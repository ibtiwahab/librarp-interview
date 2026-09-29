/** Text helpers shared by the question bank and the document importer. */

const LEADING_NUMBER = /^\s*(?:q(?:uestion)?\s*)?#?\d{1,3}\s*(?:[.):\-–—]+|\s(?=[A-Z]))\s*/i;

/** Canonical form used for duplicate detection. */
export function normalizeQuestionText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(LEADING_NUMBER, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const cc = (code: number) => String.fromCharCode(code);
// Zero-width space/joiners and BOM, built from char codes to keep the source ASCII-clean.
const ZERO_WIDTH = new RegExp(`[${cc(0x200b)}-${cc(0x200d)}${cc(0xfeff)}]`, "g");
const NBSP = new RegExp(cc(0xa0), "g");

/** Tidies whitespace without altering wording. */
export function cleanWhitespace(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .replace(NBSP, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  const compact = s.replace(/\s+/g, " ");
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export function capitalizeFirst(text: string): string {
  const t = text.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

export function ensureTerminalPunctuation(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?:…)]$/.test(t) ? t : `${t}.`;
}
