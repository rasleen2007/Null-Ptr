export class HarnessError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(message: string, options: { code?: string; status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "HarnessError";
    this.code = options.code ?? "harness_error";
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
  }
}

export class ProviderError extends HarnessError {
  constructor(
    message: string,
    options: { code?: string; status?: number; retryable?: boolean } = {},
  ) {
    super(message, { code: options.code ?? "provider_error", status: options.status ?? 502, ...options });
    this.name = "ProviderError";
  }
}

export class PermissionError extends HarnessError {
  constructor(message: string) {
    super(message, { code: "permission_denied", status: 403 });
    this.name = "PermissionError";
  }
}

export class ValidationError extends HarnessError {
  constructor(message: string) {
    super(message, { code: "validation_error", status: 400 });
    this.name = "ValidationError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
