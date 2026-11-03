# Kashmiri Dictionary Dataset (کٲشُر لُغَت ڈیٹاسیٹ)

A single, merged, machine-readable Kashmiri dictionary built from the openly
available sources, with all Kashmiri text in **one Unicode convention**: NFC,
using the dedicated Kashmiri Perso-Arabic code points (ک ی ہ ھ ؠ ٲ ۄ ۍ ٕ ٔ ٟ …).

| File | What it is |
|---|---|
| [`data/kashmiri_dictionary.jsonl`](data/kashmiri_dictionary.jsonl) | Canonical dataset, one JSON entry per line |
| [`data/kashmiri_dictionary.csv`](data/kashmiri_dictionary.csv) | The same entries as a flat CSV (UTF-8 with BOM, so Excel opens it correctly) |
| [`data/kashmiri_roman_pairs.tsv`](data/kashmiri_roman_pairs.tsv) | Kashmiri word → everyday Roman spellings (AI4Bharat Aksharantar), with an `in_dictionary` flag |
| [`data/kashmiri_headwords.txt`](data/kashmiri_headwords.txt) | Unique native-orthography Perso-Arabic headwords, in Kashmiri alphabetical order |
| [`data/build_report.json`](data/build_report.json) | Counts, coverage and QA statistics |
| [`docs/SOURCES.md`](docs/SOURCES.md) | **Source-by-source usability assessment** (what each link really contains, quality, licence) |
| [`docs/ORTHOGRAPHY.md`](docs/ORTHOGRAPHY.md) | **Which Unicode to use for Kashmiri** and every normalization rule applied |
| `scripts/` | `fetch_sources.sh` (download), `build_dataset.py` (merge), `ks_normalize.py` (Unicode normalizer), `koshur_search.py` (spelling-tolerant search engine, see [docs/ROMAN_SEARCH.md](docs/ROMAN_SEARCH.md)), `ks_verifier.py` and `validate_lexicon.py` (dual-lookup verification, see below) |

## At a glance

| | |
|---|---|
| Total entries | **46,872** |
| With a Perso-Arabic headword | 24,735 (12,188 in native modern orthography, 9,659 unique words) |
| With Devanagari | 22,616 |
| With romanization | 35,610 (+ 5,590 entries with extra everyday Roman spellings from Aksharantar) |
| Roman ↔ Perso-Arabic spelling pairs | 40,982 words (`data/kashmiri_roman_pairs.tsv`) |
| With native-speaker audio | 5,606 |
| With English example sentence | 11,684 |
| With Hindi gloss | 8,245 |
| Entries by source | Grierson 21,145 · kashmirizabaan 8,637 · Kaeshir 9,049 · ChiKhaPo 7,894 · Hassan 5,563 · other 82 (one entry can come from several sources) |

## Website

The site fills the screen like an app. A left sidebar holds the sections, your recent searches, letter browsing, the credit and the theme switches. The main area shows the current tool. In the dictionary, results are listed on the left and the selected entry, with the same word in other sources, is shown on the right. On tablets and phones, the sidebar slides in from a menu button, and an entry opens full screen with a back button.

