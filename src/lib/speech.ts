/**
 * Helpers for reading assistant replies aloud and for the microphone UI.
 *
 * These are pure functions so they can be tested without a browser. The actual
 * speech synthesis and recording lives in the hooks.
 */

export const MAX_SPEECH_CHARS = 4000;

/**
 * Turn Markdown into something that sounds natural when spoken.
 *
 * Placeholders are replaced with a neutral phrase: reading `{{AADHAAR_1}}` aloud
 * would be noise, and speaking a real value would defeat the privacy design.
 */
export function stripForSpeech(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\{\{[A-Z0-9_]+\}\}/g, "the stored value")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~#>|]/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > MAX_SPEECH_CHARS
    ? `${cleaned.slice(0, MAX_SPEECH_CHARS - 1).trimEnd()}…`
    : cleaned;
}

/** Pick an Indian English or Hindi voice hint based on the script used. */
export function speechLangFor(text: string): "hi-IN" | "en-IN" {
  return /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
}

export function formatVoiceDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Map common getUserMedia rejections onto actionable copy. */
export function microphoneErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission was denied. Allow it in your browser, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect one and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is in use by another app. Close it and try again.";
    case "OverconstrainedError":
      return "This microphone does not support the requested settings.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "The microphone could not be started.";
  }
}
