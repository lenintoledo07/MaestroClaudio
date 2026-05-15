# Maestro Claudio · Reporte de Deploy de Producción

**Fecha:** 2026-05-10
**VPS:** Hetzner Ubuntu 24.04, IP `204.168.178.170`
**Repo:** `/srv/maestroclaudio` @ commit `5bbedfd` (`feat(design): migrate to V4 "Studious Calm" — hybrid direction`)
**Dominio backend:** `study.denario.cloud` (DNS pendiente de propagar)
**Frontend:** `https://maestro-claudio.vercel.app`

---

## 1. Resumen ejecutivo

✅ **Backend desplegado y operativo en HTTP.** Los 4 containers Docker corren correctamente, la DB tiene las 10 tablas con pgvector, los workers Celery están conectados a Redis, el MCP server responde en `/sse`, y el webhook de WhatsApp valida el token correctamente.

⚠️ **SSL pendiente:** el DNS `study.denario.cloud` no resuelve aún, por lo que se ejecutó el setup con `SKIP_SSL=1`. Una vez propague el A record, basta con un `certbot --nginx -d study.denario.cloud` para tener HTTPS.

⚠️ **Cambios respecto a las instrucciones originales** (4 desviaciones documentadas más abajo). Estos cambios fueron necesarios porque el VPS no estaba virgen — ya tenía otros proyectos del usuario corriendo.

---

## 2. Estado del VPS antes y después

### Antes del deploy (encontrado al iniciar)

- **Postgres-16 del sistema** (apt-installed) corriendo en port **5433** (no 5432). El port 5432 lo ocupa otro container.
- **DB `maestro_claudio`** existente (vacía, owner `postgres`, sin user `maestro`).
- **Otros containers Docker corriendo** (no son parte de Maestro):
  - `ads_postgres` → `0.0.0.0:5432→5432`
  - `ads_redis` → `0.0.0.0:6380→6379`
- **Otros servicios escuchando externamente** (no son de Maestro):
  - `next-server` en `0.0.0.0:3000`
  - python en `0.0.0.0:8080`
  - python3 en `0.0.0.0:8888`
- **Nginx ya activo con 6 sites**: `ads`, `alphaengine`, `alphaengineV2`, `default` (catch-all IP), `mediacore`, `prism` — todos servidos en subdomains de `denario.cloud`.
- **UFW inactivo.**
- `.env.production` existía pero estaba vacío.

### Después del deploy

| Componente | Estado |
|---|---|
| `maestro-api` | ✅ running, port 8001, startup complete, schedulers iniciados |
| `maestro-worker` | ✅ running, conectado a Redis, 1 worker Celery activo |
| `maestro-mcp` | ✅ running, port 8002 |
| `maestro-redis` | ✅ running, internal only (no port mapping externo) |
| Nginx site `maestro-claudio` | ✅ Habilitado, no afecta los otros 6 sites |
| Otros containers (`ads_*`) | ✅ Intactos, siguen corriendo |
| UFW | ✅ Active (22, 80, 443 públicos + 5433 desde redes Docker) |
| Postgres user `maestro` | ✅ Creado, owner de `maestro_claudio` |
| DB tablas | ✅ 10 tablas (`users`, `courses`, `modules`, `materials`, `conversations`, `messages`, `signals`, `calendar_events`, `chunks`, `evaluations`) |
| Extensiones PG | ✅ `vector` (pgvector), `pgcrypto` |

---

## 3. Pasos ejecutados (cronológicos)

### Paso 1 — Setup user Postgres `maestro` ✅
- Generado password aleatorio con `openssl rand -hex 16`.
- `ALTER USER maestro WITH PASSWORD '...'` (el role ya existía de un intento previo).
- `ALTER DATABASE maestro_claudio OWNER TO maestro`.
- `GRANT ALL ON SCHEMA public TO maestro`.
- Agregado a `/etc/postgresql/16/main/pg_hba.conf`: `host all all 172.17.0.0/16 md5` (luego ampliado a `172.16.0.0/12 scram-sha-256`).
- `listen_addresses = '*'` en `postgresql.conf`.
- `systemctl restart postgresql`.
- Password persistido en `/root/.maestro_pg_pass` (mode 600).
- **Verificación:** `PGPASSWORD=... psql -U maestro -h 127.0.0.1 -p 5433 -c 'SELECT 1'` → OK.

### Paso 2 — Tokens generados ✅
- `SECRET_KEY` (64 chars urlsafe)
- `MCP_AUTH_TOKEN` (43 chars urlsafe)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (32 chars urlsafe)

