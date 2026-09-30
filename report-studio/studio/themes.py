"""Visual themes for generated reports.

Each theme is a palette plus a few layout switches. Colours are hex strings
without the leading '#', which is the form WordprocessingML expects.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    key: str
    name_ar: str
    name_en: str
    primary: str        # headings, cover band, table header
    accent: str         # secondary headings, rules, callout edge
    soft: str           # callout / zebra row fill
    ink: str = "1F2328"  # body text
    muted: str = "5B6470"  # captions, header/footer
    page_border: bool = False
    cover_style: str = "band"  # "band" | "frame"


THEMES: dict[str, Theme] = {
    t.key: t
    for t in [
        Theme("medical", "طبي", "Medical", primary="0E5E6F", accent="3A8891", soft="E6F2F3"),
        Theme("engineering", "هندسي", "Engineering", primary="1D3557", accent="E07A1F", soft="EEF2F7"),
        Theme("law", "قانوني", "Law", primary="5C1A1B", accent="B08D57", soft="F6F1EA",
              page_border=True, cover_style="frame"),
        Theme("humanities", "أدبي وإنساني", "Humanities", primary="3D2C5E", accent="8C6BB1", soft="F2EEF8"),
        Theme("business", "إداري واقتصادي", "Business", primary="0B3D2E", accent="2E8B57", soft="EAF4EE"),
        Theme("science", "علوم", "Science", primary="173F7A", accent="2F80ED", soft="EAF1FC"),
        Theme("minimal", "بسيط أنيق", "Minimal", primary="222222", accent="777777", soft="F3F3F3"),
        Theme("classic", "كلاسيكي عراقي", "Classic", primary="12355B", accent="A67C2D", soft="F4F0E6",
              page_border=True, cover_style="frame"),
    ]
}


def get_theme(key: str | None) -> Theme:
    return THEMES.get((key or "").lower(), THEMES["classic"])
