'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Compass, AlertCircle, ArrowRight } from 'lucide-react';
import TravelImage from './TravelImage';
import { destinationNames } from '@/lib/travel-media';
import type { CatalogPlace } from '@/lib/place-discovery';
import ThemedSelect from './ThemedSelect';
import PlannerDiscovery from './PlannerDiscovery';
import PlacePlanningSettings from './PlacePlanningSettings';
import JourneyTimingFields from './JourneyTimingFields';
import BookedTransportFields from './BookedTransportFields';
import RailReference from './RailReference';
import StayChoiceFields from './StayChoiceFields';
import PlaceSearch, { SearchOption } from './PlaceSearch';
import InfoTip from './InfoTip';
import { TripFormData } from '../types/trip';
import { apiBaseUrl, boundedFetch, requireApiSuccess } from '@/lib/planner-network';
import { plannerIssues, type PlannerIssue } from '@/lib/planner-validation';
import PlannerField, { PlannerErrors } from './PlannerField';
import PlannerDateField, { PlannerTimeField } from './PlannerDateField';

interface Catalog {
  routing_supported?: boolean;
  routing_configured?: boolean;
  availability_version?: number;
  catalog_counts?: {attraction:number;restaurant:number;hotel:number};
  cities: SearchOption[];
  places: CatalogPlace[];
  interests: string[];
  long_visits: boolean;
  climbing_known: boolean;
  food_available: boolean;
  dietary_options: string[];
  source: string;
}
const futureDate = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const steps = ['Journey', 'Travel style', 'Places & food', 'Review'];
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const defaults: TripFormData = { destination: 'hyderabad', origin_city: '', start_date: '', end_date: '', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', group_profile: 'default', origin_type: 'center', interests: [], locked_activities: [], food_preference: 'any', meal_budget_per_person: 200 };
export default function TripForm({ onSubmit, isLoading, initialValues }: { onSubmit: (data: TripFormData) => void; isLoading: boolean; initialValues?: TripFormData | null }) {
  const [form, setForm] = useState<TripFormData>(defaults);
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [cities, setCities] = useState<SearchOption[]>([]);
  const [citiesError, setCitiesError] = useState('');
  const [pendingFrom, setPendingFrom] = useState(false);
  const [pendingTo, setPendingTo] = useState(false);
  const [retry, setRetry] = useState(0);
  const [issueFields, setIssueFields] = useState<string[]>([]);
  const summary = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof TripFormData>(key: K, value: TripFormData[K]) => setForm(previous => ({ ...previous, [key]: value }));
  useEffect(() => { setForm(initialValues ? { ...defaults, ...initialValues } : { ...defaults, start_date: futureDate(7), end_date: futureDate(9) }); }, [initialValues]);
  useEffect(() => {
    const controller = new AbortController();
    setCitiesError('');
    async function loadCities() {
      try {
        const response = await boundedFetch(`${apiBaseUrl()}/api/planner/cities`, { signal: controller.signal });
        await requireApiSuccess(response);
        const data = await response.json();
        if (!Array.isArray(data.cities)) throw new Error('Could not read city suggestions.');
        if (!controller.signal.aborted) setCities(data.cities);
      } catch (failure) { if (!controller.signal.aborted) setCitiesError(failure instanceof Error ? failure.message : 'City suggestions are unavailable.'); }
    }
    void loadCities();
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setCatalogError('');
    async function load() {
      try {
        const response = await boundedFetch(`${apiBaseUrl()}/api/planner/catalog?destination=${encodeURIComponent(form.destination)}`, { signal: controller.signal });
        await requireApiSuccess(response);
        const data = await response.json() as Catalog;
        if (!Array.isArray(data.cities) || !Array.isArray(data.places) || !Array.isArray(data.interests)) throw new Error('The place catalog could not be read. Please retry.');
        if (!controller.signal.aborted) { setCatalog(data); setCities(data.cities); }
      } catch (failure) { if (!controller.signal.aborted) setCatalogError(failure instanceof Error ? failure.message : 'Could not load places.'); }
    }
    void load(); return () => controller.abort();
  }, [form.destination, retry]);
  const evaluated = plannerIssues(form, {today:futureDate(0),cities:cities.map(city=>city.value),catalogReady:!!catalog,pendingFrom,pendingTo});
  const issues=evaluated.filter(issue=>issueFields.includes(issue.field));
  const reveal=(element:HTMLElement|null)=>{
    if(!element)return;
    let parent:HTMLElement|null=element;
    while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
    element.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    const focus=element.matches('input,button,select,textarea')?element:element.querySelector<HTMLElement>('input,button,select,textarea,[tabindex]');
    (focus||element).focus({preventScroll:true});
  };
  const goToIssue=(issue:PlannerIssue)=>{setStep(issue.step);requestAnimationFrame(()=>reveal(document.getElementById(issue.field)||document.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)));};
  const move=(next:number)=>{setStep(next);setIssueFields([]);requestAnimationFrame(()=>{heading.current?.scrollIntoView({block:'start',behavior:'auto'});heading.current?.focus({preventScroll:true});});};
  const check=(through:number)=>{
    const problems=evaluated.filter(issue=>issue.step<=through);
    if(!problems.length)return true;
    setIssueFields(problems.map(issue=>issue.field));setStep(problems[0].step);
    requestAnimationFrame(()=>{summary.current?.scrollIntoView({block:'start',behavior:'auto'});summary.current?.focus({preventScroll:true});});
    return false;
  };
  const navigate=(next:number)=>{if(next<=step||check(step))move(next);};
  const submit=(event:React.FormEvent)=>{
    event.preventDefault();if(isLoading||!check(step===3?3:step))return;
    if(step<3){move(step+1);return;}
    onSubmit({...form,origin_city:form.origin_city===form.destination?undefined:form.origin_city||undefined});
  };
  const pins = form.locked_activities || [];
  const changeDestination = (destination: string) => {
    if (destination === form.destination) return;
    setForm(previous => ({ ...previous, destination, stay_choice: undefined, journey_timing: undefined, booked_transport: undefined, external_stops: [], locked_activities: [], preferred_activities: [], interests: [], max_visit_minutes: undefined, avoid_climbing: false, food_preference: 'any' }));
    setNotice('Destination changed. Place selections, stay details and destination preferences have been reset.');
  };
  const pinLabel = (value: string) => form.external_stops?.find(stop=>"discovered:"+stop.place_id===value)?.name || catalog?.places.find(place => place.value === value || place.label === value)?.label || value;

  return <PlannerErrors.Provider value={issues}><form noValidate onSubmit={submit} className="trip-form booking-form bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-6 shadow-xl">
    <header className="booking-header"><div><p className="booking-eyebrow">YOUR JOURNEY, THOUGHTFULLY PLANNED</p><h2>Your trip, your way</h2></div><span>Step {step + 1} of 4</span></header>
    <nav className="trip-stepper" aria-label="Trip setup steps">{steps.map((label, index) => <button key={label} type="button" disabled={isLoading} aria-current={step === index ? 'step' : undefined} onClick={() => navigate(index)} data-has-error={issues.some(issue=>issue.step===index)}><span>{index + 1}</span>{label}{issues.some(issue=>issue.step===index)&&<AlertCircle size={16} aria-label="Needs attention"/>}</button>)}</nav>
    <h3 ref={heading} tabIndex={-1} className="booking-step-title">{['Where are you going?', 'How do you like to travel?', 'Choose places and meals', 'Review your trip'][step]}</h3>
    {issues.length>0&&<div ref={summary} tabIndex={-1} role="alert" className="form-error-summary"><div><AlertCircle size={23}/><h4>Check {issues.length===1?'this detail':`these ${issues.length} details`} to continue</h4></div><p>Your answers are saved in this form. Select a problem below to go straight to it.</p><ul>{issues.map((issue,index)=><li key={issue.field+index}><button type="button" onClick={()=>goToIssue(issue)}><strong>{issue.section} → {issue.label}</strong><span>{issue.message}</span></button></li>)}</ul></div>}
    {notice && <p role="status" className="step-note">{notice}</p>}
    {catalogError ? <div id="trip-catalog" role="alert" className="booking-error">{catalogError} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry city data</button></div> : !catalog && <p id="trip-catalog" tabIndex={-1} role="status" className="step-note">Finding supported cities and places… The service may take a minute to wake up.</p>}
    <fieldset disabled={isLoading} className="booking-fields">
    {step === 0 && <section className="trip-step booking-section" aria-label="Journey details">
      <div className="city-picker" aria-label="Choose a destination">{Object.entries(destinationNames).filter(([value])=>cities.some(city=>city.value===value)).map(([value,label])=><button type="button" key={value} aria-pressed={form.destination===value} onClick={()=>{changeDestination(value);setPendingTo(false);}}><TravelImage destination={value} compact/><span>{label}</span></button>)}</div>
      <p className="step-note">Start with the essentials. Choose a suggestion to confirm each city.</p>
      <div className="booking-grid">
        <PlaceSearch id="trip-from" error={issues.find(issue=>issue.field==='trip-from')?.message} label="From" value={form.origin_city || ''} options={[{ value: '', label: 'Already at the destination' }, ...cities]} onChange={value => setForm(previous => ({ ...previous, origin_city: value, booked_transport: undefined, journey_timing: undefined }))} onPendingChange={setPendingFrom} status={!cities.length ? citiesError || 'Loading city suggestions; you can type now.' : undefined} />
        <PlaceSearch id="trip-to" error={issues.find(issue=>issue.field==='trip-to')?.message} label="To" value={form.destination} options={cities} onChange={changeDestination} onPendingChange={setPendingTo} status={!cities.length ? citiesError || 'Loading city suggestions; you can type now.' : undefined} />
        <PlannerField id="trip-start" label="Plan start date"><PlannerDateField label="Plan start date" value={form.start_date} min={futureDate(0)} onChange={value=>update('start_date',value)}/></PlannerField>
        <PlannerField id="trip-end" label="Plan end date"><PlannerDateField label="Plan end date" value={form.end_date} min={form.start_date||futureDate(0)} onChange={value=>update('end_date',value)}/></PlannerField>
        <PlannerField id="trip-people" label="Travelers"><input type="number" min={1} max={20} value={form.people_count || ''} onChange={event => update('people_count', Number(event.target.value))} /></PlannerField>
        <PlannerField id="trip-budget" label="Whole-group destination budget (₹)"><input type="number" min={1} max={5000000} value={form.budget_inr || ''} onChange={event => update('budget_inr', Number(event.target.value))} /></PlannerField>
      </div>
      <p className="step-note">Covers your stay, local travel, entry fees and planned meals. A stay already paid for is shown separately. Tickets to the city and extra meals cost more. You can include arrival and departure dates. Days without time for visits are shown as travel or rest days.</p>
      {form.origin_city && form.origin_city !== form.destination && <JourneyTimingFields form={form} onChange={value => update('journey_timing', value)} />}
      <PlannerField id="trip-total-budget" label="Total budget for included costs (₹, optional)" hint="Includes booked tickets and prepaid stays, even if already paid. Unknown costs are left out. Leave blank to budget only for your time at the destination."><input type="number" min={1} max={5000000} value={form.whole_journey_budget_inr??''} onChange={event=>update('whole_journey_budget_inr',event.target.value===''?undefined:Number(event.target.value))}/></PlannerField>
      {form.origin_city && form.origin_city !== form.destination && <BookedTransportFields value={form.booked_transport} onChange={value => update('booked_transport', value)} />}
      {!form.booked_transport && form.origin_city && form.origin_city !== form.destination && <fieldset className="booking-summary">
        <legend>Travel to and from the city</legend>
        <p>Choose the modes we may suggest. Select at least one. Ticket estimates cost extra. Check prices and times before booking.</p>
        <div className="transport-mode-choices">{(['train', 'bus', 'flight'] as const).map(mode => {
          const selected = form.intercity_modes ?? ['train', 'bus', 'flight'];
          return <label key={mode} className="mode-chip"><input type="checkbox" checked={selected.includes(mode)} disabled={selected.length === 1 && selected.includes(mode)} onChange={() => update('intercity_modes', selected.includes(mode) ? selected.filter(item => item !== mode) : [...selected, mode])} />{titleCase(mode)}</label>;
        })}</div>
      </fieldset>}
      <StayChoiceFields advancedTiming={catalog?.availability_version===2} value={form.stay_choice} onChange={value => update('stay_choice', value)} />
      {form.origin_city && form.origin_city !== form.destination && <RailReference key={`${form.origin_city}:${form.destination}`} originCity={form.origin_city} destinationCity={form.destination} />}
      <p className="catalog-caption">{catalog?.source}. Search currently covers supported cities only.</p>
    </section>}
    {step === 1 && <section className="trip-step booking-section" aria-label="Travel style">
      <div className="booking-grid">
        <div><div className="trip-field-heading">Travel style<InfoTip title="Group style">Adjusts pacing and fatigue assumptions. It does not certify step-free access.</InfoTip></div><ThemedSelect label="Travel style" value={form.group_profile || 'default'} onChange={value => update('group_profile', value as TripFormData['group_profile'])} options={[{ value: 'default', label: 'A little of everything' }, { value: 'young_solo', label: 'Active explorers' }, { value: 'family', label: 'Family with children' }, { value: 'elderly', label: 'Gentler group travel' }]} /></div>
        <div><div className="trip-field-heading">Sightseeing pace<InfoTip title="Pace">Sets the preferred maximum stops per day. Alternative plans may propose a different pace.</InfoTip></div><ThemedSelect label="Sightseeing pace" value={form.pace} onChange={value => update('pace', value as TripFormData['pace'])} options={[{value:'relaxed',label:'Relaxed · up to 2 visits/day'},{value:'balanced',label:'Balanced · up to 3 visits/day'},{value:'intensive',label:'Full days · up to 4 visits/day'}]} /></div>
        <div><div className="trip-field-heading">Preferred local transport<InfoTip title="Transport">Travel estimates depend on the mode. Alternative plans may suggest a different mode.</InfoTip></div><ThemedSelect label="Local transport" value={form.transport_mode} onChange={value => update('transport_mode', value as TripFormData['transport_mode'])} options={[{value:'cab',label:'Cab / Taxi'},{value:'auto',label:'Auto-rickshaw'},{value:'metro',label:'Metro'},{value:'walk',label:'Walking'}]} /></div>
      </div>
      {catalog?.routing_supported&&<label className="booking-check toggle-choice" id="road-routing"><input type="checkbox" disabled={catalog.routing_configured===false&&!form.use_road_routes} checked={form.use_road_routes===true} onChange={e=>update('use_road_routes',e.target.checked)}/><span><strong>Use road routes when available</strong><small>Share candidate place and base map coordinates with Geoapify to estimate road travel. {catalog.routing_configured===false?'Road service is not configured on this server; distance estimates will be used. ':''}Free limits apply. Fares and traffic remain estimates; metro uses a general estimate. If routing fails, we show the distance-based fallback.</small></span></label>}
      <details className="booking-more" id="comfort-options"><summary>More about your group’s comfort</summary>
        {catalog?.long_visits && <div><label>How long is your group comfortable spending at one stop?</label><ThemedSelect label="Maximum visit length" value={String(form.max_visit_minutes || '')} onChange={value => update('max_visit_minutes', value ? Number(value) : undefined)} options={[{value:'',label:'No limit'},{value:'90',label:'Up to 90 minutes'},{value:'120',label:'Up to 2 hours'},{value:'180',label:'Up to 3 hours'}]} /><p className="step-note">Based on this destination’s catalog visit lengths. Longer stops will be excluded.</p></div>}
        {catalog?.climbing_known ? <label className="booking-check"><input type="checkbox" checked={form.avoid_climbing || false} onChange={event => update('avoid_climbing', event.target.checked)} />Avoid climbs and stops with unknown climbing requirements</label> : <p className="step-note">Climbing and step-free access have not been verified for this catalog. Check directly with venues if your group needs accessible routes.</p>}
      </details>
    </section>}
    {step === 2 && <section className="trip-step booking-section" aria-label="Places and food">
      <div className="trip-field-heading"><h4>Places you don’t want to miss</h4><InfoTip title="Must-visits">Pinned places are required. If your dates, budget or preferences cannot fit them, we explain the conflict.</InfoTip></div>
      {catalog?.catalog_counts&&<p className="catalog-coverage">{catalog.catalog_counts.attraction} places to visit · {catalog.catalog_counts.restaurant} food stops · {catalog.catalog_counts.hotel} stay options considered by the planner</p>}
      <PlannerDiscovery key={form.destination} destination={form.destination} catalog={catalog?.places || []} estimatePolicy={form.discovery_policy}
        selections={Array.from(new Set([...pins,...(form.preferred_activities||[]),...(form.external_stops||[]).map(stop=>'discovered:'+stop.place_id)])).map(id=>({id,name:pinLabel(id),mandatory:pins.includes(id)}))}
        onCatalogAdd={(id,mandatory)=>setForm(previous=>({...previous,locked_activities:mandatory?Array.from(new Set([...(previous.locked_activities||[]),id])):previous.locked_activities,preferred_activities:mandatory?(previous.preferred_activities||[]).filter(item=>item!==id):Array.from(new Set([...(previous.preferred_activities||[]),id])).slice(0,15)}))}
        disabled={isLoading} capacityReached={pins.length>=15||(form.external_stops||[]).length>=15||(form.preferred_activities||[]).length>=15}
        onRemove={id=>setForm(previous=>({...previous,locked_activities:(previous.locked_activities||[]).filter(item=>item!==id),preferred_activities:(previous.preferred_activities||[]).filter(item=>item!==id),external_stops:(previous.external_stops||[]).filter(stop=>'discovered:'+stop.place_id!==id)}))}
        onTogglePin={id=>setForm(previous=>{
          const required=previous.locked_activities||[], optional=previous.preferred_activities||[];
          if(!required.includes(id)&&required.length>=15)return previous;
          if(required.includes(id)&&optional.length>=15)return previous;
          return {...previous,locked_activities:required.includes(id)?required.filter(item=>item!==id):[...required,id],preferred_activities:required.includes(id)?Array.from(new Set([...optional,id])):optional.filter(item=>item!==id)};
        })}
        onConfirm={(stop,mandatory)=>setForm(previous=>{
          if((previous.external_stops||[]).some(item=>item.place_id===stop.place_id)||(previous.external_stops||[]).length>=15||(mandatory&&(previous.locked_activities||[]).length>=15))return previous;
          return {...previous,external_stops:[...(previous.external_stops||[]),stop],preferred_activities:mandatory?previous.preferred_activities:Array.from(new Set([...(previous.preferred_activities||[]),'discovered:'+stop.place_id])).slice(0,15),locked_activities:mandatory?[...(previous.locked_activities||[]),'discovered:'+stop.place_id]:previous.locked_activities};
        })}/>
      <PlacePlanningSettings form={form} interests={catalog?.interests||[]} dietaryOptions={catalog?.dietary_options||[]} onChange={changes=>setForm(previous=>({...previous,...changes}))}/>

    </section>}
    {step === 3 && <section className="trip-step booking-section" aria-label="Review your trip">
      <div className="booking-summary"><h4>{titleCase(form.origin_city || 'Already there')} → {titleCase(form.destination)}</h4><p>{form.start_date} to {form.end_date} · {form.people_count} travelers · ₹{form.budget_inr.toLocaleString('en-IN')} destination budget</p><p>{titleCase(form.pace)} pace · {titleCase(form.transport_mode)} · {pins.length} must-visits</p><p>{pins.map(pinLabel).join(' · ') || 'Let the planner select the stops'}</p>{!!form.preferred_activities?.length&&<p>Optional choices: {form.preferred_activities.map(pinLabel).join(' · ')}</p>}<p>Interests: {form.interests.map(titleCase).join(', ') || 'Open to discovery'} · Food: {titleCase(form.food_preference || 'any')}</p>{form.max_visit_minutes && <p>Maximum {form.max_visit_minutes} minutes per stop</p>}{form.avoid_climbing && <p>Only stops documented as not requiring climbing</p>}</div>
      {form.whole_journey_budget_inr != null && <p>Budget for included costs: ₹{form.whole_journey_budget_inr.toLocaleString('en-IN')}, including already-paid costs. Unknown costs are excluded.</p>}
      {!form.booked_transport && form.origin_city && form.origin_city !== form.destination && <p>Intercity suggestions: {(form.intercity_modes ?? ['train', 'bus', 'flight']).map(titleCase).join(', ')}. Tickets are additional to the destination budget.</p>}
      {form.booked_transport && <p>Booked travel: {titleCase(form.booked_transport.outbound_mode)} outbound, {titleCase(form.booked_transport.return_mode)} return. Whole-group tickets ₹{form.booked_transport.total_fare_inr.toLocaleString('en-IN')}; paid ₹{form.booked_transport.paid_inr.toLocaleString('en-IN')}. Additional to destination budget; user-reported.</p>}
      {form.stay_choice && <div className="booking-summary"><h4>Your daily base: {form.stay_choice.base_name}</h4><p>{titleCase(form.stay_choice.kind)} · {form.stay_choice.lat}, {form.stay_choice.lng}</p><p>Stay total: ₹{form.stay_choice.total_stay_cost_inr.toLocaleString('en-IN')} · {form.stay_choice.budget_treatment === 'already_paid' ? 'Already paid, excluded from remaining destination budget' : 'Included in destination budget'}</p></div>}
      {form.journey_timing && <div className="booking-summary"><h4>Your travel timing · India time</h4><p>Outbound: {form.journey_timing.outbound_departure.slice(0,16).replace('T',' ')} → {form.journey_timing.destination_arrival.slice(0,16).replace('T',' ')}</p><p>Return: {form.journey_timing.destination_departure.slice(0,16).replace('T',' ')} → {form.journey_timing.return_arrival.slice(0,16).replace('T',' ')}</p><p>User-supplied times. Arrival buffer: {form.journey_timing.arrival_buffer_minutes} min; return buffer: {form.journey_timing.departure_buffer_minutes} min. Intercity tickets excluded from destination budget.</p></div>}
      <details className="booking-more"><summary>Arrival, departure and starting point</summary><div className="booking-grid">
        <PlannerField id="trip-arrival-ready" label="Ready to start on arrival day"><PlannerTimeField label="Ready to start" value={minuteTime(form.arrival_available_mins??60)} onChange={value=>update('arrival_available_mins',value?timeMinute(value):undefined)}/></PlannerField>
        <PlannerField id="trip-departure-back" label="Back at base on departure day"><PlannerTimeField label="Back at base" value={minuteTime(form.departure_deadline_mins??720)} onChange={value=>update('departure_deadline_mins',value?timeMinute(value):undefined)}/></PlannerField>
      </div><p>Include check-in and airport/station transfer buffers in these times.</p>{!form.stay_choice && <ThemedSelect label="Starting point" value={form.origin_type || 'center'} onChange={value => update('origin_type', value as TripFormData['origin_type'])} options={[{value:'center',label:'City center'},{value:'station',label:'Railway station'},{value:'airport',label:'Airport'},{value:'hotel',label:'Hotel'}]} />}<p className="step-note">{form.stay_choice ? `Each day starts and ends at your confirmed base: ${form.stay_choice.base_name}.` : 'Day trips start at a representative hub. Overnight trips start from the selected hotel. These are estimated locations.'}</p></details>
      <p className="step-note">We’ll compare up to three plans that fit. Prices, venue hours and travel times use the listed data sources; check current conditions before booking.</p>
    </section>}
    {issues.length>0&&<div className="continue-problem" role="status"><AlertCircle size={20}/><div><strong>{issues[0].section}</strong><p>{issues[0].message}</p></div><button type="button" onClick={()=>goToIssue(issues[0])}>Go to this field <ArrowRight size={16}/></button></div>}
    <div className="trip-step-actions">{step > 0 && <button type="button" className="step-back" onClick={() => move(step - 1)}>Back</button>}<button type="submit" disabled={isLoading || !catalog} className="booking-submit"><Compass size={18} />{isLoading ? 'Creating your trip…' : step < 3 ? 'Continue' : 'Create my trip'}</button></div>
    </fieldset>
    {isLoading && <p role="status" className="step-note">Checking routes, opening hours and the group budget. Your results will appear below.</p>}
  </form></PlannerErrors.Provider>;
}

function minuteTime(min:number){const total=min+480;return `${Math.floor(total/60).toString().padStart(2,"0")}:${(total%60).toString().padStart(2,"0")}`;}
function timeMinute(time:string){return Number(time.slice(0,2))*60+Number(time.slice(3))-480;}
