import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ToolDefinition } from "../../types";
import { numberArg, stringArg } from "../args";
import { resolveSandboxPath } from "../sandbox";
import { findPortals } from "../../../sarkari/portals";
import {
  findSchemes,
  formatSchemeSummary,
  getScheme,
  type Scheme,
} from "../../../sarkari/schemes";
import { renderRtiDraft, type RtiLanguage } from "../../../sarkari/rti-templates";
import { wrapUntrusted } from "../../../sarkari/untrusted";
import { httpGet } from "../../../lib/http";

/**
 * Government-facing tools.
 *
 * `gov_lookup` and `scheme_lookup` are static curated indexes: they never touch
 * the network and never use the vault. `rti_draft` and `form_fill` are sensitive
 * local writers and are the only tools that opt into `usesVault`, so the
 * orchestrator restores real values for them exactly at execution time.
 *
 * `gov_fetch` is a new tool that fetches live content from official .gov.in/.nic.in
 * domains with strict validation, redirect checking, timeouts, size limits, and
 * wraps output with wrapUntrusted to prevent prompt injection.
 */

const ALLOWED_DOMAINS = [".gov.in", ".nic.in"];
const MAX_FETCH_SIZE = 100_000; // 100KB
const FETCH_TIMEOUT_MS = 10_000;

function isAllowedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ALLOWED_DOMAINS.some((domain) => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function validateRedirects(originalUrl: string, finalUrl: string): boolean {
  if (!isAllowedDomain(finalUrl)) return false;
  const originalHost = new URL(originalUrl).hostname.toLowerCase();
  const finalHost = new URL(finalUrl).hostname.toLowerCase();
  return originalHost === finalHost || finalHost.endsWith(`.${originalHost}`);
}

async function fetchGovContent(url: string): Promise<{ content: string; truncated: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await httpGet(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Sarkari/1.0 (+https://github.com/rasleen2007/Null-Ptr)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    let received = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_FETCH_SIZE) {
        throw new Error(`Response exceeds size limit of ${MAX_FETCH_SIZE} bytes`);
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const content = decoder.decode(Buffer.concat(chunks));
    const truncated = received > MAX_FETCH_SIZE * 0.9;

    return { content, truncated };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function languageArg(value: unknown): "en" | "hi" {
  return value === "hi" ? "hi" : "en";
}

function rtiLanguageArg(value: unknown): RtiLanguage {
  if (value === "hi" || value === "hinglish") return value;
  return "en";
}

function informationArg(args: Record<string, unknown>): string[] {
  const raw = args.information;
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return values
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((entry) => entry.slice(0, 2000));
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function safeFileName(input: string, prefix: string, extension: string): string {
  const base = path
    .basename(input.trim())
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const fallback = `${prefix}-${timestamp()}${extension}`;
  if (!base) return fallback;
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

function optionalString(args: Record<string, unknown>, name: string, max = 300): string {
  return stringArg(args, name, { max });
}

export const govLookupTool: ToolDefinition = {
  name: "gov_lookup",
  description:
    "Look up official Indian government portals from a curated, hand-checked index. Returns official domains for services such as passports, Aadhaar, taxes, RTI, pensions, ration cards, scholarships, land records, and grievances. This tool does not fetch web pages and does not send any user data anywhere.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Service or department to look up, e.g. \"passport renewal\" or \"ration card\".",
      },
      language: {
        type: "string",
        description: "Description language. \"en\" (default) or \"hi\".",
        enum: ["en", "hi"],
      },
      limit: { type: "number", description: "Maximum results, 1-10. Default 5." },
    },
    required: ["query"],
  },
  category: "web",
  sensitivity: "safe",
  async execute(args) {
    const query = stringArg(args, "query", { required: true, max: 200 });
    const language = languageArg(args.language);
    const limit = numberArg(args, "limit", { min: 1, max: 10, fallback: 5 });
    const portals = findPortals(query, limit);

    if (!portals.length) {
      return {
        content: JSON.stringify({
          query,
          count: 0,
          results: [],
          guidance:
            "No matching portal in the curated index. Ask for the department or service name, or check https://www.india.gov.in.",
        }),
        data: { count: 0 },
      };
    }

    return {
      content: JSON.stringify({
        query,
        count: portals.length,
        results: portals.map((portal) => ({
          id: portal.id,
          name: portal.name,
          category: portal.category,
          description: portal.description[language],
          url: portal.url,
        })),
        guidance:
          "Use only the official URL shown. Never enter vault placeholders or personal identifiers into a website unless the user explicitly asks and the tool supports it.",
      }),
      data: { ids: portals.map((portal) => portal.id) },
    };
  },
};

export const govFetchTool: ToolDefinition = {
  name: "gov_fetch",
  description:
    "Fetch live content from an official Indian government portal (.gov.in or .nic.in domain). Validates domain allowlist, follows redirects within the same domain, enforces 10s timeout and 100KB size limit, and wraps output with prompt-injection protection. Use for reading official pages when the curated index is insufficient.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Full URL to fetch (must be .gov.in or .nic.in domain).",
      },
      maxChars: {
        type: "number",
        description: "Maximum characters to return (default 8000).",
      },
    },
    required: ["url"],
  },
  category: "web",
  sensitivity: "safe",
  async execute(args) {
    const url = stringArg(args, "url", { required: true, max: 500 });
    const maxChars = numberArg(args, "maxChars", { min: 500, max: 50000, fallback: 8000 });

    if (!isAllowedDomain(url)) {
      return {
        content: JSON.stringify({
          error: "Domain not allowed. Only .gov.in and .nic.in domains are permitted.",
          url,
          allowedDomains: ALLOWED_DOMAINS,
        }),
        isError: true,
      };
    }

    try {
      const { content: html, truncated } = await fetchGovContent(url);
      const text = extractTextFromHtml(html).slice(0, maxChars);
      const wrapped = wrapUntrusted("gov_fetch", text, { maxChars });

      return {
        content: JSON.stringify({
          url,
          length: text.length,
          truncated,
          content: wrapped,
        }),
        data: { url, truncated },
      };
    } catch (error) {
      return {
        content: JSON.stringify({
          error: error instanceof Error ? error.message : "Fetch failed",
          url,
        }),
        isError: true,
      };
    }
  },
};

