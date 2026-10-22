"""Build a small, reproducible railway reference bundle and inventory raw downloads.

Usage: python scripts/import_local_datasets.py --source D:\\TripWeave-Datasets
Only DataMeet's CC0 railway records are published by this importer. Other files
are inventoried without copying review text, reviewer identities or ratings.
"""
import argparse
import csv
import gzip
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def minute(value):
    try:
        hours, minutes, seconds = map(int, str(value).split(':'))
        if 0 <= hours < 24 and 0 <= minutes < 60 and 0 <= seconds < 60:
            return hours * 60 + minutes
    except (ValueError, TypeError):
        pass
    return None


def build_railways(source):
    directory = source / 'railways-india'
    # Do not infer redistribution permission from an arbitrary CSV filename.
    if '[CC0]' not in (directory / 'README.md').read_text(encoding='utf-8-sig'):
        raise ValueError('Expected DataMeet CC0 README alongside railway JSON files')
    inputs = {}
    for name in ('stations', 'trains', 'schedules'):
        raw = (directory / f'{name}.json').read_bytes()
        inputs[name] = json.loads(raw)
    stations = {}
    for feature in inputs['stations']['features']:
        item = feature['properties']
        code = str(item.get('code') or '').strip().upper()
        if code and item.get('name'):
            stations[code] = {'code': code, 'name': item['name'], 'state': item.get('state') or ''}
    trains = {}
    for feature in inputs['trains']['features']:
        item = feature['properties']
        number = str(item.get('number') or '').strip()
        if number:
            trains[number] = {'number': number, 'name': item.get('name') or number}
    grouped = defaultdict(list)
    skipped = 0
    for item in inputs['schedules']:
        code = str(item.get('station_code') or '').strip().upper()
        number = str(item.get('train_number') or '').strip()
        try:
            day = int(item.get('day'))
        except (TypeError, ValueError):
            skipped += 1
            continue
        arrival, departure = minute(item.get('arrival')), minute(item.get('departure'))
        if code not in stations or number not in trains or not 1 <= day <= 15 or (arrival is None and departure is None):
            skipped += 1
            continue
        offset = (day - 1) * 1440
        grouped[number].append([code, None if arrival is None else offset + arrival,
                                None if departure is None else offset + departure])
    services = []
    for number, stops in sorted(grouped.items()):
        # Input file order is not a documented route sequence. Absolute journey
        # times provide ordering; ambiguous/repeated stations are rejected at lookup.
        stops.sort(key=lambda stop: stop[1] if stop[1] is not None else stop[2])
        if len(stops) >= 2:
            services.append({**trains[number], 'stops': stops})
    digest = hashlib.sha256()
    for name in ('stations', 'trains', 'schedules'):
        digest.update((directory / f'{name}.json').read_bytes())
    return {'schema_version': 1, 'source': 'DataMeet Indian Railways',
            'source_url': 'https://github.com/datameet/railways', 'license': 'CC0',
            'collection_date': None, 'historical': True, 'input_sha256': digest.hexdigest(),
            'skipped_schedule_rows': skipped, 'stations': list(stations.values()), 'services': services}


def inventory(source):
    csv.field_size_limit(100_000_000)
    result = []
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        item = {'file': path.relative_to(source).as_posix(), 'bytes': path.stat().st_size,
                'sha256': digest.hexdigest()}
        if path.suffix == '.csv' or path.suffix == '.txt' and path.name not in ('source.txt',):
            with path.open(encoding='utf-8-sig', newline='', errors='replace') as stream:
                reader = csv.reader(stream)
                item['columns'] = next(reader, [])
                item['rows'] = sum(1 for _ in reader)
        result.append(item)
    return {'files': result, 'note': 'Inventory only. Download availability does not establish reuse permission. Review text and reviewer identities are excluded from published bundles.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'reference')
    args = parser.parse_args()
    bundle = build_railways(args.source)
    report = inventory(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (args.output / 'railways.json.gz').write_bytes(gzip.compress(raw, mtime=0))
    (args.output / 'inventory.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f"Imported {len(bundle['stations'])} stations and {len(bundle['services'])} historical services; skipped {bundle['skipped_schedule_rows']} unusable schedule rows.")


if __name__ == '__main__':
    main()
