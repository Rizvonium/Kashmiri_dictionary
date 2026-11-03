#!/usr/bin/env python3
"""Dual-lookup dictionary verifier for Kashmiri text.

An implementation of "Recursive Dual-Lookup Dictionary Verification for Grammatical
Self-Correction in Low-Resource Kashmiri Generation" (S. A. Sheikh, project guide v1.0,
2026), sections 6-7, adapted to this repository's dataset (data/kashmiri_dictionary.jsonl).

Every content word is checked twice against the dictionary:

  Lookup 1, by form:    what does the token that was written actually correspond to?
                        exact key (NFC + letter fixes) first, then the vowel-free skeleton,
                        narrowed by a character-trigram index before any similarity scoring.
  Lookup 2, by meaning: which entry expresses the intended sense, with the required valency?
                        TF-IDF over the English gloss + definition by default; pass any
                        sentence-transformers-style embedder to use dense vectors instead.

`flag()` decides in code (not in the LLM) whether a token has a valency mismatch or is
unknown. `verify_and_correct()` runs draft -> dual lookup -> flags -> critic -> re-check,
where the critic may only substitute attested forms. Bring your own `llm` with a
`generate_json(prompt) -> dict` method.

Usage:
    python3 scripts/ks_verifier.py form کٲشُر
    python3 scripts/ks_verifier.py meaning "to collect, gather (transitive)" --valency transitive
    python3 scripts/ks_verifier.py check "مےٚ چُھ کٲشُر زَبانہِ پؠٹھ غُرور"
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ks_normalize import normalize_ks, strip_marks  # noqa: E402

try:  # optional, much faster Levenshtein ratios (guide 7.4 tip)
    from rapidfuzz.fuzz import ratio as _rf_ratio

    def _similarity(a: str, b: str) -> float:
        return _rf_ratio(a, b) / 100.0
except ImportError:  # pragma: no cover - stdlib fallback
    def _similarity(a: str, b: str) -> float:
        return SequenceMatcher(None, a, b).ratio()

VALENCIES = ("transitive", "intransitive", "ditransitive", "causative")
PUNCT = re.compile(r"[\s،؛؟۔,.;:!?()\[\]\"'«»…/\-–—]+")


# --------------------------------------------------------------------------- keys (guide 6.3)

def nfc(text: str) -> str:
    """Exact key: the dataset's canonical form (NFC, ك→ک, ي→ی, ه→ہ, legacy code points fixed)."""
    return normalize_ks(text)


def skeleton(text: str) -> str:
    """Recall key: vowel signs, tatweel and ZWNJ removed; Kashmiri letters (ٲ ۄ ۍ ؠ) kept."""
    return strip_marks(text).replace("‌", "")


_LOOSE = str.maketrans({"ٲ": "ا", "أ": "ا", "إ": "ا", "آ": "ا", "ۄ": "و", "ؤ": "و", "ؠ": "ی", "ێ": "ی", "ۍ": "ی",
                        "ئ": "ی", "ے": "ی", "ۂ": "ہ", "ۃ": "ہ", "ة": "ہ", "ں": "ن", "\u0653": ""})


def loose(text: str) -> str:
    """Look-alike key (same rules as the website's looseKs): Kashmiri letters folded to the Urdu
    letters keyboards and OCR substitute for them, e.g. ٲ→ا, ۄ→و, ؠ/ۍ→ی. Recall only."""
    import unicodedata
    return unicodedata.normalize("NFC", unicodedata.normalize("NFD", skeleton(text)).translate(_LOOSE))


def char_ngrams(text: str, n: int = 3) -> set[str]:
    padded = f"#{text}#"
    return {padded[i:i + n] for i in range(max(1, len(padded) - n + 1))}


# --------------------------------------------------------------------------- entries (guide 7.2)

def valency_from_row(row: dict) -> str | None:
    """Valency from the dictionary's own labels only (guide 3.3 annotation policy)."""
    pos = row.get("pos", "") or ""
    if "intransitive" in pos:
        return "intransitive"
    if "transitive" in pos:
        return "transitive"
    head = (row.get("definition_en", "") or "")[:80]
    if re.search(r"\bv\.\s?(t|tr|a)\b|\btrans\.", head):
        return "transitive"
    if re.search(r"\bv\.\s?i\b|\bintrans\.", head):
        return "intransitive"
    if re.search(r"\bcaus\.", head):
        return "causative"
    return None


@dataclass
class Entry:
    id: str
    headword: str
    pos: str
    definition_ks: str
    gloss_en: str
    transliteration: str = ""
    valency: str | None = None
    stems_and_participles: list[str] = field(default_factory=list)
    source: str = ""
    quality: str = ""

    @property
    def forms(self) -> list[str]:
        return [self.headword, *self.stems_and_participles]

    @classmethod
    def from_dataset_row(cls, row: dict) -> "Entry":
        pos = (row.get("pos") or "").split(" (")[0]
        return cls(
            id=row["id"],
            headword=nfc(row["headword_ks"]),
            pos=pos,
            definition_ks="",  # the merged dataset has English definitions only
            gloss_en=row.get("gloss_en") or (row.get("definition_en") or "")[:200],
            transliteration=row.get("headword_roman", ""),
            valency=valency_from_row(row),
            source=row.get("source", ""),
            quality=row.get("script_quality", ""),
        )

    @classmethod
    def from_guide_dict(cls, d: dict) -> "Entry":
        """Entries in the guide's own schema (data/lexicon_sample.json)."""
        keys = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in keys})


