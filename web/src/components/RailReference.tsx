'use client';
import { useEffect, useRef, useState } from 'react';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl } from '@/lib/planner-network';
import PlaceSearch from './PlaceSearch';

type Station = { code: string; name: string; state: string };
type Train = { number: string; name: string; origin: Station; destination: Station; departure: string; arrival: string; arrival_day_offset: number; duration_minutes: number };
type Results = { trains: Train[]; total: number; notice: string };

function StationSearch({ label, initialQuery, value, onChange }: {
  label: string; initialQuery: string; value: Station | null; onChange: (station: Station | null) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<Station[]>([]);
  const [status, setStatus] = useState('Type a station name or code, then select a suggestion.');
  useEffect(() => {
    const controller = new AbortController();
    if (query.trim().length < 2) { setItems([]); return () => controller.abort(); }
    setStatus('Finding stations…');
    const timer = setTimeout(async () => {
      try {
        const response = await plannerFetch(`${apiBaseUrl()}/api/reference/rail/stations?${new URLSearchParams({ query: query.trim() })}`, { signal: controller.signal });
        const data = await response.json();
        if (!Array.isArray(data.stations)) throw new Error('Station suggestions could not be read.');
        if (!controller.signal.aborted) { setItems(data.stations); setStatus(data.stations.length ? 'Select a station. Nearby terminals may have separate names.' : 'No matching stations in this historical collection. Try a station code.'); }
      } catch (failure) {
        if (!controller.signal.aborted) { setItems([]); setStatus(failure instanceof Error ? failure.message : 'Station search is unavailable.'); }
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  const options = value ? [value, ...items.filter(item => item.code !== value.code)] : items;
  return <PlaceSearch label={label} value={value?.code || ''} options={options.map(item => ({ value: item.code, label: `${item.name} (${item.code})`, description: item.state }))}
    status={status} onQueryChange={text => { setQuery(text); if (text) { setItems([]); onChange(null); } }}
    onChange={code => onChange(options.find(item => item.code === code) || null)} placeholder="Station name or code, e.g. SC" />;
}

export default function RailReference({ originCity, destinationCity }: { originCity: string; destinationCity: string }) {
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function invalidate() { active.current?.abort(); setResults(null); setError(''); setBusy(false); }
  async function search() {
    if (!origin || !destination || origin.code === destination.code) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setResults(null);
    try {
      const response = await plannerFetch(`${apiBaseUrl()}/api/reference/rail/routes?${new URLSearchParams({ origin: origin.code, destination: destination.code })}`, { signal: controller.signal });
      const data = await response.json() as Results;
      if (!Array.isArray(data.trains) || typeof data.total !== 'number') throw new Error('Train results could not be read.');
      if (!controller.signal.aborted) setResults(data);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Train lookup is unavailable.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="booking-summary" aria-label="Historical train reference">
    <button type="button" className="font-semibold underline underline-offset-4" aria-expanded={expanded} onClick={() => setExpanded(previous => !previous)}>{expanded ? 'Hide' : 'Explore'} historical train routes</button>
    <p className="mt-2 text-sm leading-relaxed">Reference only: current departures, operating days, fares and seats are unverified. These results do not change your itinerary or confirm a booking.</p>
    {expanded && <div className="mt-4 space-y-4">
      <div className="booking-grid">
        <StationSearch label="Boarding station" initialQuery={originCity === 'bengaluru' ? 'bangalore' : originCity} value={origin} onChange={station => { invalidate(); setOrigin(station); }} />
        <StationSearch label="Arrival station" initialQuery={destinationCity === 'bengaluru' ? 'bangalore' : destinationCity} value={destination} onChange={station => { invalidate(); setDestination(station); }} />
      </div>
      <button type="button" disabled={busy || !origin || !destination || origin.code === destination.code} onClick={() => void search()} className="rounded-lg bg-[#243e33] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Looking up trains…' : 'Find historical direct trains'}</button>
      {origin && destination && origin.code === destination.code && <p role="status">Choose different boarding and arrival stations.</p>}
      {error && <p role="alert">{error} You can continue planning without this lookup.</p>}
      {results && <div aria-live="polite">
        <p className="mb-3 text-sm leading-relaxed">{results.notice}</p>
        {!results.trains.length && <p>No usable direct trains found in this historical dataset. This does not mean no service exists. Try another terminal or check Indian Railways.</p>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{results.trains.map(train => <article key={train.number} className="min-w-0 rounded-xl border border-[#c6d2c0] bg-[#fffdf5] p-5">
          <p className="text-sm text-[#526653]">Historical timetable · #{train.number}</p>
          <h5 className="mt-1 break-words text-lg font-semibold">{train.name}</h5>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt>Departs · IST</dt><dd className="text-lg font-semibold">{train.departure}</dd><dd>{train.origin.name} ({train.origin.code})</dd></div>
            <div><dt>Arrives · IST</dt><dd className="text-lg font-semibold">{train.arrival}{train.arrival_day_offset > 0 ? ` (+${train.arrival_day_offset} day${train.arrival_day_offset > 1 ? 's' : ''})` : ''}</dd><dd>{train.destination.name} ({train.destination.code})</dd></div>
          </dl>
          <p className="mt-3">{Math.floor(train.duration_minutes / 60)}h {train.duration_minutes % 60}m · Fare unavailable</p>
        </article>)}</div>
        {results.total > results.trains.length && <p className="mt-3">Showing the 20 shortest reference journeys out of {results.total} matches.</p>}
      </div>}
      <p className="text-sm"><a className="underline" href="https://github.com/datameet/railways" target="_blank" rel="noopener noreferrer">DataMeet · CC0 · collection date unknown</a> · <a className="underline" href="https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.jsp" target="_blank" rel="noopener noreferrer">Check current reserved-train schedules ↗</a></p>
    </div>}
  </section>;
}
