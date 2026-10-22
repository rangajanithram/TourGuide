# Historical reference data

`railways.json.gz` is generated from the downloaded **DataMeet Indian Railways**
files (`stations.json`, `trains.json`, `schedules.json`, `README.md`).

- Source: https://github.com/datameet/railways
- Source-declared license: CC0, https://creativecommons.org/publicdomain/zero/1.0/
- Original collection date: unknown. A download date is not a collection date.
- Contents: station names/codes/state and historical train stop times.
- Excluded: reviewer identities, review text, ratings, fares, availability,
  geographic route geometries, and any claim of current operation.

Rebuild from repository root:

```powershell
python scripts/import_local_datasets.py --source 'D:\TripWeave-Datasets'
```

The generator preserves train-number strings, validates day/time fields, and
omits unusable schedule rows. Lookup rejects ambiguous repeated stations and
backward/zero-length journeys. Midnight crossings use source journey-day offsets.
Results are limited to 20 shortest matching direct journeys; service days are
unknown. No journey is selected or inserted into the optimizer automatically.

`inventory.json` records raw file hashes, sizes, headers and row counts for the
other local downloads. It contains no review content. Those files are **not**
published catalogs or approved optimizer inputs. Their provenance and reuse
permissions must be resolved before publication. Raw downloads stay outside Git.

Both API routes require an authenticated user and return private/no-store
responses. Missing reference files do not prevent itinerary generation.
