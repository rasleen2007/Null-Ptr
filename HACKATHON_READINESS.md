# Hackathon Readiness

Status: **demo-ready for self-hosted, single-owner use**. The app builds, tests, runs in Docker, and supports a complete chat/agent demo with local Ollama or a configured hosted provider. It is not a multi-tenant production service.

## Verified Evidence

| Check | Command | Result |
| --- | --- | --- |
| Unit + integration tests | `npm test` | 97 passed, 10 files |
| Production HTTP/SSE E2E | `npm run test:e2e` | 7 passed |
| TypeScript | `npm run typecheck` | Clean |
| ESLint | `npm run lint` | Clean |
| Production build | `npm run build` | Succeeded |
| Docker image | `docker build -t jarvis-ai-harness:local .` | Succeeded |
| Container health | `docker inspect --format '{{.State.Health.Status}}'` | `healthy` |
| Container auth smoke | unauthorized `/api/conversations`, authorized `/api/auth` | `401`, then `200` |
| Health endpoint | `GET /api/health` | `ok: true`, correct storage and auth mode |
| Secret exposure check | Health/API responses | No provider keys or access token returned |

No real Gemini, Groq, OpenRouter, or Ollama account was used for automated testing. Provider behavior was verified against deterministic fake servers. Live-provider compatibility should be smoke-tested manually before a demo.

## What Works

- Dashboard with system status, provider state, recent runs, and quick actions.
- Streaming chat and agent workspace with live tokens, thinking indicators, tool activity, and usage.
- Four provider adapters: Gemini, Groq, OpenRouter, and Ollama.
- Agent loop with iteration limits, timeouts, cancellation, and persisted run state.
- Approval pause/resume for `file_write` and `shell_command`; denial is returned to the model.
- Workspace-sandboxed file tools.
- Persistent conversation history, pinning, search, and deletion.
- Persistent memory with deterministic lexical retrieval and prompt injection.
- Local JSON storage by default; Supabase adapter and schema included.
- Execution logs and run monitor.
- Optional access token, rate limiting, security headers, body limits, and error/log hygiene.
- Dockerfile, Compose, non-root runtime, persistent volumes, and health check.
- Fake Ollama and OpenAI-compatible servers for deterministic tests.

## Providers: Real vs Mocked

| Provider | Adapter | Automated verification | Live credentials tested |
| --- | --- | --- | --- |
| Ollama | Real HTTP adapter | Fake local Ollama server: streaming, tools, errors, timeout | No |
| Groq | OpenAI-compatible adapter | Fake OpenAI-compatible server: auth, streaming, tools, errors | No |
| OpenRouter | OpenAI-compatible adapter | Fake server with attribution headers | No |
| Gemini | Native adapter | Mocked `fetch`: streaming, function calls, errors, safety blocks | No |

Do not claim "tested with real Gemini/Groq/OpenRouter" in a pitch. Say "provider adapters are covered by deterministic integration tests; live keys were not available."

## Recommended Demo

### Preparation

1. Start Ollama and pull a model:
   ```bash
   ollama serve
   ollama pull llama3.2
   ```
2. Start the app:
   ```bash
   npm run build
   npm start
   ```
   or:
   ```bash
   docker compose up -d
   ```
3. If using an access token, have it ready.
4. Confirm `/api/health` is green and the chosen Ollama model appears in the model picker.
5. Pre-create one memory and one conversation if you want a fast opening.

### 5-minute flow

1. **Dashboard (30s)**: show provider status, storage mode, and safety defaults.
2. **Chat (60s)**: ask a question; show streaming tokens and the persisted conversation.
3. **Memory (60s)**: save a durable fact, start a new conversation, ask a question that retrieves it, and show the memory-injection log.
4. **Agent approval (90s)**: enable file write, run an agent request that writes a note. Show the approval card with arguments. Approve it and show the file in the workspace/monitor. Then deny a second request and show nothing was written.
5. **Monitor (45s)**: show run status, iteration count, tool results, and execution logs.
6. **Safety/security (45s)**: show shell disabled, explain the sandbox and access gate, and mention the E2E tests.
7. **Close (30s)**: summarize multi-provider, streaming, memory, approvals, persistence, and Docker.

