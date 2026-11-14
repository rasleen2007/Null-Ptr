import rawPortals from "./portals.json";

/**
 * Curated index of official Indian government portals.
 *
 * This is a static, hand-checked list rather than a web search. It exists so the
 * assistant can point people at the correct official domain without fetching
 * arbitrary pages or leaking identifiers into a search query.
 */

export interface Portal {
  id: string;
  name: { en: string; hi: string };
  category: string;
  description: { en: string; hi: string };
  url: string;
  tags: string[];
}

export const PORTALS = rawPortals as Portal[];

export function getPortal(id: string): Portal | undefined {
  const needle = id.trim().toLowerCase();
  return PORTALS.find((portal) => portal.id === needle);
}

/** Lexical search over names, categories, descriptions, and tags. */
export function findPortals(query: string, limit = 5): Portal[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return PORTALS.slice(0, Math.max(1, limit));
  const terms = needle.split(/\s+/).filter(Boolean);

  const scored = PORTALS.map((portal) => {
    const nameHaystack = `${portal.name.en} ${portal.name.hi}`.toLowerCase();
    const haystack = [
      nameHaystack,
      portal.category,
      portal.description.en,
      portal.description.hi,
      ...portal.tags,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (nameHaystack.includes(term)) score += 4;
      if (portal.tags.some((tag) => tag.toLowerCase().includes(term))) score += 2;
      if (haystack.includes(term)) score += 1;
    }
    return { portal, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.portal);
}

export function formatPortalSummary(
  portal: Portal,
  language: "en" | "hi" = "en",
): string {
  return [
    `${portal.name[language]} (${portal.category})`,
    portal.description[language],
    `Official link: ${portal.url}`,
  ].join("\n");
}
