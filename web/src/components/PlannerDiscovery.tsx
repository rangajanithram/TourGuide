'use client';
import { useEffect, useRef, useState } from 'react';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl } from '@/lib/planner-network';
import type { ConfirmedDiscoveryStop } from '@/types/trip';
import PlaceSearch, { SearchOption } from './PlaceSearch';
import ThemedSelect from './ThemedSelect';

type Result = { id: string; name: string; address: string; lat: number; lng: number; category: string; osm_url?: string; formatted_address?: string };
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
  const [category, setCategory] = useState('all');
  const cache = useRef(new Map<string, Result[]>());
  useEffect(() => {
    const controller = new AbortController();
    const name = query.trim();
    setItems([]); setError(''); setBusy(false);
    if ((name.length > 0 && name.length < 3) || disabled) return () => controller.abort();
    const key = `${destination}:${category}:${name.toLowerCase()}`;
    const cached = cache.current.get(key);
    if (cached) { setItems(cached); return () => controller.abort(); }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await plannerFetch(`${apiBaseUrl()}/api/discovery?${new URLSearchParams({ location: destination + ', India', category, ...(name.length >= 3 ? { query: name } : {}) })}`, { signal: controller.signal });
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
    }, name.length >= 3 ? 750 : 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, destination, disabled, retry, category]);
  const catalogMatch = (item: Result) => catalog.find(place =>
    place.label.trim().toLowerCase() === item.name.trim().toLowerCase() && place.lat !== undefined && place.lng !== undefined && Math.abs(place.lat-item.lat) < 0.002 && Math.abs(place.lng-item.lng) < 0.002);
  const live = items.filter(item => !selected.includes('discovered:' + item.id) && !selected.includes(catalogMatch(item)?.value || ''));
  const options: SearchOption[] = [
    ...live.map(item => ({ value: catalogMatch(item)?.value || 'discovered:' + item.id, label: item.name, description: `Live listing · ${item.address}` })),
    ...(category === 'all' && !busy ? catalog.filter(place => !selected.includes(place.value) && query.trim().toLowerCase().split(/\s+/).every(word => place.label.toLowerCase().includes(word)) && !live.some(item => catalogMatch(item)?.value === place.value)).map(place => ({ ...place, description: 'Reference catalog · estimated planning facts' })) : []),
  ];
  const status = disabled ? 'You can select up to 15 places. Remove a pin to add another.' : busy ? 'Searching real places…' : error || (query.trim().length < 3 ? 'Type at least 3 characters to search real attractions, restaurants, parks and hills. Select places one at a time; your pins stay selected.' : 'Matching catalog and live listings near this city. Coverage depends on the source.');
  return <div className="planner-place-discovery">
    <div className="discovery-heading"><div><h4>Explore {destination.charAt(0).toUpperCase() + destination.slice(1)}</h4><p>Search this destination and add places one at a time. Your selections stay below.</p></div><span>{busy ? 'Searching…' : `${live.length} live matches`}</span></div>
    <div className="discovery-categories" aria-label="Place categories">{[{value:'all',label:'All places'},{value:'attractions',label:'Attractions'},{value:'restaurants',label:'Restaurants'},{value:'parks',label:'Parks'},{value:'hills',label:'Hills & viewpoints'}].map(option => <button key={option.value} type="button" aria-pressed={category === option.value} disabled={disabled} onClick={() => { setCategory(option.value); setChosen(null); }}>{option.label}</button>)}</div>
    <PlaceSearch label="Search and pin a place" value="" placeholder="Type an attraction, restaurant, park or hill…" options={options} filterLocally={false} disabled={disabled} onQueryChange={setQuery} status={status} onChange={id => {
      const item = items.find(place => 'discovered:' + place.id === id);
      if (item) setChosen(item); else onPin(id);
    }} />
    {error && <div className="discovery-recovery" role="status"><p>Live destination search is unavailable. Reference catalog matches are labeled separately. {error}</p><button type="button" onClick={() => setRetry(value => value + 1)} disabled={busy}>Retry live search</button></div>}
    {chosen && <ConfirmPlace key={chosen.id} place={chosen} disabled={disabled} onCancel={() => setChosen(null)} onConfirm={(stop, mandatory) => { onConfirm(stop, mandatory); setChosen(null); }} />}
    <p className="catalog-caption">Live listings: <a href="https://www.geoapify.com/">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Hours and prices may need your confirmation.</p>
  </div>;
}