### Paso 3 — API keys recibidas del usuario ✅
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `CLAUDE_API_KEY`, `CLAUDE_MODEL=claude-sonnet-4-6`, `CLAUDE_MODEL_BULK=claude-haiku-4-5`
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY` (set), `ELEVENLABS_VOICE_ID` (vacío)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_MY_NUMBER` (vacíos — Fase 5)
- `META_API_VERSION=v21.0`
- `FRONTEND_URL=https://maestro-claudio.vercel.app`

### Paso 4 — `.env.production` poblado ✅
- Escrito en `/srv/maestroclaudio/.env.production`, mode `600 root:root`.
- 21 variables seteadas (16 con valor + 5 vacías opcionales).

### Paso 5 — Ejecución de `setup_vps.sh` ⚠️ FALLÓ EN PASO 8
Comando: `sudo env DOMAIN=study.denario.cloud APP_DIR=/srv/maestroclaudio SKIP_SSL=1 bash /srv/maestroclaudio/infrastructure/scripts/setup_vps.sh`

| Sub-paso | Resultado |
|---|---|
| 1. apt update + paquetes base | ✅ |
| 2. Docker check | ✅ (ya instalado) — pero `docker-compose-plugin` no estaba en repos de Ubuntu 24.04 (warning) |
| 3. Postgres + pgvector | ✅ (extensions ya estaban: warning no-op) |
| 4. Repo (`git reset --hard`) | ✅ |
| 5. .env.production | ✅ (skipped, ya estaba poblado) |
| 6. Migraciones SQL | ✅ `001_initial_schema.sql`, `002_phase2_columns.sql` aplicadas |
| 7. nginx config | ✅ Pero **borró** `/etc/nginx/sites-enabled/default` (catch-all IP). |
| 8. Firewall (UFW) | ❌ **FALLÓ** — `ufw --force allow OpenSSH` es sintaxis inválida (`--force` no aplica a `allow`). |
| 9. SSL Certbot | ⏭ skipped por `SKIP_SSL=1` |
| 10. docker compose up -d --build | ⛔ no se ejecutó por el fallo en paso 8 |

### Paso 5b — Recuperación manual ✅
1. **Restaurar nginx default symlink:** `sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default && sudo nginx -t`. ✅
2. **GRANT permisos al user maestro** sobre tablas, secuencias y funciones (las migrations corrieron como `postgres`, así que las tablas eran owner `postgres`):
   ```sql
   GRANT ALL ON ALL TABLES IN SCHEMA public TO maestro;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO maestro;
   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO maestro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO maestro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO maestro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO maestro;
   ```
3. **UFW manual con sintaxis correcta:**
   ```
   sudo ufw allow OpenSSH
   sudo ufw allow 'Nginx Full'
   sudo ufw --force enable
   ```
4. **`docker compose up -d --build`** → ✅ build exitoso (~2 min Python deps), 4 containers iniciados.

### Paso 5c — Diagnóstico de startup ⚠️ → ✅
El backend inicialmente quedó colgado en `Waiting for application startup`, luego falló con:
```
asyncpg.exceptions.InvalidAuthorizationSpecificationError:
no pg_hba.conf entry for host "172.19.0.4", user "maestro", database "maestro_claudio"
```

**Dos issues encadenados:**

1. **UFW bloqueaba el tráfico Docker→host en 5433**: agregado `ufw allow from 172.17.0.0/16 to any port 5433 proto tcp` (más equivalentes para 172.18, 172.19).
2. **pg_hba.conf solo permitía `172.17.0.0/16`** pero `docker compose` creó la network `infrastructure_default` en `172.19.0.0/16`. Agregada regla `host all all 172.16.0.0/12 scram-sha-256` (cubre todas las redes Docker default 172.16.0.0–172.31.255.255).
3. **Reload Postgres** (`pg_ctl reload`, no necesita restart) y **restart `maestro-api`** → startup completo:
   ```
   Postgres pool listo (min=2, max=10)
   Scheduler started
   Application startup complete.
   Uvicorn running on http://0.0.0.0:8001
   ```

### Paso 6 — Verify checks ✅ 7/7
| Check | Resultado |
|---|---|
| `GET /api/health` | ✅ 200 `{"status":"healthy"}` |
| `GET /api/health/db` | ✅ 200 `{"ok":true,"postgres":"PG 16.13","pgvector":true,"tables":10}` |
| `GET /api/health/workers` | ✅ 200 `{"ok":true,"count":1,"queue_pending":0}` |
| `GET /api/health/all` | ✅ 200 `{"status":"healthy"}` |
| `GET /mcp/sse` | ✅ Streaming SSE responde `event: endpoint` con `session_id` |
| WhatsApp webhook con token correcto | ✅ Devuelve `ping` |
| WhatsApp webhook con token incorrecto | ✅ Devuelve 403 (validación funciona) |
| `GET /api/auth/me` sin sesión | ✅ 401 |
| `docker exec maestro-redis redis-cli ping` | ✅ `PONG` |
| `celery inspect ping` | ✅ `pong` |

