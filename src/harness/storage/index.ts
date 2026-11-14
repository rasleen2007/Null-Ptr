import type { Storage } from "./types";

let storagePromise: Promise<Storage> | null = null;

async function createStorage(): Promise<Storage> {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (url && serviceRoleKey) {
    const { createSupabaseStorage } = await import("./supabase");
    return createSupabaseStorage(url, serviceRoleKey);
  }

  const { createLocalStorage } = await import("./local");
  return createLocalStorage();
}

export async function getStorage(): Promise<Storage> {
  if (!storagePromise) {
    storagePromise = createStorage().catch((error) => {
      storagePromise = null;
      throw error;
    });
  }
  return storagePromise;
}

export function resetStorageForTests(): void {
  storagePromise = null;
}

export type { Storage } from "./types";
