# Kashmiri keyboard used on the website

The website's on-screen keyboard also works with your physical keyboard: open
it and leave "type with my keyboard" ticked. It is a **phonetic** layout. It
follows the convention of the widely used Urdu phonetic keyboards (CRULP
style): each Kashmiri letter sits on the Latin key with the nearest sound, and
**Shift** gives the related letter (dental → retroflex, plain → emphatic).
Kashmiri needs letters and vowel signs that Urdu layouts do not have. They are
added on Shift, and the vowel signs are on **Shift + number row**.

Every key produces exactly the code point listed in
[ORTHOGRAPHY.md](ORTHOGRAPHY.md). It never produces the Arabic look-alikes
(ك ي ه), so what you type matches the dataset without any conversion.

| Key | Normal | Shift | | Key | Normal | Shift |
|---|---|---|---|---|---|---|
| Q | ق | ۄ (ɔ) | | A | ا | آ |
| W | و | ؤ | | S | س | ص |
| E | ع | ٲ (əː) | | D | د | ڈ |
| R | ر | ڑ | | F | ف | ئ |
| T | ت | ٹ | | G | گ | غ |
| Y | ے | ؠ (Kashmiri yē) | | H | ھ (aspiration) | ح |
| U | ء | ۍ (yē with tail) | | J | ج | ض |
| I | ی | ێ | | K | ک | خ |
| O | ہ | أ (ə) | | L | ل | ۂ |
| P | پ | إ (ɨ) | | ; | ؛ | : |
| Z | ز | ذ | | N | ن | ں |
| X | ش | ژ (ts) | | M | م | ۓ |
| C | چ | ث | | , | ، | < |
| V | ط | ظ | | . | ۔ | > |
| B | ب | ة | | / | / | ؟ |
| [ | ْ jazm | ٓ madd | | ] | ٌ | ٍ |
| \ | ٘ nūn-ghunna mark | ۃ | | ` | ZWNJ | ً do zabar |

**Vowel signs (Shift + number row):**

| Shift+ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 0 | - | = |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sign | َ a | ِ i | ُ u | ٔ ə | ٕ ɨ | ٖ iː | ٗ uː | ٚ e/o | ٛ ʲ/ʷ | ٟ ɨː | ّ shad | ٰ khaḍā zabar |

Examples: `kE` + `x` + `Shift+3` + `r` gives **کٲشُر**. `x` `h` gives **شھ**,
`Shift+X` `h` gives **ژھ** (tsʰ), and `t` `r` `Shift+9` gives **ترٛ**.

By default, the search ignores vowel signs: آب finds اَب, آب and so on. Tick
**match vowel signs** to search for an exact diacritized spelling.
