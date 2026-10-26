"""Researched destination additions shared by every catalog consumer.

This is independent place data, not a Google/Tripadvisor response cache. Base
provider failures propagate before the supplement is considered.
"""
import json
from functools import lru_cache
from pathlib import Path
from tripweave.models import Place


@lru_cache(maxsize=1)
def hyderabad_supplement():
    path = Path(__file__).resolve().parents[1] / 'data/hyderabad_curated.json'
    rows = [Place.model_validate(row) for row in json.loads(path.read_text(encoding='utf-8'))]
    ids = [row.place_id for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate curated Hyderabad place IDs')
    return rows


class ExpandedPlacesProvider:
    def __init__(self, base):
        self.base = base

    def get_supported_cities(self):
        return self.base.get_supported_cities()

    def get_places(self, destination):
        rows = self.base.get_places(destination)  # Preserve explicit outage/503 behavior.
        if destination.strip().casefold() != 'hyderabad':
            return rows
        existing = {p.place_id for p in rows}
        rows.extend(p.model_copy(deep=True) for p in hyderabad_supplement() if p.place_id not in existing)
        return rows