function ConfirmPlace({ place, disabled, onCancel, onConfirm }: { place: Result; disabled: boolean; onCancel: () => void; onConfirm: (stop: ConfirmedDiscoveryStop, mandatory: boolean) => void }) {
  const [duration, setDuration] = useState('');
  const [cost, setCost] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mandatory, setMandatory] = useState(true);
  const [meal, setMeal] = useState('');
  const [error, setError] = useState('');
  return <section className="booking-summary" aria-label={`Confirm estimates for ${place.name}`}>
    <h4>{place.name}</h4><p>{place.address}</p>
    <p>This listing is missing verified planning facts. Confirm your estimates to include it; these remain labeled as estimates in the itinerary.</p>
    {place.category === 'restaurants' && <div><p className="font-semibold">Meal window</p><ThemedSelect label="Meal window" value={meal} options={[{value:'',label:'Choose a meal window (optional)'},{value:'breakfast',label:'Breakfast · 08:00–10:00'},{value:'lunch',label:'Lunch · 12:00–15:00'},{value:'dinner',label:'Dinner · 18:00–20:00'}]} onChange={value => {
      setMeal(value);
      const windows: Record<string, [string, string]> = { breakfast: ['08:00', '10:00'], lunch: ['12:00', '15:00'], dinner: ['18:00', '20:00'] };
      const window = windows[value];
      if (window) { setStart(window[0]); setEnd(window[1]); }
    }} /><p className="step-note">These are your planning windows, not verified restaurant service hours. Confirm service and dietary needs with the venue. A restaurant visit does not replace a separately reserved base meal.</p></div>}
    <div className="booking-grid">
      <label>Visit length (minutes)<input type="number" min={15} max={480} value={duration} onChange={event => setDuration(event.target.value)} /></label>
      <label>Cost per person (₹, enter 0 if free)<input type="number" min={0} max={100000} value={cost} onChange={event => setCost(event.target.value)} /></label>
      <label>Earliest planned visit<input type="time" min="08:00" max="20:00" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Finish by<input type="time" min="08:00" max="20:00" value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>
    <label className="booking-check"><input type="checkbox" checked={mandatory} onChange={event => setMandatory(event.target.checked)} /> Make this stop a must-visit (pinned)</label>
    {error && <p role="alert">{error}</p>}
    <div className="trip-step-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="booking-submit" disabled={disabled} onClick={() => {
      const minute = (time: string) => Number(time.slice(0,2))*60 + Number(time.slice(3))-480;
      if (!cost || !duration || !Number.isInteger(Number(cost)) || Number(cost)<0 || Number(cost)>100000 || !Number.isInteger(Number(duration)) || Number(duration)<15 || Number(duration)>480 || !start || !end || minute(start)<0 || minute(end)>720 || minute(end)-minute(start)<Number(duration)) { setError('Enter a duration, cost and time window that fits your visit between 08:00 and 20:00.'); return; }
      onConfirm({
        place_id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        place_type: place.category === 'restaurants' ? 'restaurant' : 'attraction',
        duration_minutes: Number(duration),
        estimated_cost_per_person_inr: Number(cost),
        open_time_mins: minute(start),
        close_time_mins: minute(end),
        formatted_address: (place.address || place.formatted_address || "").slice(0, 300) || null,
      }, mandatory);
    }}>{mandatory ? 'Confirm estimates and pin' : 'Confirm as optional candidate'}</button></div>
  </section>;
}
