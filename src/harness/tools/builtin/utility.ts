import type { ToolDefinition } from "../../types";
import { evaluateExpression } from "../safe-math";
import { numberArg, stringArg } from "../args";

export const calculatorTool: ToolDefinition = {
  name: "calculator",
  description:
    "Evaluate a mathematical expression safely. Supports + - * / % ^, parentheses, and functions sqrt, abs, sin, cos, tan, asin, acos, atan, log (base 10), ln, exp, round, floor, ceil, sign, min, max, pow. Constants: pi, e, tau. Example: \"sqrt(144) + 2^10\".",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "The mathematical expression to evaluate." },
    },
    required: ["expression"],
  },
  category: "utility",
  sensitivity: "safe",
  async execute(args) {
    const expression = stringArg(args, "expression", { required: true, max: 600 });
    try {
      const value = evaluateExpression(expression);
      return {
        content: JSON.stringify({ expression, result: value }),
        data: { result: value },
      };
    } catch (error) {
      return {
        content: `Calculator error: ${(error as Error).message}`,
        isError: true,
      };
    }
  },
};

export const currentTimeTool: ToolDefinition = {
  name: "current_time",
  description:
    "Get the current date and time on the server. Optionally provide an IANA timezone such as \"America/New_York\" or \"Asia/Kolkata\".",
  parameters: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "IANA timezone name. Defaults to UTC." },
      offsetMinutes: {
        type: "number",
        description: "Optional fixed UTC offset in minutes (ignored if timezone is valid).",
      },
    },
  },
  category: "utility",
  sensitivity: "safe",
  async execute(args) {
    const timezone = stringArg(args, "timezone", { fallback: "UTC", max: 64 });
    const offset = numberArg(args, "offsetMinutes", { min: -840, max: 840, fallback: 0 });
    const now = new Date();
    let iso = now.toISOString();
    let formatted = iso;
    let usedTimezone = "UTC";
    try {
      formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      }).format(now);
      usedTimezone = timezone;
    } catch {
      const shifted = new Date(now.getTime() + offset * 60_000);
      formatted = `${shifted.toISOString().replace("Z", "")} (UTC${offset >= 0 ? "+" : ""}${offset / 60})`;
      usedTimezone = `UTC${offset >= 0 ? "+" : ""}${offset / 60}`;
    }
    return {
      content: JSON.stringify({
        iso,
        formatted,
        timezone: usedTimezone,
        unixSeconds: Math.floor(now.getTime() / 1000),
      }),
    };
  },
};

