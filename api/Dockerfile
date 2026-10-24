# The build stage runs on the runner's own platform and installs wheels for the target platform;
# every dependency ships binary wheels for both. The runtime stage holds only COPY steps, so no
# instruction ever runs on the target platform and the arm64 image builds without QEMU.
FROM --platform=$BUILDPLATFORM ghcr.io/astral-sh/uv:0.13.0 AS uv

FROM --platform=$BUILDPLATFORM python:3.13-slim AS build
ARG TARGETARCH
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
 && case "$TARGETARCH" in \
      amd64) platform=x86_64-manylinux_2_28 ;; \
      arm64) platform=aarch64-manylinux_2_28 ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && uv pip install --target /app --python-version 3.13 --python-platform "$platform" \
      --only-binary :all: -r requirements.txt
COPY src/exercise_planner_api /app/exercise_planner_api
RUN printf '#!/bin/sh\nexec python -m exercise_planner_api.cli "$@"\n' > /ep-admin && mkdir /data

FROM python:3.13-slim
ENV PYTHONPATH=/app PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
COPY --from=build /app /app
COPY --from=build --chmod=755 /ep-admin /usr/local/bin/ep-admin
COPY --from=build --chown=10001:10001 /data /data
USER 10001:10001
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=2)"]
CMD ["python", "-m", "uvicorn", "--factory", "exercise_planner_api.app:create_app_from_env", \
     "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
