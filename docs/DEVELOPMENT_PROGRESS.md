# Sarkari Kaam — Development Progress & Implementation Log

Persistent tracking of the Sarkari Kaam implementation on top of the JARVIS AI Harness.

---

## Current Status & Test Baseline (2026-11-14)

- **Repository**: `https://github.com/rasleen2007/Null-Ptr`
- **Branch**: `Null-Ptr`
- **TypeScript (`npm run typecheck`)**: PASSED (0 errors)
- **Unit & Integration Tests (`npm test`)**: 16 test files, 176 tests PASSED
- **ESLint (`npm run lint`)**: PASSED (0 warnings, 0 errors)
- **Next.js Production Build (`npm run build`)**: Blocked by missing `src/app/not-found.tsx` during NFT tracing on Windows (`.next/server/app/_not-found/page.js.nft.json` ENOENT).

---

## Detailed Audit Summary

### 1. Security & Vault
- **Status**: Mostly complete, high quality foundation.
- **Strengths**: AES-256-GCM encryption with Scrypt key derivation, HMAC passphrase verifier, distinct wrong passphrase vs tampering errors, in-memory scrub on lock, stable placeholder generation (`{{AADHAAR_1}}`), Verhoeff checksum for Aadhaar, outbound guard routing unknown PII to local Ollama.
- **Vulnerabilities / Missing**:
  - **Memory PII Leak Risk**: `memory_save`, `memory_update` tools and `/api/memory` routes do NOT redact PII before persisting. Personal identifiers can leak into `.data/jarvis.json` plaintext memory.
  - **Execution Logging Risk**: `safeLog` (`src/harness/engine/log.ts`) only checks for generic secrets (tokens, passwords) and does not redact personal identifiers (Aadhaar, PAN, phone) or vault values from error messages or event data.

### 2. Sarkari Persona Integration
- **Status**: Implemented in `src/sarkari/persona.ts` and runtime composition in `src/harness/orchestrator.ts`.
- **Missing**: Dedicated unit tests verifying `composeSarkariPrompt` runtime behavior, date/vault status context injection, and preservation of user operating rules.

### 3. Voice Input (Whisper STT)
- **Status**: Backend worker and hook implemented (`public/workers/whisper.worker.js`, `src/lib/use-voice.ts`), but **COMPLETELY DISCONNECTED** from the UI.
- **Missing**:
  - Microphone button in `src/components/chat/composer.tsx`.
  - Recording indicators, elapsed timer, processing status ("Loading whisper-small...", "Transcribing...").
  - Cancellation control.
  - Transcript populating chat composer input for user review before sending (never auto-send).
  - Unit/component tests for voice flow.

### 4. Text-to-Speech (TTS)
- **Status**: Pure helpers in `src/lib/speech.ts` and hook in `src/lib/use-speech.ts` implemented, but **DISCONNECTED** from the UI.
- **Missing**:
  - Speaker button on assistant `MessageBubble` (`src/components/chat/message-bubble.tsx`).
  - Active speaking indicator and stop speech button.
  - Speech coordination across bubbles (preventing overlapping audio).
  - Devanagari detection routing to `hi-IN` and English to `en-IN`.
  - Unit tests for speech synthesis helpers and integration.

### 5. Memory & Hindi/Hinglish Retrieval
- **Status**: Devanagari tokenization and Hindi/Hinglish stopwords implemented in `src/harness/memory/retrieval.ts`.
- **Missing**:
  - `RetrievedMemory` does not return `matchedTerms`.
  - No `memory_recall` stream event emitted when memories are fetched.
  - UI does not show why a memory was recalled.
  - PII redaction must be added to memory operations.
  - Comprehensive unit tests for Devanagari, Hinglish, and mixed queries with matchedTerms.

### 6. Government Tools
- **Status**: `scheme_lookup`, `rti_draft`, and `form_fill` implemented with test coverage.
- **Missing / Incomplete**:
  - `gov_lookup`: Currently only queries static portals index. Must support URL verification for `.gov.in` and `.nic.in` domains, validate redirects, block unsafe protocols, enforce size limits, and wrap output with `wrapUntrusted` against prompt injection.
  - Document preview cards in chat for generated RTIs and demo PDFs.

### 7. User Interface & Accessibility
- **Missing**:
  - Large-text accessibility mode toggle for citizens.
  - Integration of microphone and audio playback buttons in chat.
  - Generated document preview and download cards.
  - Clear distinction between user, assistant, and government tool approval states.

### 8. Production Readiness & Build Fix
- Missing `src/app/not-found.tsx` causing Next.js 15 standalone build tracing failure.

---

## Phased Implementation Roadmap

- [x] **Phase 1**: Security review & fix (Memory PII redaction, execution log PII scrubbing, Next.js build fix).
  - Fixed standalone NFT trace ENOENT by creating `src/app/not-found.tsx`.
  - Added PII redaction to `memory_save` & `memory_update` tools so sensitive identifiers are securely tokenized into the vault rather than stored plaintext.
  - Added PII scanning and vault locked checks to `/api/memory` and `/api/memory/[id]`.
  - Added vault secret scrubbing via `redactForModel` to `safeLog` and `redactLogData`.
  - All 179 tests and 8 E2E tests passing.
- [ ] **Phase 2**: Persona integration tests & edge-case handling.
- [ ] **Phase 3**: Whisper voice input integration in chat composer & tests.
- [ ] **Phase 4**: Text-to-speech speaker button on assistant messages & tests.
- [ ] **Phase 5**: Memory enhancement (`matchedTerms`, `memory_recall` event, UI explanation, PII scanning).
- [ ] **Phase 6**: Government tools (`gov_lookup` URL inspection with `.gov.in`/`.nic.in` allowlist, redirects, prompt injection defense, document preview).
- [ ] **Phase 7**: UI polish (Large-text mode, responsive composer, document action cards).
- [ ] **Phase 8**: Privacy & security verification suite (12 dedicated security tests).
- [ ] **Phase 9**: Documentation & README update for Sarkari Kaam.
- [ ] **Phase 10**: Full build, typecheck, lint, test, and E2E verification.
