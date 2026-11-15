# Sarkari Kaam AI Harness (JARVIS)

A **privacy-first, local-first** Indian government paperwork assistant. specialized variant of the AI Harness with sovereign PII protection, Hindi/Hinglish support, and government-domain tooling.

## Architecture Overview

### Privacy-First Design (Sarkari Kaam)

| Layer | Protection |
|-------|------------|
| **Vault** | AES-256-GCM encrypted, passphrase-derived keys (scrypt N=32768), HMAC integrity check |
| **Ingress Redaction** | All user messages scanned for Aadhaar, PAN, Phone, Email, DOB, Address before storage/model call |
| **Placeholders** | Replaced with deterministic tokens: `{{AADHAAR_1}}`, `{{PAN_1}}`, `{{PHONE_1}}`, etc. |
| **Outbound Guard** | Scans assistant output for leaked vault values; scrubs to placeholders; routes unknown PII to local Ollama only |
| **Log Scrubbing** | All log entries redacted at write-time via `redactLogData()` |
| **Untrusted Wrapping** | External tool results wrapped with nonce, tool attribution, and `UNTRUSTED DATA` markers |

### Key Privacy Invariants
- **Vault never leaves server** — plaintext values only in memory while unlocked
- **No PII in model context** — placeholders only, even for local models
- **Unknown PII → local only** — outbound guard routes to Ollama, never to cloud providers
- **Audit trail** — every redaction logged with placeholder mapping

## Features

### Voice Input (Whisper)
- Microphone button in composer with visual recording indicator
- Real-time countdown (max 30s), cancel control, status states
- Transcription via local Whisper (Ollama) or cloud fallback

### Text-to-Speech (TTS)
- Speaker button on every assistant message
- Auto language detection: Devanagari → `hi-IN`, Latin → `en-IN`
- Active speech highlight, stop control, respects `prefers-reduced-motion`

### Memory & Recall
- Persistent memories with lexical scoring (token overlap, tags, importance, recency)
- **Hindi/Hinglish retrieval** — Devanagari and romanized queries both work
- `matchedTerms` returned per memory for UI highlighting
- Memory recall pills displayed inline in chat stream

### Government Tools
- `gov_fetch` tool — strict `.gov.in` / `.nic.in` domain validation
- Redirect chain validation (must stay on allowlisted domains)
- 10s timeout, 100KB size limit, `wrapUntrusted` protection
- Document cards for RTI drafts and demo PDFs in chat

### Accessibility
- **Large text toggle** in top bar (persists in localStorage)
- Responsive layout, refined status indicators
- Focus-visible outlines, reduced motion support

## Requirements

- Node.js 20+ (Node 22 or 24 recommended)
- npm 10+
- **Ollama** for local inference (required for privacy features):
  ```bash
  ollama serve
  ollama pull llama3.2
  ollama pull whisper  # for voice input
  ```
- Optional: API keys for Gemini, Groq, OpenRouter (cloud providers)
- Optional: Supabase for cloud persistence

## Quick Start

```bash
npm install
copy .env.example .env.local   # Windows
# cp .env.example .env.local   # macOS/Linux

# Generate a strong vault passphrase
# Store it securely — it cannot be recovered
npm run dev
```

Open http://localhost:3000 → **Settings → Vault** → set your passphrase to unlock PII handling.

## Environment Variables

Copy `.env.example` to `.env.local`. Critical variables for Sarkari Kaam:

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama endpoint (required for privacy) |
| `JARVIS_VAULT_FILE` | `.data/vault.enc.json` | Encrypted vault path |
| `JARVIS_DEFAULT_MODEL` | `ollama:llama3.2` | Default to local model |
| `JARVIS_ACCESS_TOKEN` | empty | Optional bearer token for API/UI |
| `GEMINI_API_KEY` | empty | Cloud provider (opt-in only) |
| `GROQ_API_KEY` | empty | Cloud provider (opt-in only) |
| `OPENROUTER_API_KEY` | empty | Cloud provider (opt-in only) |
| `SUPABASE_URL` | empty | Cloud persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Server-only Supabase key |

**Privacy Note**: Never set cloud provider keys if you want strict local-only operation. The outbound guard will still route unknown PII to Ollama, but cloud models may receive placeholder-redacted content.

## Models

| Provider | Models | Use Case |
|---|---|---|
| **Ollama (local)** | `llama3.2`, `llama3.1`, `mistral`, `whisper` | **Primary** — all PII handling, voice, TTS |
| **Gemini** | `gemini-3.6-flash`, `gemini-3.5-flash-lite` | General chat (PII redacted) |
| **Groq** | `llama-3.3-70b-versatile`, `mixtral-8x7b` | Fast cloud inference (PII redacted) |
| **OpenRouter** | `:free` models | Variety (PII redacted) |

**Model Selection Logic**:
1. Default: `ollama:llama3.2` (local, private)
2. User can override in Settings → Model defaults
3. Outbound guard enforces: unknown PII → Ollama only

## Vault Operations

### Unlock (required for PII handling)
```bash
# Via UI: Settings → Vault → Enter passphrase
# Via API:
curl -X POST http://localhost:3000/api/vault \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"action":"unlock","passphrase":"your-passphrase"}'
```

### Lock
```bash
curl -X POST http://localhost:3000/api/vault \
  -H "Authorization: Bearer <token>" \
  -d '{"action":"lock"}'
```

### Status
```bash
curl http://localhost:3000/api/vault \
  -H "Authorization: Bearer <token>"
# Returns: { exists, unlocked, fieldCount, updatedAt }
```

## API Overview

