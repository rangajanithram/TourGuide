'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Compass, Pin, Sparkles, X } from 'lucide-react';
import ThemedSelect from './ThemedSelect';
import PlaceSearch, { SearchOption } from './PlaceSearch';
import InfoTip from './InfoTip';
import { TripFormData } from '../types/trip';
import { apiBaseUrl, boundedFetch, requireApiSuccess } from '@/lib/planner-network';

interface Catalog {
  cities: SearchOption[];
  places: (SearchOption & { type: string; duration: number })[];
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
const defaults: TripFormData = { destination: 'hyderabad', origin_city: '', start_date: '', end_date: '', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', group_profile: 'default', origin_type: 'center', interests: [], locked_activities: [], food_preference: 'any' };
export default function TripForm({ onSubmit, isLoading, initialValues }: { onSubmit: (data: TripFormData) => void; isLoading: boolean; initialValues?: TripFormData | null }) {
  const [form, setForm] = useState<TripFormData>(defaults);
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [surprise, setSurprise] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof TripFormData>(key: K, value: TripFormData[K]) => setForm(previous => ({ ...previous, [key]: value }));
  useEffect(() => { setForm(initialValues ? { ...defaults, ...initialValues } : { ...defaults, start_date: futureDate(7), end_date: futureDate(9) }); }, [initialValues]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setCatalogError('');
    async function load() {
      try {
        const response = await boundedFetch(`${apiBaseUrl()}/api/planner/catalog?destination=${encodeURIComponent(form.destination)}`, { signal: controller.signal });
        await requireApiSuccess(response);
        const data = await response.json() as Catalog;
        if (!Array.isArray(data.cities) || !Array.isArray(data.places) || !Array.isArray(data.interests)) throw new Error('The place catalog could not be read. Please retry.');
        if (!controller.signal.aborted) setCatalog(data);
      } catch (failure) { if (!controller.signal.aborted) setCatalogError(failure instanceof Error ? failure.message : 'Could not load places.'); }
    }
    void load(); return () => controller.abort();
  }, [form.destination, retry]);
  const move = (next: number) => { setStep(next); setError(''); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); };
  const validate = () => {
    if (!catalog) return 'Wait for the destination catalog, or retry loading it.';
    if (!catalog.cities.some(city => city.value === form.destination) || (form.origin_city && !catalog.cities.some(city => city.value === form.origin_city))) return 'Choose a supported city from the suggestions.';
    if (!form.start_date || !form.end_date || form.start_date < futureDate(0) || form.end_date < form.start_date) return 'Choose valid dates, starting today or later.';
    if ((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000 >= 14) return 'Plan up to 14 days at a time.';
    if (!Number.isInteger(form.people_count) || form.people_count < 1 || form.people_count > 20) return 'Enter between 1 and 20 travelers.';
    if (!Number.isInteger(form.budget_inr) || form.budget_inr < 1 || form.budget_inr > 5000000) return 'Enter a group budget between ₹1 and ₹50,00,000.';
    if ((form.locked_activities?.length || 0) > 15) return 'Choose up to 15 must-visit places.';
    return '';
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (isLoading) return;
    const problem = validate(); if (problem) { setError(problem); return; }
    if (step < 3) { move(step + 1); return; }
    onSubmit({ ...form, origin_city: form.origin_city === form.destination ? undefined : form.origin_city || undefined });
  };
  const pins = form.locked_activities || [];
  const changeDestination = (destination: string) => {
    if (destination === form.destination) return;
    setForm(previous => ({ ...previous, destination, locked_activities: [], interests: [], max_visit_minutes: undefined, avoid_climbing: false, food_preference: 'any' }));
    setNotice('Destination changed. Place selections and destination preferences have been reset.'); setSurprise(false);
  };
  const pinLabel = (value: string) => catalog?.places.find(place => place.value === value || place.label === value)?.label || value;
  const remaining = catalog?.places.filter(place => !pins.includes(place.value) && !pins.includes(place.label)) || [];
  return <form noValidate onSubmit={submit} className="trip-form booking-form bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-6 shadow-xl">
    <header className="booking-header"><div><p className="booking-eyebrow">YOUR JOURNEY, THOUGHTFULLY PLANNED</p><h2>Your trip, your way</h2></div><span>Step {step + 1} of 4</span></header>
    <nav className="trip-stepper" aria-label="Trip setup steps">{steps.map((label, index) => <button key={label} type="button" disabled={isLoading} aria-current={step === index ? 'step' : undefined} onClick={() => move(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <h3 ref={heading} tabIndex={-1} className="booking-step-title">{['Where will the journey take you?', 'Find your group’s rhythm', 'Make room for your favorites', 'A quick check before we plan'][step]}</h3>
    {error && <p role="alert" className="booking-error">{error}</p>}
    {notice && <p role="status" className="step-note">{notice}</p>}
    {catalogError ? <div role="alert" className="booking-error">{catalogError} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry catalog</button></div> : !catalog && <p role="status" className="step-note">Finding supported cities and places… The service may take a minute to wake up.</p>}
    <fieldset disabled={isLoading} className="booking-fields">
    {step === 0 && <section className="trip-step booking-section" aria-label="Journey details">
      <p className="step-note">Start with the essentials. Choose a suggestion to confirm each city.</p>
      <div className="booking-grid">
        <PlaceSearch label="From" value={form.origin_city || ''} options={[{ value: '', label: 'Already at the destination' }, ...(catalog?.cities || [])]} onChange={value => update('origin_city', value)} disabled={!catalog} />
        <PlaceSearch label="To" value={form.destination} options={catalog?.cities || []} onChange={changeDestination} disabled={!catalog} />
        <label>Start date<input type="date" value={form.start_date} min={futureDate(0)} onChange={event => update('start_date', event.target.value)} /></label>
        <label>End date<input type="date" value={form.end_date} min={form.start_date || futureDate(0)} onChange={event => update('end_date', event.target.value)} /></label>
        <label>Travelers<input type="number" min={1} max={20} value={form.people_count || ''} onChange={event => update('people_count', Number(event.target.value))} /></label>
        <label>Whole-group destination budget (₹)<input type="number" min={1} max={5000000} value={form.budget_inr || ''} onChange={event => update('budget_inr', Number(event.target.value))} /></label>
      </div>
      <p className="step-note">Includes lodging, local travel, entry fees and scheduled dining. Travel to the city and extra meals are estimated separately. Dates are sightseeing days; allow for your arrival journey.</p>
      <p className="catalog-caption">{catalog?.source}. Search currently covers supported cities only.</p>
    </section>}
    {step === 1 && <section className="trip-step booking-section" aria-label="Travel style">
      <div className="booking-grid">
        <div><div className="trip-field-heading">Travel style<InfoTip title="Group style">Adjusts pacing and fatigue assumptions. It does not certify step-free access.</InfoTip></div><ThemedSelect label="Travel style" value={form.group_profile || 'default'} onChange={value => update('group_profile', value as TripFormData['group_profile'])} options={[{ value: 'default', label: 'A little of everything' }, { value: 'young_solo', label: 'Active explorers' }, { value: 'family', label: 'Family with children' }, { value: 'elderly', label: 'Gentler group travel' }]} /></div>
        <div><div className="trip-field-heading">Sightseeing pace<InfoTip title="Pace">Sets the preferred maximum stops per day. Alternative plans may propose a different pace.</InfoTip></div><ThemedSelect label="Sightseeing pace" value={form.pace} onChange={value => update('pace', value as TripFormData['pace'])} options={[{value:'relaxed',label:'Relaxed · up to 2 visits/day'},{value:'balanced',label:'Balanced · up to 3 visits/day'},{value:'intensive',label:'Full days · up to 4 visits/day'}]} /></div>
        <div><div className="trip-field-heading">Preferred local transport<InfoTip title="Transport">Travel estimates depend on the mode. Alternative plans may suggest a different mode.</InfoTip></div><ThemedSelect label="Local transport" value={form.transport_mode} onChange={value => update('transport_mode', value as TripFormData['transport_mode'])} options={[{value:'cab',label:'Cab / Taxi'},{value:'auto',label:'Auto-rickshaw'},{value:'metro',label:'Metro'},{value:'walk',label:'Walking'}]} /></div>
      </div>
      <details className="booking-more"><summary>More about your group’s comfort</summary>
        {catalog?.long_visits && <div><label>How long is your group comfortable spending at one stop?</label><ThemedSelect label="Maximum visit length" value={String(form.max_visit_minutes || '')} onChange={value => update('max_visit_minutes', value ? Number(value) : undefined)} options={[{value:'',label:'No limit'},{value:'90',label:'Up to 90 minutes'},{value:'120',label:'Up to 2 hours'},{value:'180',label:'Up to 3 hours'}]} /><p className="step-note">Based on this destination’s catalog visit lengths. Longer stops will be excluded.</p></div>}
        {catalog?.climbing_known ? <label className="booking-check"><input type="checkbox" checked={form.avoid_climbing || false} onChange={event => update('avoid_climbing', event.target.checked)} />Avoid climbs and stops with unknown climbing requirements</label> : <p className="step-note">Climbing and step-free access have not been verified for this catalog. Check directly with venues if your group needs accessible routes.</p>}
      </details>
    </section>}
    {step === 2 && <section className="trip-step booking-section" aria-label="Places and food">
      <div className="trip-field-heading"><h4>Places you don’t want to miss</h4><InfoTip title="Must-visits">Pinned places are required. If your dates, budget or preferences cannot fit them, we explain the conflict.</InfoTip></div>
      <PlaceSearch label="Search and pin a place" value="" placeholder="Start typing a place name…" options={remaining} disabled={!catalog || pins.length >= 15} onChange={value => update('locked_activities', [...pins, value])} />
      <div className="booking-chips">{pins.map(pin => <button type="button" key={pin} onClick={() => update('locked_activities', pins.filter(item => item !== pin))} aria-label={`Remove ${pinLabel(pin)}`}><Pin size={14} />{pinLabel(pin)}<X size={14} /></button>)}</div>
      <button type="button" className="surprise-choice" aria-pressed={surprise} onClick={() => { setSurprise(!surprise); if (!surprise) update('interests', []); }}><Sparkles size={18} />{surprise ? 'Surprise me is on · your pins stay' : 'Surprise me with the remaining stops'}</button>
      <p className="step-note">{surprise ? 'No interest ranking: the planner chooses from feasible catalog stops. Your budget, comfort preferences and pins still apply.' : 'Pins are optional. The planner fills the remaining time around your interests.'}</p>
      <div><h4>What do you enjoy?</h4><div className="booking-chips">{(catalog?.interests || []).slice(0, 6).map(tag => <button type="button" key={tag} aria-pressed={form.interests.includes(tag)} onClick={() => { setSurprise(false); update('interests', form.interests.includes(tag) ? form.interests.filter(item => item !== tag) : [...form.interests, tag].slice(0,20)); }}>{titleCase(tag)}</button>)}</div>
      {(catalog?.interests.length || 0) > 6 && <details className="booking-more"><summary>View more interests</summary><div className="booking-chips">{catalog?.interests.slice(6).map(tag => <button type="button" key={tag} aria-pressed={form.interests.includes(tag)} onClick={() => { setSurprise(false); update('interests', form.interests.includes(tag) ? form.interests.filter(item => item !== tag) : [...form.interests, tag].slice(0,20)); }}>{titleCase(tag)}</button>)}</div></details>}</div>
      {catalog?.food_available && <div><div className="trip-field-heading">Food plans<InfoTip title="Food preferences">Only catalog restaurants with explicit dietary evidence can match a dietary preference. Confirm allergies directly with the restaurant.</InfoTip></div><ThemedSelect label="Food plans" value={form.food_preference || 'any'} onChange={value => update('food_preference', value as TripFormData['food_preference'])} options={[{value:'any',label:'Open to catalog dining suggestions'},...catalog.dietary_options.map(value => ({value,label:titleCase(value)})),{value:'own_meals',label:'I’ll arrange meals myself'}]} /><p className="step-note">{catalog.dietary_options.length ? 'Only documented dietary choices are listed.' : 'Dietary suitability is not verified yet. Arrange your own meals if you have specific dietary needs.'} Meal stops are subject to time and budget.</p></div>}
    </section>}
    {step === 3 && <section className="trip-step booking-section" aria-label="Review your trip">
      <div className="booking-summary"><h4>{titleCase(form.origin_city || 'Already there')} → {titleCase(form.destination)}</h4><p>{form.start_date} to {form.end_date} · {form.people_count} travelers · ₹{form.budget_inr.toLocaleString('en-IN')} destination budget</p><p>{titleCase(form.pace)} pace · {titleCase(form.transport_mode)} · {pins.length} must-visits</p><p>{pins.map(pinLabel).join(' · ') || 'Let the planner select the stops'}</p><p>Interests: {form.interests.map(titleCase).join(', ') || 'Open to discovery'} · Food: {titleCase(form.food_preference || 'any')}</p>{form.max_visit_minutes && <p>Maximum {form.max_visit_minutes} minutes per stop</p>}{form.avoid_climbing && <p>Only stops documented as not requiring climbing</p>}</div>
      <details className="booking-more"><summary>Arrival and starting point</summary><ThemedSelect label="Starting point" value={form.origin_type || 'center'} onChange={value => update('origin_type', value as TripFormData['origin_type'])} options={[{value:'center',label:'City center'},{value:'station',label:'Railway station'},{value:'airport',label:'Airport'},{value:'hotel',label:'Hotel'}]} /><p className="step-note">Day trips start at a representative hub. Overnight trips start from the selected hotel. These are estimated locations.</p></details>
      <p className="step-note">We’ll compare up to three feasible options. Prices, venue hours and travel times use the listed data sources; check current conditions before booking.</p>
    </section>}
    <div className="trip-step-actions">{step > 0 && <button type="button" className="step-back" onClick={() => move(step - 1)}>Back</button>}<button type="submit" disabled={isLoading || !catalog} className="booking-submit"><Compass size={18} />{isLoading ? 'Creating your trip…' : step < 3 ? 'Continue' : 'Create my trip'}</button></div>
    </fieldset>
    {isLoading && <p role="status" className="step-note">Checking routes, opening hours and the group budget. Your results will appear below.</p>}
  </form>;
}
