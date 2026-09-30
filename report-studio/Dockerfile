FROM python:3.11-slim

# LibreOffice Writer converts DOCX -> PDF; fonts are embedded from ./fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer fontconfig \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /usr/share/fonts/truetype/studio && cp fonts/*.ttf /usr/share/fonts/truetype/studio/ && fc-cache -f

ENV STUDIO_OUT=/data/output
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
