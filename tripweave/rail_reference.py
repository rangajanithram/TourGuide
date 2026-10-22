"""Historical train lookup, deliberately outside verified itinerary scheduling."""
import gzip
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def catalog():
    path = Path(__file__).resolve().parents[1] / 'data/reference/railways.json.gz'
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        data = json.load(stream)
    if data['schema_version'] != 1 or not data['historical']:
        raise ValueError('Unsupported railway reference bundle')
    station_map = {item['code']: item for item in data['stations']}
    departures = {}
    for service in data['services']:
        for code in {stop[0] for stop in service['stops']}:
            departures.setdefault(code, []).append(service)
    return data, station_map, departures


def stations(query):
    _, station_map, _ = catalog()
    text = query.strip().casefold()
    if len(text) < 2:
        return []
    matches = [station for station in station_map.values()
               if text in station['code'].casefold() or text in station['name'].casefold()]
    matches.sort(key=lambda item: (item['code'].casefold() != text,
                                  not item['name'].casefold().startswith(text), item['name'], item['code']))
    return matches[:20]


def routes(origin, destination):
    data, station_map, departures = catalog()
    if origin == destination or origin not in station_map or destination not in station_map:
        raise ValueError('Choose two different stations from the suggestions.')
    options = []
    for service in departures.get(origin, []):
        starts = [stop for stop in service['stops'] if stop[0] == origin]
        ends = [stop for stop in service['stops'] if stop[0] == destination]
        # Repeated stations need an explicit sequence unavailable in this source.
        if len(starts) != 1 or len(ends) != 1:
            continue
        departure, arrival = starts[0][2], ends[0][1]
        if departure is None or arrival is None or not 0 < arrival - departure <= 7 * 1440:
            continue
        options.append({'number': service['number'], 'name': service['name'],
                        'origin': station_map[origin], 'destination': station_map[destination],
                        'departure': f'{departure // 60 % 24:02}:{departure % 60:02}',
                        'arrival': f'{arrival // 60 % 24:02}:{arrival % 60:02}',
                        'arrival_day_offset': arrival // 1440 - departure // 1440,
                        'duration_minutes': arrival - departure,
                        'operating_days': None, 'fare_inr': None, 'availability': None})
    options.sort(key=lambda item: (item['duration_minutes'], item['number']))
    return {'source': data['source'], 'source_url': data['source_url'], 'license': data['license'],
            'historical': True, 'collection_date': None, 'total': len(options), 'trains': options[:20],
            'notice': 'Historical timetable; collection date unknown. Operating days, current times, fares and seats are unverified. Confirm with Indian Railways before planning or booking.'}
