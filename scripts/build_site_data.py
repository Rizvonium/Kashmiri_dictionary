#!/usr/bin/env python3
"""Export data/kashmiri_dictionary.jsonl to a compact JSON file for the website.

    python3 scripts/build_site_data.py data/kashmiri_dictionary.jsonl site/data/dictionary.json

Format: {"fields": [...], "sources": [...], "schemes": [...], "quality": [...], "rows": [[...], ...]}
Each row is a list in `fields` order; source/scheme/quality are stored as small integers.
"""
import json
import os
import re
import sys

FIELDS = ["headword_ks", "headword_ks_bare", "headword_roman", "roman_scheme", "roman_variants", "headword_deva",
          "pos", "gender", "gloss_en", "definition_en", "hindi_gloss", "example_en", "example_ks",
          "example_ks_roman", "audio_url", "source", "source_ref", "script_quality"]
CODED = ("roman_scheme", "source", "script_quality")


def main(src, dst):
    tables = {k: [] for k in CODED}
    rows = []
    for line in open(src, encoding="utf-8"):
        e = json.loads(line)
        row = []
        for f in FIELDS:
            v = e.get(f, "")
            if f in CODED:
                if v not in tables[f]:
                    tables[f].append(v)
                v = tables[f].index(v)
            elif f == "audio_url":
                v = v.replace("https://dsal.uchicago.edu/dictionaries/hassan/audio/", "@h/")
            row.append(v)
        rows.append(row)
    out = {"fields": FIELDS, "schemes": tables["roman_scheme"], "sources": tables["source"],
           "quality": tables["script_quality"], "rows": rows}
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} rows -> {dst}")
    # Spelling-only Roman <-> Perso-Arabic pairs (Aksharantar) not already dictionary headwords
    pairs_src = os.path.join(os.path.dirname(src), "kashmiri_roman_pairs.tsv")
    if os.path.exists(pairs_src):
        pairs = []
        for i, line in enumerate(open(pairs_src, encoding="utf-8")):
            if i == 0:
                continue
            ks, roms, in_dict = line.rstrip("\n").split("\t")
            if in_dict == "0":
                pairs.append([ks, roms])
        p = os.path.join(os.path.dirname(dst), "roman_pairs.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(pairs, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"{len(pairs)} spelling pairs -> {p}")
    # English word list (from the English meanings and example sentences; Grierson's definitions are
    # skipped because they contain romanized Kashmiri). Used by the writer to keep English words in English.
    eng = set()
    for line in open(src, encoding="utf-8"):
        e = json.loads(line)
        if e.get("source", "").startswith("grierson"):
            continue
        for t in (e.get("gloss_en", ""), e.get("example_en", "")):
            for w in re.findall(r"[a-z]+", (t or "").lower()):
                if len(w) > 1 or w in ("a", "i"):
                    eng.add(w)
    p = os.path.join(os.path.dirname(dst), "english_words.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(sorted(eng), fh, separators=(",", ":"))
    print(f"{len(eng)} English words -> {p}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
