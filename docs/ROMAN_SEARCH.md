# Spelling-tolerant Roman Kashmiri search (KoshurSoundex)

Romanized Kashmiri has no spelling standard that people actually follow. The
same word is typed many ways:

| Word | Typed as |
|---|---|
| ژوٗنٛٹھ "apple" | cxoont, tsoont, tsūnṭh, Tso:nth |
| کٲشُر "Kashmiri" | kaeshur, koshur, kashur, kạ̄shur |
| ترٛومُت "abandoned" | trovmut, traavmut, tromut, trowmut |

The KoshurLex page (`site/koshurlex.html`) and the Python engine
(`scripts/koshur_search.py`) both use the same method, so either one finds
the word whichever way it is spelled.

## The two keys

Every Roman spelling of every entry is turned into two keys when the data
loads. They are computed once, not on each search.

**Phonetic skeleton** (`compute_kashmiri_phonetic_skeleton`):

1. Diacritics and special letters are flattened: `ạ̄ ạ` → a, `ɨ̄ ɨ ι` → i,
   `ɔ ͻ ö` → o, `ü` → u, `ʰ` → h, `ʦ` → ts, and accents are dropped.
2. Digraphs are merged: `cxh cx tsh tz` → ts, `chh` → ch, `kh q` → k,
   `ph` → f, `th` → t, `dh` → d, `bh` → b, `gh` → g, `w` → v. Apostrophes and
   colons are dropped.
3. Vowel clusters are merged: `ae ea aa ai ay` → a, `ee ii ey ei e` → i,
   `oo uu ou ow au aw oa o` → u.
4. Doubled letters are collapsed.

The results: `cxoont`, `tsoont` and `tsūnṭh` all become **tsunt**, and
`traavmut` becomes **travmut**.

**Consonant root** (`compute_consonant_skeleton`): the skeleton with its
internal vowels removed. `koshur`, `kaeshur`, `kashir` and `kạ̄shur` all
become **kshr**.

## Ranking tiers

| Tier | Score | Rule |
|---|---|---|
| 1 | 100 | Exact Roman spelling (any listed variant), or exact Kashmiri script |
| 2 | 94 | Same phonetic skeleton |
| 3 | 89 | Whole word inside the English meaning |
| 4 | 85 | Same consonant root (root of 2 or more letters) |
| 5 | 78 | Prefix of a spelling or skeleton. Runs only while there are fewer than 60 results |
| 6 | ≤75 | Fuzzy skeleton match, edit-distance similarity ≥ 72%. Runs only when there are fewer than 15 results |

Two adjustments apply on top of the score:

* Entries with no meaning (Aksharantar spelling-only pairs) lose 15 points.
  This keeps real dictionary entries first.
* When scores tie, entries are ordered by spelling reliability: native, then
  Grierson 1932, then spelling-only, then machine-transliterated (Hassan),
  then unverified (ChiKhaPo).

A query in Kashmiri script is matched by its exact form first, then with the
vowel signs ignored, then with letter variants folded together (ٲ/أ/آ → ا,
ؠ/ێ/ۍ → ی, ۄ → و …), and finally as a substring.

## Roman → Perso-Arabic writer

The writer converts one word at a time:

1. It looks the word up among the Roman spellings of entries whose Kashmiri
   spelling is reliable (native, Grierson, or an Aksharantar spelling). It
   tries the exact spelling first, then the phonetic skeleton.
2. If neither finds the word, rule-based conversion spells it (`tsh` → ژھ,
   `ae` → ٲ, `oo` → وٗ, `'` → ؠ …). These words are **marked as guesses**: a
   dotted underline on the web page, and a printed list in the CLI.

## Sentence Studio (KoshurLex first tab)

You type a whole sentence using only a–z. The studio fills in three outputs at once:

1. **Direct / literal**: a letter-by-letter conversion of exactly what you
   typed. It does not use the dictionary.
2. **Dictionary Kashmiri**: each word replaced by a dictionary spelling. The
   candidates for each word are found by exact spelling, then phonetic
   skeleton, then consonant root. Each candidate's score combines how well it
   matched with how reliable its source is: core list > native > Aksharantar
   spelling > Grierson 1932 > unverified > machine-transliterated. Context is
   then added in **two passes**:
   * **gloss overlap (Lesk-style)**: +6 for each content word the candidate's
     English meaning shares with the chosen meanings of words within ±3
     positions, up to +18;
   * **hand-checked hints**: +12. For example, ترٛےٚ "three" next to
     cxoont, kitaab or insaan.

   Words that aren't found are spelled by rule and **underlined**. A badge
   shows how many words were found in the dictionary.
3. **Corrected Roman**: the dictionary's Roman spelling of each chosen word,
   plus a plain a–z version where long vowels are written doubled
   (ā → aa, ī → ee, ū → oo, ạ̄ → ae).

**Escapes (LaTeX-style)**: wrap a single word as `\word` or a phrase as
`\{several words\}`. Escaped text is copied unchanged into all three outputs,
which is useful for names, English and numbers.

Tap any word in the trace to see every candidate with its score.

This is context *scoring*, not a trained language model. No Kashmiri corpus
with word order is available here to train one. The demo homographs suggested
earlier were checked against the data and dropped: *trēsh* "thirst" is not
spelled like *tre* "three", and Grierson's *tar* means seedling or fresh, not
cold.

## Where the Roman spellings come from

| Source | Roman spellings |
|---|---|
| Kaeshir `collected-words` | popular spellings (Trovmut, Kaeshur) |
| Hassan (DSAL) | phonemic (ʦūr, cʰalι) |
| Grierson 1932 | scholarly (ʦūnṭhᵘ, kạ̄shur) |
| AI4Bharat Aksharantar | everyday typing (zabaan, zeban, trowmut). 40,982 words, with the named-entity lists removed |

## Using it from Python

```bash
python3 scripts/koshur_search.py cxoont
python3 scripts/koshur_search.py --write "kaeshur zabaan chhu meeth"
python3 scripts/koshur_search.py --romanize "کٲشُر زَبان"
```

```python
from koshur_search import SmartKashmiriSearchEngine
eng = SmartKashmiriSearchEngine.from_files("data/kashmiri_dictionary.jsonl",
                                           "data/kashmiri_roman_pairs.tsv")
for hit in eng.search("koshur", limit=5):
    print(hit["kashmiri_unicode"], hit["meaning"], hit["match_tier"])
```

The engine takes about 6 seconds to load the full data, and each search after
that takes milliseconds.
