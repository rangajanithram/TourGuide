'use client';
import type { JourneyTiming, TripFormData } from '../types/trip';
import { journeyWindow } from '../lib/journey-timing';

export default function JourneyTimingFields({ form, onChange }: { form: TripFormData; onChange: (value: JourneyTiming | undefined) => void }) {
  const journey = form.journey_timing;
  const fields = [
    ['outbound_departure', 'Leave your origin'], ['destination_arrival', 'Arrive at destination terminal'],
    ['destination_departure', 'Leave destination terminal'], ['return_arrival', 'Arrive back at origin'],
  ] as const;
  let summary = '';
  if (journey) {
    try {
      const window = journeyWindow(form);
      const clock = (value: number) => `${String(Math.floor((value + 480) / 60)).padStart(2, '0')}:${String((value + 480) % 60).padStart(2, '0')}`;
      summary = `First sightseeing day starts no earlier than ${clock(window.earliest)}. Last day returns to base by ${clock(window.latest)} (India time).`;
    } catch (error) { summary = error instanceof Error ? error.message : 'Check travel timing.'; }
  }
  return <details className="booking-more" open={journey ? true : undefined}>
    <summary>Add your travel timing (optional)</summary>
    <p className="step-note">Use your booked or planned times. All times are India time (Asia/Kolkata, UTC+05:30). Travel can start the previous day. Tickets and transfers are not verified.</p>
    <label><input type="checkbox" checked={!!journey} onChange={event => onChange(event.target.checked ? {
      version: 1, timezone: 'Asia/Kolkata', outbound_departure: '', destination_arrival: '', destination_departure: '', return_arrival: '', arrival_buffer_minutes: 0, departure_buffer_minutes: 0,
    } : undefined)} /> Use these times to constrain sightseeing</label>
    {journey && <>
      <div className="booking-grid">
        {fields.map(([key, label]) => <label key={key}>{label}<input type="datetime-local" step={60} value={journey[key].slice(0,16)} onChange={event => onChange({ ...journey, [key]: event.target.value ? `${event.target.value}+05:30` : '' })} /></label>)}
        <label>Arrival transfer, luggage and rest buffer (minutes)<input type="number" min={0} max={720} value={journey.arrival_buffer_minutes} onChange={event => onChange({ ...journey, arrival_buffer_minutes: Number(event.target.value) })} /></label>
        <label>Return transfer and boarding buffer (minutes)<input type="number" min={0} max={720} value={journey.departure_buffer_minutes} onChange={event => onChange({ ...journey, departure_buffer_minutes: Number(event.target.value) })} /></label>
      </div>
      <p className="step-note">Enter your own buffers; zero reserves no transfer time. Confirm luggage storage and check-in with your stay. The budget below covers destination costs only, excluding intercity tickets.</p>
      <p role="status" className="step-note">{summary}</p>
    </>}
  </details>;
}
