// Ported from the original prototype's Arabic-normalization helper.
export function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْ]/g, "") // tashkeel/diacritics
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchText(title: string, description?: string | null): string {
  return normalizeArabicText([title, description].filter(Boolean).join(" "));
}