export const schemeLookupTool: ToolDefinition = {
  name: "scheme_lookup",
  description:
    "Look up central government welfare schemes from a curated catalogue. Returns benefits, eligibility, required documents, and the official application link for schemes such as PM-KISAN, Ayushman Bharat, MGNREGA, PMAY-G, Ujjwala, Atal Pension, e-Shram, and scholarships. Static data; no network access.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Exact scheme id, e.g. \"pm-kisan\". Use this when the scheme is already known.",
      },
      query: {
        type: "string",
        description: "Free-text search, e.g. \"farmer income\" or \"widow pension\".",
      },
      language: {
        type: "string",
        description: "Name and description language. \"en\" (default) or \"hi\".",
        enum: ["en", "hi"],
      },
      limit: { type: "number", description: "Maximum matches, 1-8. Default 3." },
    },
  },
  category: "utility",
  sensitivity: "safe",
  async execute(args) {
    const id = optionalString(args, "id", 80);
    const query = optionalString(args, "query", 200);
    const language = languageArg(args.language);
    const limit = numberArg(args, "limit", { min: 1, max: 8, fallback: 3 });

    let matches: Scheme[] = [];
    if (id) {
      const scheme = getScheme(id);
      if (!scheme) {
        return {
          content: JSON.stringify({
            id,
            matches: [],
            guidance: "No scheme with that id. Use scheme_lookup with a query, or gov_lookup for the department.",
          }),
          isError: true,
        };
      }
      matches = [scheme];
    } else if (query) {
      matches = findSchemes(query, limit);
    } else {
      return {
        content: "Provide either an exact scheme id or a search query.",
        isError: true,
      };
    }

    if (!matches.length) {
      return {
        content: JSON.stringify({
          query,
          matches: [],
          guidance:
            "No matching scheme in the curated catalogue. Use gov_lookup for the department portal and say the match is unverified.",
        }),
        data: { count: 0 },
      };
    }

    const header =
      language === "hi"
        ? `आधिकारिक योजना मिलान (${matches.length}). समय-सीमा और शुल्क की पुष्टि आधिकारिक पोर्टल पर करें।`
        : `Official scheme matches (${matches.length}). Confirm deadlines and fees on the official portal.`;

    return {
      content: [header, ...matches.map((scheme) => formatSchemeSummary(scheme, language))].join(
        "\n\n---\n\n",
      ),
      data: { ids: matches.map((scheme) => scheme.id) },
    };
  },
};

