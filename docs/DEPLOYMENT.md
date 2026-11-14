# Deployment Guide

JARVIS can run as a self-hosted Docker container, a bare Node.js process, or on Vercel with Supabase. It is a single-owner harness, not a multi-tenant SaaS. Always set an access token and TLS before exposing it to the internet.

## Choose a Target

| Target | Storage | Shell tools | Best for |
| --- | --- | --- | --- |
| Docker Compose | Persistent volumes | Optional, disabled by default | Recommended self-hosting and demos |
| Bare Node.js | Local disk | Optional | A trusted machine or VM |
| Vercel + Supabase | Supabase | Keep disabled | Public demo without filesystem tools |
| Serverless/edge with local JSON | Ephemeral | Not supported | Not recommended |

## Environment Variables

At minimum, set the provider you intend to use and an access token for anything reachable beyond localhost.

```bash
JARVIS_ACCESS_TOKEN=<long-random-value>
OLLAMA_BASE_URL=http://localhost:11434
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
```

For containers, `OLLAMA_BASE_URL` usually points at the Docker host:

```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Generate a token on Windows PowerShell:

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

On macOS/Linux:

```bash
openssl rand -base64 48
```

Never commit `.env.local` or provider keys. The Docker build context ignores `.env*` except `.env.example`.

## Docker Compose (Recommended)

Prerequisites: Docker Engine or Docker Desktop with Compose v2.

```bash
docker compose build
docker compose up -d
```

Open http://localhost:3000.

The provided Compose file:

- builds a multi-stage, standalone Next.js image;
- runs as the non-root `nextjs` user;
- drops Linux capabilities and sets `no-new-privileges`;
- persists `/app/.data` and `/app/.workspace` in named volumes;
- exposes port 3000 and includes a health check;
- defaults to `host.docker.internal:11434` for Ollama on the host.

Set variables in your shell before `up` so Compose can pass them through:

```powershell
$env:JARVIS_ACCESS_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$env:GEMINI_API_KEY = "your-key"
docker compose up -d
```

Without Compose, build and run directly:

```bash
docker build -t jarvis-ai-harness:local .
docker run -d --name jarvis \
  -p 3000:3000 \
  -e JARVIS_ACCESS_TOKEN=<token> \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v jarvis-data:/app/.data \
  -v jarvis-workspace:/app/.workspace \
  --restart unless-stopped \
  jarvis-ai-harness:local
```

On Linux, add `--add-host=host.docker.internal:host-gateway` when using host Ollama.

### Health and logs

```bash
docker compose ps
docker compose logs -f jarvis
curl http://localhost:3000/api/health
docker inspect --format '{{.State.Health.Status}}' jarvis
```

A healthy response includes `"ok": true`, the storage mode, provider booleans, and the auth mode. `/api/health` is public by design and never contains secrets.

### Data and backups

The Compose file uses named volumes:

- `jarvis-data`: `/app/.data`, including `jarvis.json`
- `jarvis-workspace`: `/app/.workspace`, files written by approved file tools

Back up the data volume before upgrades:

```bash
docker run --rm -v jarvis-data:/data -v ${PWD}:/backup alpine \
  tar czf /backup/jarvis-data-$(date +%Y%m%d).tar.gz -C /data .
```

List volumes with `docker volume ls` if Compose applied a project prefix. Restore only while the container is stopped.

### Updating

```bash
git pull
docker compose build
docker compose up -d
```

Volumes survive rebuilds. Re-run the health check and the auth smoke test afterward.

### TLS and reverse proxy

Terminate TLS at a reverse proxy such as Caddy, nginx, or Traefik, and forward to `127.0.0.1:3000`. Do not publish port 3000 directly to the internet. Recommended proxy headers:

- `X-Forwarded-For` (used for rate limiting)
- `X-Forwarded-Proto`
- `Host`

Set a request body limit of at least 1 MB. JARVIS rejects JSON bodies over 1 MB, but the proxy should enforce the same ceiling earlier.

## Ollama

JARVIS talks to Ollama over HTTP. Keep Ollama on localhost or a private network; do not expose port 11434 publicly.

```bash
ollama serve
ollama pull llama3.2
```

For Docker on the same host, use `http://host.docker.internal:11434`. For a remote GPU box, use a private VPN or firewall-restricted endpoint and set `OLLAMA_BASE_URL` accordingly.

## Vercel + Supabase

Vercel's filesystem is ephemeral, so use Supabase for persistence and keep shell/file tools disabled.

1. Push the project to your own Git repository.
2. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
3. Import the repository into Vercel.
4. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JARVIS_ACCESS_TOKEN`
   - provider keys as needed
   - `JARVIS_ENABLE_SHELL=false`
5. Deploy and open the app; enter the access token when prompted.

Caveats:

- The Supabase service-role key is server-only. Never prefix it with `NEXT_PUBLIC_`.
- Local `.data` files and `.workspace` files do not persist across deployments.
- In-memory rate limiting is per serverless instance and is best-effort, not a global quota.
- File write, file read, and shell tools are unsuitable for serverless deployments. Leave them disabled.
- If you need workspace tools, use a self-hosted container instead.

## Bare Node.js

```bash
npm ci
npm run build
JARVIS_ACCESS_TOKEN=<token> npm start
```

Use a process manager (systemd, PM2, or a container) and a persistent directory for `JARVIS_DATA_FILE` and `JARVIS_WORKSPACE_DIR`. Run as a dedicated non-root user.

Example `systemd` environment file:

```ini
JARVIS_ACCESS_TOKEN=<token>
JARVIS_DATA_FILE=/var/lib/jarvis/jarvis.json
JARVIS_WORKSPACE_DIR=/var/lib/jarvis/workspace
JARVIS_ENABLE_SHELL=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## Verification Checklist

After deployment:

```bash
curl -fsS https://your-host/api/health
curl -i https://your-host/api/conversations          # expect 401
curl -i -H "Authorization: Bearer <token>" https://your-host/api/conversations
```

- The UI asks for the token and unlocks with the correct value.
- A wrong token is rejected.
- `/api/health` reports the expected storage and auth mode.
- Container health is `healthy`.
- Rate limits return `429` with `Retry-After` when exceeded.
- Logs do not contain provider keys, tokens, or the Supabase service-role key.
- Backups of the data volume or Supabase project exist.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `401 unauthorized` everywhere | Set the token in the UI or send `Authorization: Bearer`. Health and auth endpoints are public. |
| UI stuck on "Initializing secure link" | `/api/health` must be reachable; check reverse-proxy routing. |
| Ollama unreachable from Docker | Use `host.docker.internal` and add `host-gateway` on Linux. |
| Data disappears after redeploy | Use a persistent volume or Supabase; serverless filesystems are ephemeral. |
| Approval never appears | Enable the relevant permission and use an agent-mode model with tool support. |
| Container unhealthy | Run `docker compose logs jarvis`; confirm the app can bind port 3000. |
| `429 rate_limited` | Wait for `Retry-After` or raise the limits for your own deployment. |
| Supabase errors | Apply `supabase/schema.sql`, verify the URL and service-role key, and check project status. |

## Security Notes

- Always set `JARVIS_ACCESS_TOKEN` for public exposure.
- Use TLS; never send the token or provider keys over plain HTTP.
- Keep `JARVIS_ENABLE_SHELL=false` unless you have reviewed the risk.
- Review `docs/SECURITY.md` before exposing filesystem tools.
- Rotate provider keys and the access token if they may have leaked.
- The access token is a shared secret, not a user account system. It does not provide per-user isolation.
