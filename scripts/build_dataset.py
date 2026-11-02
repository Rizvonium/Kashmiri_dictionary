#!/usr/bin/env python3
"""Build the unified Kashmiri dictionary dataset from the raw sources.

Usage:
    python3 scripts/build_dataset.py RAW_DIR OUT_DIR

RAW_DIR is the folder populated by scripts/fetch_sources.sh:
    RAW_DIR/kaeshir-dictionary-data/        (git clone, MIT)
    RAW_DIR/kzwebscrap/                     (git clone, MIT)
    RAW_DIR/injilashah/kashmiri_zabaan.csv, wordphonemes-meaning.csv
    RAW_DIR/grierson/pages/<n>.html         (DSAL page dumps)
    RAW_DIR/omarrran/KASHMIRi_Multilingual_Dictionary.csv   (optional, gated)

Output (all UTF-8, Kashmiri text in NFC, see docs/ORTHOGRAPHY.md):
    OUT_DIR/kashmiri_dictionary.jsonl   one entry per line (canonical)
    OUT_DIR/kashmiri_dictionary.csv     same entries, flat, Excel-friendly (UTF-8 BOM)
    OUT_DIR/kashmiri_headwords.txt      unique normalized Perso-Arabic headwords
    OUT_DIR/build_report.json           counts and QA statistics
"""
import csv
import glob
import html
import json
import os
import re
import sys
import unicodedata
from collections import Counter, OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ks_normalize import foreign_chars, normalize_ks, strip_marks  # noqa: E402

FIELDS = [
    "id", "headword_ks", "headword_ks_bare", "headword_roman", "roman_scheme",
    "headword_deva", "pos", "gender", "gloss_en", "definition_en",
    "hindi_gloss", "example_en", "example_ks", "example_ks_roman",
    "audio_url", "source", "source_ref", "script_quality", "license",
]

SOURCES = {
    "kashmirizabaan": {
        "name": "kashmirizabaan.com English-Kashmiri dictionary "
                "(via ubaierbhat/kzwebscrap and injilashah/Kashmiri-language-text-dataset)",
        "license": "MIT (scrape repo); underlying site content: rights unclear",
    },
    "kaeshir": {
        "name": "Kaeshir Dictionary curated collection (izan-majeed/kaeshir-dictionary-data, collected-words.json)",
        "license": "MIT",
    },
    "hassan": {
        "name": "Sheeba Hassan, A Pronouncing Dictionary of Kashmiri (DSAL, Univ. of Chicago), "
                "via ubaierbhat/kzwebscrap and izan-majeed/kaeshir-dictionary-data",
        "license": "DSAL / author copyright - research and non-commercial use",
    },
    "grierson": {
        "name": "G. A. Grierson, A Dictionary of the Kashmiri Language (1932), DSAL digital edition",
        "license": "Public domain text (1932); DSAL digitization - cite DSAL",
    },
    "injilashah-phonemes": {
        "name": "injilashah/Kashmiri-language-text-dataset, wordphonemes-meaning.csv",
        "license": "not stated on dataset card",
    },
    "omarrran": {
        "name": "Omarrran/kashmiri_multilingual_dictionary_dataset (Hugging Face, gated)",
        "license": "Apache-2.0",
    },
}

POS_MAP = {
    "n": "noun", "noun": "noun", "plural noun": "noun",
    "biographical name": "proper noun", "geographical name": "proper noun",
    "v": "verb", "vt": "verb (transitive)", "vi": "verb (intransitive)",
    "vti": "verb", "verb": "verb", "auxv": "auxiliary verb", "auxiliary verb": "auxiliary verb",
    "mv": "modal verb", "imperative verb": "verb", "inf": "verb (infinitive)",
    "adj": "adjective", "adjective": "adjective",
    "adv": "adverb", "adverb": "adverb", "adverb or adjective": "adverb",
    "adjective or adverb": "adjective",
    "pron": "pronoun", "pronoun": "pronoun", "plural pronoun": "pronoun",
    "rel pron": "pronoun", "refl pron": "pronoun", "reflpron": "pronoun", "posspron": "pronoun",
    "interro": "pronoun", "demonstrative": "pronoun",
    "prep": "postposition", "preposition": "postposition", "postp": "postposition",
    "conj": "conjunction", "conjunction": "conjunction",
    "interj": "interjection", "interjection": "interjection",
    "det": "determiner", "art": "determiner", "indef": "determiner",
    "part": "particle", "prvb": "proverb", "phrase": "phrase", "idiom": "phrase",
    "card": "numeral", "ord": "numeral", "num": "numeral",
    "pref": "prefix", "suffix": "suffix", "suff": "suffix",
}

