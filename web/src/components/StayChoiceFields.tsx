'use client';
import type { StayChoice } from '../types/trip';
import ThemedSelect from './ThemedSelect';
import ChoiceCards from './ChoiceCards';

export default function StayChoiceFields({ value, onChange }: { value?: StayChoice; onChange: (value: StayChoice | undefined) => void }) {
  return <section className="booking-section" aria-label="Accommodation and budget scope">
    <h4>Where will you stay?</h4>
    <ChoiceCards label="Accommodation" value={value?.kind || 'planner_selected'} options={[
      { value: 'planner_selected', label: 'Suggest a stay for me', description: 'Compare estimated stays through the itinerary options. Live rooms and prices are not confirmed.' }, { value: 'booked', label: 'I already booked a stay', description: 'Use your hotel location, whole-group price and check-in details.' },
      { value: 'family_friends', label: 'Staying with family or friends', description: 'Plan from your confirmed base without a hotel charge.' }, { value: 'no_stay', label: 'No accommodation arranged', description: 'Use a meeting point; arrange overnight accommodation separately.' },
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
          <label><input type="checkbox" checked={value.constrain_sightseeing_to_stay === true} onChange={event => onChange({ ...value, constrain_sightseeing_to_stay: event.target.checked })} /> Start the first day after check-in and return to base before checkout on the last day</label>
          <p className="step-note">Enable only when these check-in/out dates match your first and last sightseeing dates. This reserves the room-access window; confirm luggage storage and terminal transfers separately.</p>
          <label>Check-in time (optional)<input type="time" value={value.check_in_time || ''} onChange={event => onChange({ ...value, check_in_time: event.target.value || undefined })} /></label>
          <label>Check-out time (optional)<input type="time" value={value.check_out_time || ''} onChange={event => onChange({ ...value, check_out_time: event.target.value || undefined })} /></label>
        </>}
      </div>
      <p className="step-note">{value.kind === 'no_stay' ? 'No lodging cost or overnight stay will be added. For a multi-day trip, arrange a safe place to sleep separately.' : 'Confirm occupancy, check-in, luggage storage and the stay dates yourself. The planner uses your supplied location and cost.'} Intercity tickets remain outside this destination budget.</p>
    </> : <p className="step-note">Overnight plans include an estimated stay in the destination budget. Day trips use a representative starting hub without lodging charges.</p>}
  </section>;
}