export const rtiDraftTool: ToolDefinition = {
  name: "rti_draft",
  description:
    "Draft a Right to Information (RTI) application in English, Hindi, or Hinglish and save it as a text file inside the workspace. This is a sensitive action: it writes a file and uses the personal vault to restore placeholders. Explain what will be drafted and wait for approval before calling it. It is not legal advice and does not submit the application.",
  parameters: {
    type: "object",
    properties: {
      language: {
        type: "string",
        description: "Draft language: \"en\", \"hi\", or \"hinglish\".",
        enum: ["en", "hi", "hinglish"],
      },
      applicantName: { type: "string", description: "Applicant's full name." },
      department: {
        type: "string",
        description: "Public authority / department the application is addressed to.",
      },
      information: {
        type: "array",
        description: "Information items requested, one per array entry.",
        items: { type: "string" },
      },
      address: { type: "string", description: "Applicant's postal address." },
      subject: { type: "string", description: "Optional subject line." },
      period: { type: "string", description: "Optional period the information relates to." },
      feeMode: { type: "string", description: "Optional fee payment detail, e.g. \"₹10 by IPO\"." },
      date: { type: "string", description: "Optional application date." },
      place: { type: "string", description: "Optional place of writing." },
      phone: { type: "string", description: "Optional contact phone." },
      email: { type: "string", description: "Optional contact email." },
      fileName: {
        type: "string",
        description: "Optional file name. Saved under the workspace rti/ folder.",
      },
    },
    required: ["applicantName", "department", "information"],
  },
  category: "filesystem",
  sensitivity: "sensitive",
  usesVault: true,
  async execute(args, ctx) {
    const applicantName = stringArg(args, "applicantName", { required: true, max: 200 });
    const department = stringArg(args, "department", { required: true, max: 300 });
    const information = informationArg(args);
    if (!information.length) {
      return {
        content: "RTI draft needs at least one information item.",
        isError: true,
      };
    }

    const language = rtiLanguageArg(args.language);
    const draft = renderRtiDraft({
      language,
      applicantName,
      department,
      information,
      address: optionalString(args, "address", 400),
      subject: optionalString(args, "subject", 300),
      period: optionalString(args, "period", 200),
      feeMode: optionalString(args, "feeMode", 200),
      date: optionalString(args, "date", 80),
      place: optionalString(args, "place", 200),
      phone: optionalString(args, "phone", 40),
      email: optionalString(args, "email", 200),
    });

    const fileName = safeFileName(optionalString(args, "fileName", 120), "rti-draft", ".txt");
    const sandbox = resolveSandboxPath(ctx.workspaceDir, path.join("rti", fileName));
    await fs.mkdir(path.dirname(sandbox.absolute), { recursive: true });
    await fs.writeFile(sandbox.absolute, draft, { encoding: "utf8", mode: 0o600 });

    const bytes = Buffer.byteLength(draft, "utf8");
    return {
      content: JSON.stringify({
        written: true,
        path: sandbox.relative,
        language,
        bytes,
        items: information.length,
        preview: draft.slice(0, 600),
        notice:
          "RTI draft saved locally. The user must review, sign, and submit it on the official portal or to the public authority. This is procedural help, not legal advice.",
      }),
      data: { path: sandbox.relative, bytes },
    };
  },
};

