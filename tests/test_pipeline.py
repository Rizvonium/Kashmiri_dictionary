#!/usr/bin/env python3
"""Offline end-to-end test of the dual-lookup verifier (guide, sections 9 and 5.2 P3).

    python3 tests/test_pipeline.py

1. Replays the guide's motivating example (pot waan) with a scripted model, so it runs
   with no network and no LLM: the draft uses the intransitive participle samyith with an
   ergative agent; the verifier must flag it, the meaning lookup must find the transitive
   verb sombrawun, and the critic may only substitute its attested participle sombrawith.
2. Phase-3 exit criterion on the real dataset: form lookup recovers the headword for at
   least 95% of damaged spellings (vowel signs dropped, Kashmiri letters typed as Urdu ones).
3. The validator passes on the guide's sample lexicon.
"""
import json
import os
import random
import re
import sys
import unicodedata

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from ks_verifier import KashmiriDictionaryVerifier, nfc, skeleton, verify_and_correct  # noqa: E402
from validate_lexicon import validate, load  # noqa: E402

SAMPLE = os.path.join(ROOT, "data", "lexicon_sample.json")
DATASET = os.path.join(ROOT, "data", "kashmiri_dictionary.jsonl")

DRAFT = "دانہِ چھۄمبَنہٕ پَتہٕ تُل تٔمۍ پۆت وان تہٕ سَمیِتھ ٹوکرِ مَنٛز۔"
VERIFIED = "دانہِ چھۄمبَنہٕ پَتہٕ تُل تٔمۍ پۆت وان تہٕ سۄمبرٲوِتھ ٹوکرِ مَنٛز۔"


class ScriptedLLM:
    """Plays the model: writes the faulty draft, then edits only what the evidence allows."""

    def __init__(self):
        self.calls = []

    def generate_json(self, prompt):
        self.calls.append(prompt)
        if prompt.startswith("Target word:"):
            return {"sentence": DRAFT, "tokens": [
                {"surface": "سَمیِتھ", "intended_meaning": "having collected, gathered together actively",
                 "required_valency": "transitive"}]}
        sentence = re.search(r"Draft sentence: (.*)", prompt).group(1)
        evidence = json.loads(prompt.split("do not override it):\n", 1)[1].split("\nRules:")[0])
        edits = []
        for p in evidence:
            used = p["used_token"]
            ending = used[-3:]  # conjunctive participle ending (ِتھ)
            forms = [f for c in p["correct_dictionary_candidates"] for f in c["stems_and_participles"]]
            attested = [f for f in forms if f.endswith(ending)]
            if attested:  # rule 1+2: substitute an attested form only
                sentence = sentence.replace(used, attested[0])
                edits.append({"from": used, "to": attested[0], "reason": "valency"})
        tokens = [{"surface": e["to"], "intended_meaning": "having collected, gathered together actively",
                   "required_valency": "transitive"} for e in edits]
        return {"is_valid": True, "sentence": sentence, "tokens": tokens, "edits": edits}


def test_motivating_example():
    v = KashmiriDictionaryVerifier.from_json(SAMPLE)
    form = v.lookup_by_form("سَمیِتھ", top_k=1)
    assert form and form[0].transliteration == "samyun", form
    meaning = v.lookup_by_meaning("having collected, gathered together actively", "transitive", top_k=1)
    assert meaning[0].transliteration == "sombrawun", meaning
    flag = v.flag({"surface": "سَمیِتھ", "intended_meaning": "having collected actively", "required_valency": "transitive"})
    assert flag["valency_mismatch"] and not flag["unknown_word"]
    llm = ScriptedLLM()
    final, log = verify_and_correct("پۆت وان", v, llm)
    assert log[0]["problems"] == ["سَمیِتھ"], log
    assert log[-1]["problems"] == [], log
    assert nfc(final) == nfc(VERIFIED), final
    print("form lookup :", [e.transliteration for e in form])
    print("meaning     :", [e.transliteration for e in meaning])
    for entry in log:
        print(f"iter {entry['iter']}      : problems = {entry['problems']}")
    print("final       :", final)


def damage(word, rng):
    """Typical keyboard/OCR damage: drop the vowel signs, type Kashmiri letters as Urdu ones."""
    w = unicodedata.normalize("NFC", "".join(c for c in unicodedata.normalize("NFD", word)
                                             if not ("ً" <= c <= "ٟ" or c == "ٰ")))
    if rng.random() < 0.5:
        w = w.translate(str.maketrans({"ٲ": "ا", "ۄ": "و", "ؠ": "ی", "ۍ": "ی"}))
    return w


def test_form_recovery(n=2000, seed=7):
    v = KashmiriDictionaryVerifier.from_dataset(DATASET)
    heads = sorted({e.headword for e in v.entries if e.quality == "native" and " " not in e.headword
                    and skeleton(e.headword) != e.headword and len(e.headword) >= 3})
    rng = random.Random(seed)
    sample = rng.sample(heads, min(n, len(heads)))
    top1 = top3 = 0
    for h in sample:
        hits = [e.headword for e in v.lookup_by_form(damage(h, rng), top_k=3)]
        top1 += bool(hits) and skeleton(hits[0]) == skeleton(h)
        top3 += any(x == h for x in hits) or (bool(hits) and skeleton(hits[0]) == skeleton(h))
    r1, r3 = top1 / len(sample), top3 / len(sample)
    print(f"form recovery on {len(sample)} damaged native headwords: top-1 letters {r1:.1%}, exact word in top-3 {r3:.1%}")
    assert r1 >= 0.95, f"phase-3 exit criterion not met: {r1:.1%} < 95%"


def test_validator_on_sample():
    errors, _ = validate(load(SAMPLE))
    assert not errors, errors


if __name__ == "__main__":
    test_motivating_example()
    test_validator_on_sample()
    test_form_recovery()
    print("ALL TESTS PASSED")