All routes require `JARVIS_ACCESS_TOKEN` when configured (except `/api/health`, `/api/auth`).

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Capabilities, limits, auth mode |
| `/api/auth` | GET | Verify access token |
| `/api/chat` | POST | Start chat/agent run (SSE stream) |
| `/api/runs/[id]/resume` | POST | Approve/deny tool call |
| `/api/runs/[id]/cancel` | POST | Cancel run |
| `/api/conversations` | GET/POST | List/create conversations |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Manage conversation |
| `/api/conversations/[id]/messages` | GET/DELETE | Read/clear messages |
| `/api/memory` | GET/POST | List/create memories (PII redacted) |
| `/api/memory/[id]` | PATCH/DELETE | Update/delete memory |
| `/api/models` | GET | Catalogue, provider status, Ollama discovery |
| `/api/tools` | GET | Tool catalog |
| `/api/settings` | GET/PATCH | Read/update settings |
| `/api/vault` | GET/POST/DELETE | Vault status, unlock, lock, wipe |
| `/api/vault/fields/[placeholder]` | GET | Resolve placeholder (server-only) |
| `/api/files` | GET | Serve generated documents (RTI, PDFs) |
| `/api/logs` | GET/DELETE | Execution logs (redacted) |

## Chat Stream Events

The `/api/chat` SSE stream emits:

| Event | Payload |
|---|---|
| `delta` | `{ text: string }` — token chunk |
| `tool_call` | `{ name, args, id }` — tool invocation |
| `tool_result` | `{ name, result, id, isError }` — tool completion |
| `approval_request` | `{ tool, args, reason }` — human approval needed |
| `memory_recall` | `{ memories: [{ id, content, matchedTerms, score }] }` — recalled memories |
| `run_status` | `{ status: "running" \| "completed" \| "failed" \| "cancelled" }` |
| `usage` | `{ inputTokens, outputTokens, totalTokens }` |
| `done` | `{ conversationId, runId }` — stream complete |

## Privacy Test Suite

12 dedicated integration tests verify the privacy architecture:

```bash
npm test -- tests/privacy-integration.test.ts
```

| Test | Verifies |
|---|---|
| 1. Ingress locked reject | Locked vault rejects PII messages |
| 2. Ingress unlocked redact | Unlocked vault replaces PII with placeholders |
| 3. Outbound guard scrub | Leaked vault values scrubbed from assistant output |
| 4. Outbound unknown PII route | Unknown PII routes to Ollama only |
| 5. Memory save locked reject | Tool rejects PII when vault locked |
| 6. Memory save unlocked redact | Tool redacts PII when vault unlocked |
| 7. Memory update redact | Update tool redacts PII |
| 8. API memory locked reject | Endpoint rejects PII when locked |
| 9. API memory unlocked redact | Endpoint redacts when unlocked |
| 10. Log redaction | Log data scrubbed of vault values |
| 11. Tool result wrapUntrusted | gov_fetch output wrapped |
| 12. Multi-PII end-to-end | All PII types redacted in single turn |

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build (standalone output)
npm start          # Serve production build
npm run clean      # Delete .next cache
npm run lint       # ESLint
npm run typecheck  # TypeScript (no emit)
npm test           # Unit + integration tests (195+)
npm run test:e2e   # Build + production HTTP/SSE E2E
npm run test:all   # Both suites
npm run test:watch # Vitest watch mode
```

## Verified State

- **195+ unit/integration tests** passing
- **7 production HTTP/SSE E2E tests** passing
- TypeScript strict mode clean
- ESLint clean
- Production build successful (standalone)
- Docker image builds, health checks pass

## Docker Deployment

```bash
docker compose build
# Generate secure tokens
JARVIS_ACCESS_TOKEN=$(openssl rand -hex 32)
JARVIS_VAULT_FILE=/data/vault.enc.json
docker compose up -d
```

- Runs as non-root user
- Persistent volumes: `jarvis-data`, `jarvis-workspace`, `jarvis-vault`
- Health check on `/api/health`
- Ollama reachable at `host.docker.internal:11434`

## Documentation

- `docs/ARCHITECTURE.md` — Runtime design, streaming, providers, storage, tools, testing
- `docs/DEPLOYMENT.md` — Docker, Vercel/Supabase, backups, health checks, TLS
- `docs/SECURITY.md` — Threat model, controls, limitations, checklist
- `docs/PRIVACY.md` — **Sarkari Kaam privacy architecture deep dive** (PII types, vault crypto, guard logic, test evidence)

## Implemented (Sarkari Kaam)

- [x] AES-256-GCM vault with passphrase-derived keys
- [x] PII detection: Aadhaar (Verhoeff), PAN, Phone, Email, DOB, Address
- [x] Ingress redaction with deterministic placeholders
- [x] Outbound leak guard with Ollama-only routing for unknown PII
- [x] Log redaction at write-time
- [x] Whisper voice input (Ollama)
- [x] TTS with auto Devanagari detection (hi-IN/en-IN)
- [x] Hindi/Hinglish memory retrieval with matchedTerms
- [x] gov_fetch with .gov.in/.nic.in validation, redirect checks, size/timeout limits
- [x] wrapUntrusted for all external tool results
- [x] Large-text accessibility toggle
- [x] Document cards for RTI drafts and PDFs
- [x] 12 privacy integration tests
- [x] Production build, typecheck, lint, E2E all passing

## Not Implemented

- User accounts / multi-tenancy
- Vector/semantic memory embeddings
- File uploads, image/audio input
- Built-in web search
- Scheduled/background agents
- Streaming shell output
- Exact token accounting
- Cloudflare Workers support
- Browser-level UI automation (Playwright)
- Full nonce-based CSP

## License

No license declared. Add one before distributing.

---

**Sarkari Kaam** — Your paperwork, your privacy, your machine.
