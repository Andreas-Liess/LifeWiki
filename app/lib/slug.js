// Turns any text into a clean URL part: "Maßtheorie & Analysis" -> "masstheorie-analysis".
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss').replace(/æ/gi, 'ae').replace(/ø/gi, 'o').replace(/œ/gi, 'oe').replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
