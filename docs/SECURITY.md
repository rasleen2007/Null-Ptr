# Security Guide

JARVIS is a single-owner AI harness, not a multi-tenant platform. This document describes the threat model, the controls that are implemented, and the risks that remain. Read it before exposing the app beyond localhost.

## Threat Model

Assets:

- provider API keys and the Supabase service-role key;
- conversation history, memories, run logs, and workspace files;
- the host filesystem and any enabled shell;
- provider quota and spending limits;
- the access token itself.

Primary risks:

1. Unauthorized use of the API or provider quota.
2. Prompt-driven tool abuse: writes, shell commands, or SSRF.
3. Secret leakage through responses, logs, or the browser bundle.
4. Host escape through filesystem or shell tools.
5. Denial of service through large bodies, long runs, or request floods.

Assumed deployment: one trusted owner, a private server or container, with TLS and an access token for any public exposure.

## Implemented Controls

### Secrets stay server-side

- Provider calls and Supabase access happen only in Node.js API routes and the harness.
- `SUPABASE_SERVICE_ROLE_KEY` is read from the environment and never included in client code.
- The health endpoint reports provider booleans, not keys.
- Client bundles contain no provider credentials by construction; only the access token the user enters is stored locally.

### Access token

When `JARVIS_ACCESS_TOKEN` is set:

- the UI shows an access gate before rendering the app;
- every API route except `/api/health` and `/api/auth` requires the token;
- clients may use `Authorization: Bearer <token>` or `X-Jarvis-Token`;
- comparison uses SHA-256 digests and a constant-time XOR loop;
- a wrong or missing token returns `401` with `WWW-Authenticate: Bearer`.

`/api/auth` lets the browser verify a stored token. `/api/health` is public so the UI can discover whether a token is required.

### Rate limiting

`src/middleware.ts` limits API requests per IP and path:

- general API: `JARVIS_RATE_LIMIT_MAX`, default 240 per window;
- `/api/chat` and `/api/runs/:id/resume`: `JARVIS_CHAT_RATE_LIMIT_MAX`, default 60 per window;
- window: `JARVIS_RATE_LIMIT_WINDOW_MS`, default 60 seconds;
- blocked requests return `429` with `Retry-After`.

Limits are in-memory and per process. They are best-effort abuse friction, not a hard quota. A multi-instance deployment needs a shared limiter.

**IP trust caveat:** the limiter uses `X-Forwarded-For` when present. Behind a correctly configured reverse proxy, this reflects the client. If the app is exposed directly, a client may spoof the header and rotate apparent IPs. Treat the access token as the primary control.

### Input and error hygiene

- JSON bodies are capped at 1 MB and must be objects (`src/lib/http.ts`).
- Messages are trimmed and capped at 30,000 characters.
- Conversation titles, system prompts, memory tags, settings, and iteration counts are clamped.
- Unexpected exceptions return a generic `500` (`Internal server error.`) without stack traces or internal messages.
- Intentional `HarnessError` responses preserve only safe, user-facing messages and codes.
- Run logs redact keys matching `api_key`, `token`, `secret`, `password`, `credential`, `authorization`, or `cookie`; strings are truncated and nested data is depth/size limited.

### Security headers

Pages and API responses include:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

`poweredByHeader` is disabled.

### Approval-gated tools

- `file_write` and `shell_command` always pause for explicit approval.
- The pending call ID is bound to the decision; a stale approval cannot authorize another call.
- Denials are recorded and returned to the model; the tool does not execute.
- Pending approvals survive restarts because they are persisted in the run record.
- Safe tools still pass availability checks, argument validation, and timeouts.

### Filesystem sandbox

- Paths resolve against `JARVIS_WORKSPACE_DIR`.
- `..` escapes and symlink escapes are rejected.
- Reads and writes are limited to the workspace.
- The container uses dedicated persistent volumes for data and workspace.

### Shell controls

- Disabled by default (`JARVIS_ENABLE_SHELL=false`).
- Only allowlisted binaries run (`git,node` by default).
- Execution uses `execFile`, not a shell.
- Shell operators, redirection, and `node -e` are rejected.
- Approval is always required, even when enabled.
- The Docker image runs as a non-root user and drops capabilities.

