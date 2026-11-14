/**
 * RTI application templates.
 *
 * These are plain-text drafts the user can copy into the official portal or print.
 * Values may still be vault placeholders when the model produces the draft; the
 * tool execution edge restores them just before writing the file.
 */

export type RtiLanguage = "hi" | "hinglish" | "en";

export interface RtiDraftInput {
  language?: RtiLanguage;
  applicantName: string;
  address?: string;
  department: string;
  subject?: string;
  information: string | string[];
  period?: string;
  feeMode?: string;
  date?: string;
  place?: string;
  phone?: string;
  email?: string;
}

const DEFAULT_SUBJECT: Record<RtiLanguage, string> = {
  en: "Request for information under the Right to Information Act, 2005",
  hi: "सूचना का अधिकार अधिनियम, 2005 के अंतर्गत सूचना हेतु आवेदन",
  hinglish: "Right to Information Act, 2005 ke tahat soochna ke liye aavedan",
};

function asList(information: string | string[]): string[] {
  const items = Array.isArray(information) ? information : [information];
  return items.map((item) => item.trim()).filter(Boolean);
}

function numbered(items: string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function contactLine(input: RtiDraftInput): string {
  const parts = [input.phone, input.email].filter(Boolean);
  return parts.join(" | ");
}

export function renderRtiDraft(input: RtiDraftInput): string {
  const language: RtiLanguage = input.language ?? "en";
  const information = asList(input.information);
  if (!information.length) {
    throw new Error("RTI draft needs at least one item of information.");
  }
  if (!input.department?.trim()) {
    throw new Error("RTI draft needs the department / public authority.");
  }

  const date = input.date?.trim() || new Date().toLocaleDateString("en-IN");
  const place = input.place?.trim() || input.address?.trim() || "";
  const applicant = input.applicantName?.trim() || "{{NAME_1}}";
  const address = input.address?.trim() || "";
  const fee = input.feeMode?.trim();
  const period = input.period?.trim();
  const contact = contactLine(input);
  const subject = input.subject?.trim() || DEFAULT_SUBJECT[language];

  if (language === "hi") {
    return [
      `दिनांक: ${date}`,
      place ? `स्थान: ${place}` : "",
      "",
      `प्रति,`,
      `लोक सूचना अधिकारी,`,
      input.department.trim(),
      "",
      `विषय: ${subject}`,
      "",
      "महोदय/महोदया,",
      "",
      "सूचना का अधिकार अधिनियम, 2005 की धारा 6 के अंतर्गत निम्नलिखित सूचना उपलब्ध कराने हेतु निवेदन है:",
      "",
      ...numbered(information),
      "",
      period ? `संबंधित अवधि: ${period}` : "",
      fee ? `आवेदन शुल्क: ${fee}` : "",
      "सूचना का माध्यम: लिखित/मुद्रित प्रति अथवा ई-मेल द्वारा।",
      "",
      "यह आवेदन किसी कानूनी कार्यवाही हेतु नहीं, बल्कि सूचना प्राप्त करने हेतु दिया जा रहा है। सूचना प्राप्त करने का कोई कारण बताना अनिवार्य नहीं है।",
      "",
      "कृपया सूचना निर्धारित समय-सीमा के भीतर उपलब्ध कराने की कृपा करें।",
      "",
      "धन्यवाद,",
      "",
      applicant,
      address,
      contact,
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  if (language === "hinglish") {
    return [
      `Date: ${date}`,
      place ? `Place: ${place}` : "",
      "",
      "To,",
      "Public Information Officer,",
      input.department.trim(),
      "",
      `Subject: ${subject}`,
      "",
      "Respected Sir/Madam,",
      "",
      "Right to Information Act, 2005 ki Section 6 ke tahat main niche di gayi soochna maang raha/rahi hoon:",
      "",
      ...numbered(information),
      "",
      period ? `Relevant period: ${period}` : "",
      fee ? `Application fee: ${fee}` : "",
      "Mode of access: printed copy or email.",
      "",
      "Yeh application kisi legal proceeding ke liye nahi, sirf soochna prapt karne ke liye hai. Soochna maangne ka karan batana zaroori nahi hai.",
      "",
      "Kripya soochna nirdharit samay-seema ke andar uplabdh karayein.",
      "",
      "Dhanyavaad,",
      "",
      applicant,
      address,
      contact,
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  return [
    `Date: ${date}`,
    place ? `Place: ${place}` : "",
    "",
    "To,",
    "The Public Information Officer,",
    input.department.trim(),
    "",
    `Subject: ${subject}`,
    "",
    "Respected Sir/Madam,",
    "",
    "Under Section 6 of the Right to Information Act, 2005, I request the following information:",
    "",
    ...numbered(information),
    "",
    period ? `Relevant period: ${period}` : "",
    fee ? `Application fee: ${fee}` : "",
    "Mode of access: printed copy or email.",
    "",
    "This application is for obtaining information and not for any legal proceeding. I am not required to give a reason for requesting the information.",
    "",
    "Kindly provide the information within the statutory time limit.",
    "",
    "Thank you,",
    "",
    applicant,
    address,
    contact,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