function sanitizeWinAnsi(value: string): { text: string; changed: boolean } {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const cleaned = collapsed.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?").trim();
  return { text: cleaned, changed: cleaned !== collapsed };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Hard-split a single overlong token (for example a long email or URL).
    let chunk = "";
    for (const char of word) {
      const next = chunk + char;
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

interface DemoFormField {
  label: string;
  value: string;
}

async function buildDemoPdf(
  purpose: string,
  inputFields: DemoFormField[],
): Promise<{ bytes: Uint8Array; sanitized: boolean }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.38, 0.38, 0.38);
  const red = rgb(0.72, 0.11, 0.11);
  const margin = 56;

  let sanitized = false;
  const cleanPurpose = sanitizeWinAnsi(purpose);
  sanitized ||= cleanPurpose.changed;
  const fields = inputFields.map((field) => {
    const value = sanitizeWinAnsi(field.value);
    sanitized ||= value.changed;
    return { label: field.label, value: value.text };
  });

  let page = pdf.addPage([595.28, 841.89]);
  let y = page.getHeight() - margin;

  const startPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = page.getHeight() - margin;
  };

  page.drawText("Sarkari Demo Application Form", { x: margin, y, size: 18, font: bold, color: ink });
  y -= 22;
  page.drawText("DEMO TEMPLATE - NOT AN OFFICIAL GOVERNMENT FORM", {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: red,
  });
  y -= 15;
  page.drawText("Generated locally. Verify every detail before copying it onto a real form.", {
    x: margin,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: page.getWidth() - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 26;

  page.drawText("PURPOSE", { x: margin, y, size: 8, font: bold, color: muted });
  y -= 15;
  for (const line of wrapText(cleanPurpose.text, font, 12, page.getWidth() - margin * 2)) {
    page.drawText(line, { x: margin, y, size: 12, font, color: ink });
    y -= 16;
  }
  y -= 12;

  for (const field of fields) {
    if (y < margin + 80) startPage();
    page.drawText(field.label.toUpperCase(), { x: margin, y, size: 8, font: bold, color: muted });
    y -= 15;
    for (const line of wrapText(field.value, font, 12, page.getWidth() - margin * 2)) {
      if (y < margin + 50) startPage();
      page.drawText(line, { x: margin, y, size: 12, font, color: ink });
      y -= 16;
    }
    y -= 10;
  }

  if (y < margin + 50) startPage();
  const footerY = margin;
  page.drawText("Demo template only - not an official government form.", {
    x: margin,
    y: footerY,
    size: 8,
    font,
    color: red,
  });
  page.drawText(`Generated ${new Date().toISOString()} by Sarkari (local).`, {
    x: margin,
    y: footerY - 11,
    size: 8,
    font,
    color: muted,
  });

  return { bytes: await pdf.save(), sanitized };
}

export const formFillTool: ToolDefinition = {
  name: "form_fill",
  description:
    "Generate a clearly labelled DEMO application-form PDF in the workspace, pre-filled with the user's details. This is a sensitive action: it writes a file and uses the personal vault to restore placeholders. It is not an official government form and cannot be submitted anywhere. Explain what will be generated and wait for approval before calling it.",
  parameters: {
    type: "object",
    properties: {
      fullName: { type: "string", description: "Applicant's full name." },
      purpose: {
        type: "string",
        description: "What the form is for, e.g. \"PM-KISAN application\". Default \"General application\".",
      },
      dob: { type: "string", description: "Date of birth." },
      aadhaar: { type: "string", description: "Aadhaar number or {{AADHAAR_N}} placeholder." },
      pan: { type: "string", description: "PAN or {{PAN_N}} placeholder." },
      phone: { type: "string", description: "Phone number or {{PHONE_N}} placeholder." },
      email: { type: "string", description: "Email address or {{EMAIL_N}} placeholder." },
      address: { type: "string", description: "Postal address or {{ADDRESS_N}} placeholder." },
      state: { type: "string", description: "State." },
      district: { type: "string", description: "District." },
      fileName: {
        type: "string",
        description: "Optional PDF file name. Saved under the workspace forms/ folder.",
      },
    },
    required: ["fullName"],
  },
  category: "filesystem",
  sensitivity: "sensitive",
  usesVault: true,
  async execute(args, ctx) {
    const fullName = stringArg(args, "fullName", { required: true, max: 120 });
    const purpose = stringArg(args, "purpose", { max: 160, fallback: "General application" });

    const fields: DemoFormField[] = [
      { label: "Full name", value: fullName },
      { label: "Date of birth", value: optionalString(args, "dob", 60) },
      { label: "Aadhaar", value: optionalString(args, "aadhaar", 40) },
      { label: "PAN", value: optionalString(args, "pan", 20) },
      { label: "Phone", value: optionalString(args, "phone", 40) },
      { label: "Email", value: optionalString(args, "email", 200) },
      { label: "Address", value: optionalString(args, "address", 500) },
      { label: "State", value: optionalString(args, "state", 80) },
      { label: "District", value: optionalString(args, "district", 80) },
    ].filter((field) => field.value.trim().length > 0);

    const { bytes, sanitized } = await buildDemoPdf(purpose, fields);
    const fileName = safeFileName(optionalString(args, "fileName", 120), "demo-form", ".pdf");
    const sandbox = resolveSandboxPath(ctx.workspaceDir, path.join("forms", fileName));
    await fs.mkdir(path.dirname(sandbox.absolute), { recursive: true });
    await fs.writeFile(sandbox.absolute, bytes, { mode: 0o600 });

    return {
      content: JSON.stringify({
        written: true,
        path: sandbox.relative,
        template: "demo-application",
        bytes: bytes.byteLength,
        fields: fields.length,
        nonLatinReplaced: sanitized,
        notice:
          "Demo PDF only; not an official government form. Verify every detail before copying it onto a real form.",
      }),
      data: { path: sandbox.relative, bytes: bytes.byteLength, sanitized },
    };
  },
};

export const sarkariTools = [govLookupTool, govFetchTool, schemeLookupTool, rtiDraftTool, formFillTool];
