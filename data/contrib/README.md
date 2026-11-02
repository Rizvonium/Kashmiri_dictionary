# Contributed word lists

Put CSV files here (UTF-8) and rebuild — they are merged into the dictionary automatically:

```bash
python3 scripts/build_dataset.py raw data
python3 scripts/build_site_data.py data/kashmiri_dictionary.jsonl site/data/dictionary.json
```

Recognised columns (any order, extra columns ignored):

| column | meaning |
|---|---|
| `kashmiri_unicode` | Kashmiri word in Perso-Arabic script (normalized to the dataset's Unicode convention on import) |
| `romanized_kashmiri` | Roman spelling(s); several can be separated with ` / ` |
| `meaning` | English meaning |
| `source` | optional, kept in `source_ref` |

Rows already present in the dictionary (same Kashmiri spelling and meaning, or same Roman spelling and meaning) are skipped.
Imported rows are labelled `source = user-upload`.
