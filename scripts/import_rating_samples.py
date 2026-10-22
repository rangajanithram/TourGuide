"""Aggregate user-provided numerical rating samples; never export review text or identities."""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path


def normalize(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    records = []
    for relative, name_field, rating_field, label in [
        ('restaurants-hyderabad/Restaurant reviews.csv', 'Restaurant', 'Rating', 'Hyderabad restaurant dataset rating sample'),
        ('ToursitPlaces-Hyderabad/reviews.csv', 'Place You Want to Review About', 'On a Scale of 1-5 Rate the Place', 'Hyderabad attraction dataset rating sample'),
    ]:
        groups = defaultdict(list)
        with (args.source / relative).open(encoding='utf-8-sig', newline='') as stream:
            for row in csv.DictReader(stream):
                try:
                    score = float(row[rating_field])
                except (ValueError, TypeError):
                    continue
                if 1 <= score <= 5 and row[name_field].strip():
                    groups[normalize(row[name_field])].append(score)
        for name, scores in sorted(groups.items()):
            records.append({'city': 'hyderabad', 'place_type': 'restaurant' if relative.startswith('restaurants-') else 'attraction', 'name_key': name, 'rating': round(sum(scores)/len(scores), 2),
                            'review_count': len(scores), 'rating_evidence': label + '; historical, collection date unverified; sample mean, not current platform rating'})
    output = Path(__file__).resolve().parents[1] / 'data/reference/rating_samples.json'
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(records)} numerical rating summaries. Review text and identities excluded.')


if __name__ == '__main__':
    main()
