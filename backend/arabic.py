import re


DIACRITICS_REGEX = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED]")
NON_WORD_GAP_REGEX = re.compile(r"[^\w\s]+", re.UNICODE)
MULTISPACE_REGEX = re.compile(r"\s+")


def normalize_arabic_text(value: str) -> str:
    normalized = value.strip()
    normalized = DIACRITICS_REGEX.sub("", normalized)
    normalized = normalized.replace("\u0640", "")
    normalized = re.sub(r"[إأآٱ]", "ا", normalized)
    normalized = normalized.replace("ى", "ي")
    normalized = normalized.replace("ؤ", "و")
    normalized = normalized.replace("ئ", "ي")
    normalized = normalized.replace("ة", "ه")
    normalized = NON_WORD_GAP_REGEX.sub(" ", normalized)
    normalized = MULTISPACE_REGEX.sub(" ", normalized)
    return normalized.strip()


def slugify_label(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = re.sub(r"[^\w\s\u0600-\u06FF-]+", "", lowered, flags=re.UNICODE)
    return MULTISPACE_REGEX.sub("-", cleaned).strip("-")
