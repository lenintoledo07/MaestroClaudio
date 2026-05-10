#!/usr/bin/env bash
# Maestro Claudio · verificación end-to-end del deploy.
# Ejecutar desde el VPS o desde tu máquina (con DOMAIN seteado).
#
#   bash verify.sh                          # default: study.denario.cloud
#   DOMAIN=otro.dominio.com bash verify.sh  # custom

set -uo pipefail

DOMAIN="${DOMAIN:-study.denario.cloud}"
BASE="https://${DOMAIN}"

ok=0
fail=0

check() {
    local name="$1" cmd="$2"
    printf "%-40s " "${name}"
    if eval "${cmd}" >/dev/null 2>&1; then
        echo "✅"
        ok=$((ok+1))
    else
        echo "❌"
        fail=$((fail+1))
    fi
}

# 1) Health básico
check "API /health"          "curl -fsS ${BASE}/api/health"
check "API /health/db"       "curl -fsS ${BASE}/api/health/db | grep -q '\"ok\":true'"
check "API /health/workers"  "curl -fsS ${BASE}/api/health/workers | grep -q '\"ok\":true'"
check "API /health/all"      "curl -fsS ${BASE}/api/health/all | grep -q '\"status\":\"healthy\"'"

# 2) MCP SSE responde 200
check "MCP /sse"             "curl -fsS --max-time 3 ${BASE}/mcp/sse"

# 3) WhatsApp webhook verify (con token vacío matchea si no está configurado)
check "WA verify endpoint"   "curl -fsS '${BASE}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=&hub.challenge=ping' | grep -q ping"

# 4) Auth /me sin sesión devuelve 401 (no 502)
check "Auth /me 401 sin ses." "[ \"\$(curl -s -o /dev/null -w '%{http_code}' ${BASE}/api/auth/me)\" = \"401\" ]"

# 5) Solo si se ejecuta desde el VPS: chequeos locales
if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    check "Redis PING"            "docker exec maestro-redis redis-cli ping | grep -q PONG"
    check "Celery workers ping"   "docker exec maestro-worker celery -A workers.celery_app inspect ping --timeout 3 | grep -q pong"
fi

echo
echo "Resumen: ${ok} ok / ${fail} fallaron"
exit "${fail}"