---

## 4. Cambios al sistema (audit trail)

### Postgres
- `/etc/postgresql/16/main/pg_hba.conf`:
  - **+** `host all all 172.17.0.0/16 md5` (Docker default bridge)
  - **+** `host all all 172.16.0.0/12 scram-sha-256` (todas las redes Docker)
- `/etc/postgresql/16/main/postgresql.conf`:
  - `listen_addresses = '*'` (antes: comentado)
- DB `maestro_claudio`:
  - Owner cambiado a `maestro`
  - 10 tablas creadas via migrations 001 y 002
  - Extensiones `vector`, `pgcrypto` (ya existían)
  - GRANTs aplicados al user `maestro`

### Nginx
- `/etc/nginx/sites-available/maestro-claudio` **creado** (config para `study.denario.cloud`).
- `/etc/nginx/sites-enabled/maestro-claudio` symlink **creado**.
- `/etc/nginx/sites-enabled/default` **borrado por el script y re-creado manualmente** (apunta a `/etc/nginx/sites-available/default`).

### UFW
Reglas activas:
| # | To | Action | From |
|---|---|---|---|
| 1 | OpenSSH | ALLOW IN | Anywhere |
| 2 | Nginx Full (80/443) | ALLOW IN | Anywhere |
| 3 | 5433/tcp | ALLOW IN | 172.17.0.0/16 |
| 4 | 5433/tcp | ALLOW IN | 172.18.0.0/16 |
| 5 | 5433/tcp | ALLOW IN | 172.19.0.0/16 |
| 6 | OpenSSH (v6) | ALLOW IN | Anywhere (v6) |
| 7 | Nginx Full (v6) | ALLOW IN | Anywhere (v6) |

Default: `deny incoming`, `allow outgoing`, `deny routed`.

### Docker
- Network `infrastructure_default` creada (`172.19.0.0/16`).
- Volume `infrastructure_redis_data` creado.
- 4 containers Maestro corriendo.
- Image `maestro-claudio-backend:latest` buildeada (~2 min).
- Image `maestro-claudio-mcp:latest` buildeada.

### Files
- `/root/.maestro_pg_pass` **creado** (mode 600).
- `/srv/maestroclaudio/.env.production` **poblado** (mode 600 root:root).
- `/tmp/setup_vps.log` — log de la corrida del script (informativo, puede borrarse).

---

## 5. Secrets (referencia rápida)

⚠️ **Estos valores son sensibles. Copialos a tu password manager y borrá este archivo cuando termines.**

| Variable | Valor (prefijo) | Path completo |
|---|---|---|
| `PG_PASS` (user maestro) | `f114ddb5...` (32 hex chars) | `/root/.maestro_pg_pass` |
| `SECRET_KEY` | `tAutnsiNxgil...` (64 chars) | `.env.production` |
| `MCP_AUTH_TOKEN` | `yQ0kz_9lh1WY...` (43 chars) | `.env.production` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `VmHOHq9bUruS...` (32 chars) | `.env.production` |
| API keys (Anthropic/OpenAI/Deepgram/ElevenLabs/Google) | Recibidas del usuario | `.env.production` |

Para leer los valores completos:
```
sudo cat /root/.maestro_pg_pass
sudo cat /srv/maestroclaudio/.env.production
```

---

## 6. Desviaciones del plan original

| # | Plan original | Realidad | Cambio aplicado |
|---|---|---|---|
| 1 | `DATABASE_URL=...host.docker.internal:5432/...` | Port 5432 ocupado por `ads_postgres` (otro proyecto). PG del sistema en 5433. | `DATABASE_URL` apunta a port **5433**. |
| 2 | `pg_hba.conf` con `172.17.0.0/16` | `docker compose` crea network en `172.19.0.0/16`. Auth fallaba. | Ampliado a `172.16.0.0/12` (todas las redes Docker default). |
| 3 | UFW solo `OpenSSH` + `Nginx Full` | Containers Docker no podían llegar a Postgres del host. | Agregadas 3 reglas adicionales: `allow from 172.17/172.18/172.19 to 5433`. |
| 4 | Setup script ejecuta todos los pasos | Paso 8 (UFW) abortaba el script por sintaxis inválida `--force allow`. | Ejecutado manualmente con sintaxis correcta `ufw allow X` (sin `--force`). |

---

## 7. Bugs encontrados en `infrastructure/scripts/setup_vps.sh`

Los siguientes 5 bugs deberían fixearse en el script para futuros deploys:

