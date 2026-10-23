# The build stage runs on the runner's native platform: its output (static files) is the same
# for every target, so only the COPY-only runtime stage is built per architecture, without QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
# npm 11: npm 10.9's resolver crashes on this dependency tree (see docs/development.md).
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
