'use client';
import type { StayChoice } from '../types/trip';
import ThemedSelect from './ThemedSelect';

export default function StayChoiceFields({ value, onChange }: { value?: StayChoice; onChange: (value: StayChoice | undefined) => void }) {
  return <section className="booking-section" aria-label="Accommodation and budget scope">
    <h4>Where will you stay?</h4>
    <ThemedSelect label="Accommodation" value={value?.kind || 'planner_selected'} options={[
      { value: 'planner_selected', label: 'Suggest a stay for me' }, { value: 'booked', label: 'I already booked a stay' },
      { value: 'family_friends', label: 'Staying with family or friends' }, { value: 'no_stay', label: 'No accommodation arranged' },
    ]} onChange={kind => onChange(kind === 'planner_selected' ? undefined : {
      version: 1, kind: kind as StayChoice['kind'], base_name: value?.base_name || '', lat: value?.lat ?? NaN, lng: value?.lng ?? NaN,
      total_stay_cost_inr: kind === 'booked' ? value?.total_stay_cost_inr || 0 : 0,
      budget_treatment: kind === 'booked' ? value?.budget_treatment || 'include' : 'include',
    })} />
    {value ? <>
      <p className="step-note">Every sightseeing day starts and ends at this base. Confirm its map pin within 100 km of the destination center. A base is not proof of a booking or overnight accommodation.</p>
      <div className="booking-grid">
        <label>Daily base name<input maxLength={160} value={value.base_name} placeholder="Your hotel or meeting point" onChange={event => onChange({ ...value, base_name: event.target.value })} /></label>
        <div><p className="step-note">Copy latitude and longitude from your confirmed map pin. Latitude comes first; do not enter an address in these fields.</p>{Number.isFinite(value.lat) && Number.isFinite(value.lng) && <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=16/${value.lat}/${value.lng}`}>Check this pin on OpenStreetMap ↗</a>}</div>
        <label>Latitude<input type="number" step="any" min={-90} max={90} value={Number.isFinite(value.lat) ? value.lat : ''} placeholder="e.g. 17.385" onChange={event => onChange({ ...value, lat: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
        <label>Longitude<input type="number" step="any" min={-180} max={180} value={Number.isFinite(value.lng) ? value.lng : ''} placeholder="e.g. 78.486" onChange={event => onChange({ ...value, lng: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
        {value.kind === 'booked' && <>
          <label>Total stay cost for the whole group (₹)<input type="number" min={0} max={5000000} value={value.total_stay_cost_inr} onChange={event => onChange({ ...value, total_stay_cost_inr: Number(event.target.value) })} /><span className="step-note">Enter the full stay total, including any known taxes. This is not a per-night rate.</span></label>
          <ThemedSelect label="Stay cost in your destination budget" value={value.budget_treatment} options={[{ value: 'include', label: 'Count this stay inside my budget' }, { value: 'already_paid', label: 'Already paid; my budget is for remaining costs' }]} onChange={treatment => onChange({ ...value, budget_treatment: treatment as StayChoice['budget_treatment'] })} />
        </>}
      </div>
      <p className="step-note">{value.kind === 'no_stay' ? 'No lodging cost or overnight stay will be added. For a multi-day trip, arrange a safe place to sleep separately.' : 'Confirm occupancy, check-in, luggage storage and the stay dates yourself. The planner uses your supplied location and cost.'} Intercity tickets remain outside this destination budget.</p>
    </> : <p className="step-note">Overnight plans include an estimated stay in the destination budget. Day trips use a representative starting hub without lodging charges.</p>}
  </section>;
}
