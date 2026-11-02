# Unicode convention for Kashmiri (Perso-Arabic / Nastaʿlīq)

Kashmiri (`ks`, ISO 15924 `Arab`, BCP-47 `ks-Arab`) is officially written in a
Perso-Arabic script that extends the Urdu alphabet with extra vowel letters and
vowel signs, all of which now have their own Unicode code points.
Every Perso-Arabic field in this dataset (`headword_ks`, `example_ks`, the
Perso-Arabic text inside `definition_en`) is normalized to the convention below
by [`scripts/ks_normalize.py`](../scripts/ks_normalize.py).

## 1. Normalization form

**NFC** (Unicode Normalization Form C), which the W3C recommends for text on the
web. Combining marks are put in canonical order, so the same word always has
the same bytes and string comparison and search work.

## 2. Base letters: use the Urdu/Kashmiri code points, not the Arabic ones

| Use | Code point | Not this | Note |
|---|---|---|---|
| ک | U+06A9 KEHEH | ك U+0643 | |
| ی | U+06CC FARSI YEH | ي U+064A, ى U+0649 | |
| ہ | U+06C1 HEH GOAL | ه U+0647 | `ہ` is the vowel/medial h |
| ھ | U+06BE HEH DOACHASHMEE | | used only for aspiration: `کھ`, `چھ`, `ژھ`, `پھ`, … |
| ے | U+06D2 YEH BARREE | | |
| ژ | U+0698 JEH | | Kashmiri **ts** (`ژھ` = tsʰ) |
| ؠ | U+0620 KASHMIRI YEH | ٮ۪ (U+066E + U+06EA) | the legacy-font workaround is replaced |
| ۍ | U+06CD YEH WITH TAIL | | final palatalization (ʲ) |
| ێ | U+06CE YEH WITH SMALL V | | |
| ٹ ڈ ڑ | U+0679, U+0688, U+0691 | | retroflex consonants |

## 3. Kashmiri vowel letters and vowel signs (kept exactly)

| Sound | Initial (letter) | After a consonant (sign) |
|---|---|---|
| a | اَ | َ U+064E FATHA |
| aː | آ U+0622 | ا |
| ə | أ U+0623 (ا + ٔ) | ٔ U+0654 HAMZA ABOVE |
| əː | ٲ U+0672 ALEF WITH WAVY HAMZA ABOVE | ٲ |
| i | اِ | ِ U+0650 KASRA |
| iː | ای | ٖ U+0656 SUBSCRIPT ALEF / ی |
| ɨ | إ U+0625 (ا + ٕ) | ٕ U+0655 HAMZA BELOW |
| ɨː | اٟ (U+0627 + U+065F) | ٟ U+065F WAVY HAMZA BELOW |
| u | اُ | ُ U+064F DAMMA |
| uː | اوٗ | ٗ U+0657 INVERTED DAMMA (وٗ) |
| e / eː | اێ, ایٚ | ٚ U+065A SMALL V ABOVE (یٚ), ێ |
| o / oː | اوٚ | ٚ U+065A on و (وٚ), plain و for oː |
| ɔ / ɔː | اۄ | ۄ U+06C4 WAW WITH RING |
| (palatal / labial) | | ٛ U+065B INVERTED SMALL V ABOVE (e.g. `ترٛ`, `سنٛد`) |

## 4. Legacy encodings converted by the normalizer

| Found in source | Becomes | Why |
|---|---|---|
| `ٮ۪` (U+066E U+06EA) | `ؠ` U+0620 | old fonts lacked KASHMIRI YEH (kashmirizabaan data) |
| `ۭ` U+06ED SMALL LOW MEEM | `ٟ` U+065F | old fonts' stand-in for the long ɨː sign (`سۭتۍ` → `سٟتۍ`) |
| `ۆ` U+06C6 | `وٚ` (U+0648 U+065A) | o vowel in the Hassan/DSAL Perso-Arabic |
| `ٳ` U+0673 | `اٟ` (U+0627 U+065F) | U+0673 has been deprecated since Unicode 6.0 |
| `ك` `ي` `ى` `ه` | `ک` `ی` `ی` `ہ` | Arabic keyboard forms |
| `ڐ` `ٿ` `ڇ` (Sindhi letters in Grierson 1932) | `ڈ` `تھ` `چھ` | Urdu/Kashmiri spellings of ḍ, tʰ, cʰ |
| Arabic presentation forms (U+FB50–FEFF) | base letters | old encodings |
| doubled marks (`اََ`) | one mark | typing errors |
| tatweel, LRM/RLM, BOM | removed | |
| `,` `،` with any spacing | `، ` | one list separator |

## 5. Things the normalizer does *not* change

* It does not add missing vowel signs. Undiacritized words stay undiacritized,
  because guessing vowels would invent data. `headword_ks_bare` gives every
  headword with the vowel signs removed, so you can match words written with
  and without diacritics.
* It does not correct spellings. For example, the Hassan data writes `ح` for
  plain *h* (`افواح` for *afwāh*). Those entries are flagged
  `script_quality = auto-transliterated` and should be treated with caution.
* Romanizations are kept in the scheme their source used (`roman_scheme`).
  These schemes are not compatible and are not converted into each other.

## 6. Fonts

To display the text correctly, use a Nastaʿlīq or Naskh font that supports the
Kashmiri code points, such as **Noto Nastaliq Urdu**, **Noto Naskh Arabic**,
**Gulmarg Nastaleeq** (Kashmir Academy), or **Afan Koshur Naksh**. Many generic
Arabic fonts show ؠ ٲ ٳ ۄ ٟ as boxes.
