# صورة للنشر على Hugging Face Spaces (Docker) أو أي سيرفر
FROM python:3.11-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# نحمّل أوزان EfficientNetB0 وقت البناء حتى السيرفر ما يحتاج إنترنت عند التشغيل
RUN python -c "from tensorflow.keras.applications import EfficientNetB0; EfficientNetB0(weights='imagenet', include_top=False)"

COPY --chown=user . .

ENV MAMMO_DATA_DIR=/home/user/app/data
EXPOSE 7860
# إذا فعّلت Persistent Storage بـ Hugging Face ينربط /data وتنحفظ البيانات هناك
CMD ["sh", "-c", "if [ -w /data ]; then export MAMMO_DATA_DIR=/data; fi; exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}"]
