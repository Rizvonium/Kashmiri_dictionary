# Kashmiri Dictionary Dataset (کٲشُر لُغَت ڈیٹاسیٹ)

A single, merged, machine-readable Kashmiri dictionary built from the openly
available sources, with all Kashmiri text in **one Unicode convention**: NFC,
using the dedicated Kashmiri Perso-Arabic code points (ک ی ہ ھ ؠ ٲ ۄ ۍ ٕ ٔ ٟ …).

| File | What it is |
|---|---|
| [`data/kashmiri_dictionary.jsonl`](data/kashmiri_dictionary.jsonl) | Canonical dataset, one JSON entry per line |
| [`data/kashmiri_dictionary.csv`](data/kashmiri_dictionary.csv) | The same entries as a flat CSV (UTF-8 with BOM, so Excel opens it correctly) |
| [`data/kashmiri_headwords.txt`](data/kashmiri_headwords.txt) | Unique native-orthography Perso-Arabic headwords, in Kashmiri alphabetical order |
| [`data/build_report.json`](data/build_report.json) | Counts, coverage and QA statistics |
| [`docs/SOURCES.md`](docs/SOURCES.md) | **Source-by-source usability assessment** (what each link really contains, quality, licence) |
| [`docs/ORTHOGRAPHY.md`](docs/ORTHOGRAPHY.md) | **Which Unicode to use for Kashmiri** and every normalization rule applied |
| `scripts/` | `fetch_sources.sh` (download), `build_dataset.py` (merge), `ks_normalize.py` (Unicode normalizer) |

## At a glance

| | |
|---|---|
| Total entries | **38,978** |
| With a Perso-Arabic headword | 20,131 (12,188 in native modern orthography, 9,659 unique words) |
| With Devanagari | 19,326 |
| With romanization | 35,610 |
| With native-speaker audio | 5,606 |
| With English example sentence | 11,684 |
| With Hindi gloss | 8,245 |
| Entries by source | Grierson 21,145 · kashmirizabaan 8,637 · Kaeshir 9,049 · Hassan 5,563 · other 82 (one entry can come from several sources) |


## Website (search UI)

`site/` is a static website, with no build step. It loads `site/data/dictionary.json` and offers:

* instant search in Kashmiri script, English, romanized Kashmiri, Hindi and Devanagari, plus full-text search of Grierson's definitions
* Smart / Starts with / Exact / Contains matching. Vowel signs are ignored unless you ask for them
* filters for source, part of speech and audio, and browsing by Kashmiri letter
* an on-screen **Kashmiri keyboard** that also maps your physical keyboard, covering every Kashmiri letter and vowel sign ([docs/KEYBOARD.md](docs/KEYBOARD.md))
* a welcome page with example searches, a word of the day, your recent searches, and browsing by letter
* forgiving search: کاشر finds کٲشُر (letter variants and vowel signs are ignored unless you ask for an exact spelling), and "did you mean …" for English typos
* on phones, the keyboard slides up from the bottom and the phone's own keyboard stays hidden
* native-speaker audio, Naskh/Nastaʿlīq typeface switch (both fonts cover all Kashmiri code points), dark mode, and shareable `#q=…` links

**Run locally:** `python3 -m http.server -d site 8000`, then open http://localhost:8000

**Deploy to Vercel:** import this repo. `vercel.json` already sets `outputDirectory: "site"`, and no framework or build command is needed. Alternatively, run `npx vercel --prod` in the repo root.

After rebuilding the data, refresh the site's copy:

```bash
python3 scripts/build_site_data.py data/kashmiri_dictionary.jsonl site/data/dictionary.json
```

## Entry schema

| Field | Meaning |
|---|---|
| `id` | Stable row id (`ks000001`, …) for this build |
| `headword_ks` | Kashmiri headword in Perso-Arabic, normalized (empty if the source has none) |
| `headword_ks_bare` | Same headword with the vowel signs removed, for search and matching |
| `headword_roman` | Romanization, exactly as the source gives it |
| `roman_scheme` | `grierson-1932`, `hassan-dsal`, `kaeshir-popular` (the schemes differ; see ORTHOGRAPHY.md) |
| `headword_deva` | Devanagari form (Grierson; the Kashmiri stop-word list) |
| `pos`, `gender` | Normalized part of speech (`noun`, `verb`, `adjective`, …) and gender (`m`, `f`, `c.g.`) |
| `gloss_en` | Short English equivalent(s), separated by `; ` |
| `definition_en` | Full English dictionary article (Grierson). Sub-entries are separated by ` ¶ `. Vanishing vowels are written as superscripts (`dyunᵘ`) |
| `hindi_gloss` | Hindi equivalent(s) |
| `example_en`, `example_ks`, `example_ks_roman` | Usage examples |
| `audio_url` | Native-speaker pronunciation (DSAL Hassan recordings) |
| `source`, `source_ref` | Source(s) the entry came from, plus file name or page number |
| `script_quality` | `native` (modern Kashmiri orthography), `source-perso-arabic (1932)` (Grierson's Persian-style spelling), `auto-transliterated` (Hassan: machine-generated, use with care), `unverified` |
| `license` | Licence(s) of the source(s) for that row |

### How the merge works

* **English→Kashmiri sources** (kashmirizabaan, Kaeshir, and Omarrran once
  access is granted) are turned around so that Kashmiri is the headword. A cell
  such as `لایقِہ کار، قٲبِل` becomes two headwords. Rows with the same
  Kashmiri word and part of speech are merged into one, and all of their
  English glosses, Hindi glosses, examples and sources are collected together.
* **Kashmiri→English sources** (Grierson, Hassan) keep their own entries,
  because their romanization schemes cannot be reliably matched to the
  modern-orthography entries.
* Native-orthography entries are sorted in Kashmiri alphabetical order. They
  come first, followed by Hassan and then Grierson in romanized order.

## Rebuild

```bash
bash scripts/fetch_sources.sh raw        # ~20 min: polite page-by-page crawl of DSAL Grierson
python3 scripts/build_dataset.py raw data
```

## Using it

```python
import json
entries = [json.loads(l) for l in open("data/kashmiri_dictionary.jsonl", encoding="utf-8")]
water = [e for e in entries if "water" in (e["gloss_en"] + e["definition_en"]).lower()]
```

## Licence and credits

Developed by **Kainaat & RGMir**.


The build code is released under MIT. The data rows keep their sources'
licences (per-row `license` field). See [`docs/SOURCES.md`](docs/SOURCES.md);
to keep only rows that are safe to redistribute, filter
`source ∈ {kaeshir, grierson}`. Credits: G. A. Grierson (1932) and DSAL,
University of Chicago; Sheeba Hassan and DSAL; Izan Majeed (Kaeshir
Dictionary); kashmirizabaan.com; ubaierbhat/kzwebscrap; injilashah.

Prof. Shafi Shauq's *Kāśir Lug̲h̲at* is **not included**: it is under
copyright, and DSAL offers it for look-up only.
