const DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g
const TATWEEL_REGEX = /\u0640/g
const NON_ARABIC_WORD_GAP_REGEX = /[^\p{L}\p{N}\s]+/gu
const MULTISPACE_REGEX = /\s+/g

export function normalizeArabicText(input) {
  return input
    .trim()
    .replace(DIACRITICS_REGEX, '')
    .replace(TATWEEL_REGEX, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(NON_ARABIC_WORD_GAP_REGEX, ' ')
    .replace(MULTISPACE_REGEX, ' ')
    .trim()
}

export function slugifyLabel(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(MULTISPACE_REGEX, '-')
}
