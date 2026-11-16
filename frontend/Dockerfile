# Build context = repository root (CHANGELOG.md becomes the site's "Nouveautés" page).
#   docker build -f frontend/Dockerfile .
# ── build ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY CHANGELOG.md /app/CHANGELOG.md
COPY frontend/ ./
RUN npm run build

# ── runtime: unprivileged nginx (listens on 8080, runs as a non-root user) ────
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx/security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/frontend/dist/mybody365/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