SUP = {"u": "ᵘ", "i": "ⁱ", "ü": "ᵘ̈", "a": "ᵃ", "e": "ᵉ", "o": "ᵒ", "ĕ": "ᵉ̆",
       "ŏ": "ᵒ̆", "ö": "ᵒ̈", "y": "ʸ", "h": "ʰ", "w": "ʷ", "ī": "ⁱ̄"}


def clean(s):
    if s is None:
        return ""
    s = html.unescape(str(s)).replace(" ", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return "" if s in {"-", "--", "—", "N/A", "nan"} else s


def norm_pos(p):
    p = clean(p).lower().strip(" .()")
    return POS_MAP.get(p, p)


def split_alternatives(ks):
    """Split 'a، b , c' into ['a','b','c'] (Kashmiri synonyms in one cell)."""
    parts = re.split(r"\s*[،,؛;]\s*", ks)
    return [p for p in (normalize_ks(x) for x in parts) if p]


# --------------------------------------------------------------------------- sources

def load_utf16_json(path):
    raw = open(path, "rb").read()
    for enc in ("utf-16", "utf-8-sig"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise ValueError(path)


def en_ks_rows(raw):
    """English->Kashmiri sources: kashmirizabaan (2 copies), kaeshir collected, omarrran."""
    rows = []
    for p in sorted(glob.glob(os.path.join(raw, "kzwebscrap/data/json/*.json"))):
        for r in load_utf16_json(p):
            rows.append(dict(src="kashmirizabaan", ref="kzwebscrap:" + os.path.basename(p),
                             en=r.get("en_meaning"), ks=r.get("ks_word"), pos=r.get("category"),
                             ex_en=r.get("en_example"), ex_ks=r.get("ks_example"),
                             roman=r.get("transliteration"), hindi=""))
    p = os.path.join(raw, "injilashah/kashmiri_zabaan.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8")):
            rows.append(dict(src="kashmirizabaan", ref="injilashah:kashmiri_zabaan.csv",
                             en=r.get("englishMeaning"), ks=r.get("headword"), pos=r.get("category"),
                             ex_en=r.get("englishExample"), ex_ks=r.get("kashmiriExample"),
                             roman="", hindi=r.get("hindiMeaning")))
    p = os.path.join(raw, "kaeshir-dictionary-data/kashmiri/data/collected-words.json")
    if os.path.exists(p):
        for r in json.load(open(p, encoding="utf-8")):
            pos = clean(r.get("pos")).split(",")[-1].strip() if "," in clean(r.get("pos")) else ""
            roman, gender = clean(r.get("englishMeaning")), ""
            m = re.search(r"\((m|f|m\.|f\.)\)?\s*$", roman)
            if m:
                gender = m.group(1).strip(".")
                roman = roman[:m.start()].strip()
            rows.append(dict(src="kaeshir", ref="kaeshir:collected-words.json",
                             en=r.get("title"), ks=r.get("kashmiriMeaning"), pos=pos,
                             ex_en=r.get("englishExample"), ex_ks_roman=r.get("kashmiriExample"),
                             roman=roman, gender=gender, hindi=""))
    for p in glob.glob(os.path.join(raw, "omarrran/*.csv")):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            rows.append(dict(src="omarrran", ref="omarrran:" + os.path.basename(p),
                             en=r.get("word"), ks=r.get("kashmiri_word"), pos=r.get("word_type"),
                             ex_en=r.get("english_example"), ex_ks=r.get("kashmiri_example"),
                             roman="", hindi=""))
    return rows


def build_en_ks(raw):
    """Invert EN->KS rows into Kashmiri-headword entries, merging duplicates."""
    merged = OrderedDict()
    for r in en_ks_rows(raw):
        en = clean(r["en"])
        ks_cell = clean(r["ks"])
        if not ks_cell or not en:
            continue
        pos = norm_pos(r.get("pos"))
        alts = split_alternatives(ks_cell)
        romans = [clean(x) for x in re.split(r"\s*[,،]\s*", clean(r.get("roman")))]
        if len(romans) != len(alts):
            romans = [""] * len(alts)
        hindi = clean(re.sub(r"_", " ", clean(r.get("hindi")))).strip(" ,")
        for ks, roman in zip(alts, romans):
            key = (ks, pos.split(" ")[0])
            e = merged.get(key)
            if e is None:
                e = merged[key] = dict(
                    headword_ks=ks, pos=pos, gender=clean(r.get("gender")), glosses=[],
                    hindi=[], example_en="", example_ks="", example_ks_roman="",
                    romans=[], sources=[], refs=[])
            if en.lower() not in [g.lower() for g in e["glosses"]]:
                e["glosses"].append(en.lower() if not en.isupper() else en)
            for h in [x.strip() for x in hindi.split(",") if x.strip()]:
                if h not in e["hindi"]:
                    e["hindi"].append(h)
            if roman and r["src"] == "kaeshir" and roman not in e["romans"]:
                e["romans"].append(roman)
            if not e["example_en"] and clean(r.get("ex_en")):
                e["example_en"] = clean(r.get("ex_en"))
            if not e["example_ks"] and clean(r.get("ex_ks")):
                e["example_ks"] = normalize_ks(clean(r.get("ex_ks")))
            if not e["example_ks_roman"] and clean(r.get("ex_ks_roman")):
                e["example_ks_roman"] = clean(r.get("ex_ks_roman"))
            if not e["gender"] and clean(r.get("gender")):
                e["gender"] = clean(r.get("gender"))
            if r["src"] not in e["sources"]:
                e["sources"].append(r["src"])
            if r["ref"] not in e["refs"]:
                e["refs"].append(r["ref"])
    out = []
    for e in merged.values():
        out.append(dict(
            headword_ks=e["headword_ks"],
            headword_roman=" / ".join(e["romans"]),
            roman_scheme="kaeshir-popular" if e["romans"] else "",
            pos=e["pos"], gender=e["gender"],
            gloss_en="; ".join(e["glosses"]),
            hindi_gloss="; ".join(e["hindi"]),
            example_en=e["example_en"], example_ks=e["example_ks"],
            example_ks_roman=e["example_ks_roman"],
            source="; ".join(e["sources"]), source_ref="; ".join(e["refs"]),
            script_quality="native",
        ))
    return out


HASSAN_POS = re.compile(
    r"^\s*((?:n|v|adj|adv|prep|conj|interj|pron|prvb|indef|m|f|sg|pl)\.?"
    r"(?:\s*&\s*\w+\.)?(?:[ .]?(?:m|f|sg|pl)\.)*|phrase|demonstrative)[\s,]+", re.I)


def build_hassan(raw):
    out, seen = [], set()

    def add(word_ks, roman, meaning, audio, ref):
        meaning = clean(meaning).strip('"')
        m = HASSAN_POS.match(meaning)
        pos_raw, gender = "", ""
        if m:
            pos_raw = m.group(1)
            meaning = meaning[m.end():]
            toks = [t for t in re.split(r"[.\s&]+", pos_raw.lower()) if t]
            gender = "/".join(t for t in toks if t in ("m", "f"))
            main = [t for t in toks if t not in ("m", "f", "sg", "pl")]
            pos_raw = POS_MAP.get(main[0], main[0]) if main else ("noun" if gender else "")
            if pos_raw == "n":
                pos_raw = "noun"
        audio = re.sub(r"(?<!:)//+", "/", clean(audio)).replace("http://", "https://")
        key = (clean(roman), meaning)
        if key in seen:
            return
        seen.add(key)
        out.append(dict(
            headword_ks=normalize_ks(word_ks), headword_roman=clean(roman),
            roman_scheme="hassan-dsal", pos=pos_raw, gender=gender,
            gloss_en=meaning, audio_url=audio, source="hassan", source_ref=ref,
            script_quality="auto-transliterated" if word_ks else "",
        ))

    for p in sorted(glob.glob(os.path.join(raw, "kzwebscrap/data/hassan/json/*.json"))):
        for r in load_utf16_json(p):
            add(r.get("ks_word"), r.get("transliteration"), r.get("en_meaning"),
                r.get("ks_pronunciation"), "kzwebscrap:hassan/" + os.path.basename(p))
    p = os.path.join(raw, "kaeshir-dictionary-data/kashmiri/data/audio-words.json")
    if os.path.exists(p):
        have = {e["headword_roman"] for e in out}
        for r in json.load(open(p, encoding="utf-8")):
            if clean(r.get("word")) not in have:
                add("", r.get("word"), r.get("desc"), r.get("audioUrl"), "kaeshir:audio-words.json")
    return out


def build_injila_phonemes(raw, hassan_romans):
    p = os.path.join(raw, "injilashah/wordphonemes-meaning.csv")
    if not os.path.exists(p):
        return []
    grouped = OrderedDict()
    for r in csv.DictReader(open(p, encoding="utf-8")):
        w = clean(r.get("word"))
        if len(w) < 2 or w in hassan_romans:
            continue
        g = grouped.setdefault(w, dict(glosses=[], audio=""))
        m = clean(r.get("meaning"))
        if m and m not in g["glosses"]:
            g["glosses"].append(m)
        if clean(r.get("urls")) and not g["audio"]:
            g["audio"] = clean(r.get("urls"))
    out = []
    for w, g in grouped.items():
        deva = bool(re.search(r"[ऀ-ॿ]", w))
        out.append(dict(
            headword_deva=w if deva else "", headword_roman="" if deva else w,
            roman_scheme="" if deva else "hassan-dsal", gloss_en="; ".join(g["glosses"]),
            audio_url=g["audio"], source="injilashah-phonemes", script_quality="unverified",
            source_ref="injilashah:wordphonemes-meaning.csv"))
    return out


# --- Grierson (DSAL HTML) ---------------------------------------------------

G_ENTRY = re.compile(r"(<hw>.*?)</div>", re.S)  # DSAL "page=N" browse view
G_POS = re.compile(
    r"^\s*((?:(?:card|ord|adj|adv|conj|interj|pron|postp|prep|suff|pref|inf|"
    r"m|f|c\.g|n|pl|sg|indecl|v|interr|num|onom|emph|abl|dat|ag|loc)\.\s*)+)")


def sup_to_unicode(m):
    return "".join(SUP.get(c, c) for c in m.group(1))


def g_text(fragment):
    t = re.sub(r"<sup>(.*?)</sup>", sup_to_unicode, fragment)
    t = re.sub(r"<letter>.*?</letter>", " ", t, flags=re.S)
    t = re.sub(r"<d>.*?</d>", "", t, flags=re.S)       # Devanagari / Sanskrit glosses
    t = re.sub(r"<pa>(.*?)</pa>", lambda m: normalize_ks(m.group(1)), t, flags=re.S)
    t = re.sub(r"</?p2>", " ¶ ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+([,.;:)])", r"\1", t)
    t = re.sub(r"([,;])(?:\s*[,;])+", r"\1", t)
    t = re.sub(r"\(\s*[,;]?\s*\)", "", t)
    t = re.sub(r"\(\s*=\s*", "(= ", t)
    t = re.sub(r"\s*¶\s*(¶\s*)*", " ¶ ", t).strip(" ¶")
    return t.strip()


def build_grierson(raw):
    pages = glob.glob(os.path.join(raw, "grierson/pages/*.html"))
    out, seen = [], set()
    for p in sorted(pages, key=lambda x: int(re.sub(r"\D", "", os.path.basename(x)) or 0)):
        doc = open(p, encoding="utf-8", errors="replace").read()
        page = re.sub(r"\D", "", os.path.basename(p))
        for body in G_ENTRY.findall(doc):
            m = re.search(r"<hw>(.*?)</hw>", body, re.S)
            if not m:
                continue
            hw_html = m.group(1)
            hw = re.sub(r"<sup>(.*?)</sup>", sup_to_unicode, hw_html)
            hw = clean(re.sub(r"<[^>]+>", "", hw)).rstrip(".,; ")
            rest = body[m.end():]
            # leading script forms: <d>deva । sanskrit</d> and <pa>...</pa> before the definition
            deva, pa, sanskrit = "", "", ""
            lead = re.match(r"\s*((?:\(?=?\s*<(?:d|pa)>.*?</(?:d|pa)>\)?\s*)+)", rest, re.S)
            if lead:
                for tag, val in re.findall(r"<(d|pa)>(.*?)</\1>", lead.group(1), re.S):
                    val = clean(re.sub(r"<[^>]+>", "", val))
                    if tag == "pa" and not pa:
                        pa = normalize_ks(val)
                    elif tag == "d":
                        parts = [x.strip() for x in val.split("।")]
                        if parts[0] and not deva:
                            deva = parts[0]
                        if len(parts) > 1 and not sanskrit:
                            sanskrit = parts[1]
                rest = rest[lead.end():]
            definition = g_text(rest).lstrip(" ,")
            pm = G_POS.match(definition)
            pos, gender = "", ""
            if pm:
                toks = [t for t in re.split(r"\.\s*", pm.group(1).strip()) if t]
                gender = "/".join(dict.fromkeys(
                    "c.g." if t == "c.g" else t for t in toks if t in ("m", "f", "c.g")))
                main = [t for t in toks if t not in ("m", "f", "c.g", "sg", "pl")]
                if main:
                    pos = POS_MAP.get(main[0], main[0])
                elif gender:
                    pos = "noun"
            key = (hw, page, definition[:80])
            if key in seen:
                continue
            seen.add(key)
            out.append(dict(
                headword_ks=pa, headword_roman=hw, roman_scheme="grierson-1932",
                headword_deva=deva, pos=pos, gender=gender,
                definition_en=definition, source="grierson",
                source_ref=f"Grierson 1932 p. {page}",
                script_quality="source-perso-arabic (1932)" if pa else "",
            ))
    return out


def build_grierson_fallback(raw):
    """If the DSAL crawl is unavailable, use the romanised Grierson copy in kaeshir."""
    p = os.path.join(raw, "kaeshir-dictionary-data/kashmiri/data/dictionary-words.json")
    out = []
    for r in json.load(open(p, encoding="utf-8")):
        out.append(dict(headword_roman=clean(r.get("word")), roman_scheme="grierson-1932",
                        definition_en=clean(r.get("meaning")), source="grierson",
                        source_ref="kaeshir:dictionary-words.json"))
    return out


# --------------------------------------------------------------------------- sorting

KS_ORDER = list("اآأٲإبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنںوۄہھءیؠێےۍ")
KS_RANK = {c: i for i, c in enumerate(KS_ORDER)}


def ks_sort_key(word):
    base = strip_marks(word)
    base = unicodedata.normalize("NFD", base)
    return [KS_RANK.get(c, 500 + ord(c) % 1000) for c in base if not unicodedata.combining(c)]


def roman_sort_key(word):
    d = unicodedata.normalize("NFD", word.lower())
    return "".join(c for c in d if c.isalnum() or c == " ")


SRC_RANK = {"kashmirizabaan": 0, "kaeshir": 0, "omarrran": 0, "hassan": 1,
            "injilashah-phonemes": 2, "grierson": 3}


def main(raw, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    en_ks = build_en_ks(raw)
    hassan = build_hassan(raw)
    injila = build_injila_phonemes(raw, {e["headword_roman"] for e in hassan})
    grierson = build_grierson(raw)
    if len(grierson) < 1000:
        grierson = build_grierson_fallback(raw)

    entries = en_ks + hassan + injila + grierson

    def order(e):
        first_src = e["source"].split(";")[0].strip()
        rank = SRC_RANK.get(first_src, 9)
        if e.get("headword_ks") and rank == 0:
            return (rank, ks_sort_key(e["headword_ks"]), "")
        return (rank, [], roman_sort_key(e.get("headword_roman") or e.get("headword_deva", "")))

    entries.sort(key=order)

    qa_foreign = Counter()
    for i, e in enumerate(entries, 1):
        e["id"] = f"ks{i:06d}"
        e["headword_ks_bare"] = strip_marks(e.get("headword_ks", "")) if e.get("headword_ks") else ""
        srcs = [s.strip() for s in e["source"].split(";")]
        e["license"] = " | ".join(dict.fromkeys(SOURCES[s]["license"] for s in srcs))
        for c in foreign_chars(e.get("headword_ks", "")):
            qa_foreign[f"U+{ord(c):04X} {unicodedata.name(c, '?')}"] += 1
        for f in FIELDS:
            e[f] = unicodedata.normalize("NFC", e.get(f) or "")

    with open(os.path.join(out_dir, "kashmiri_dictionary.jsonl"), "w", encoding="utf-8") as fh:
        for e in entries:
            fh.write(json.dumps({f: e[f] for f in FIELDS}, ensure_ascii=False) + "\n")
    with open(os.path.join(out_dir, "kashmiri_dictionary.csv"), "w", encoding="utf-8-sig",
              newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        for e in entries:
            w.writerow({f: e[f] for f in FIELDS})
    native = sorted({e["headword_ks"] for e in entries
                     if e["headword_ks"] and e["script_quality"] == "native"}, key=ks_sort_key)
    with open(os.path.join(out_dir, "kashmiri_headwords.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(native) + "\n")

    report = {
        "total_entries": len(entries),
        "by_source": Counter(s.strip() for e in entries for s in e["source"].split(";")),
        "with_perso_arabic_headword": sum(1 for e in entries if e["headword_ks"]),
        "by_script_quality": Counter(e["script_quality"] or "none" for e in entries),
        "with_roman": sum(1 for e in entries if e["headword_roman"]),
        "with_devanagari": sum(1 for e in entries if e["headword_deva"]),
        "with_audio": sum(1 for e in entries if e["audio_url"]),
        "with_example_en": sum(1 for e in entries if e["example_en"]),
        "with_hindi": sum(1 for e in entries if e["hindi_gloss"]),
        "unique_native_headwords": len(native),
        "non_inventory_chars_in_headwords": dict(qa_foreign.most_common()),
        "sources": SOURCES,
    }
    with open(os.path.join(out_dir, "build_report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k != "sources"},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
