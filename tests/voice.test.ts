import { describe, expect, it, vi } from "vitest";
import { stripForSpeech, speechLangFor, formatVoiceDuration, microphoneErrorMessage } from "@/lib/speech";

describe("stripForSpeech", () => {
  it("removes markdown code blocks", () => {
    const input = "Here is code:\n```js\nconsole.log('hello')\n```\nEnd.";
    expect(stripForSpeech(input)).toBe("Here is code: End.");
  });

  it("removes images and keeps alt text", () => {
    const input = "![alt text](https://example.com/image.png)";
    expect(stripForSpeech(input)).toBe("alt text");
  });

  it("removes links and keeps link text", () => {
    const input = "[JARVIS](https://jarvis.ai)";
    expect(stripForSpeech(input)).toBe("JARVIS");
  });

  it("removes inline code backticks", () => {
    const input = "Use `console.log` to print.";
    expect(stripForSpeech(input)).toBe("Use console.log to print.");
  });

  it("replaces placeholders with neutral phrase", () => {
    const input = "Your Aadhaar is {{AADHAAR_1}}";
    expect(stripForSpeech(input)).toBe("Your Aadhaar is the stored value");
  });

  it("removes URLs", () => {
    const input = "Visit https://example.com for more info.";
    expect(stripForSpeech(input)).toBe("Visit for more info.");
  });

  it("removes headers", () => {
    const input = "# Heading 1\n## Heading 2\n### Heading 3";
    expect(stripForSpeech(input)).toBe("Heading 1 Heading 2 Heading 3");
  });

  it("removes blockquotes", () => {
    const input = "> This is a quote";
    expect(stripForSpeech(input)).toBe("This is a quote");
  });

  it("removes list markers", () => {
    const input = "- Item 1\n- Item 2\n1. Item 3";
    expect(stripForSpeech(input)).toBe("Item 1 Item 2 Item 3");
  });

  it("removes markdown formatting characters", () => {
    const input = "**bold** *italic* ~~strike~~ `code` >quote|pipe";
    expect(stripForSpeech(input)).toBe("bold italic strike code quote pipe");
  });

  it("normalizes whitespace and newlines", () => {
    const input = "Line 1\n\nLine 2\n\n\nLine 3";
    expect(stripForSpeech(input)).toBe("Line 1. Line 2. Line 3");
  });

  it("truncates long text", () => {
    const longText = "a".repeat(5000);
    const result = stripForSpeech(longText);
    expect(result.length).toBeLessThanOrEqual(4000);
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles empty input", () => {
    expect(stripForSpeech("")).toBe("");
    expect(stripForSpeech("   ")).toBe("");
  });
});

describe("speechLangFor", () => {
  it("returns hi-IN for Devanagari text", () => {
    expect(speechLangFor("नमस्ते")).toBe("hi-IN");
    expect(speechLangFor("आप कैसे हैं")).toBe("hi-IN");
    expect(speechLangFor("क्या")).toBe("hi-IN");
  });

  it("returns en-IN for Latin text", () => {
    expect(speechLangFor("Hello")).toBe("en-IN");
    expect(speechLangFor("How are you")).toBe("en-IN");
    expect(speechLangFor("नमस्ते hello")).toBe("hi-IN");
  });

  it("returns en-IN for mixed text with Devanagari", () => {
    expect(speechLangFor("नमस्ते hello")).toBe("hi-IN");
    expect(speechLangFor("hello नमस्ते")).toBe("hi-IN");
  });

  it("returns en-IN for Hinglish (Roman script)", () => {
    expect(speechLangFor("namaste kaise ho")).toBe("en-IN");
    expect(speechLangFor("mera naam rahul hai")).toBe("en-IN");
  });
});

describe("formatVoiceDuration", () => {
  it("formats seconds correctly", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(5)).toBe("0:05");
    expect(formatVoiceDuration(30)).toBe("0:30");
    expect(formatVoiceDuration(59)).toBe("0:59");
    expect(formatVoiceDuration(60)).toBe("1:00");
    expect(formatVoiceDuration(90)).toBe("1:30");
    expect(formatVoiceDuration(119)).toBe("1:59");
    expect(formatVoiceDuration(120)).toBe("2:00");
  });

  it("handles non-integer and negative values", () => {
    expect(formatVoiceDuration(5.7)).toBe("0:05");
    expect(formatVoiceDuration(-10)).toBe("0:00");
    expect(formatVoiceDuration(NaN)).toBe("0:00");
    expect(formatVoiceDuration(Infinity)).toBe("0:00");
  });
});

describe("microphoneErrorMessage", () => {
  it("maps NotAllowedError to permission denied message", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    expect(microphoneErrorMessage(error)).toContain("permission was denied");
  });

  it("maps NotFoundError to no microphone message", () => {
    const error = new DOMException("Not found", "NotFoundError");
    expect(microphoneErrorMessage(error)).toContain("No microphone was found");
  });

  it("maps NotReadableError to microphone in use message", () => {
    const error = new DOMException("Track start failed", "NotReadableError");
    expect(microphoneErrorMessage(error)).toContain("in use by another app");
  });

  it("maps OverconstrainedError to settings not supported message", () => {
    const error = new DOMException("Overconstrained", "OverconstrainedError");
    expect(microphoneErrorMessage(error)).toContain("does not support the requested settings");
  });

  it("returns generic message for unknown errors", () => {
    const error = new Error("Unknown error");
    expect(microphoneErrorMessage(error)).toBe("Unknown error");
  });

  it("handles non-Error input", () => {
    expect(microphoneErrorMessage("string error")).toBe("The microphone could not be started.");
    expect(microphoneErrorMessage(null)).toBe("The microphone could not be started.");
    expect(microphoneErrorMessage(undefined)).toBe("The microphone could not be started.");
  });
});

describe("useVoice hook integration", () => {
  it("exports useVoice function", async () => {
    const { useVoice } = await import("@/lib/use-voice");
    expect(typeof useVoice).toBe("function");
  });

  it("exports VoiceStatus type", () => {
    type VoiceStatus = "idle" | "recording" | "transcribing";
    const statuses: VoiceStatus[] = ["idle", "recording", "transcribing"];
    expect(statuses).toHaveLength(3);
  });
});