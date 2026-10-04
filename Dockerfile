FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir fastapi uvicorn
COPY . .
ENV PORT=8000
EXPOSE 8000
# QLOO_API_KEY and TASTETABLE_LIVE=1 are injected as host secrets, never baked into the image.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