QUALITY_RANK = {"native": 0, "source-perso-arabic (1932)": 1, "": 2, "auto-transliterated": 3, "unverified": 4}


# --------------------------------------------------------------------------- meaning index

class TfidfEmbedder:
    """Tiny dependency-free stand-in for a sentence encoder (sparse TF-IDF, cosine)."""

    token = re.compile(r"[a-z]+")

    def fit(self, texts: list[str]) -> "TfidfEmbedder":
        df = Counter()
        docs = [Counter(self.token.findall(t.lower())) for t in texts]
        for d in docs:
            df.update(d.keys())
        n = len(docs)
        self.idf = {w: math.log((1 + n) / (1 + c)) + 1 for w, c in df.items()}
        self.doc_vecs = [self._vec(d) for d in docs]
        return self

    def _vec(self, counts: Counter) -> dict[str, float]:
        v = {w: (1 + math.log(c)) * self.idf.get(w, 0.0) for w, c in counts.items() if w in self.idf}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {w: x / norm for w, x in v.items()}

    def scores(self, query: str) -> list[float]:
        q = self._vec(Counter(self.token.findall(query.lower())))
        return [sum(q[w] * d.get(w, 0.0) for w in q) for d in self.doc_vecs]


# --------------------------------------------------------------------------- verifier (guide 7.3)

class KashmiriDictionaryVerifier:
    def __init__(self, entries: list[Entry], embedder=None, n: int = 3):
        self.entries = entries
        self.n = n
        self.exact: dict[str, list[int]] = defaultdict(list)
        self.by_skel: dict[str, list[int]] = defaultdict(list)
        self.by_loose: dict[str, list[int]] = defaultdict(list)
        self.grams: dict[str, set[int]] = defaultdict(set)
        self._skel: list[list[str]] = []
        for i, e in enumerate(self.entries):
            skels = []
            for form in e.forms:
                self.exact[nfc(form)].append(i)
                sk = skeleton(form)
                skels.append(sk)
                self.by_skel[sk].append(i)
                self.by_loose[loose(form)].append(i)
                for g in char_ngrams(sk, n):
                    self.grams[g].add(i)
            self._skel.append(skels)
        texts = [f"{e.definition_ks} {e.gloss_en}" for e in self.entries]
        self.embedder = embedder
        if embedder is None:
            self._tfidf = TfidfEmbedder().fit(texts)
        else:
            import numpy as np  # only needed for dense embedders

            self._np = np
            self.vectors = np.asarray(embedder.encode(texts, normalize_embeddings=True))

    # ---- construction
    @classmethod
    def from_dataset(cls, path: str, embedder=None, qualities=("native", "source-perso-arabic (1932)")):
        entries = []
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                if row.get("headword_ks") and row.get("script_quality") in qualities:
                    entries.append(Entry.from_dataset_row(row))
        return cls(entries, embedder)

    @classmethod
    def from_json(cls, path: str, embedder=None):
        with open(path, encoding="utf-8") as fh:
            return cls([Entry.from_guide_dict(d) for d in json.load(fh)], embedder)

    def _order(self, ids):
        return sorted(ids, key=lambda i: QUALITY_RANK.get(self.entries[i].quality, 2))

    # ---- Lookup 1: what does the surface token the model wrote actually mean?
    def lookup_by_form(self, token: str, top_k: int = 2, threshold: float = 0.55) -> list[Entry]:
        token = nfc(token)
        if token in self.exact:  # exact hit wins
            return [self.entries[i] for i in self._order(self.exact[token])][:top_k]
        sk = skeleton(token)
        # Same letters without vowel signs, then same letters up to Kashmiri look-alikes.
        for key, index in ((sk, self.by_skel), (loose(token), self.by_loose)):
            if key in index:
                return [self.entries[i] for i in self._order(dict.fromkeys(index[key]))][:top_k]
        pool = set().union(*(self.grams.get(g, set()) for g in char_ngrams(sk, self.n)))
        scored = []
        for i in pool:
            best = max(1.0 if s == sk else _similarity(sk, s) for s in self._skel[i])
            scored.append((best, -QUALITY_RANK.get(self.entries[i].quality, 2), i))
        scored.sort(reverse=True)
        return [self.entries[i] for s, _, i in scored[:top_k] if s >= threshold]

    # ---- Lookup 2: which entry expresses the meaning the model intended?
    def lookup_by_meaning(self, intent: str, valency: str | None = None, top_k: int = 2) -> list[Entry]:
        if self.embedder is None:
            sims = self._tfidf.scores(intent)
            order = sorted(range(len(sims)), key=lambda i: -sims[i])
            order = [i for i in order if sims[i] > 0] or order
        else:
            q = self._np.asarray(self.embedder.encode([intent], normalize_embeddings=True))[0]
            order = list(self._np.argsort(self.vectors @ q)[::-1])
        hits = [self.entries[i] for i in order[:500]]
        if valency in ("transitive", "intransitive"):  # hard filter
            hits = [e for e in hits if e.valency == valency] or hits
        return hits[:top_k]

    # ---- Deterministic pre-check: flag tokens before the LLM critic runs.
    def flag(self, tok: dict) -> dict:
        form = self.lookup_by_form(tok["surface"], top_k=1)
        need = tok.get("required_valency")
        found = form[0].valency if form else None
        mismatch = bool(form) and need in ("transitive", "intransitive") and found not in (None, need)
        return {
            "used_token": tok["surface"],
            "intended": tok.get("intended_meaning", ""),
            "required_valency": need,
            "dictionary_valency": found,
            "valency_mismatch": mismatch,
            "unknown_word": not form,
            "what_used_token_actually_means": [e.__dict__ for e in form],
            "correct_dictionary_candidates": [
                e.__dict__ for e in self.lookup_by_meaning(tok.get("intended_meaning", ""), need)
            ] if (mismatch or not form) and tok.get("intended_meaning") else [],
        }

    # ---- Convenience: check a sentence without an LLM (unknown-word flags only).
    def check_sentence(self, sentence: str) -> list[dict]:
        out = []
        for t in PUNCT.split(sentence):
            if not t or not re.search(r"[ؠ-ۿ]", t):
                continue
            exact = nfc(t) in self.exact
            hits = self.lookup_by_form(t, top_k=3)
            out.append({
                "token": t,
                "status": "attested" if exact else ("similar" if hits else "unknown"),
                "headwords": [h.headword for h in hits],
                "gloss": hits[0].gloss_en[:80] if hits else "",
                "valency": hits[0].valency if hits else None,
            })
        return out


