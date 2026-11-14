import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  UnsafeUrlError,
  assertSafeUrl,
  resolveSandboxPath,
} from "@/harness/tools/sandbox";
import { splitCommand } from "@/harness/tools/builtin/shell";

describe("assertSafeUrl", () => {
  it("allows public http and https URLs", () => {
    expect(assertSafeUrl("https://example.com/docs?q=1").hostname).toBe("example.com");
    expect(assertSafeUrl("http://api.github.com/repos").protocol).toBe("http:");
  });

  it("rejects non-http protocols", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl("ftp://example.com")).toThrow(/Only http and https/);
    expect(() => assertSafeUrl("javascript:alert(1)")).toThrow(UnsafeUrlError);
  });

  it("rejects embedded credentials", () => {
    expect(() => assertSafeUrl("https://user:pass@example.com")).toThrow(/credentials/);
  });

  it("blocks localhost and loopback addresses", () => {
    expect(() => assertSafeUrl("http://localhost:3000")).toThrow(/blocked/);
    expect(() => assertSafeUrl("http://127.0.0.1")).toThrow(/Private IPv4/);
    expect(() => assertSafeUrl("http://[::1]")).toThrow(/blocked/);
  });

  it("blocks private and link-local networks", () => {
    expect(() => assertSafeUrl("http://10.0.0.5")).toThrow(/Private IPv4/);
    expect(() => assertSafeUrl("http://192.168.1.5")).toThrow(/Private IPv4/);
    expect(() => assertSafeUrl("http://172.20.0.1")).toThrow(/Private IPv4/);
    expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data")).toThrow(/Private IPv4/);
    expect(() => assertSafeUrl("http://100.64.0.1")).toThrow(/Private IPv4/);
  });

  it("blocks internal suffixes and numeric hostnames", () => {
    expect(() => assertSafeUrl("http://printer.local")).toThrow(/private suffix/);
    expect(() => assertSafeUrl("http://metadata.google.internal")).toThrow(/blocked/);
    expect(() => assertSafeUrl("http://2130706433")).toThrow(/blocked|Private IPv4|Numeric/);
  });
});

describe("resolveSandboxPath", () => {
  it("resolves paths inside the workspace", () => {
    const result = resolveSandboxPath("workspace-test", "notes/today.md");
    expect(result.absolute).toBe(path.resolve(process.cwd(), "workspace-test", "notes/today.md"));
    expect(result.relative).toBe(path.join("notes", "today.md"));
  });

  it("normalizes the workspace root", () => {
    const result = resolveSandboxPath("workspace-test", ".");
    expect(result.relative).toBe(".");
  });

  it("rejects traversal outside the workspace", () => {
    expect(() => resolveSandboxPath("workspace-test", "../secrets.txt")).toThrow(UnsafeUrlError);
    expect(() => resolveSandboxPath("workspace-test", "nested/../../escape")).toThrow(/escapes/);
  });

  it("rejects absolute paths outside the workspace", () => {
    const absolute = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc/passwd";
    expect(() => resolveSandboxPath("workspace-test", absolute)).toThrow(UnsafeUrlError);
  });
});

describe("splitCommand", () => {
  it("splits whitespace-separated arguments", () => {
    expect(splitCommand("git status --short")).toEqual(["git", "status", "--short"]);
  });

  it("preserves quoted arguments", () => {
    expect(splitCommand('node "my script.js" --flag')).toEqual(["node", "my script.js", "--flag"]);
    expect(splitCommand("git commit -m 'a message'")).toEqual(["git", "commit", "-m", "a message"]);
  });

  it("handles repeated whitespace and empty input", () => {
    expect(splitCommand("  git   status  ")).toEqual(["git", "status"]);
    expect(splitCommand("")).toEqual([]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => splitCommand('node "unterminated')).toThrow(/Unterminated quote/);
  });
});
