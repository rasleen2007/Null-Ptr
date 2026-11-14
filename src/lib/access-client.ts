export const ACCESS_TOKEN_STORAGE_KEY = "jarvis.access.token";

export function getStoredAccessToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function storeAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token.trim());
  } catch {
    // Private browsing or storage disabled: the token stays in memory for this page.
  }
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function accessHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
