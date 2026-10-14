'use client';
import { useEffect, useRef, useState } from 'react';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl } from '@/lib/planner-network';
import type { ConfirmedDiscoveryStop } from '@/types/trip';
import PlaceSearch, { SearchOption } from './PlaceSearch';

type Result = { id: string; name: string; address: string; lat: number; lng: number; category: string };
type CatalogOption = SearchOption & { lat?: number; lng?: number };
export default function PlannerDiscovery({ destination, catalog, selected, onPin, onConfirm, disabled }: {
  destination: string; catalog: CatalogOption[]; selected: string[];
  onPin: (id: string) => void; onConfirm: (stop: ConfirmedDiscoveryStop, mandatory: boolean) => void; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Result[]>([]);
  const [chosen, setChosen] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, Result[]>());
  useEffect(() => {
    const controller = new AbortController();
    const name = query.trim();
    setItems([]); setError(''); setBusy(false);
    if (name.length < 3 || disabled) return () => controller.abort();
    const key = `${destination}:${name.toLowerCase()}`;
    const cached = cache.current.get(key);
    if (cached) { setItems(cached); return () => controller.abort(); }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await plannerFetch(`${apiBaseUrl()}/api/discovery?${new URLSearchParams({ location: destination + ', India', category: 'all', query: name })}`, { signal: controller.signal });
        const body = await response.json();
        if (!Array.isArray(body.places)) throw new Error('Place search returned an invalid response. Please retry.');
        if (!controller.signal.aborted) {
          const places = body.places as Result[];
          if (cache.current.size >= 10) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, places); setItems(places);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Live search is unavailable. Catalog matches are still available.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 900);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, destination, disabled, retry]);
  const live = items.filter(item => !selected.includes('discovered:' + item.id) && !catalog.some(place =>
    place.label.trim().toLowerCase() === item.name.trim().toLowerCase() && place.lat !== undefined && place.lng !== undefined && Math.abs(place.lat-item.lat) < 0.002 && Math.abs(place.lng-item.lng) < 0.002));
  const options: SearchOption[] = [
    ...catalog.filter(place => !selected.includes(place.value)).map(place => ({ ...place, description: 'Catalog · planning estimates available' })),
    ...live.map(item => ({ value: 'discovered:' + item.id, label: item.name, description: `Live listing · ${item.address}` })),
  ];
  const status = disabled ? 'You can select up to 15 places. Remove a pin to add another.' : busy ? 'Searching real places…' : error || (query.trim().length < 3 ? 'Type at least 3 characters to search real attractions, restaurants, parks and hills. Select places one at a time; your pins stay selected.' : 'Matching catalog and live listings near this city. Coverage depends on the source.');
  return <div>
    <PlaceSearch label="Search and pin a place" value="" placeholder="Type an attraction, restaurant, park or hill…" options={options} disabled={disabled} onQueryChange={setQuery} status={status} onChange={id => {
      const item = items.find(place => 'discovered:' + place.id === id);
      if (item) setChosen(item); else onPin(id);
    }} />
    {error && <button type="button" onClick={() => setRetry(value => value + 1)} disabled={busy}>Retry live search</button>}
    {chosen && <ConfirmPlace key={chosen.id} place={chosen} disabled={disabled} onCancel={() => setChosen(null)} onConfirm={stop => { onConfirm(stop, true); setChosen(null); }} />}
    <p className="catalog-caption">Live listings: <a href="https://www.geoapify.com/">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Hours and prices may need your confirmation.</p>
  </div>;
}

function ConfirmPlace({ place, disabled, onCancel, onConfirm }: { place: Result; disabled: boolean; onCancel: () => void; onConfirm: (stop: ConfirmedDiscoveryStop) => void }) {
  const [duration, setDuration] = useState('');
  const [cost, setCost] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  return <section className="booking-summary" aria-label={`Confirm estimates for ${place.name}`}>
    <h4>{place.name}</h4><p>{place.address}</p>
    <p>This listing is missing verified planning facts. Confirm your estimates to pin it; these remain labeled as estimates in the itinerary.</p>
    <div className="booking-grid">
      <label>Visit length (minutes)<input type="number" min={15} max={480} value={duration} onChange={event => setDuration(event.target.value)} /></label>
      <label>Cost per person (₹, enter 0 if free)<input type="number" min={0} max={100000} value={cost} onChange={event => setCost(event.target.value)} /></label>
      <label>Earliest planned visit<input type="time" min="08:00" max="20:00" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Finish by<input type="time" min="08:00" max="20:00" value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="trip-step-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="booking-submit" disabled={disabled} onClick={() => {
      const minute = (time: string) => Number(time.slice(0,2))*60 + Number(time.slice(3))-480;
      if (!cost || !duration || !Number.isInteger(Number(cost)) || Number(cost)<0 || Number(cost)>100000 || !Number.isInteger(Number(duration)) || Number(duration)<15 || Number(duration)>480 || !start || !end || minute(start)<0 || minute(end)>720 || minute(end)-minute(start)<Number(duration)) { setError('Enter a duration, cost and time window that fits your visit between 08:00 and 20:00.'); return; }
      onConfirm({ place_id: place.id, name: place.name, lat: place.lat, lng: place.lng, place_type: place.category === 'restaurants' ? 'restaurant' : 'attraction', duration_minutes: Number(duration), estimated_cost_per_person_inr: Number(cost), open_time_mins: minute(start), close_time_mins: minute(end) });
    }}>Confirm estimates and pin</button></div>
  </section>;
}
