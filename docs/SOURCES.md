# Source assessment: which Kashmiri dictionary sources are usable

All sources were checked on 2026-11-02 by downloading them and reading the
files, not just the descriptions. Several things the descriptions claimed did
not match what the files actually contain. Those cases are marked ⚠.

| # | Source | What it really contains | Kashmiri script quality | License | Verdict |
|---|---|---|---|---|---|
| 1 | **Kaeshir Dictionary data** — [izan-majeed/kaeshir-dictionary-data](https://github.com/izan-majeed/kaeshir-dictionary-data) | 3 JSON files. `collected-words.json`: 5,156 English→Kashmiri rows, with Perso-Arabic, a popular romanization and gender (87 have a Kashmiri example). `dictionary-words.json`: 20,643 Grierson entries, **romanized only** (the original Perso-Arabic and Devanagari were stripped). `audio-words.json`: 2,919 Hassan entries, **romanized only**, with DSAL audio links. | Good, modern orthography in `collected-words` | MIT | ✅ **Used.** `collected-words` is merged in. `audio-words` fills gaps in Hassan. The Grierson copy is only a fallback, because DSAL has richer data. |
| 2 | **kzwebscrap** — [ubaierbhat/kzwebscrap](https://github.com/ubaierbhat/kzwebscrap) | ⚠ Files are **UTF-16**, not UTF-8. `data/json`: 10,572 rows scraped from kashmirizabaan.com (English→Kashmiri, POS, English example, ad-hoc transliteration). `data/hassan/json`: **5,350** Hassan entries, more than the 2,919 claimed, with Perso-Arabic, a phonemic romanization and audio. | kashmirizabaan: good, but uses legacy-font hacks (`ٮ۪` for ؠ, `ۭ` for ٟ). The normalizer fixes these. Hassan Perso-Arabic: ⚠ **poor**. It is machine-generated from the romanization: `ح` is used for plain h, `ذ` for z, `ئ` for ɨ. | MIT for the scrape; the content belongs to kashmirizabaan.com / DSAL | ✅ **Used.** Hassan's Perso-Arabic is kept but flagged `auto-transliterated`. |
| 3 | **injilashah/Kashmiri-language-text-dataset** ([HF](https://huggingface.co/datasets/injilashah/Kashmiri-language-text-dataset)) | `kashmiri_zabaan.csv`: 10,145 rows. This is the **same kashmirizabaan.com data** as #2 (9,227 of its 9,371 headword+gloss pairs are identical). It adds Hindi glosses for every row. `wordphonemes-meaning.csv`: 1,960 romanized words, 1,875 of which are already in Hassan, plus 85 Devanagari Kashmiri stop-words. | Same as #2 | Not stated | ✅ **Used.** The Hindi glosses are merged in, along with the 85 rows that are not duplicates. |
| 4 | **Grierson, *A Dictionary of the Kashmiri Language* (1932)** — [DSAL](https://dsal.uchicago.edu/dictionaries/grierson/) | Searchable, with structured HTML: `<hw>` romanized headword, `<d>` Devanagari plus a Sanskrit equivalent, and `<pa>` Perso-Arabic. ⚠ Perso-Arabic appears in **only ~17%** of entries (Persian/Arabic loanwords), not throughout. ⚠ The search cannot find ʦ-initial words, so the data was collected through the page view (`?page=1…1252`; 21,163 entries). | The 1932 Perso-Arabic follows Persian/Urdu conventions and has no Kashmiri vowel signs. Romanization: Grierson's scholarly scheme. | Text is public domain (1932); cite DSAL | ✅ **Used.** This is the largest and most scholarly source. It contributes the definitions, the Devanagari and the Perso-Arabic for loanwords. |
| 5 | **Sheeba Hassan, *Pronouncing Dictionary of Kashmiri*** — [DSAL](https://dsal.uchicago.edu/dictionaries/hassan/) | Obtained through #2 and #1, not scraped again | see #2 | DSAL / author copyright | ✅ Used (through #1 and #2), with a license caution. |
| 6 | **Omarrran/kashmiri_multilingual_dictionary_dataset** ([HF](https://huggingface.co/datasets/Omarrran/kashmiri_multilingual_dictionary_dataset)) | 16,598 rows (according to its card). | Unknown | Apache-2.0 | ⛔ **Not accessible.** ⚠ The dataset is *gated with manual approval* and returns HTTP 401 without an approved Hugging Face account. The build script supports it: request access, then run `HF_TOKEN=… bash scripts/fetch_sources.sh` and rebuild. |
| 7 | **KATHE 2026 "48K lexicon"** — [Aju360/kathe-r11-restorer](https://huggingface.co/Aju360/kathe-r11-restorer) | ⚠ The Hugging Face repo has **only PyTorch weights** and no lexicon. The lexicon is in the companion GitHub repo ([AzhadArshad/kathe_2026](https://github.com/AzhadArshad/kathe_2026), `data/processed/diacritic_lexicon_both.json`). It holds **10,703** undiacritized→diacritized mappings (the "48k" is a different count), with no meanings and no POS. | Machine-mined from the BPCC/NLLB parallel corpus | Apache-2.0 (+ CC-BY-4.0 / CC0 data) | ❌ **Not a dictionary.** It is useful later as a diacritic-restoration aid for `headword_ks_bare`, but it is not merged. |
| 8 | **Shafi Shauq, *Kāśir Lug̲h̲at*** (DSAL) | The monolingual Kashmiri dictionary pictured on the cover. DSAL hosts it as a **copyrighted, look-up-only** resource. | — | © Shafi Shauq / Ali Mohammad & Sons | ⛔ **Excluded.** Bulk scraping or redistribution would infringe copyright. Use it to look words up by hand, or ask the publisher for a licence. |
| 9 | **IndoWordNet Kashmiri word list** — [cfilt/iwn_wordlists](https://huggingface.co/datasets/cfilt/iwn_wordlists) | A plain word list with no glosses | — | CC-BY-NC-SA-4.0 | ❌ Not merged (no definitions; license is non-commercial and share-alike). |
| 10 | **kashmirairesearch.online hub** | A catalogue page that links to the items above. It contains no data itself. | — | — | ℹ Index only. |

## License summary for the merged dataset

Each row has a `license` field that carries the licence of every source it came
from. In practice:

* **Safe to redistribute:** `kaeshir` (MIT) and `grierson` (public-domain
  text; credit DSAL).
* **Use with care:** `kashmirizabaan`. The scraper is MIT, but the rights to
  the content on the original site are unclear. `hassan` is DSAL / author
  copyright, so treat it as research and non-commercial use only.
  `injilashah-phonemes` has no stated licence.

To publish a dataset that is clean for commercial use, filter on
`source ∈ {kaeshir, grierson}`.
