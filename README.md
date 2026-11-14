# JARVIS AI Harness

A local-first, multi-provider personal AI harness. JARVIS combines a streaming chat and agent loop, long-term memory, approval-gated tools, and a futuristic glassmorphic dashboard in one Next.js application.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Radix UI, Framer Motion, and optional Supabase persistence. It works on free tiers: no paid service is required.

## Highlights

- **Multiple providers**: Google Gemini, Groq, OpenRouter, and local Ollama behind one streaming interface.
- **Streaming chat**: server-sent events for tokens, tool activity, run status, and usage.
- **Agent runs**: bounded tool-calling loop with iteration limits, per-tool timeouts, cancellation, and persisted run state.
- **Human approval**: sensitive tools (`file_write`, `shell_command`) pause the run until explicitly approved or denied.
- **Real memory**: persisted long-term notes retrieved per turn with deterministic lexical scoring.
- **Dual storage**: zero-config local JSON at `.data/jarvis.json`, or Supabase when server credentials are present.
- **Safety by default**: workspace sandbox, command allowlist, no shell operators, URL checks, shell disabled by default.
- **Optional access protection**: set `JARVIS_ACCESS_TOKEN` to gate the UI and every API route, plus in-memory rate limiting.
- **Complete UI**: dashboard, chat/agent workspace, memory manager, model catalogue, tool catalog, run monitor, settings.
- **Verified tests**: 97 unit/integration tests plus 7 production HTTP/SSE E2E tests, TypeScript, ESLint, build, and Docker smoke test.

## Requirements

