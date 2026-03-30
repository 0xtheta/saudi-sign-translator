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

function tokenize(text) {
  if (!text) {
    return []
  }

  return text.split(' ').filter(Boolean)
}

export function scorePhraseMatch(query, candidate) {
  if (!query || !candidate) {
    return 0
  }

  if (query === candidate) {
    return 1
  }

  const queryTokens = tokenize(query)
  const candidateTokens = tokenize(candidate)
  if (!queryTokens.length || !candidateTokens.length) {
    return 0
  }

  if (queryTokens.length === 1 && queryTokens[0].length < 3) {
    return 0
  }

  const [shorterTokens, longerTokens] =
    queryTokens.length <= candidateTokens.length
      ? [queryTokens, candidateTokens]
      : [candidateTokens, queryTokens]

  if (
    shorterTokens.length >= 2 &&
    shorterTokens.every((token, index) => token === longerTokens[index])
  ) {
    return 0.75 + (shorterTokens.length / longerTokens.length) * 0.2
  }

  const overlap = queryTokens.filter((token) => candidateTokens.includes(token)).length
  if (overlap < 2) {
    return 0
  }

  return overlap / Math.max(queryTokens.length, candidateTokens.length)
}

export function findBestAnimationMatch(query, animations, phrases) {
  const normalizedQuery = normalizeArabicText(query)
  if (!normalizedQuery) {
    return null
  }

  const rankedMatches = phrases
    .map((phrase) => ({
      phrase,
      score: scorePhraseMatch(normalizedQuery, phrase.text_normalized),
    }))
    .filter((entry) => entry.score >= 0.6)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return right.phrase.priority - left.phrase.priority
    })

  if (!rankedMatches.length) {
    return null
  }

  const bestMatch = rankedMatches[0]
  const animation = animations.find((entry) => entry.id === bestMatch.phrase.animation_id)
  if (!animation) {
    return null
  }

  return {
    animation,
    phrase: bestMatch.phrase,
    normalizedQuery,
    score: bestMatch.score,
  }
}
