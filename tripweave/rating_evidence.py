"""Optional historical sample scores, separate from live provider reviews."""
import json
import re
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def samples():
    path = Path(__file__).resolve().parents[1] / 'data/reference/rating_samples.json'
    if not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding='utf-8'))
    return {(r['city'], r['name_key']): r for r in rows}


def attach_rating_evidence(places, destination):
    for place in places:
        key = re.sub(r'[^a-z0-9]+', ' ', place.name.casefold()).strip()
        evidence = samples().get((destination.casefold(), key))
        # Restaurant chains need a branch ID/address crosswalk. A name-only join
        # would attach one branch's reviews to another; keep them unattached.
        if evidence and evidence.get('place_type') == 'attraction' and place.place_type == 'attraction':
            place.rating = evidence['rating']
            place.review_count = evidence['review_count']
            place.rating_evidence = evidence['rating_evidence']
    return places
