#!/usr/bin/env bash
# Download every usable raw source into RAW_DIR (default: ./raw, git-ignored).
#   bash scripts/fetch_sources.sh [RAW_DIR]
# Optional: put the gated Omarrran CSV in RAW_DIR/omarrran/ after accepting its
# terms on Hugging Face (export HF_TOKEN=... and this script will try to fetch it).
set -euo pipefail
RAW="${1:-raw}"; mkdir -p "$RAW"; cd "$RAW"

clone() { [ -d "$2/.git" ] || git clone --depth 1 "https://github.com/$1.git" "$2"; }
clone izan-majeed/kaeshir-dictionary-data kaeshir-dictionary-data   # MIT
clone ubaierbhat/kzwebscrap kzwebscrap                               # MIT

mkdir -p injilashah
for f in kashmiri_zabaan.csv wordphonemes-meaning.csv; do
  [ -s "injilashah/$f" ] || curl -fsSL -o "injilashah/$f" \
    "https://huggingface.co/datasets/injilashah/Kashmiri-language-text-dataset/resolve/main/$f"
done

if [ -n "${HF_TOKEN:-}" ]; then
  mkdir -p omarrran
  curl -fsSL -H "Authorization: Bearer $HF_TOKEN" -o omarrran/KASHMIRi_Multilingual_Dictionary.csv \
    "https://huggingface.co/datasets/Omarrran/kashmiri_multilingual_dictionary_dataset/resolve/main/KASHMIRi_Multilingual_Dictionary.csv" \
    || echo "Omarrran dataset not accessible (gated: request access on Hugging Face first)"
fi

# Grierson (1932, public domain) from DSAL, page by page; polite rate, resumable.
mkdir -p grierson/pages
for p in $(seq 1 1260); do
  [ -s "grierson/pages/$p.html" ] && continue
  curl -fsS --retry 4 --retry-delay 2 \
    "https://dsal.uchicago.edu/cgi-bin/app/grierson_query.py?page=$p" -o "grierson/pages/$p.html" || true
  sleep 0.5
done

# AI4Bharat Aksharantar Kashmiri Roman<->Perso-Arabic pairs (CC-BY/CC0) and ChiKhaPo Kashmiri-English (MIT)
mkdir -p aksharantar chikhapo
[ -s aksharantar/kas.zip ] || curl -fsSL -o aksharantar/kas.zip \
  "https://huggingface.co/datasets/ai4bharat/Aksharantar/resolve/main/kas.zip"
[ -s chikhapo/kas_eng.jsonl ] || curl -fsSL -o chikhapo/kas_eng.jsonl \
  "https://huggingface.co/datasets/ec5ug/chikhapo/resolve/main/data/kas_eng.jsonl"
echo "done: $(ls grierson/pages | wc -l) Grierson pages"