# --------------------------------------------------------------------------- recursive loop (guide 7.4)

DRAFT_PROMPT = """Target word: {head} -- {definition}
Write ONE natural Kashmiri sentence (Perso-Arabic script) using the target word.
Return JSON: {{"sentence": str, "tokens": [{{"surface": str,
 "intended_meaning": str (English), "required_valency":
 "transitive"|"intransitive"|"noun"|"other"}}]}}
List every open-class content word except the target word."""

CRITIC_PROMPT = """Draft sentence: {sentence}
Dictionary evidence (authoritative; do not override it):
{evidence}
Rules:
1. A token with valency_mismatch=true MUST be replaced by an attested form
   from correct_dictionary_candidates[*].stems_and_participles (or its headword).
2. Never invent a form that is absent from the evidence.
3. Change nothing else.
Return JSON: {{"is_valid": bool, "sentence": str, "tokens": [...],
 "edits": [{{"from": str, "to": str, "reason": str}}]}}"""


def verify_and_correct(target: str, verifier: KashmiriDictionaryVerifier, llm, max_iters: int = 3):
    """Draft -> dual lookup -> deterministic flags -> critic -> re-verify (stops when clean)."""
    hits = verifier.lookup_by_form(target, top_k=1)
    if not hits:
        raise ValueError(f"target word not in the dictionary: {target}")
    head = hits[0]
    draft = llm.generate_json(DRAFT_PROMPT.format(head=head.headword, definition=head.definition_ks or head.gloss_en))
    log = []
    for it in range(max_iters):
        evidence = [verifier.flag(t) for t in draft["tokens"] if nfc(t["surface"]) != nfc(head.headword)]
        problems = [e for e in evidence if e["valency_mismatch"] or e["unknown_word"]]
        log.append({"iter": it, "sentence": draft["sentence"], "problems": [p["used_token"] for p in problems],
                    "edits": draft.get("edits", [])})
        if not problems:  # deterministic stop condition
            return draft["sentence"], log
        draft = llm.generate_json(CRITIC_PROMPT.format(
            sentence=draft["sentence"], evidence=json.dumps(problems, ensure_ascii=False, indent=1)))
    log.append({"iter": max_iters, "sentence": draft["sentence"], "needs_human_review": True})
    return draft["sentence"], log  # best effort; route to the human-review queue


# --------------------------------------------------------------------------- CLI

def _main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("command", choices=["form", "meaning", "check"])
    ap.add_argument("text")
    ap.add_argument("--valency", choices=VALENCIES)
    ap.add_argument("--data", default=os.path.join(here, "..", "data", "kashmiri_dictionary.jsonl"))
    ap.add_argument("-k", type=int, default=5)
    a = ap.parse_args()
    v = KashmiriDictionaryVerifier.from_dataset(a.data)
    if a.command == "form":
        res = [e.__dict__ for e in v.lookup_by_form(a.text, top_k=a.k)]
    elif a.command == "meaning":
        res = [e.__dict__ for e in v.lookup_by_meaning(a.text, a.valency, top_k=a.k)]
    else:
        res = v.check_sentence(a.text)
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    _main()
