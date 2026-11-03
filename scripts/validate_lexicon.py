#!/usr/bin/env python3
"""Validate a lexicon batch before it is merged or indexed (dual-lookup guide, section 6.4).

    python3 scripts/validate_lexicon.py data/kashmiri_dictionary.jsonl
    python3 scripts/validate_lexicon.py data/lexicon_sample.json      # guide schema

Errors (exit code 1): missing required fields, duplicate ids, unknown part of speech,
bad valency value, Kashmiri text that is not NFC or not in the dataset's canonical form,
and characters outside the Arabic blocks in Perso-Arabic headwords (the commonest OCR
leftovers). Warnings (reported, exit code 0): verbs without a valency label.
"""
import json
import os
import sys
import unicodedata
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ks_normalize import normalize_ks  # noqa: E402
from ks_verifier import valency_from_row  # noqa: E402

POS = {"", "noun", "verb", "adjective", "adverb", "pronoun", "postposition", "particle", "conjunction",
       "interjection", "numeral", "determiner", "phrase", "inflected form", "preposition", "suffix", "prefix",
       "verb (transitive)", "verb (intransitive)", "abbreviation", "idiom", "proverb",
       "proper noun", "auxiliary verb", "modal verb"}
VALENCY = {None, "transitive", "intransitive", "ditransitive", "causative"}


def allowed(ch: str) -> bool:
    """Arabic-block letters/marks, space, ZWNJ, and the punctuation Kashmiri headwords use."""
    cp = ord(ch)
    return (0x0600 <= cp <= 0x06FF or 0x0750 <= cp <= 0x077F or ch in " \u200c\u06d4،()-–"
            or ch.isascii() and ch.isdigit())  # years in historical names, e.g. (1968–2012)


def load(path):
    with open(path, encoding="utf-8") as f:
        if path.endswith(".jsonl"):
            return [json.loads(line) for line in f if line.strip()]
        return json.load(f)


def validate(entries):
    errors, warnings, seen = [], Counter(), set()
    guide_schema = bool(entries) and "headword" in entries[0]
    required = {"id", "headword", "pos", "definition_ks", "gloss_en"} if guide_schema else {"id", "headword_ks", "pos", "gloss_en"}
    for n, e in enumerate(entries):
        tag = e.get("id", f"#{n}")
        if missing := required - e.keys():
            errors.append(f"{tag}: missing {sorted(missing)}")
            continue
        if tag in seen:
            errors.append(f"{tag}: duplicate id")
        seen.add(tag)
        if e["pos"] not in POS and e["pos"].split(" (")[0] not in POS:
            errors.append(f"{tag}: unknown pos {e['pos']!r}")
        val = e.get("valency") if guide_schema else valency_from_row(e)
        if val not in VALENCY:
            errors.append(f"{tag}: bad valency {val!r}")
        if e["pos"].startswith("verb") and val is None:
            warnings["verb without valency"] += 1
        head = e["headword"] if guide_schema else e["headword_ks"]
        forms = [head, *e.get("stems_and_participles", [])] if head else []
        for form in forms:
            if form != unicodedata.normalize("NFC", form):
                errors.append(f"{tag}: not NFC: {form}")
            elif not guide_schema and form != normalize_ks(form):
                errors.append(f"{tag}: not in canonical form: {form!r} -> {normalize_ks(form)!r}")
            if bad := {c for c in form if not allowed(c)}:
                errors.append(f"{tag}: foreign chars {[f'U+{ord(c):04X}' for c in sorted(bad)]} in {form}")
    return errors, warnings


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/kashmiri_dictionary.jsonl"
    entries = load(path)
    errs, warns = validate(entries)
    for w, c in warns.items():
        print(f"warning: {c} × {w}")
    print("\n".join(errs[:200]) or f"OK: {len(entries)} entries are valid")
    if len(errs) > 200:
        print(f"... and {len(errs) - 200} more errors")
    print(f"{len(errs)} error(s)")
    sys.exit(1 if errs else 0)
