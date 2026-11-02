"""Normalize Kashmiri Perso-Arabic text to one Unicode convention.

Target convention (see docs/ORTHOGRAPHY.md):
  * Unicode Normalization Form C (NFC), as recommended by W3C/Unicode.
  * Kashmiri/Urdu letter forms, not Arabic ones:
        ك U+0643 -> ک U+06A9     ي U+064A / ى U+0649 -> ی U+06CC
        ه U+0647 -> ہ U+06C1     ۀ U+06C0 -> ۂ (ہ + ٔ)
  * Legacy-font workarounds replaced by the dedicated Kashmiri code points:
        ٮ۪ (U+066E U+06EA)  -> ؠ U+0620 ARABIC LETTER KASHMIRI YEH
        ۭ  U+06ED (small low meem, used for the long central vowel)
                             -> ٟ U+065F ARABIC WAVY HAMZA BELOW
        ۆ  U+06C6 (o, used by the Hassan/DSAL data) -> وٚ (U+0648 U+065A)
  * Kashmiri vowel signs are kept as-is:
        َ U+064E a   ُ U+064F u   ِ U+0650 i   ٔ U+0654 ə   ٕ U+0655 ɨ
        ٖ U+0656 iː  ٗ U+0657 uː  ٚ U+065A e/o ٛ U+065B o  ٟ U+065F ɨː
        ٲ U+0672 əː  اٟ ɨː (initial; deprecated ٳ U+0673 is decomposed)  ۄ U+06C4 ɔ  ێ U+06CE e  ۍ U+06CD ʲ
  * Arabic-Indic / Extended digits -> ASCII digits are NOT touched (rare).
  * Tatweel removed, ZWNJ kept, repeated identical marks collapsed,
    whitespace collapsed, Arabic comma ، used as the list separator.
"""
import re
import unicodedata

_CHAR_MAP = {
    "ك": "ک",  # ARABIC KAF -> KEHEH
    "ي": "ی",  # ARABIC YEH -> FARSI YEH
    "ى": "ی",  # ALEF MAKSURA -> FARSI YEH
    "ه": "ہ",  # ARABIC HEH -> HEH GOAL
    "ۀ": "ۂ",  # HEH WITH YEH ABOVE -> HEH GOAL + HAMZA ABOVE
    "ۭ": "ٟ",  # SMALL LOW MEEM (legacy) -> WAVY HAMZA BELOW
    "ۆ": "وٚ",  # WAW WITH V ABOVE -> WAW + SMALL V ABOVE
    "ـ": "",        # TATWEEL
    "‏": "", "‎": "", "‪": "", "‫": "", "‬": "",  # bidi marks
    "﻿": "",
}
_TRANS = str.maketrans({k: v for k, v in _CHAR_MAP.items()})

_MARKS = "ً-ٰٟۖ-ۭ"
_DUP_MARK = re.compile(r"([%s])\1+" % _MARKS)
_LEGACY_KASHMIRI_YEH = re.compile("ٮ۪")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([،؛۔,;.])")
_COMMA_SPACING = re.compile(r"\s*[،,]\s*")

# Characters allowed in a normalized headword (for QA reporting).
KASHMIRI_LETTERS = set(
    "ءآأؤإئابةتثجحخدذرزسشصضطظعغفقلمنوپٹچڈڑژکگںھہۂۃیےۍێؠٲۄ"
)
KASHMIRI_MARKS = set("ًٌٍَُِّْٕٖٔ"
                     "ٰٟٗ٘ٚٛٓ")
KASHMIRI_PUNCT = set(" ،؛؟۔()-‌")


def normalize_ks(text):
    """Return Kashmiri Perso-Arabic text in the dataset's canonical form."""
    if not text:
        return ""
    t = _LEGACY_KASHMIRI_YEH.sub("ؠ", text)
    t = t.translate(_TRANS)
    t = _DUP_MARK.sub(r"\1", t)
    t = unicodedata.normalize("NFC", t)
    t = _COMMA_SPACING.sub("، ", t)
    t = _SPACE_BEFORE_PUNCT.sub(r"\1", t)
    t = re.sub(r"\s+", " ", t).strip(" ،,")
    return t


def strip_marks(text):
    """Consonantal skeleton: remove vowel signs (for search / fuzzy matching)."""
    d = unicodedata.normalize("NFD", normalize_ks(text))
    d = "".join(ch for ch in d if ch not in KASHMIRI_MARKS or ch == "\u0653")  # keep madda (آ)
    return unicodedata.normalize("NFC", d)


def foreign_chars(text):
    """Characters outside the canonical Kashmiri inventory (QA helper)."""
    allowed = KASHMIRI_LETTERS | KASHMIRI_MARKS | KASHMIRI_PUNCT
    return {ch for ch in text if ch not in allowed}


if __name__ == "__main__":
    for s in ["پٮ۪ٹھ", "سۭتۍ", "اََڈٕلیوٚک", "كتاب", "اڈلنۆک", "نیوٗل،آسمٲنۍ"]:
        out = normalize_ks(s)
        print(s, "->", out, [f"U+{ord(c):04X}" for c in out])