The look takes its colours from Kashmir in autumn: warm paper neutrals, one chinar-ember accent, and a chinar leaf as the logo and the mark of the selected item. The design follows [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky (CC BY 4.0). The animated example on the home screen, a Roman sentence turning into Kashmiri, follows the approach of [stageshow](https://github.com/benjitaylor/skills) by Benji Taylor (MIT), built in plain CSS and JS on the site's own writer engine.


`site/` is one static page, with no build step, and three tabs. One on-screen keyboard is shared by every field. It opens only when you press ⌨ (or Ctrl+K) and stays closed once closed. While open, it shows Roman for Roman fields and کٲشُر for Kashmiri fields.

* **Dictionary**: search in English, Kashmiri script, Hindi, or Roman Kashmiri spelled any way (*koshur* / *kaeshur* / *kạ̄shur*, *cxoont* / *tsoont*). Vowel signs and letter variants are optional. It offers filters, browsing by letter, audio, "did you mean", a word of the day and recent searches.
* **Write & Translate**: type a sentence in a–z and get four views of it: your input, the dictionary Kashmiri spelling (chosen using the sentence's context; tap any word to see and pick other spellings), the corrected Roman spelling, and a letter-by-letter Kashmiri spelling. `\word` and `\{phrase\}` keep names exactly as typed. The **Meaning & translation** panel offers:
  * a word-by-word meaning from the dictionary (offline);
  * an **AI translation and correction**, which receives every word's dictionary hints;
  * **English → Kashmiri**.
* **Sources & add a word**: add your own words (saved in your browser and exportable as CSV), and read about the sources.

### Meaning and translation

Press **Translate and correct** in Write and translate to use three sources:
1. **The dictionary meaning**: instant and works offline.
2. **Google Translate's free web endpoint**: needs no key. Google may limit or refuse automated use, and Kashmiri support is up to Google. When it is unavailable, the column says so.
3. **An AI translation**: the AI receives the sentence, every word's dictionary meanings and Google's attempt. It returns a fluent English translation plus corrected Kashmiri and Roman text, which you can apply with one click.

English → Kashmiri works the same way. Words typed as `\word` or `\{phrase\}`, and English words you kept, stay exactly as typed. To switch the panel off, set `TRANSLATION_ENABLED = false` in `site/assets/app.js`.

### Translation quality: optional server-side Claude

The best translations come from the included Vercel function `api/translate.js`, which calls **Claude** (`claude-opus-5-5`, high effort, with server-side refusal fallback enabled). To turn it on, open Vercel → Project → Settings → Environment Variables and add `ANTHROPIC_API_KEY`, then redeploy. Without the key, the site falls back to a free public model (text.pollinations.ai), which works on the deployed site but not from `localhost`. The function only accepts requests from your own site (or the `ALLOWED_ORIGINS` you list), limits each request to 1,200 characters, and rate-limits each IP address on a best-effort basis. Note that each translation spends your API credit.

**Run locally:** `python3 -m http.server -d site 8000`. The dictionary and writer work fully; AI translation needs the deployed site.

**Deploy:** import the repo into Vercel. `vercel.json` serves `site/`, sets up the `api/` function, and redirects the old `/koshurlex.html` address.

After rebuilding the data, refresh the site's copy:

```bash
python3 scripts/build_site_data.py data/kashmiri_dictionary.jsonl site/data/dictionary.json
```

### Adding word lists

Put CSV files (`kashmiri_unicode, romanized_kashmiri, meaning`) in `data/contrib/` and rebuild. They are normalized, de-duplicated and merged; see `data/contrib/README.md`.

## Dictionary verification (dual-lookup)

`scripts/ks_verifier.py` implements the verifier from *Recursive Dual-Lookup Dictionary Verification
for Grammatical Self-Correction in Low-Resource Kashmiri Generation* (S. A. Sheikh, project guide v1.0,
2026) on this dataset. Every content word is looked up twice:

* **by form**: what does the written token correspond to? Exact key first, then the vowel-free
  skeleton, then Kashmiri look-alikes (ٲ→ا, ۄ→و, ؠ/ۍ→ی), then a character-trigram index with fuzzy
  scoring (`rapidfuzz` if installed);
* **by meaning**: which entry expresses the intended sense with the required valency? TF-IDF over
  the English gloss by default; any sentence-transformers embedder can be passed instead.

`flag()` decides in code whether a token has a valency mismatch or is unknown, and
`verify_and_correct()` runs draft → dual lookup → flags → critic → re-check, where the critic may only
substitute attested forms. Valency comes only from the sources' own labels ("verb (transitive)",
Grierson's *v. t.* / *v. i.*), never from a model.

```bash
python3 scripts/ks_verifier.py form کاشر                       # -> کٲشُر
python3 scripts/ks_verifier.py meaning "to collect (transitive)" --valency transitive
python3 scripts/ks_verifier.py check "مےٚ چُھ کٲشُر زَبانہِ پؠٹھ غُرور"
python3 scripts/validate_lexicon.py data/kashmiri_dictionary.jsonl
python3 tests/test_pipeline.py
```

`tests/test_pipeline.py` replays the guide's motivating example (*pot waan*: the intransitive
سَمیِتھ is flagged next to an ergative agent and replaced by the attested transitive سۄمبرٲوِتھ)
with a scripted model, so it runs offline. On the real dataset, the form lookup recovers **97.5%** of
2,000 damaged native headwords (vowel signs dropped, Kashmiri letters typed as Urdu ones), above the
guide's 95% target. The guide's own three sample entries are in `data/lexicon_sample.json`.

`scripts/validate_lexicon.py` (guide §6.4) checks every entry: required fields, unique ids, part of
speech, valency, NFC/canonical form and foreign characters. All 46,872 entries are NFC and canonical.
It flags 23 headwords that are not really headwords: alternatives joined with `/`
(رۄہُن/رُہُن), trailing or bare `....`, a `label: value` pair and a whole sentence. `build_dataset.py`
now splits and cleans these, so the next rebuild removes them. 5,119 verbs still have no valency
label in any source; the guide's annotation protocol (two annotators, a third on disagreement) is the
way to fill them.

The website's **Translate and correct** follows the same rules: each hint says whether a word is
`[IN DICTIONARY]` (with part of speech) or `[NOT IN DICTIONARY]` (spelled by rule), the model may
only swap in spellings from the hints, and it returns an `edits` list (from, to, reason), which
the page shows under the AI translation.

## Entry schema

| Field | Meaning |
|---|---|
| `id` | Stable row id (`ks000001`, …) for this build |
| `headword_ks` | Kashmiri headword in Perso-Arabic, normalized (empty if the source has none) |
| `headword_ks_bare` | Same headword with the vowel signs removed, for search and matching |
| `headword_roman` | Romanization, exactly as the source gives it |
| `roman_variants` | Everyday Roman spellings of the headword from AI4Bharat Aksharantar (`; `-separated) |
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

A labour of love (and a little fun) by **Sajad Kainaat & RGMir**, built on open-source resources.


The build code is released under MIT. The data rows keep their sources'
licences (per-row `license` field). See [`docs/SOURCES.md`](docs/SOURCES.md);
to keep only rows that are safe to redistribute, filter
`source ∈ {kaeshir, grierson}`. Credits: G. A. Grierson (1932) and DSAL,
University of Chicago; Sheeba Hassan and DSAL; Izan Majeed (Kaeshir
Dictionary); kashmirizabaan.com; ubaierbhat/kzwebscrap; injilashah.

Prof. Shafi Shauq's *Kāśir Lug̲h̲at* is **not included**: it is under
copyright, and DSAL offers it for look-up only.
