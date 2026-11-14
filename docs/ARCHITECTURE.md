# JARVIS Architecture

This document explains how the harness works at runtime, where the trust boundaries are, and how to extend it without breaking the safety model.

## Design Goals

1. **Provider independence**: one streaming interface for hosted and local models.
2. **Server-only secrets**: provider and service-role keys never reach the client.
3. **Approval-gated autonomy**: the agent can propose sensitive actions but cannot execute them without a human decision.
4. **Real persistence**: conversations, memories, runs, and logs survive restarts.
5. **Free-tier viability**: no mandatory paid vector database, queue, or hosting service.
6. **Explicit failure bounds**: iteration, time, context, body, and output limits are enforced.

## System Overview

```
Browser (React 19)
  pages + chat workspace + access gate
        |
        | fetch / SSE (optional bearer token)
        v
Next.js middleware (src/middleware.ts)
  - API rate limiting
  - access-token verification
  - security headers
        |
        v
Next.js App Router API routes (Node.js runtime)
        |
        v
Harness facade (src/harness/orchestrator.ts)
  +-- Provider registry --> Gemini / Groq / OpenRouter / Ollama
  +-- Tool registry     --> utility / memory / files / web / shell
  +-- Memory retrieval  --> lexical scoring + persistence
  +-- Context builder   --> system prompt, memory block, history trimming
  +-- Storage adapter   --> local JSON or Supabase
```

There is no separate worker, queue, or database server in the default setup. The Next.js server process owns run execution and delegates persistence to the configured adapter.

## Access Protection and Rate Limiting

`src/middleware.ts` matches every `/api/:path*` request.

