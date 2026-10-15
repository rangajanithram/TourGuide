'use client';
import type { BookedTransport } from '../types/trip';
import ThemedSelect from './ThemedSelect';
const modes = [{ value: 'train', label: 'Train' }, { value: 'bus', label: 'Bus' }, { value: 'flight', label: 'Flight' }];
export default function BookedTransportFields({ value, onChange }: { value?: BookedTransport; onChange: (value: BookedTransport | undefined) => void }) {
  return <fieldset className="booking-summary">
    <legend>Already booked both journeys?</legend>
    <label className="booking-check"><input type="checkbox" checked={!!value} onChange={event => onChange(event.target.checked ? { version: 1, outbound_mode: 'train', return_mode: 'train', total_fare_inr: 0, paid_inr: 0 } : undefined)} />Use my booked outbound and return journeys</label>
    {value && <>
      <p>Add your travel timing above. We will preserve these modes and fares instead of suggesting replacement services. Do not enter booking references or passenger details.</p>
      <div className="booking-grid">
        <ThemedSelect label="Booked outbound mode" value={value.outbound_mode} options={modes} onChange={mode => onChange({ ...value, outbound_mode: mode as BookedTransport['outbound_mode'] })} />
        <ThemedSelect label="Booked return mode" value={value.return_mode} options={modes} onChange={mode => onChange({ ...value, return_mode: mode as BookedTransport['return_mode'] })} />
        <label>Total ticket cost for everyone, both directions (₹)<input type="number" min={0} max={5000000} step={1} value={value.total_fare_inr} onChange={event => onChange({ ...value, total_fare_inr: Number(event.target.value) })} /></label>
        <label>Ticket amount already paid (₹)<input type="number" min={0} max={value.total_fare_inr} step={1} value={value.paid_inr} onChange={event => onChange({ ...value, paid_inr: Number(event.target.value) })} /></label>
      </div>
      <p>These fares are additional to your destination budget. Tickets, availability and payments are user-reported and are not verified by TripWeave.</p>
    </>}
  </fieldset>;
}
