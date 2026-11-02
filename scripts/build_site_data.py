#!/usr/bin/env python3
"""Export data/kashmiri_dictionary.jsonl to a compact JSON file for the website.

    python3 scripts/build_site_data.py data/kashmiri_dictionary.jsonl site/data/dictionary.json

Format: {"fields": [...], "sources": [...], "schemes": [...], "quality": [...], "rows": [[...], ...]}
Each row is a list in `fields` order; source/scheme/quality are stored as small integers.
"""
import json
import sys

FIELDS = ["headword_ks", "headword_ks_bare", "headword_roman", "roman_scheme", "headword_deva",
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


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
