'use client';
import type { JourneyTiming, TripFormData } from '../types/trip';
import { journeyWindow } from '../lib/journey-timing';
import PlannerField, { FieldMessage } from './PlannerField';
import { PlannerDateTimeField } from './PlannerDateField';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export default function JourneyTimingFields({ form, onChange }: { form: TripFormData; onChange: (value: JourneyTiming | undefined) => void }) {
  const journey=form.journey_timing;
  const timing=(key:'outbound_departure'|'destination_arrival'|'destination_departure'|'return_arrival',label:string)=>journey&&<PlannerField id={`timing-${key}`} label={label}><PlannerDateTimeField label={label} value={journey[key]} onChange={value=>onChange({...journey,[key]:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?`${value}+05:30`:value})}/></PlannerField>;
  const extra=(key:'arrival_transfer_minutes'|'departure_transfer_minutes'|'arrival_transfer_cost_inr'|'departure_transfer_cost_inr'|'arrival_transfer_paid_inr'|'departure_transfer_paid_inr'|'arrival_buffer_minutes'|'departure_buffer_minutes',label:string,optional=false)=>journey&&<PlannerField id={`timing-${key}`} label={label}><input type="number" min={0} max={key.includes('inr')?500000:720} value={journey[key]??(optional?'':0)} placeholder={optional?'Unknown':''} onChange={event=>onChange({...journey,[key]:optional&&event.target.value===''?null:Number(event.target.value)})}/></PlannerField>;
  let summary='';
  if(journey)try{const window=journeyWindow(form);const clock=(n:number)=>`${String(Math.floor((n+480)/60)).padStart(2,'0')}:${String((n+480)%60).padStart(2,'0')}`;summary=`Sightseeing starts from ${clock(window.earliest)} on your first day. Be back at your base by ${clock(window.latest)} on your last day.`;}catch{/* Field errors appear when the user continues. */}
  return <details className="booking-more journey-timing" id="timing-settings" open={journey?true:undefined}>
    <summary>Add your travel timing (optional)</summary>
    <p className="step-note">Know your travel times? Add all four below so we can plan your first and last days. All times use India time. Leave this switched off if you do not know yet.</p>
    <label className="booking-check toggle-choice"><input type="checkbox" checked={!!journey} onChange={event=>onChange(event.target.checked?{version:1,timezone:'Asia/Kolkata',outbound_departure:'',destination_arrival:'',destination_departure:'',return_arrival:'',arrival_buffer_minutes:0,departure_buffer_minutes:0}:undefined)}/><span><strong>Use my travel times</strong><small>Switch off to plan full sightseeing days instead.</small></span></label><FieldMessage id="timing-settings"/>
    {journey&&<>
      <div className="journey-leg-grid">
        <section className="journey-leg"><h4><ArrowUpRight size={20}/>Going to your destination</h4>{timing('outbound_departure','Leave your origin')}{timing('destination_arrival','Arrive at destination')}</section>
        <section className="journey-leg"><h4><ArrowDownLeft size={20}/>Coming back home</h4>{timing('destination_departure','Leave destination')}{timing('return_arrival','Arrive back at origin')}</section>
      </div>
      <details className="booking-more transfer-fields"><summary>Transfers, rest time and fares (optional)</summary><p>Allow time between the station or airport and your daily base. Add extra time for luggage, rest and boarding. Fares below are for everyone together.</p>
        <div className="journey-leg-grid"><section className="journey-leg"><h4>On arrival</h4>{extra('arrival_transfer_minutes','Travel to your base (minutes)')}{extra('arrival_buffer_minutes','Extra time for luggage and rest (minutes)')}{extra('arrival_transfer_cost_inr','Transfer fare (₹, optional)',true)}{extra('arrival_transfer_paid_inr','Transfer amount already paid (₹)',true)}</section><section className="journey-leg"><h4>Before leaving</h4>{extra('departure_transfer_minutes','Travel to station or airport (minutes)')}{extra('departure_buffer_minutes','Extra time for boarding (minutes)')}{extra('departure_transfer_cost_inr','Transfer fare (₹, optional)',true)}{extra('departure_transfer_paid_inr','Transfer amount already paid (₹)',true)}</section></div>
        <p className="step-note">Leave a fare blank if unknown; use 0 if free. Known fares count toward your total budget. Check luggage storage and transfers yourself. Tickets and travel times are not verified.</p>
      </details>
      {summary&&<p role="status" className="timing-preview">{summary} These times include your transfer and rest buffers.</p>}
    </>}
  </details>;
}
