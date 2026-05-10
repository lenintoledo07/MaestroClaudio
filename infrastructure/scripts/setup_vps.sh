#!/usr/bin/env bash
# Maestro Claudio · setup inicial del VPS Hetzner.
#
# Ejecutar como root la primera vez:
#   curl -fsSL https://raw.githubusercontent.com/lenintoledo07/MaestroClaudio/main/infrastructure/scripts/setup_vps.sh | bash
# o, si ya cloneaste el repo:
#   bash /opt/maestro-claudio/infrastructure/scripts/setup_vps.sh
#
# Idempotente: podés re-correrlo sin romper nada. Solo aplica lo que falta.
#
# Variables que el script lee del entorno (con defaults):
#   DOMAIN           dominio público (default: study.denario.cloud)
#   CERTBOT_EMAIL    email para Let's Encrypt (default: lenintoledo0785@gmail.com)
#   REPO_URL         URL del repo a clonar
#   APP_DIR          ruta donde vivirá el repo (default: /opt/maestro-claudio)
#   POSTGRES_DB      nombre de la DB (default: maestro_claudio)
#   SKIP_SSL         '1' para saltar Certbot (útil si DNS aún no apunta)

set -euo pipefail

DOMAIN="${DOMAIN:-study.denario.cloud}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-lenintoledo0785@gmail.com}"
REPO_URL="${REPO_URL:-https://github.com/lenintoledo07/MaestroClaudio.git}"
APP_DIR="${APP_DIR:-/opt/maestro-claudio}"
POSTGRES_DB="${POSTGRES_DB:-maestro_claudio}"
SKIP_SSL="${SKIP_SSL:-0}"

log() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m[!] %s\033[0m\n" "$*"; }
fail() { printf "\033[1;31m[✗] %s\033[0m\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Este script tiene que correr como root."

# ── 1. Sistema ──────────────────────────────────────────────────────────────
log "1. apt update + paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git nginx postgresql postgresql-contrib ufw

# ── 2. Docker ───────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    log "2. Instalando Docker"
    curl -fsSL https://get.docker.com | sh
else
    log "2. Docker ya instalado ($(docker --version))"
fi

# Compose v2 plugin
apt-get install -y -qq docker-compose-plugin || true

systemctl enable --now docker

# ── 3. Postgres + pgvector ──────────────────────────────────────────────────
log "3. Postgres + pgvector"
systemctl enable --now postgresql

# pgvector se instala desde el package del PG (apt), nombre depende del major.
PG_MAJOR=$(psql -V | sed -E 's/.* ([0-9]+)\..*/\1/' || echo "")
if [[ -n "$PG_MAJOR" ]]; then
    apt-get install -y -qq "postgresql-${PG_MAJOR}-pgvector" || warn "pgvector apt no disponible, intentá compilar desde fuente."
fi

# Detectar el port real del cluster (puede ser 5432 o 5433 si hay otro PG corriendo).
PG_PORT=$(sudo -u postgres psql -tAc "SHOW port;" 2>/dev/null | tr -d ' ' || echo "5432")
log "   Postgres detectado en port ${PG_PORT}"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1; then
    log "3.b creando DB ${POSTGRES_DB}"
    sudo -u postgres createdb "${POSTGRES_DB}"
fi

sudo -u postgres psql -d "${POSTGRES_DB}" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
sudo -u postgres psql -d "${POSTGRES_DB}" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

# Permitir conexiones desde cualquier red Docker default (172.16.0.0/12 cubre
# 172.16-172.31). El bridge default de Docker es 172.17, pero `docker compose`
# crea redes desde 172.18 en adelante — solo 172.17 no alcanza.
PG_HBA="/etc/postgresql/${PG_MAJOR}/main/pg_hba.conf"
if [[ -f "${PG_HBA}" ]] && ! grep -q "172.16.0.0/12" "${PG_HBA}"; then
    echo "host all all 172.16.0.0/12 scram-sha-256" >> "${PG_HBA}"
    sudo -u postgres pg_ctlcluster "${PG_MAJOR}" main reload || true
fi
PG_CONF="/etc/postgresql/${PG_MAJOR}/main/postgresql.conf"
if [[ -f "${PG_CONF}" ]] && ! grep -qE "^listen_addresses.*=.*'\\*'" "${PG_CONF}"; then
    sed -i "s/^#\\?listen_addresses.*/listen_addresses = '*'/" "${PG_CONF}"
    systemctl restart postgresql
fi

# ── 4. Repo ─────────────────────────────────────────────────────────────────
log "4. Repo en ${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
    git clone "${REPO_URL}" "${APP_DIR}"
else
    git -C "${APP_DIR}" fetch --all --prune
    git -C "${APP_DIR}" reset --hard origin/main
fi

# ── 5. .env.production ──────────────────────────────────────────────────────
ENV_FILE="${APP_DIR}/.env.production"
if [[ ! -f "${ENV_FILE}" ]] || ! grep -q "^SECRET_KEY=." "${ENV_FILE}"; then
    if [[ ! -f "${ENV_FILE}" ]]; then
        log "5. Creando .env.production desde .env.example"
        cp "${APP_DIR}/.env.example" "${ENV_FILE}"
    fi
    warn "Editá ${ENV_FILE} y poblá:"
    warn "  - SECRET_KEY (generá: python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    warn "  - DATABASE_URL  (postgresql://USER:PASS@host.docker.internal:${PG_PORT}/${POSTGRES_DB})"
    warn "  - REDIS_URL     (redis://redis:6379/0)"
    warn "  - GOOGLE_*, CLAUDE_*, OPENAI_*, DEEPGRAM_*, ELEVENLABS_*"
    warn "  - WHATSAPP_*    (si lo vas a usar)"
    warn "Después volvé a correr este script."
    exit 0
fi

grep -q "^SECRET_KEY=." "${ENV_FILE}" || fail "Faltan claves en ${ENV_FILE}"

# ── 6. Migraciones SQL ──────────────────────────────────────────────────────
log "6. Migraciones SQL"
DB_USER=$(grep -oE 'postgresql://[^:]+' "${ENV_FILE}" | sed 's|postgresql://||') || true
for migration in "${APP_DIR}/infrastructure/migrations/"*.sql; do
    [[ -f "$migration" ]] || continue
    log "   aplicando $(basename "$migration")"
    sudo -u postgres psql -d "${POSTGRES_DB}" -f "${migration}" >/dev/null 2>&1 \
        || warn "Migración $(basename "$migration") ya aplicada o falló (revisá logs)."
done

# Las migraciones corren como `postgres` así que las tablas quedan owner postgres.
# Re-grant al user que el backend usa para que pueda escribir.
if [[ -n "${DB_USER}" ]]; then
    log "   GRANTs a ${DB_USER}"
    sudo -u postgres psql -d "${POSTGRES_DB}" >/dev/null 2>&1 <<EOF || true
GRANT ALL ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${DB_USER};
EOF
fi

# ── 7. nginx ────────────────────────────────────────────────────────────────
log "7. nginx config para ${DOMAIN}"
NGINX_CONF=/etc/nginx/sites-available/maestro-claudio
cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Backend API
    location /api/ {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;            # SSE
        proxy_read_timeout 3600;
    }

    # MCP server
    location /mcp/ {
        rewrite ^/mcp/(.*) /\$1 break;
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        proxy_read_timeout 3600;
    }

    # WhatsApp webhook (Meta exige HTTPS público)
    location /webhook/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # OAuth callback va al backend directo
    location /auth/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health endpoints (sin /api/ prefix para verify.sh + monitoring externo)
    location /health {
        proxy_pass http://127.0.0.1:8001;
    }

    # Si llegan al root, redirigir a Vercel (ahí vive el frontend)
    location / {
        return 301 https://${DOMAIN}\$request_uri;
    }
}
EOF
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/maestro-claudio
# NO borramos sites-enabled/default automáticamente: en un VPS compartido con
# otros proyectos, default suele ser un catch-all importante. Si querés que
# study.denario.cloud tome todo el tráfico HTTP, borralo a mano:
#   rm /etc/nginx/sites-enabled/default && nginx -s reload
nginx -t
systemctl reload nginx

# ── 8. UFW ──────────────────────────────────────────────────────────────────
log "8. Firewall (UFW)"
# `--force` solo aplica a enable/reset/disable. Con allow falla y aborta el
# script (set -e). Por eso van sin --force.
ufw allow OpenSSH
ufw allow 'Nginx Full'
# Permitir que los containers Docker alcancen Postgres del host
# (todas las redes Docker default 172.16-31).
ufw allow from 172.16.0.0/12 to any port "${PG_PORT}" proto tcp comment 'docker→postgres'
ufw --force enable

# ── 9. SSL ──────────────────────────────────────────────────────────────────
if [[ "${SKIP_SSL}" != "1" ]]; then
    log "9. Certbot SSL para ${DOMAIN}"
    apt-get install -y -qq certbot python3-certbot-nginx
    certbot --nginx -d "${DOMAIN}" \
        --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" \
        --redirect || warn "Certbot falló. Si DNS no apunta aún, re-correr con SKIP_SSL=0."
else
    warn "9. SSL skipped (SKIP_SSL=1)"
fi

# ── 10. Stack ───────────────────────────────────────────────────────────────
log "10. Levantando stack con docker compose"
cd "${APP_DIR}"
docker compose -f infrastructure/docker-compose.prod.yml up -d --build

log "Setup completado."
echo "Probá:"
echo "  curl https://${DOMAIN}/api/health"
echo "  curl https://${DOMAIN}/api/health/all"
echo "  curl https://${DOMAIN}/mcp/sse"