- Node.js 20+ (Node 22 or 24 recommended)
- npm 10+
- Optional: an API key for Gemini, Groq, or OpenRouter
- Optional: [Ollama](https://ollama.com/download) for fully local inference
- Optional: a Supabase project for cloud persistence
- Optional: Docker Desktop or Docker Engine for container deployment

## Quick Start

```bash
npm install
copy .env.example .env.local   # Windows
# cp .env.example .env.local   # macOS/Linux
npm run dev
```

Open http://localhost:3000.

Without any keys, JARVIS starts with local JSON storage. Configure at least one provider before chatting:

- **Ollama**: run `ollama serve` and `ollama pull llama3.2`, then choose the discovered local model in the picker.
- **Gemini**: set `GEMINI_API_KEY` and keep the default model `gemini:gemini-3.6-flash` (free tier).
- **Groq**: set `GROQ_API_KEY` and choose a Groq model.
- **OpenRouter**: set `OPENROUTER_API_KEY` and choose a `:free` model.

Provider keys are read only on the server. They are never sent to the browser.

## Environment Variables

Copy `.env.example` to `.env.local`. Every variable is optional, but a public deployment should set an access token.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Google Gemini API key |
| `GROQ_API_KEY` | empty | Groq API key |
| `OPENROUTER_API_KEY` | empty | OpenRouter API key |
| `OPENROUTER_SITE_URL` | `http://localhost:3000` | Optional OpenRouter attribution |
| `OPENROUTER_APP_NAME` | `JARVIS AI Harness` | Optional OpenRouter attribution |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama endpoint |
| `SUPABASE_URL` | empty | Enables Supabase storage with the next variable |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Server-only Supabase service role key |
| `JARVIS_DATA_FILE` | `.data/jarvis.json` | Local JSON storage path |
| `JARVIS_DEFAULT_MODEL` | `gemini:gemini-3.6-flash` | Initial model ID (`provider:model`) |
| `JARVIS_MAX_ITERATIONS` | `6` | Agent loop cap, maximum 20 |
| `JARVIS_PROVIDER_TIMEOUT_MS` | `60000` | Per-provider request timeout |
| `JARVIS_TOOL_TIMEOUT_MS` | `15000` | Per-tool execution timeout |
| `JARVIS_CONTEXT_TOKEN_BUDGET` | `12000` | Approximate context budget (chars / 4) |
| `JARVIS_MEMORY_LIMIT` | `5` | Memories injected per turn |
| `JARVIS_WORKSPACE_DIR` | `.workspace` | Sandbox root for file tools |
| `JARVIS_SHELL_ALLOWLIST` | `git,node` | Permitted shell binaries |
| `JARVIS_ENABLE_SHELL` | `false` | Enables the shell tool (still approval-gated) |
| `JARVIS_ACCESS_TOKEN` | empty | Optional bearer token required by the UI and API |
| `JARVIS_RATE_LIMIT_MAX` | `240` | General API requests per IP per window |
| `JARVIS_CHAT_RATE_LIMIT_MAX` | `60` | Chat/resume requests per IP per window |
| `JARVIS_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |

Never expose `SUPABASE_SERVICE_ROLE_KEY` or provider keys to the browser.

## Gemini Models

The default Gemini route is `gemini:gemini-3.6-flash`, which Google lists with free-tier input and output tokens and which passed a live request test. The catalogue also includes the newer `gemini-3.8-flash` (free tier, but capacity-constrained during verification), `gemini-3.5-flash-lite`, and `gemini-3.1-flash-lite`.

- Gemini 2.0 models are shut down. Stored settings and conversations that still reference them are automatically migrated to the closest supported replacement.
- Any Gemini model ID can be entered manually in **Settings → Model defaults → Custom Gemini model ID** using the `provider:model` format. The provider remains the source of truth: unavailable models return a clear provider error.
- Model availability and free-tier quotas can change; check [Google's model documentation](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Access Protection

JARVIS is designed for a single owner. Set `JARVIS_ACCESS_TOKEN` before exposing it beyond localhost:

```bash
JARVIS_ACCESS_TOKEN=<long-random-value>
```

- The UI asks for the token and stores it in browser `localStorage`.
- API clients send `Authorization: Bearer <token>` or `X-Jarvis-Token: <token>`.
- `/api/health` and `/api/auth` are deliberately exempt so the UI can discover and verify protection.
- All other API routes return `401` without a valid token.
- `/api/chat` and `/api/runs/:id/resume` have a lower default rate limit.

The token is compared in constant time using SHA-256 digests. Rate limits are in-memory and per process; a multi-instance deployment needs a shared limiter. See `docs/SECURITY.md` for the full model.

## Safety Model

- **Approval gate**: sensitive tools always pause the run. The UI shows the tool, arguments, and reason. Denial is recorded and returned to the model.
- **Workspace sandbox**: file reads and writes are confined to `JARVIS_WORKSPACE_DIR` and cannot escape via `..` or symlinks.
- **Shell**: disabled by default. When enabled, only allowlisted binaries run with `execFile` (no shell), shell operators are rejected, and `node -e` is blocked.
- **Web fetch**: blocks credentials in URLs, private/loopback/link-local hosts, numeric and non-standard IP forms, and redirects that leave the public internet.
- **Secrets**: provider calls happen exclusively in server routes.
- **Input bounds**: 30,000-character messages, 1 MB JSON bodies, clamped settings, bounded contexts.
- **Error hygiene**: unexpected server errors return a generic `500`; logs redact secret-like keys and truncate large values.
- **Bounded execution**: iteration limits, provider/tool timeouts, context trimming, and per-run cancellation.

Even with these controls, review every approval request. Run JARVIS in a container or dedicated user account if you enable filesystem writes or shell access.

## Docker

```bash
docker compose build
docker compose up -d
```

Open http://localhost:3000. Compose persists data in the `jarvis-data` and `jarvis-workspace` volumes, runs as a non-root user, and includes a health check.

To expose it safely, set a token in your shell before starting:

```powershell
$env:JARVIS_ACCESS_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
docker compose up -d
```

Ollama running on the host is reachable at `http://host.docker.internal:11434` (the Compose default). See `docs/DEPLOYMENT.md` for Docker, Vercel + Supabase, backups, and TLS guidance.

## Memory

Memory is genuine, persisted long-term storage, but retrieval is lexical rather than vector-based:

- Memories are scored by token overlap, tag matches, importance, and recency.
- Retrieved memories are injected as a clearly labelled context block.
- The agent can save and update memories when `allowMemoryWrite` and memory are enabled.
- There is no embedding model dependency, which keeps the stack free and local.

See `src/harness/memory/retrieval.ts` for the scoring implementation.

## Storage

### Local (default)

Data is written atomically to `.data/jarvis.json`. This is ideal for local development and personal use. It is not durable on ephemeral/serverless filesystems. Override the path with `JARVIS_DATA_FILE`.

### Supabase

Set both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to switch adapters automatically. Apply `supabase/schema.sql` in the Supabase SQL editor first.

The schema creates:

- `jarvis_conversations`
- `jarvis_messages`
- `jarvis_memories`
- `jarvis_logs`
- `jarvis_runs`
- `jarvis_settings`

RLS is enabled with no public policies. All access uses the service role server-side.

## Project Structure

```
src/
  app/                 App Router pages and API routes
    api/               auth, chat, conversations, memory, models, runs, settings, tools, health
    chat/ agent/       chat and agent workspaces
    memory/ models/    memory and model management
    tools/ monitor/    tool catalog and run observability
    settings/          harness configuration
  components/
    chat/              composer, messages, approval card, model picker, sidebar
    dashboard/         dashboard widgets
    shell/             application shell and access gate
    ui/                Radix-based primitives
    visual/            animated background and orb
  harness/
    providers/         provider adapters and catalogue
    storage/           local and Supabase adapters
    memory/            retrieval and persistence helpers
    tools/             registry, sandbox, executor, built-ins
    orchestrator.ts    run lifecycle and streaming loop
    context.ts         context assembly and trimming
  lib/                 client API, hooks, access, rate limiting, formatting
  middleware.ts        API auth, rate limiting, security headers
tests/
  helpers/             fake Ollama/OpenAI servers, harness and Next.js helpers
  e2e/                 production HTTP/SSE tests
supabase/schema.sql    Supabase tables, indexes, and RLS
docs/                  architecture, deployment, security
```

## API Overview

All routes use the Node.js runtime. Except for `/api/health` and `/api/auth`, every route requires the access token when one is configured.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Public capabilities, limits, auth mode |
| `/api/auth` | GET | Verify an access token |
| `/api/chat` | POST | Start a chat or agent run; streams SSE |
| `/api/runs/[id]/resume` | POST | Approve or deny a pending tool call |
| `/api/runs/[id]/cancel` | POST | Cancel a run |
| `/api/runs` | GET | List recent runs |
| `/api/runs/[id]` | GET | Get a run record |
| `/api/conversations` | GET/POST | List or create conversations |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Manage one conversation |
| `/api/conversations/[id]/messages` | GET/DELETE | Read or clear messages |
| `/api/memory` | GET/POST | List or create memories |
| `/api/memory/[id]` | PATCH/DELETE | Update or delete a memory |
| `/api/models` | GET | Catalogue, provider status, and Ollama discovery |
| `/api/tools` | GET | Tool catalog with availability |
| `/api/settings` | GET/PATCH | Read or update settings |
| `/api/logs` | GET/DELETE | Read or clear execution logs |

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm start          # serve production build
npm run clean      # delete the .next build cache
npm run lint       # ESLint
npm run typecheck  # TypeScript, no emit
npm test           # unit + integration tests (112)
npm run test:e2e   # build + production HTTP/SSE E2E (7)
npm run test:all   # both suites
npm run test:watch # Vitest watch mode
```

`npm run test:e2e` requires a successful build; the script performs it automatically. The E2E suite starts a real `next start` process and fake local provider servers.

## Troubleshooting

### `ChunkLoadError` while loading `app/layout.js`

Next.js compiles routes on first request. After a cold start, especially on Windows, the first compile can take long enough for the browser's chunk request to time out even though the server is healthy.

1. Wait for the dev server to print `Ready`, then hard-reload the page (`Ctrl+Shift+R`).
2. If it still fails, stop the server and reset the cache:

   ```bash
   npm run clean
   npm run dev
   ```

Avoid running `npm run build` while `npm run dev` is active: both write to `.next`, and the production build invalidates the dev chunks the browser is using.

## Testing

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Current verified state:

- 112 unit/integration tests passing across 11 files.
- 7 production HTTP/SSE E2E tests passing.
- TypeScript, ESLint, and production build clean.
- Docker image builds and the container reports healthy; unauthorized and authorized API smoke checks pass.

Provider integration tests use deterministic fake servers. No real Gemini, Groq, OpenRouter, or Ollama credentials were available, so live-provider compatibility is not claimed. See `HACKATHON_READINESS.md` for the evidence table and known limitations.

## Free-Tier Notes

- Gemini, Groq, and OpenRouter offer free tiers with rate limits and model availability that can change.
- Ollama has no usage cost but requires local compute.
- Supabase's free tier pauses inactive projects and has storage/bandwidth quotas.
- The local JSON adapter is free and zero-config but not durable on serverless hosts.
- JARVIS does not require a paid vector database; memory retrieval is lexical by design.

## Deployment

- **Self-hosted Docker (recommended)**: `docs/DEPLOYMENT.md`.
- **Vercel + Supabase**: supported with caveats; local JSON and workspace are ephemeral, and shell tools should stay disabled.
- **Bare Node**: `npm run build && npm start` with a persistent `.data` directory.
- **Cloudflare Workers/Pages**: not supported out of the box. The shell and filesystem tools rely on Node APIs, and the local adapter needs persistent disk.

Always set `JARVIS_ACCESS_TOKEN` and TLS for any internet-facing deployment. Read `docs/SECURITY.md` first.

## Documentation

- `docs/ARCHITECTURE.md`: runtime design, streaming, providers, storage, tools, testing.
- `docs/DEPLOYMENT.md`: Docker, Vercel/Supabase, backups, health checks, troubleshooting.
- `docs/SECURITY.md`: threat model, implemented controls, limitations, checklist.
- `HACKATHON_READINESS.md`: verified evidence, demo script, submission checklist.

## Implemented vs Not Implemented

### Implemented

- Multi-provider streaming (Gemini, Groq, OpenRouter, Ollama)
- Provider discovery, health, and Ollama model listing
- Streaming chat and agent loop
- Tool catalogue, execution, timeouts, approval pause/resume
- Persistent conversation history, pinning, search, deletion
- Persistent memory with lexical retrieval
- Local JSON and Supabase storage adapters
- Execution logs and run monitoring
- Optional access token, API gate, rate limiting, security headers
- Dockerfile, Compose, non-root container, health check
- Production HTTP/SSE E2E suite and fake provider servers
- Unit/integration coverage for math, retrieval, context, permissions, sandboxing, models, chat, approvals, providers, security

### Not Implemented

- User accounts, roles, or per-user isolation
- Multi-instance shared rate limiting or run leasing
- Vector/semantic memory embeddings
- File uploads or image/audio input
- Voice input/output
- Built-in web search (only explicit `web_fetch`)
- Scheduled or background agents
- Streaming shell output
- Exact token accounting (estimates use chars / 4)
- Cloudflare Workers support
- Browser-level UI automation (Playwright)
- Full CSP (security headers are present, but no nonce-based CSP yet)

## License

No license has been declared for this project. Add one before distributing it.
