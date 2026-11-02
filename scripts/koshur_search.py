#!/usr/bin/env python3
"""KoshurSoundex: spelling-tolerant search over the Kashmiri dictionary.

Romanized Kashmiri has no enforced spelling: "apple" ژوٗنٛٹھ is typed cxoont,
tsoont, tsūnṭh …; "Kashmiri" کٲشُر is kaeshur, koshur, kạ̄shur …  This module
gives every entry two keys and ranks matches in tiers (same algorithm as
site/koshurlex.html):

  Tier 1  exact Roman spelling (any listed variant) / exact Kashmiri script
  Tier 2  same phonetic skeleton      cxoont, tsoont, tsūnṭh  -> "tsunt"
  Tier 3  whole word in the English meaning
  Tier 4  same consonant root          koshur, kaeshur, kạ̄shur -> "kshr"
  Tier 5  prefix of a spelling / skeleton
  Tier 6  fuzzy skeleton (edit-distance similarity >= 0.72)

Usage:
    python3 scripts/koshur_search.py cxoont
    python3 scripts/koshur_search.py --romanize "کٲشُر زَبان"
    python3 scripts/koshur_search.py --write "kaeshur zabaan chhu meeth"

    from koshur_search import SmartKashmiriSearchEngine
    eng = SmartKashmiriSearchEngine.from_files("data/kashmiri_dictionary.jsonl",
                                               "data/kashmiri_roman_pairs.tsv")
    eng.search("koshur")
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ks_normalize import normalize_ks, strip_marks  # noqa: E402

# --------------------------------------------------------------------------- keys

def compute_kashmiri_phonetic_skeleton(word):
    """Collapse spelling variation: digraphs, vowel clusters, diacritics, doubled letters."""
    if not word:
        return ""
    s = word.lower().strip()
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"/[^/]*/", "", s)
    if "/" in s:
        s = s.split("/")[0].strip()
    for a, b in (("ʦ", "ts"), ("ạ̄", "a"), ("ạ", "a"), ("ä", "a"), ("ɨ̄", "i"), ("ɨ", "i"), ("ι", "i"),
                 ("ɔ̄", "o"), ("ɔ", "o"), ("ͻ", "o"), ("ö", "o"), ("ü", "u"), ("ʰ", "h"), ("ʲ", "y"), ("ʸ", "y")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\s+\d+$", "", s)
    for pat, rep in ((r"cxh|cx|tsh|tz", "ts"), (r"chh", "ch"), (r"shh", "sh"), (r"kh|q", "k"),
                     (r"ph", "f"), (r"th", "t"), (r"dh", "d"), (r"bh", "b"), (r"gh", "g"),
                     (r"w", "v"), (r"['’`:]", ""),
                     (r"ae|ea|aa|ai|ay", "a"), (r"ee|ii|ey|ei|e", "i"),
                     (r"oo|uu|ou|ow|au|aw|oa|o", "u"), (r"[^a-z0-9]", ""), (r"(.)\1+", r"\1")):
        s = re.sub(pat, rep, s)
    return s


def compute_consonant_skeleton(word):
    skel = compute_kashmiri_phonetic_skeleton(word)
    if not skel:
        return ""
    first = "V" if skel[0] in "aiu" else skel[0]
    return re.sub(r"(.)\1+", r"\1", first + re.sub(r"[aiuy]", "", skel[1:]))


_DIGRAPHS = [("ژھ", "tsh"), ("چھ", "chh"), ("پھ", "ph"), ("تھ", "th"), ("ٹھ", "ṭh"), ("کھ", "kh"),
             ("بھ", "bh"), ("دھ", "dh"), ("ڈھ", "ḍh"), ("گھ", "gh"), ("یٖ", "ī"), ("وٗ", "ū"),
             ("یٚ", "e"), ("وٚ", "o"), ("اٟ", "ɨ̄"), ("إ", "ɨ"), ("أ", "ạ"), ("آ", "ā"), ("ٲ", "ạ̄")]
_CHARS = {"ا": "a", "ب": "b", "پ": "p", "ت": "t", "ٹ": "ṭ", "ث": "s", "ج": "j", "چ": "ch", "ح": "h",
          "خ": "kh", "د": "d", "ڈ": "ḍ", "ذ": "z", "ر": "r", "ڑ": "ṛ", "ز": "z", "ژ": "ts", "س": "s",
          "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a", "غ": "g", "ف": "f", "ق": "q",
          "ک": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "ں": "n", "و": "v", "ۄ": "ɔ", "ہ": "h",
          "ھ": "h", "ء": "'", "ی": "y", "ے": "ē", "ؠ": "'", "ۍ": "'", "ێ": "e",
          "َ": "a", "ِ": "i", "ُ": "u", "ٔ": "ạ", "ٕ": "ɨ", "ٟ": "ɨ̄",
          "ٖ": "ī", "ٗ": "ū", "ٚ": "e", "ٛ": "", "ٰ": "ā", "ْ": "",
          "ّ": "", "‌": "", "،": ","}


def deterministic_romanize_kashmiri(ks):
    """Rule-based Perso-Arabic -> Roman (a readable approximation, not a standard)."""
    s = normalize_ks(ks)
    for a, b in _DIGRAPHS:
        s = s.replace(a, b)
    s = unicodedata.normalize("NFD", s)
    return re.sub(r"\s+", " ", "".join(_CHARS.get(c, c) for c in s)).strip()


_ROMAN_RULES = [("tsh", "ژھ"), ("cxh", "ژھ"), ("chh", "چھ"), ("sh", "ش"), ("ts", "ژ"), ("cx", "ژ"),
                ("ch", "چ"), ("kh", "کھ"), ("ph", "پھ"), ("ṭh", "ٹھ"), ("th", "تھ"), ("bh", "بھ"),
                ("dh", "دھ"), ("gh", "گھ"), ("ae", "ٲ"), ("ạ̄", "ٲ"), ("aa", "آ"), ("ā", "آ"),
                ("ee", "یٖ"), ("ī", "یٖ"), ("oo", "وٗ"), ("ū", "وٗ"), ("oa", "ۄ"), ("ɔ", "ۄ"),
                ("ɨ̄", "ٟ"), ("ɨ", "ٕ"), ("ạ", "ٔ"), ("ē", "ے"), ("ṭ", "ٹ"), ("ḍ", "ڈ"), ("ṛ", "ڑ"), ("'", "ؠ")]
_ROMAN_CHARS = {"a": "َ", "i": "ِ", "u": "ُ", "e": "یٚ", "o": "وٚ", "b": "ب", "p": "پ", "t": "ت",
                "j": "ج", "d": "د", "r": "ر", "z": "ز", "s": "س", "f": "ف", "q": "ق", "k": "ک",
                "g": "گ", "l": "ل", "m": "م", "n": "ن", "v": "و", "w": "و", "h": "ہ", "y": "ی",
                "c": "چ", "x": "ش"}


def rule_based_roman_to_kashmiri(word):
    s = word.lower().strip()
    for a, b in _ROMAN_RULES:
        s = s.replace(a, b)
    if re.match(r"^[aiueo]", s):
        s = "ا" + s
    return normalize_ks("".join(_ROMAN_CHARS.get(c, c) for c in s))


def _variants(rom):
    out = []
    for v in re.split(r"\s*/\s*|\s+or\s+|\s*[,;]\s*", (rom or "").lower()):
        v = re.sub(r"\([^)]*\)", "", v)
        v = re.sub(r"\s+\d+$", "", v).strip().rstrip(".:")
        if v:
            out.append(v)
    return out


def _similarity(a, b):
    if not a or not b:
        return 0.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return 1 - prev[-1] / max(len(a), len(b))


# --------------------------------------------------------------------------- engine

QUALITY_RANK = {"native": 0, "source-perso-arabic (1932)": 1, "spelling": 1.5, "": 2,
                "auto-transliterated": 3, "unverified": 4}


class SmartKashmiriSearchEngine:
    def __init__(self):
        self.entries = []
        self.by_variant = defaultdict(list)
        self.by_pskel = defaultdict(list)
        self.by_cskel = defaultdict(list)
        self.ime_variant = defaultdict(list)
        self.ime_pskel = defaultdict(list)

    # ---- building
    def add(self, kashmiri_unicode="", romanized_kashmiri="", meaning="", source="", quality="", extra_variants="", **extra):
        ks = normalize_ks(kashmiri_unicode) if kashmiri_unicode else ""
        rom, rom_auto = romanized_kashmiri or "", False
        if not rom and ks:
            rom, rom_auto = deterministic_romanize_kashmiri(ks), True
        variants = list(dict.fromkeys(_variants(rom) + _variants(extra_variants)))
        e = dict(extra, kashmiri_unicode=ks, romanized_kashmiri=rom, romanized_auto=rom_auto, meaning=meaning or "",
                 source=source, quality=quality, variants=variants,
                 vskels=[compute_kashmiri_phonetic_skeleton(v) for v in variants],
                 vcskels=[compute_consonant_skeleton(v) for v in variants],
                 bare=strip_marks(ks) if ks else "", rank=QUALITY_RANK.get(quality, 2))
        e["phonetic_skeleton"] = e["vskels"][0] if e["vskels"] else ""
        e["consonant_skeleton"] = e["vcskels"][0] if e["vcskels"] else ""
        idx = len(self.entries)
        self.entries.append(e)
        for v in variants:
            self.by_variant[v].append(idx)
        for k in set(e["vskels"]):
            if k:
                self.by_pskel[k].append(idx)
        for k in set(e["vcskels"]):
            if len(k) >= 2:
                self.by_cskel[k].append(idx)
        if ks and not rom_auto and e["rank"] <= 1.5:
            for v in variants:
                self.ime_variant[v].append(idx)
            for k in set(e["vskels"]):
                self.ime_pskel[k].append(idx)
        return e

    @classmethod
    def from_files(cls, dictionary_jsonl, roman_pairs_tsv=None):
        eng = cls()
        with open(dictionary_jsonl, encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if not (r["headword_ks"] or r["headword_roman"]):
                    continue
                meaning = r["gloss_en"] or (r["definition_en"][:200] + ("…" if len(r["definition_en"]) > 200 else ""))
                eng.add(r["headword_ks"], r["headword_roman"], meaning, r["source"], r["script_quality"],
                        extra_variants=r.get("roman_variants", ""), id=r["id"], pos=r["pos"])
        if roman_pairs_tsv and os.path.exists(roman_pairs_tsv):
            with open(roman_pairs_tsv, encoding="utf-8") as fh:
                next(fh)
                for line in fh:
                    ks, roms, in_dict = line.rstrip("\n").split("\t")
                    if in_dict == "0":
                        eng.add(ks, roms.replace("; ", " / "), "", "aksharantar", "spelling")
        for m in (eng.ime_variant, eng.ime_pskel):
            for k in m:
                m[k].sort(key=lambda i: eng.entries[i]["rank"])
        return eng

    # ---- searching
    def search(self, query, limit=20):
        q = (query or "").strip()
        if not q:
            return []
        best = {}

        def hit(i, score, tier):
            e = self.entries[i]
            if not e["meaning"]:
                score -= 15
            if i not in best or best[i][0] < score:
                best[i] = (score, tier)

        if re.search(r"[؀-ۿ]", q):
            nq, bq = normalize_ks(q), strip_marks(q)
            for i, e in enumerate(self.entries):
                if not e["kashmiri_unicode"]:
                    continue
                if e["kashmiri_unicode"] == nq:
                    hit(i, 100, "exact Kashmiri script")
                elif e["bare"] == bq:
                    hit(i, 96, "Kashmiri script, vowel signs ignored")
                elif bq in e["bare"]:
                    hit(i, 88, "Kashmiri script substring")
        else:
            ql = q.lower()
            ps, cs = compute_kashmiri_phonetic_skeleton(ql), compute_consonant_skeleton(ql)
            for i in self.by_variant.get(ql, []):
                hit(i, 100, "tier 1: exact Roman spelling")
            for i in self.by_pskel.get(ps, []):
                hit(i, 94, "tier 2: phonetic skeleton")
            word = re.compile(r"(^|[^a-z])" + re.escape(ql) + r"([^a-z]|$)")
            for i, e in enumerate(self.entries):
                if e["meaning"] and word.search(e["meaning"].lower()):
                    hit(i, 89, "tier 3: English meaning")
            if len(cs) >= 2:
                for i in self.by_cskel.get(cs, []):
                    hit(i, 85, "tier 4: consonant root")
            if len(best) < limit:
                for i, e in enumerate(self.entries):
                    if any(v.startswith(ql) for v in e["variants"]) or (len(ps) >= 2 and any(k.startswith(ps) for k in e["vskels"])):
                        hit(i, 78, "tier 5: prefix")
            if len(best) < 15 and len(ps) >= 3:
                for i, e in enumerate(self.entries):
                    if i in best:
                        continue
                    for k in e["vskels"]:
                        if k and k[0] == ps[0] and abs(len(k) - len(ps)) <= 2:
                            sim = _similarity(ps, k)
                            if sim >= 0.72:
                                hit(i, round(sim * 75), f"tier 6: fuzzy ({sim:.0%})")
                                break
        ranked = sorted(best.items(), key=lambda kv: (-kv[1][0], self.entries[kv[0]]["rank"],
                                                      len(self.entries[kv[0]]["romanized_kashmiri"])))
        return [dict(self.entries[i], score=s, match_tier=t) for i, (s, t) in ranked[:limit]]

    def roman_to_kashmiri(self, text):
        """Write Roman Kashmiri in Perso-Arabic: dictionary spellings first, rules for unknown words.
        Returns (text, list_of_guessed_words)."""
        out, guessed = [], []
        for tok in re.split(r"(\s+)", text):
            if not tok.strip():
                out.append(tok)
                continue
            w = tok.lower()
            idx = (self.ime_variant.get(w) or self.ime_pskel.get(compute_kashmiri_phonetic_skeleton(w)) or [None])[0]
            if idx is not None:
                out.append(self.entries[idx]["kashmiri_unicode"])
            else:
                g = rule_based_roman_to_kashmiri(w)
                guessed.append(g)
                out.append(g)
        return "".join(out), guessed


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("query", nargs="?", help="Roman, Kashmiri-script or English search")
    ap.add_argument("--write", help="convert a Roman Kashmiri sentence to Perso-Arabic")
    ap.add_argument("--romanize", help="convert Perso-Arabic Kashmiri to Roman (rule-based)")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--data", default=os.path.join(here, "data"))
    a = ap.parse_args()
    if a.romanize:
        print(deterministic_romanize_kashmiri(a.romanize))
        return
    eng = SmartKashmiriSearchEngine.from_files(os.path.join(a.data, "kashmiri_dictionary.jsonl"),
                                               os.path.join(a.data, "kashmiri_roman_pairs.tsv"))
    if a.write:
        text, guessed = eng.roman_to_kashmiri(a.write)
        print(text)
        if guessed:
            print("rule-based guesses (check these):", " ".join(guessed))
        return
    if not a.query:
        ap.error("give a query, --write or --romanize")
    print(f"skeleton={compute_kashmiri_phonetic_skeleton(a.query)}  root={compute_consonant_skeleton(a.query)}")
    for r in eng.search(a.query, a.limit):
        print(f"{r['score']:>3}  {r['kashmiri_unicode'] or '—':<16} {r['romanized_kashmiri'][:28]:<28} "
              f"{r['meaning'][:50]:<50} [{r['match_tier']}; {r['source']}]")


if __name__ == "__main__":
    main()
