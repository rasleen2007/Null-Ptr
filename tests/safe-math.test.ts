import { describe, expect, it } from "vitest";
import { SafeMathError, evaluateExpression } from "@/harness/tools/safe-math";

describe("evaluateExpression", () => {
  it("respects operator precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("10 - 2 - 3")).toBe(5);
  });

  it("supports unary operators and right-associative powers", () => {
    expect(evaluateExpression("-2^2")).toBe(-4);
    expect(evaluateExpression("2^3^2")).toBe(512);
    expect(evaluateExpression("--5")).toBe(5);
  });

  it("supports functions, constants, and multiple arguments", () => {
    expect(evaluateExpression("sqrt(144)")).toBe(12);
    expect(evaluateExpression("min(3, 7, -2)")).toBe(-2);
    expect(evaluateExpression("round(pi * 100) / 100")).toBe(3.14);
    expect(evaluateExpression("log(1000) + ln(e)")).toBeCloseTo(4, 10);
  });

  it("supports modulo and scientific notation", () => {
    expect(evaluateExpression("10 % 3")).toBe(1);
    expect(evaluateExpression("1e3 + 2.5e2")).toBe(1250);
  });

  it("rejects division by zero", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(SafeMathError);
    expect(() => evaluateExpression("5 % 0")).toThrow(/Modulo by zero/);
  });

  it("rejects unsupported input", () => {
    expect(() => evaluateExpression("")).toThrow(/empty/i);
    expect(() => evaluateExpression("alert(1)")).toThrow(/Unknown function/);
    expect(() => evaluateExpression("1; process.exit()")).toThrow(SafeMathError);
    expect(() => evaluateExpression("2 +")).toThrow(SafeMathError);
    expect(() => evaluateExpression("foo")).toThrow(/Unknown identifier/);
    expect(() => evaluateExpression("2 3")).toThrow(/trailing/i);
    expect(() => evaluateExpression("(".repeat(50))).toThrow(SafeMathError);
  });
});
