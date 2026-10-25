'use client';
import type { StayChoice } from '../types/trip';
import ThemedSelect from './ThemedSelect';
import ChoiceCards from './ChoiceCards';
import PlannerField, { FieldMessage } from './PlannerField';
import PlannerDateField, { PlannerTimeField } from './PlannerDateField';

export default function StayChoiceFields({ value, onChange, advancedTiming=false }: { value?: StayChoice; onChange: (value: StayChoice | undefined) => void; advancedTiming?: boolean }) {
  return <section id="stay-settings" tabIndex={-1} className="booking-section" aria-label="Accommodation and budget scope">
    <h4>Where will you stay?</h4><FieldMessage id="stay-settings"/>
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
        <PlannerField id="stay-name" label="Daily base name"><input maxLength={160} value={value.base_name} placeholder="Your hotel or meeting point" onChange={event => onChange({ ...value, base_name: event.target.value })} /></PlannerField>
        <div><p className="step-note">Copy latitude and longitude from your confirmed map pin. Latitude comes first; do not enter an address in these fields.</p>{Number.isFinite(value.lat) && Number.isFinite(value.lng) && <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=16/${value.lat}/${value.lng}`}>Check this pin on OpenStreetMap ↗</a>}</div>
        <PlannerField id="stay-lat" label="Latitude"><input type="number" step="any" min={-90} max={90} value={Number.isFinite(value.lat) ? value.lat : ''} placeholder="e.g. 17.385" onChange={event => onChange({ ...value, lat: event.target.value === '' ? NaN : Number(event.target.value) })} /></PlannerField>
        <PlannerField id="stay-lng" label="Longitude"><input type="number" step="any" min={-180} max={180} value={Number.isFinite(value.lng) ? value.lng : ''} placeholder="e.g. 78.486" onChange={event => onChange({ ...value, lng: event.target.value === '' ? NaN : Number(event.target.value) })} /></PlannerField>
        {value.kind === 'booked' && <>
          <PlannerField id="stay-cost" label="Total stay cost for everyone (₹)" hint="Full stay total, including known taxes. Not a per-night rate."><input type="number" min={0} max={5000000} value={value.total_stay_cost_inr} onChange={event => onChange({ ...value, total_stay_cost_inr: Number(event.target.value) })} /></PlannerField>
          <ThemedSelect label="Stay cost in your destination budget" value={value.budget_treatment} options={[{ value: 'include', label: 'Count this stay inside my budget' }, { value: 'already_paid', label: 'Already paid; my budget is for remaining costs' }]} onChange={treatment => onChange({ ...value, budget_treatment: treatment as StayChoice['budget_treatment'] })} />
          <label className="booking-check"><input type="checkbox" checked={value.constrain_sightseeing_to_stay === true} onChange={event => onChange({ ...value, constrain_sightseeing_to_stay: event.target.checked })} /> Start the first day after check-in and return to base before checkout on the last day</label>
          <p className="step-note">Add the actual dates below when your stay starts earlier or ends later than sightseeing. Without dates, these times apply to the first and last trip dates. Time for check-in, packing and rest is reserved when this option is on.</p>
          {advancedTiming&&<>
          <PlannerField id="stay-check-in-date" label="Check-in date (optional)"><PlannerDateField label="Check-in date" value={value.check_in_date || ''} onChange={date=>onChange({...value,check_in_date:date})}/></PlannerField>
          <PlannerField id="stay-check-out-date" label="Check-out date (optional)"><PlannerDateField label="Check-out date" value={value.check_out_date || ''} min={value.check_in_date || undefined} onChange={date=>onChange({...value,check_out_date:date})}/></PlannerField>
          {(value.check_in_date || value.check_out_date)&&<button type="button" onClick={()=>onChange({...value,check_in_date:undefined,check_out_date:undefined})}>Clear stay dates</button>}
          </>}
          <PlannerField id="stay-check-in" label="Check-in time (optional)"><PlannerTimeField label="Check-in time" value={value.check_in_time || ''} onChange={time => onChange({ ...value, check_in_time: time || undefined })}/></PlannerField>
          <PlannerField id="stay-check-out" label="Check-out time (optional)"><PlannerTimeField label="Check-out time" value={value.check_out_time || ''} onChange={time => onChange({ ...value, check_out_time: time || undefined })}/></PlannerField>
          {advancedTiming&&value.constrain_sightseeing_to_stay&&<>
            <PlannerField id="stay-check-in-buffer" label="Extra check-in and rest time (minutes)"><input type="number" min={0} max={180} value={value.check_in_buffer_minutes??0} onChange={e=>onChange({...value,check_in_buffer_minutes:Number(e.target.value)})}/></PlannerField>
            <PlannerField id="stay-check-out-buffer" label="Time to pack and check out (minutes)"><input type="number" min={0} max={180} value={value.check_out_buffer_minutes??0} onChange={e=>onChange({...value,check_out_buffer_minutes:Number(e.target.value)})}/></PlannerField>
          </>}
          {!value.constrain_sightseeing_to_stay&&<ThemedSelect label="Luggage storage before check-in or after check-out" value={value.allows_bag_drop==null?'unknown':value.allows_bag_drop?'yes':'no'} options={[{value:'unknown',label:'Not confirmed yet'},{value:'yes',label:'The stay confirmed storage'},{value:'no',label:'I will manage my bags myself'}]} onChange={choice=>onChange({...value,allows_bag_drop:choice==='unknown'?null:choice==='yes'})}/>}
        </>}
      </div>
      <p className="step-note">{value.kind === 'no_stay' ? 'No stay or hotel cost will be added. For a multi-day trip, arrange a safe place to sleep separately.' : 'Check room capacity, check-in times, luggage storage and your stay dates. The planner uses your supplied location and cost.'} Tickets between cities cost extra.</p>
    </> : <p className="step-note">Overnight plans include an estimated stay in the destination budget. Day trips start at a nearby meeting point and have no hotel cost.</p>}
  </section>;
}