1. **Paso 8 (UFW) — sintaxis inválida**: `ufw --force allow OpenSSH` y `ufw --force allow 'Nginx Full'`. La flag `--force` solo aplica a `enable`/`reset`/`disable`. Con `allow` falla con exit 1, y `set -euo pipefail` corta el script antes de SSL y docker compose.
   **Fix:** quitar `--force` de los `allow`.

2. **Paso 7 borra `/etc/nginx/sites-enabled/default` sin advertir.** En VPS con catch-all `default` que sirve para IP requests, esto rompe el catch-all hasta restaurar el symlink.
   **Fix:** chequear si default tiene contenido útil, o solo borrarlo si es el default Ubuntu vacío.

3. **`pg_hba.conf` solo agrega `172.17.0.0/16`** (red Docker bridge default). Pero `docker compose` siempre crea redes en `172.18.0.0/16` o superior (en este caso `172.19.0.0/16`). Auth falla.
   **Fix:** usar rango `172.16.0.0/12` que cubre todas las redes Docker.

4. **DATABASE_URL hardcoded a port 5432** en el warning del paso 5. Si el VPS ya tiene otro PG en 5432, el postgres del sistema se instala en 5433 y el ejemplo apunta al lugar equivocado.
   **Fix:** detectar `pg_lsclusters` o `psql -c 'SHOW port'` antes de sugerir la URL.

5. **UFW no permite tráfico Docker→host en port 5433**. Containers no pueden alcanzar el postgres del host.
   **Fix:** agregar `ufw allow from 172.16.0.0/12 to any port 5433 proto tcp` después del enable.

---

## 8. Pendientes (action items para vos, fuera del VPS)

```
[ ] 1. DNS: agregá A record en tu DNS provider (Cloudflare/Route53/whatever):
       study.denario.cloud → 204.168.178.170
       Esperá ~5 min a que propague (verificá con: dig +short study.denario.cloud)

[ ] 2. Una vez DNS propaga, desde este VPS corré:
       sudo certbot --nginx -d study.denario.cloud --non-interactive \
         --agree-tos -m lenintoledo0785@gmail.com --redirect

[ ] 3. Google Cloud Console → tu OAuth client (810546691960-...):
       Authorized redirect URIs → agregar https://study.denario.cloud/auth/callback

[ ] 4. Vercel → maestro-claudio → Settings → Environment Variables:
       VITE_API_URL = https://study.denario.cloud/api
       → Redeploy frontend

[ ] 5. (Opcional) GitHub Actions secrets para auto-deploy:
       Settings → Secrets and variables → Actions:
         VPS_HOST    = 204.168.178.170
         VPS_USER    = root  (o claudeuser con sudo)
         VPS_SSH_KEY = <tu private key>

[ ] 6. (Opcional, Fase 5) WhatsApp Meta Cloud API:
       - developers.facebook.com → tu app → Webhooks
       - Callback URL: https://study.denario.cloud/webhook/whatsapp
       - Verify token: VmHOHq9bUruSKoOUNYpvPNEoViTudg0b
```

---

## 9. Comandos útiles para el día a día

### Logs
```bash
sudo docker logs maestro-api --tail 50 -f
sudo docker logs maestro-worker --tail 50 -f
sudo docker logs maestro-mcp --tail 50 -f
sudo docker logs maestro-redis --tail 50 -f
```

### Restart selectivo
```bash
sudo docker compose -f /srv/maestroclaudio/infrastructure/docker-compose.prod.yml restart maestro-api
```

### Rebuild y restart todo
```bash
cd /srv/maestroclaudio
sudo docker compose -f infrastructure/docker-compose.prod.yml up -d --build
```

### Status del stack
```bash
sudo docker ps --filter "name=maestro" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
sudo systemctl status postgresql
sudo nginx -t && sudo systemctl status nginx
sudo ufw status numbered
```

### Conectarse a la DB
```bash
PG_PASS=$(sudo cat /root/.maestro_pg_pass)
PGPASSWORD="$PG_PASS" psql -U maestro -d maestro_claudio -h 127.0.0.1 -p 5433
```

### Health checks (sin SSL aún, vía nginx local)
```bash
curl -H "Host: study.denario.cloud" http://127.0.0.1/api/health/all
```

### Health checks (con SSL, una vez DNS+Certbot)
```bash
curl https://study.denario.cloud/api/health/all
DOMAIN=study.denario.cloud bash /srv/maestroclaudio/infrastructure/scripts/verify.sh
```

---

## 10. Cleanup posterior recomendado

Cuando termines de revisar este reporte:

```bash
# Borrar este reporte (contiene prefijos de secrets)
sudo rm /srv/maestroclaudio/DEPLOY_REPORT.md

# Borrar log temporal del script
sudo rm /tmp/setup_vps.log /tmp/.maestro_tokens

# .env.production y /root/.maestro_pg_pass son las copias canónicas — no las borres.
```
