FROM python:3.11-slim

# LibreOffice converts DOCX/PPTX -> PDF; fonts come from ./fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fontconfig \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /usr/share/fonts/truetype/studio && cp fonts/*.ttf /usr/share/fonts/truetype/studio/ && cp fonts/local.conf /etc/fonts/local.conf && fc-cache -f

ENV STUDIO_OUT=/data/output
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