### Failure fallback

If the network or a hosted provider fails, switch to local Ollama. If Ollama is not available for the live demo, use the recorded test output or run the fake-server E2E suite to demonstrate streaming and approvals deterministically.

## Security Summary for Judges

- Sensitive tools cannot run without human approval.
- Shell is off by default; when enabled, it is allowlisted, shell-free, and approval-gated.
- File tools are confined to a workspace.
- Optional access token gates the UI and API; comparisons are constant-time.
- API rate limiting, 1 MB body caps, generic 500s, redacted logs, and security headers are implemented.
- Provider and Supabase keys stay server-side.
- Docker runs as a non-root user with dropped capabilities.

Remaining risks are documented in `docs/SECURITY.md`: no user accounts, in-memory rate limits, token in `localStorage`, no full CSP, DNS rebinding for `web_fetch`, and two accepted production dependency advisories until a Next major upgrade.

## Deployment Readiness

| Target | Status |
| --- | --- |
| Local development | Ready |
| Docker Compose self-host | Ready and smoke-tested |
| Bare Node.js with persistent disk | Ready |
| Vercel + Supabase | Supported with caveats; keep shell/file tools disabled and use Supabase for persistence |
| Multi-user SaaS | Not ready; no per-user isolation |
| Cloudflare Workers | Not supported without replacing Node-only tools and storage |

Deployment steps are in `docs/DEPLOYMENT.md`. Public exposure requires `JARVIS_ACCESS_TOKEN` and TLS.

## Known Limitations

- No real hosted-provider credentials were available for automated tests.
- No browser-level UI automation (Playwright is not installed).
- No user accounts, roles, or per-user data isolation.
- Rate limiting is process-local; serverless replicas do not share counters.
- Access token is a shared secret stored in `localStorage`; no MFA or full CSP.
- `web_fetch` does not resolve DNS, so DNS rebinding/private-IP SSRF is not fully mitigated.
- Shell commands are allowlisted and approval-gated, not OS-sandboxed.
- Memory retrieval is lexical, not vector/semantic.
- Token accounting is approximate (chars / 4).
- Production audit still reports a moderate Next advisory and a high PostCSS advisory nested under Next; the available fix is a Next 16 major upgrade.
- Development audit reports Vitest/Vite/tinypool advisories; these are not in the production image.

## Submission Checklist

- [ ] `.env.local` is not committed and contains no secrets in the repository.
- [ ] `JARVIS_ACCESS_TOKEN` is set for the demo URL.
- [ ] TLS is enabled if the demo is public.
- [ ] Shell remains disabled for the demo unless explicitly shown.
- [ ] A provider is configured and manually smoke-tested.
- [ ] `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- [ ] Docker image builds and the container is healthy.
- [ ] Data/workspace volumes are backed up or disposable.
- [ ] `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md` are included.
- [ ] The pitch states that providers are integration-tested with fakes, not live keys.
- [ ] Known limitations and next steps are disclosed honestly.

## Suggested Next Steps After the Hackathon

1. Add live provider smoke tests behind an opt-in environment flag.
2. Add a nonce-based Content Security Policy and move the access token to a secure, HTTP-only session.
3. Add a Redis-backed rate limiter and run leases for multi-instance deployments.
4. Add DNS resolution and IP pinning for `web_fetch`.
5. Upgrade to Next 16 and re-run the full regression suite to clear remaining advisories.
6. Add Playwright coverage for the access gate, chat, approval, and monitor flows.
7. Add accounts and per-user storage isolation before any multi-user offering.
8. Add vector embeddings only if lexical retrieval proves insufficient.
