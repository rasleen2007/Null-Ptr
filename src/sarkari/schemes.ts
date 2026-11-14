import rawSchemes from "./schemes.json";

export interface Scheme {
  id: string;
  name: { en: string; hi: string };
  category: string;
  description: { en: string; hi: string };
  benefits: string[];
  eligibility: string[];
  documents: string[];
  applyUrl: string;
  tags: string[];
}

export const SCHEMES = rawSchemes as Scheme[];

export function getScheme(id: string): Scheme | undefined {
  const needle = id.trim().toLowerCase();
  return SCHEMES.find((scheme) => scheme.id === needle);
}

/** Simple lexical search over names, categories, descriptions and tags. */
export function findSchemes(query: string, limit = 5): Scheme[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SCHEMES.slice(0, Math.max(1, limit));
  const terms = needle.split(/\s+/).filter(Boolean);

  const scored = SCHEMES.map((scheme) => {
    const haystack = [
      scheme.name.en,
      scheme.name.hi,
      scheme.category,
      scheme.description.en,
      scheme.description.hi,
      ...scheme.tags,
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (scheme.name.en.toLowerCase().includes(term)) score += 3;
      if (scheme.tags.some((tag) => tag.toLowerCase() === term)) score += 2;
      if (haystack.includes(term)) score += 1;
    }
    return { scheme, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.scheme);
}

export function formatSchemeSummary(scheme: Scheme, language: "en" | "hi" = "en"): string {
  const lines = [
    `${scheme.name[language]} (${scheme.category})`,
    scheme.description[language],
    "",
    "Benefits:",
    ...scheme.benefits.map((item) => `- ${item}`),
    "",
    "Eligibility:",
    ...scheme.eligibility.map((item) => `- ${item}`),
    "",
    "Documents:",
    ...scheme.documents.map((item) => `- ${item}`),
    "",
    `Official link: ${scheme.applyUrl}`,
  ];
  return lines.join("\n");
}
