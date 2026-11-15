/**
 * Read the first non-empty environment variable from a list of names.
 *
 * The project was renamed from JARVIS to Sarkari Saathi, but existing
 * deployments (and `.env.local` files) still use the `JARVIS_*` names. Every
 * lookup therefore accepts the new `SAATHI_*` name first and falls back to the
 * legacy `JARVIS_*` name, so both keep working.
 */
export function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