### Network fetch controls

`web_fetch` blocks:

- non-HTTP(S) protocols;
- credentials embedded in URLs;
- literal loopback, private, link-local, and reserved hosts;
- numeric and non-standard IP encodings;
- private DNS suffixes;
- redirects that leave the allowed public space.

**Limitation:** DNS is not resolved during validation. A public hostname that resolves to a private address, or DNS rebinding, is not fully mitigated. Use egress firewall rules for a hardened deployment.

### Persistence and audit

- RLS is enabled on all Supabase tables with no public policies; only the server-side service role accesses them.
- Local writes are atomic and serialized within one process.
- Logs are bounded at 2,000 entries; runs at 300.
- Logs are observable in the UI and via `/api/logs`.

## Dependency Status

Verified on 2026-11-10 with `npm audit --omit=dev` and `npm audit`:

- `sharp` was updated by `npm audit fix`; the earlier libvips/libheif advisories are resolved in the lockfile.
- Production dependencies still report 2 advisory items: a moderate `next` advisory and a high `postcss` advisory nested under Next. The suggested fix is a major upgrade to Next 16.4.6.
- Development dependencies report additional advisories in Vitest/Vite/tinypool and ESLint tooling. These are not part of the production image and are not reachable at runtime.

Why the remaining production items are accepted for this release:

- JARVIS does not process untrusted CSS at runtime; PostCSS is used during the build.
- The app does not accept arbitrary stylesheet input from users.
- A Next major upgrade was out of scope for a verified hackathon release and would require a full regression pass.

Action before a long-lived public deployment: plan a Next 16 upgrade, re-run the full test/build/Docker suite, and re-audit dependencies. Do not run `npm audit fix --force` blindly in production.

## Known Limitations

- **No user accounts or per-user isolation.** The access token is one shared secret.
- **No MFA.** A leaked token grants full access.
- **Token stored in `localStorage`.** A successful XSS bug could read it. There is no nonce-based CSP yet.
- **No shared rate limiter.** Serverless or multi-instance deployments can exceed intended limits.
- **No CSRF tokens.** Authentication uses a bearer header rather than cookies, which removes classic cookie-based CSRF, but the app is not a general-purpose identity system.
- **No OS-level sandbox for approved shell commands.** Allowlisting and approval reduce risk but do not contain a malicious allowlisted binary.
- **DNS rebinding/SSRF remains possible** for `web_fetch` as described above.
- **Log redaction is key-based and best-effort.** Secrets embedded in free-form message text may still appear. Do not put secrets in prompts or tool arguments.
- **No tamper-evident audit trail.**
- **No browser-level UI security testing** yet.

## Deployment Checklist

- [ ] Set a long random `JARVIS_ACCESS_TOKEN`.
- [ ] Terminate TLS at a trusted reverse proxy; do not expose port 3000 directly.
- [ ] Keep `JARVIS_ENABLE_SHELL=false` unless explicitly needed.
- [ ] Keep file tools disabled in serverless deployments.
- [ ] Use a persistent data volume or Supabase; back it up.
- [ ] Restrict Ollama, Supabase, and provider endpoints to trusted networks.
- [ ] Verify `/api/health` and `401` behavior with the token absent.
- [ ] Verify a wrong token is rejected and the correct token works.
- [ ] Confirm logs do not contain keys or tokens.
- [ ] Review dependency advisories before each release.
- [ ] Rotate keys and the access token after any suspected exposure.
- [ ] Add egress firewall rules if `web_fetch` is enabled for untrusted prompts.

## Incident Response

1. Remove or rotate `JARVIS_ACCESS_TOKEN`.
2. Rotate Gemini, Groq, OpenRouter, and Supabase service-role keys.
3. Review `/api/logs`, provider dashboards, and Supabase access logs.
4. Stop the container or scale it to zero if abuse is ongoing.
5. Inspect `.data` and the workspace volume for unexpected files.
6. Patch, rebuild, and redeploy; re-run the security tests.

Report security issues privately to the project owner. Do not open a public issue containing exploit details or live secrets.
