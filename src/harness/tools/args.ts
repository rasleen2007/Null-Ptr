export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentError";
  }
}

export function stringArg(
  args: Record<string, unknown>,
  name: string,
  options: { required?: boolean; max?: number; min?: number; fallback?: string } = {},
): string {
  const raw = args[name];
  if (raw === undefined || raw === null || raw === "") {
    if (options.required) throw new ToolArgumentError(`Missing required argument "${name}".`);
    return options.fallback ?? "";
  }
  if (typeof raw !== "string") throw new ToolArgumentError(`Argument "${name}" must be a string.`);
  const min = options.min ?? 0;
  if (raw.length < min) throw new ToolArgumentError(`Argument "${name}" is too short.`);
  if (options.max && raw.length > options.max) {
    throw new ToolArgumentError(`Argument "${name}" exceeds ${options.max} characters.`);
  }
  return raw;
}

export function numberArg(
  args: Record<string, unknown>,
  name: string,
  options: { required?: boolean; min?: number; max?: number; fallback?: number } = {},
): number {
  const raw = args[name];
  if (raw === undefined || raw === null || raw === "") {
    if (options.required) throw new ToolArgumentError(`Missing required argument "${name}".`);
    return options.fallback ?? 0;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) throw new ToolArgumentError(`Argument "${name}" must be a number.`);
  if (options.min !== undefined && value < options.min) {
    throw new ToolArgumentError(`Argument "${name}" must be >= ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ToolArgumentError(`Argument "${name}" must be <= ${options.max}.`);
  }
  return value;
}

export function stringArrayArg(
  args: Record<string, unknown>,
  name: string,
  options: { maxItems?: number; maxLength?: number } = {},
): string[] {
  const raw = args[name];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ToolArgumentError(`Argument "${name}" must be an array of strings.`);
  const items = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, options.maxItems ?? 12);
  return items.map((item) => item.slice(0, options.maxLength ?? 48));
}

export function booleanArg(
  args: Record<string, unknown>,
  name: string,
  fallback: boolean,
): boolean {
  const raw = args[name];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  return fallback;
}