1. Requests are rate limited per client IP and per path. The default is 240 requests per 60 seconds, or 60 for `/api/chat` and `/api/runs/:id/resume`. Limits are configurable through environment variables.
2. When `JARVIS_ACCESS_TOKEN` is set, the request must carry `Authorization: Bearer <token>` or `X-Jarvis-Token`. The comparison uses SHA-256 digests and a constant-time loop.
3. `/api/health` and `/api/auth` remain public so the UI can discover protection and verify a token.
4. All API responses receive `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers. `next.config.mjs` adds the same headers plus `Permissions-Policy` to pages.

The browser gate lives in `src/components/shell/access-gate.tsx`. It checks `/api/health`, verifies any stored token against `/api/auth`, and stores a valid token in `localStorage`. The shared API client attaches the token to every request.

**Limitation:** rate-limit buckets are process-local. Multiple instances or serverless replicas do not share counters. A public multi-instance deployment needs Redis or another shared limiter.

## Runtime Lifecycle

### Starting a chat or agent run

`POST /api/chat` validates the body, then calls `harness.startChat`.

1. Load effective settings (stored settings merged over defaults).
2. Resolve or create the conversation.
3. Persist the user message.
4. Create a `RunRecord` with status `running` and a serializable `RunState`.
5. Register an `AbortController` in the in-process active-run registry.
6. Return an event source. The route streams it as Server-Sent Events.

### The agent loop

`runAgent` is an async generator. Each iteration:

1. Check cancellation and the persisted run status.
2. If pending tool calls exist, execute them one at a time.
3. Otherwise, check the iteration limit and increment it.
4. Retrieve memories for the latest user message (first iteration only).
5. Rebuild provider context from stored messages with the token budget.
6. Stream the provider response, forwarding text deltas and collecting tool calls.
7. Persist the assistant message.
8. If there are no tool calls, finish as `completed`.
9. If there are tool calls, store them in `RunState` and continue the loop.

The loop is bounded by `settings.maxIterations` (hard-capped at 20), provider timeouts, tool timeouts, and the context budget. A runaway model cannot loop forever.

### Tool execution and approval

Tool definitions carry a sensitivity: `safe` or `sensitive`.

For every pending call:

1. Verify the tool exists.
2. Verify availability: global tool flag, per-permission flag, shell environment flag, memory flag, and model tool support.
3. If the tool is sensitive and has not been approved, persist `awaiting_approval`, emit a `permission_request` event, and end the stream.
4. On approval, `POST /api/runs/:id/resume` reloads the run and resumes the generator at the same pending index.
5. On denial, a synthetic tool result is stored, so the model can see that the user refused and continue.
6. Approved tools execute with a per-tool timeout and an abort signal.

The approval decision is tied to the specific tool call ID, preventing a stale approval from authorizing a different action. Pending approvals survive a storage restart because they live in the run record.

### Cancellation

`POST /api/runs/:id/cancel` marks the run `cancelled` and aborts its controller. The generator checks both the signal and the persisted status. If the client disconnects, the SSE route calls `cancelRun` so abandoned runs do not continue consuming provider quota.

The active-run registry is in-memory and process-local. In a multi-instance deployment, cancellation or resume requests must reach the instance that owns the run. A shared queue or run lease would be required for horizontal scaling.

## Streaming Events

The SSE stream uses one JSON object per event:

- `run`: run and conversation IDs
- `title`: generated conversation title
- `iteration`: current step and cap
- `thinking`: human-readable progress
- `delta`: assistant token chunk
- `tool_call`: tool invocation with sensitivity and category
- `permission_request`: pending sensitive action
- `tool_result`: tool output and error flag
- `usage`: optional provider token counts
- `error`: failure message and code
- `done`: terminal status (`completed`, `failed`, `cancelled`, `awaiting_approval`)

The client hook in `src/lib/use-chat-session.ts` reduces these events into assistant text, tool activity, permission cards, and run state.

## Context Assembly

`src/harness/context.ts` builds provider messages from:

1. The system prompt.
2. An optional memory block, clearly marked as retrieved notes.
3. Recent conversation history, trimmed to fit the token budget.
4. Tool messages and assistant tool calls in provider-compatible form.

Token counts are estimates (`characters / 4`). This is intentionally approximate and provider-agnostic; it is not billing-grade accounting.

Trimming preserves the newest turns and avoids splitting a tool-call/tool-result pair. If the budget is extremely small, the system prompt and memory block still take priority.

## Provider Layer

`src/harness/providers/` contains:

- `catalog.ts`: static free-tier model catalogue and metadata.
- `gemini.ts`: Google Generative Language API adapter.
- `openai-compatible.ts`: shared adapter for Groq and OpenRouter.
- `ollama.ts`: local `/api/chat` adapter plus model discovery.
- `transport.ts`: fetch/stream parsing and timeout handling.
- `registry.ts`: model resolution and provider status.

Every adapter yields the same `ProviderEvent` union: text deltas, tool calls, usage, and finish reason. The orchestrator does not know which provider produced them.

Provider resolution rules:

- A model ID is `provider:model`.
- Unknown providers are rejected.
- Models outside the static catalogue can still be used when their provider is configured, but Ollama models are discovered dynamically.
- Models that do not support tools receive an empty tool list.
- HTTP failures preserve upstream status when safe to do so (for example Ollama 4xx/5xx responses).

## Storage Contract

`src/harness/storage/types.ts` defines the adapter interface. Both adapters implement:

- conversations: list, search, get, create, update, delete
- messages: list, add, clear
- memories: list, create, update, delete
- logs: add, list, clear
- runs: create, get, update, list
- settings: get, update

### Local adapter

- Atomic writes via a temporary file and rename.
- A process-local mutex serializes writes.
- In-memory cache after first load.
- Logs capped at 2000 entries; runs capped at 300.
- Data file defaults to `.data/jarvis.json`; override with `JARVIS_DATA_FILE`.

This adapter is intentionally simple and single-process. Do not run multiple writers against the same file.

### Supabase adapter

- Uses the service role key on the server only.
- Tables are defined in `supabase/schema.sql`.
- RLS is enabled with no public policies; the service role bypasses RLS.
- Conversation counters are updated on message add and clear.
- Deleting a conversation removes its messages and runs.

Supabase is a network dependency: provider errors and storage errors are surfaced as run failures rather than silently discarded.

## Tool Layer

`src/harness/tools/` contains the registry, argument validation, executor, sandbox helpers, and built-ins.

Built-in tools:

| Tool | Category | Sensitivity | Notes |
| --- | --- | --- | --- |
| `calculator` | utility | safe | Safe arithmetic parser |
| `current_time` | utility | safe | Timezone-aware clock |
| `memory_search` | memory | safe | Lexical memory lookup |
| `memory_save` | memory | safe | Persists a memory |
| `memory_update` | memory | safe | Updates an owned memory |
| `file_list` | filesystem | safe | Sandboxed listing |
| `file_read` | filesystem | safe | Sandboxed read |
| `file_write` | filesystem | sensitive | Sandboxed write, approval required |
| `web_fetch` | web | safe | Public text/JSON/XML fetch |
| `shell_command` | system | sensitive | Allowlisted binary, approval required, off by default |

### Permission mapping

| Permission | Tools |
| --- | --- |
| `allowFileRead` | `file_read`, `file_list` |
| `allowFileWrite` | `file_write` |
| `allowMemoryWrite` | `memory_save`, `memory_update` |
| `allowNetwork` | `web_fetch` |
| `allowShell` | `shell_command` |

A tool is available only when tools are globally enabled, the relevant permission is on, the model supports tools, and environment-level gates allow it. Sensitivity adds the approval requirement on top.

### Sandboxing

- Paths are resolved against the workspace root and rejected if the relative path escapes it.
- Shell commands are parsed into program and arguments, executed with `execFile`, and restricted to an allowlist.
- Shell operators and `node -e` are rejected.
- Web fetch blocks credentials, literal loopback/private/link-local hosts, private DNS suffixes, numeric hostnames, and non-HTTP protocols.
- Redirects are re-validated against the same rules.

**Known limitation:** URL validation inspects the literal hostname and does not resolve DNS. A public hostname that resolves to a private address, or DNS rebinding, is not fully mitigated. For a hardened deployment, add DNS resolution checks, pin the resolved IP, and use egress firewall rules.

## Memory

`src/harness/memory/retrieval.ts` scores stored memories against the latest user message using:

- token overlap, normalized by query size
- a higher weight for tag matches
- importance weight
- a small recency boost

`src/harness/memory/manager.ts` retrieves the top N, updates access metadata, and formats a prompt block with IDs and timestamps. Memory writes go through tools and respect `allowMemoryWrite`.

This is not a vector store and does not claim semantic understanding. It is deterministic, dependency-free, and works offline.

## Security Boundaries

| Boundary | Control |
| --- | --- |
| Browser to server | Optional access token; no provider keys or service-role key in client bundles |
| Server to provider | Timeouts, abort signals, retry only before output |
| Model to tools | Availability checks, argument validation, approval for sensitive tools |
| Tool to filesystem | Workspace containment |
| Tool to shell | Disabled by default, allowlist, no shell, approval |
| Tool to network | URL validation, redirect validation, size and content limits |
| Storage | Service role server-only; RLS denies public access |
| Input | Message length caps, 1 MB JSON body cap, shape validation, settings clamping |
| API surface | Rate limits, constant-time token comparison, generic 500 errors, security headers |
| Logs | Secret-key redaction, value truncation, bounded retention |

### Deliberate non-goals

- No user accounts or multi-tenant isolation; the access token is a single shared secret.
- No MFA or per-user audit trail.
- No shared rate limiter or run lease for multi-instance deployments.
- No OS-level sandbox for shell tooling beyond allowlisting and approval.
- No full Content Security Policy yet. Browser storage of the access token means an XSS bug could expose it.
- No tamper-evident audit log.

Do not treat the access token as a substitute for per-user isolation. For public multi-user use, add accounts, scoped storage, CSRF protection, a shared limiter, and network egress controls.

## Extending the Harness

### Add a provider

1. Implement `ProviderAdapter` in `src/harness/providers/`.
2. Register it in `src/harness/providers/registry.ts`.
3. Add models to `catalog.ts` if they should appear in the picker.
4. Add the key to `ServerConfig` and `.env.example`.
5. Map provider tool calls and results to the shared `ProviderEvent`/`ProviderMessage` shapes.

### Add a tool

1. Define a `ToolDefinition` with a JSON schema and sensitivity.
2. Add it to the registry.
3. Map its permission in `PERMISSION_KEYS` if it needs a toggle.
4. Add sandbox or validation helpers when it touches the host.
5. Add unit and integration tests for validation and failure paths.
6. Update the tools page and documentation.

### Add a storage backend

Implement the `Storage` interface and return it from `src/harness/storage/index.ts`. Keep adapter-specific row mapping inside the adapter. The orchestrator should never import a database client directly.

## Testing Strategy

- **Unit tests** cover safe arithmetic, retrieval scoring, context trimming, permissions, URL/path sandboxing, shell validation, model resolution, body limits, error hygiene, log redaction, and rate limiting.
- **Harness integration tests** use a fake Ollama server and temp storage to cover chat persistence, provider switching, retries, timeouts, empty responses, cancellation, memory injection, approval pause/resume, rejection, restart recovery, and provider adapters (OpenAI-compatible and Gemini).
- **Production E2E tests** build the app, start `next start`, and exercise health, auth, SSE chat, reload, missing credentials, provider errors, approval/resume, filesystem effects, and cancellation over real HTTP.
- **Container smoke test** builds the Docker image and verifies health, unauthorized access, auth, and the Docker health check.

Current verified suite: 97 unit/integration tests and 7 HTTP/SSE E2E tests. Real hosted-provider calls are not part of the suite because no live credentials were available. The fake servers are deterministic and do not prove live API compatibility.
