"""Embed TrueType fonts inside a .docx so it looks identical on any machine.

Word stores embedded fonts as "obfuscated" TTF parts (ECMA-376 Part 1,
17.8.1): the first 32 bytes of the font are XOR-ed with a GUID key that is
recorded next to the reference in fontTable.xml.
"""

import uuid
from pathlib import Path

from lxml import etree

from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"
OBFUSCATED_FONT_CT = "application/vnd.openxmlformats-officedocument.obfuscatedFont"

# family name -> {"regular": file, "bold": file}
FAMILIES = {
    "Amiri": {"regular": "Amiri-Regular.ttf", "bold": "Amiri-Bold.ttf"},
    "Tajawal": {"regular": "Tajawal-Regular.ttf", "bold": "Tajawal-Bold.ttf"},
    "Tajawal ExtraBold": {"regular": "Tajawal-ExtraBold.ttf"},
}


def _obfuscate(data: bytes, guid: uuid.UUID) -> bytes:
    hex_key = guid.hex  # 32 hex chars, no dashes
    # Key bytes are taken from the GUID string read right-to-left.
    key = bytes(int(hex_key[i : i + 2], 16) for i in range(30, -1, -2))
    head = bytes(data[i] ^ key[i % 16] for i in range(32))
    return head + data[32:]


def embed_fonts(document) -> None:
    doc_part = document.part
    font_table = doc_part.part_related_by(RT.FONT_TABLE)
    root = parse_xml(font_table.blob)

    counter = 0
    for family, faces in FAMILIES.items():
        font_el = None
        for f in root.findall(qn("w:font")):
            if f.get(qn("w:name")) == family:
                font_el = f
                break
        if font_el is None:
            font_el = parse_xml(
                f'<w:font {nsdecls("w")} w:name="{family}">'
                '<w:charset w:val="00"/><w:family w:val="auto"/><w:pitch w:val="variable"/>'
                "</w:font>"
            )
            root.append(font_el)

        for face, filename in faces.items():
            counter += 1
            guid = uuid.uuid4()
            blob = _obfuscate((FONT_DIR / filename).read_bytes(), guid)
            part = Part(
                PackURI(f"/word/fonts/font{counter}.odttf"),
                OBFUSCATED_FONT_CT,
                blob,
                doc_part.package,
            )
            rid = font_table.relate_to(part, RT.FONT)
            tag = "w:embedRegular" if face == "regular" else "w:embedBold"
            el = parse_xml(
                f'<{tag} {nsdecls("w", "r")} r:id="{rid}" '
                f'w:fontKey="{{{str(guid).upper()}}}"/>'
            )
            font_el.append(el)

    font_table._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

    # <w:embedTrueTypeFonts/> must sit right after zoom/view-type elements.
    settings = document.settings.element
    if settings.find(qn("w:embedTrueTypeFonts")) is None:
        el = parse_xml(f'<w:embedTrueTypeFonts {nsdecls("w")}/>')
        anchor = None
        for tag in ("w:zoom", "w:view", "w:writeProtection"):
            anchor = settings.find(qn(tag))
            if anchor is not None:
                break
        if anchor is not None:
            anchor.addnext(el)
        else:
            settings.insert(0, el)
