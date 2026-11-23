FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GPU_FE_HOST=0.0.0.0 \
    GPU_FE_PORT=8080 \
    GPU_LEGACY_BASE_URL=""

WORKDIR /app
COPY serve.py ./
COPY docker_erd_20261117/app/web/static ./docker_erd_20261117/app/web/static

RUN useradd --uid 10001 --no-create-home app
USER 10001

EXPOSE 8080
CMD ["python", "serve.py"]
