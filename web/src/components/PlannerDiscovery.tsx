'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, MapPin, Pin, Plus, Search, Star, X } from 'lucide-react';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl } from '@/lib/planner-network';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type { ConfirmedDiscoveryStop } from '@/types/trip';
import { type BrowsePlace, type CatalogPlace, type DiscoveryPlace, planningTime, priceLabel } from '@/lib/place-discovery';
import PlaceSearch from './PlaceSearch';
import ThemedSelect from './ThemedSelect';
import TravelImage from './TravelImage';

type Selection = { id: string; name: string; mandatory: boolean };
type Props = {
  destination: string; catalog: CatalogPlace[]; selections: Selection[];
  onCatalogAdd: (id: string, mandatory: boolean) => void;
  onConfirm: (stop: ConfirmedDiscoveryStop, mandatory: boolean) => void;
  onRemove: (id: string) => void; onTogglePin: (id: string) => void;
  disabled: boolean; capacityReached: boolean;
};
const categories = [{value:'all',label:'All places'}, {value:'attractions',label:'Attractions'}, {value:'restaurants',label:'Food & cafes'}, {value:'parks',label:'Parks'}, {value:'hills',label:'Viewpoints'}, {value:'museums',label:'Museums'}, {value:'heritage',label:'Heritage'}];
function matchesCategory(place: CatalogPlace, category: string) {
  const words = [place.label, ...(place.tags || [])].join(' ').toLowerCase();
  return category === 'all' || (category === 'restaurants' ? place.type === 'restaurant'
    : category === 'attractions' ? place.type !== 'restaurant'
    : category === 'parks' ? /park|garden|nature/.test(words)
    : category === 'hills' ? /hill|viewpoint|panoramic/.test(words)
    : category === 'museums' ? /museum|art/.test(words) : /heritage|history|fort|palace|architecture/.test(words));
}
export default function PlannerDiscovery({destination,catalog,selections,onCatalogAdd,onConfirm,onRemove,onTogglePin,disabled,capacityReached}: Props) {
  const [query,setQuery]=useState(''), [items,setItems]=useState<DiscoveryPlace[]>([]);
  const [chosen,setChosen]=useState<{place:BrowsePlace;mandatory:boolean}|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [retry,setRetry]=useState(0);
  const [category,setCategory]=useState('all'), [sort,setSort]=useState('default'), [shortVisits,setShortVisits]=useState(false), [visible,setVisible]=useState(6);
  const cache=useRef(new Map<string,DiscoveryPlace[]>());
  const city=destination.charAt(0).toUpperCase()+destination.slice(1);
  const providerCategory=['museums','heritage'].includes(category)?'attractions':category;
  useEffect(()=>{
    const controller=new AbortController(), name=query.trim();
    setItems([]);setError('');setBusy(false);
    if((name.length>0&&name.length<3)||disabled)return()=>controller.abort();
    const key=`${destination}:${providerCategory}:${name.toLowerCase()}`, cached=cache.current.get(key);
    if(cached){setItems(cached);return()=>controller.abort();}
    setBusy(true);
    const timer=setTimeout(async()=>{
      try{
        const response=await plannerFetch(`${apiBaseUrl()}/api/discovery?${new URLSearchParams({location:destination+', India',category:providerCategory,...(name.length>=3?{query:name}:{})})}`,{signal:controller.signal});
        const body=await response.json();
        if(!response.ok||!Array.isArray(body.places))throw new Error(typeof body.detail==='string'?body.detail:'Could not load nearby places.');
        if(!controller.signal.aborted){
          const places=(body.places as DiscoveryPlace[]).filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
          if(cache.current.size>=10)cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key,places);setItems(places);
        }
      }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Live search is unavailable.');}
      finally{if(!controller.signal.aborted)setBusy(false);}
    },name.length>=3?750:200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,destination,disabled,retry,providerCategory]);
  const places=useMemo(()=>{
    const matches:BrowsePlace[]=catalog.filter(p=>matchesCategory(p,category)&&query.trim().toLowerCase().split(/\s+/).every(word=>p.label.toLowerCase().includes(word))).map(p=>({id:p.value,name:p.label,address:p.formatted_address||city,category:p.type==='restaurant'?'restaurants':category==='all'?'attractions':category,lat:p.lat,lng:p.lng,catalog:p}));
    for(const item of items){
      if(catalog.some(p=>p.label.trim().toLowerCase()===item.name.trim().toLowerCase()&&p.lat!=null&&p.lng!=null&&Math.abs(p.lat-item.lat)<0.002&&Math.abs(p.lng-item.lng)<0.002))continue;
      if(category==='museums'&&!/museum|gallery|art/i.test(item.name))continue;
      if(category==='heritage'&&!/fort|palace|heritage|temple|historic|monument/i.test(item.name))continue;
      matches.unshift({id:'discovered:'+item.id,name:item.name,address:item.address||item.formatted_address||city,category:item.category,lat:item.lat,lng:item.lng,live:item});
    }
    const filtered=shortVisits?matches.filter(p=>p.catalog?.duration!=null&&p.catalog.duration<=120):matches;
    return [...filtered].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='duration'?(a.catalog?.duration??Infinity)-(b.catalog?.duration??Infinity):sort==='rating'?((b.catalog?.rating_evidence?b.catalog.rating:null)??-1)-((a.catalog?.rating_evidence?a.catalog.rating:null)??-1):0);
  },[catalog,category,query,city,items,shortVisits,sort]);
  const options=places.filter(p=>!selections.some(s=>s.id===p.id)).map(p=>({value:p.id,label:p.name,description:`${p.live?'Live listing':'Reference catalog'} · ${p.address}`}));
  const status=busy?'Searching nearby places…':query.length>0&&query.trim().length<3?'Type 3 or more letters for live search. Catalog matches appear below.':`${places.length} places from the available sources. Missing facts stay marked as unknown.`;
  const choose=(place:BrowsePlace,mandatory:boolean)=>{if(place.catalog)onCatalogAdd(place.id,mandatory);else setChosen({place,mandatory});};
  const selectedPanel=<div className="selected-panel-content">
    <div className="selected-title"><h4>Your places</h4><span>{selections.length}</span></div>
    <p>Must-visits are required. Other options get priority when they fit your trip.</p>
    {!selections.length&&<div className="selection-empty"><Pin size={25}/><strong>Start with a favorite</strong><span>Add a few places, or let the planner choose for you.</span></div>}
    <ul>{selections.map(item=><li key={item.id}><div><strong>{item.name}</strong><span>{item.mandatory?'Must visit':'Optional choice'}</span></div><button type="button" className="selection-pin" aria-pressed={item.mandatory} aria-label={`${item.mandatory?'Make optional':'Make required'}: ${item.name}`} onClick={()=>onTogglePin(item.id)} disabled={disabled}><Pin size={17}/></button><button type="button" aria-label={`Remove ${item.name}`} disabled={disabled} onClick={()=>onRemove(item.id)}><X size={18}/></button></li>)}</ul>
    <small>{capacityReached?'Selection limit reached. Remove a place to add another.':'Up to 15 required stops and 15 discovered places. The planner may add more stops around your choices.'}</small>
  </div>;
  return <section className="visual-discovery" aria-label={`Explore places in ${city}`}>
    <div className="destination-banner"><TravelImage destination={destination}/><div><span>MAKE IT YOUR TRIP</span><h4>Explore {city}</h4><p>Find places you love. We’ll put the day together.</p></div></div>
    <div className="discovery-workspace"><div className="discovery-browser">
      <PlaceSearch label={`Search places in ${city}`} value="" placeholder="Try a fort, museum, restaurant or park…" options={options} filterLocally={false} disabled={disabled} onQueryChange={value=>{setQuery(value);setVisible(6);}} status={status} onChange={id=>{const place=places.find(p=>p.id===id);if(place)setChosen({place,mandatory:false});}}/>
      <div className="discovery-categories" aria-label="Place categories">{categories.map(option=><button key={option.value} type="button" aria-pressed={category===option.value} disabled={disabled} onClick={()=>{setCategory(option.value);setVisible(6);}}>{option.label}</button>)}</div>
      <div className="browse-controls"><label className="booking-check"><input type="checkbox" checked={shortVisits} onChange={e=>{setShortVisits(e.target.checked);setVisible(6);}}/>Up to 2 hours <small>(known estimates only)</small></label><ThemedSelect label="Sort places" value={sort} onChange={setSort} options={[{value:'default',label:'Live listings first'},{value:'name',label:'Name A–Z'},{value:'duration',label:'Shortest known visit'},{value:'rating',label:'Available older ratings'}]}/></div>
      {error&&<div className="discovery-recovery" role="status"><p>Live search is unavailable. You can still browse the reference catalog. {error}</p><button type="button" onClick={()=>setRetry(v=>v+1)} disabled={busy}>Try live search again</button></div>}
      <div className="place-card-grid" aria-busy={busy}>{places.slice(0,visible).map(place=>{
        const added=selections.find(s=>s.id===place.id), facts=place.catalog;
        return <article key={place.id} className="place-card" data-selected={!!added}>
          <button type="button" className="place-card-image-button" aria-label={`View details: ${place.name}`} onClick={()=>setChosen({place,mandatory:false})}><TravelImage destination={destination} category={place.category} placeName={place.name}/>{added&&<span className="place-added-badge"><Check size={14}/>{added.mandatory?'Must visit':'Added'}</span>}</button>
          <div className="place-card-body"><span className="place-source">{place.live?'Live place listing':'Reference catalog'} · {place.category==='restaurants'?'Food & cafes':'Place to visit'}</span><h5>{place.name}</h5><p className="place-area"><MapPin size={14}/>{place.address}</p>
            <div className="place-facts"><span><Clock size={14}/>{facts?.duration?`${facts.duration} min · estimate`:'Visit length unknown'}</span><span>{facts?.rating!=null&&facts.rating_evidence?<><Star size={14}/>{facts.rating.toFixed(1)}/5 · older samples</>:'No sourced rating'}</span></div>
            <strong className="place-price">{priceLabel(facts?.cost)}</strong>
            <div className="place-card-actions"><button type="button" onClick={()=>setChosen({place,mandatory:false})}>Details</button><button type="button" className="visual-primary" disabled={disabled||capacityReached||!!added} onClick={()=>choose(place,false)}>{added?<><Check size={16}/>Added</>:<><Plus size={16}/>Add to options</>}</button></div>
            <button type="button" className="place-pin-action" disabled={disabled||capacityReached||!!added} onClick={()=>choose(place,true)}><Pin size={15}/>Must visit</button>
          </div></article>;
      })}</div>
      {!places.length&&<div className="browse-empty" role="status"><Search size={26}/><h4>{busy?'Looking for nearby places…':'No matches yet'}</h4><p>{shortVisits?'Turn off the visit-length filter to include places with unknown times.':'Try another name or category. The data source may not cover every place.'}</p></div>}
      {visible<places.length&&<button type="button" className="browse-more" onClick={()=>setVisible(v=>v+6)}>Show more places ({places.length-visible})</button>}
      <p className="catalog-caption">Live listings: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Artwork is AI-generated; hours, prices and ratings are separate data.</p>
    </div><aside className="selected-places-desktop" aria-label="Selected places">{selectedPanel}</aside></div>
    <details className="selected-places-mobile"><summary>Your places · {selections.length} selected</summary>{selectedPanel}</details>
    {chosen&&createPortal(<PlaceDrawer key={chosen.place.id} place={chosen.place} destination={destination} mandatory={chosen.mandatory} alreadySelected={selections.some(s=>s.id===chosen.place.id)} disabled={disabled||capacityReached} onCancel={()=>setChosen(null)} onCatalogAdd={mandatory=>{onCatalogAdd(chosen.place.id,mandatory);setChosen(null);}} onConfirm={(stop,mandatory)=>{onConfirm(stop,mandatory);setChosen(null);}}/>,document.body)}
  </section>;
}
function PlaceDrawer({place,destination,mandatory:initialMandatory,alreadySelected,disabled,onCancel,onConfirm,onCatalogAdd}:{
  place:BrowsePlace;destination:string;mandatory:boolean;alreadySelected:boolean;disabled:boolean;onCancel:()=>void;onCatalogAdd:(mandatory:boolean)=>void;onConfirm:(stop:ConfirmedDiscoveryStop,mandatory:boolean)=>void;
}){
  const id=useId(), dialog=useDialogFocus(true,onCancel);
  const [duration,setDuration]=useState(''),[cost,setCost]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const [mandatory,setMandatory]=useState(initialMandatory),[meal,setMeal]=useState(''),[error,setError]=useState('');
  const facts=place.catalog;
  const confirm=()=>{
    if(facts){onCatalogAdd(mandatory);return;}
    const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3))-480;
    if(cost===''||duration===''||!Number.isInteger(Number(cost))||Number(cost)<0||Number(cost)>100000||!Number.isInteger(Number(duration))||Number(duration)<15||Number(duration)>480||!start||!end||minute(start)<0||minute(end)>720||minute(end)-minute(start)<Number(duration)){setError('Enter a visit length, cost and a time window between 08:00 and 20:00 that fits your visit.');return;}
    if(!place.live)return;
    onConfirm({place_id:place.live.id,name:place.name,lat:place.live.lat,lng:place.live.lng,place_type:place.category==='restaurants'?'restaurant':'attraction',duration_minutes:Number(duration),estimated_cost_per_person_inr:Number(cost),open_time_mins:minute(start),close_time_mins:minute(end),formatted_address:(place.address||'').slice(0,300)||null},mandatory);
  };
  return <div className="place-drawer-backdrop" onClick={e=>{if(e.target===e.currentTarget)onCancel();}}><div className="place-drawer booking-form" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
    <header><span>PLACE DETAILS</span><button type="button" aria-label="Close place details" onClick={onCancel}><X size={22}/></button></header>
    <TravelImage destination={destination} category={place.category} placeName={place.name}/>
    <div className="place-drawer-body"><h2 id={`${id}-title`}>{place.name}</h2><p><MapPin size={16}/>{place.address}</p>
      {place.lat!=null&&place.lng!=null&&<a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}`} target="_blank" rel="noopener noreferrer">See location on OpenStreetMap ↗</a>}
      <section><h3>Visit details</h3><dl className="place-detail-facts"><div><dt>Visit length</dt><dd>{facts?.duration?`${facts.duration} minutes · estimate`:'Not confirmed'}</dd></div><div><dt>Cost</dt><dd>{priceLabel(facts?.cost)}</dd></div><div><dt>Hours in catalog</dt><dd>{facts?.open_time_mins!=null&&facts?.close_time_mins!=null?`${planningTime(facts.open_time_mins)}–${planningTime(facts.close_time_mins)}`:'Not confirmed'}</dd></div><div><dt>Closed days in catalog</dt><dd>{facts?.closed_days?.length?facts.closed_days.join(', '):'No closures recorded; check with venue'}</dd></div></dl><p>Hours and costs may be outdated. Check current details before you travel.</p></section>
      <section><h3>Ratings & access</h3><p>{facts?.rating!=null&&facts.rating_evidence?`★ ${facts.rating.toFixed(1)}/5 · ${facts.review_count??0} older samples. ${facts.rating_evidence}`:'No sourced rating or review text is available for this listing.'}</p><p>Step-free access and special food needs are not confirmed. Ask the venue directly.</p></section>
      <section><h3>Data source</h3><p>{facts?.source_reference||(place.live?'Geoapify / OpenStreetMap listing. Hours, visit length and fees need your estimates.':'Reference city catalog. Planning estimates are not live offers.')}</p><p>{facts?.last_verified_date?`Catalog check date: ${facts.last_verified_date}. This is not a live check.`:'No checking date is available.'}</p></section>
      {!facts&&!alreadySelected&&<section className="estimate-confirmation"><h3>Confirm your planning estimates</h3><p>Use your own estimates for the missing facts below. These stay labelled as estimates in your plan.</p>
        {place.category==='restaurants'&&<ThemedSelect label="Meal window" value={meal} options={[{value:'',label:'Choose a meal time (optional)'},{value:'breakfast',label:'Breakfast · 08:00–10:00'},{value:'lunch',label:'Lunch · 12:00–15:00'},{value:'dinner',label:'Dinner · 18:00–20:00'}]} onChange={value=>{setMeal(value);const windows:Record<string,[string,string]>={breakfast:['08:00','10:00'],lunch:['12:00','15:00'],dinner:['18:00','20:00']};if(windows[value]){setStart(windows[value][0]);setEnd(windows[value][1]);}}}/>}
        <div className="booking-grid"><label>Visit length (minutes)<input type="number" min={15} max={480} value={duration} onChange={e=>setDuration(e.target.value)}/></label><label>Cost per person (₹; 0 if free)<input type="number" min={0} max={100000} value={cost} onChange={e=>setCost(e.target.value)}/></label><label>Earliest planned visit<input type="time" min="08:00" max="20:00" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Finish by<input type="time" min="08:00" max="20:00" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      </section>}
      {!alreadySelected&&<label className="booking-check"><input type="checkbox" checked={mandatory} onChange={e=>setMandatory(e.target.checked)}/>Must visit — include this stop or explain why it cannot fit</label>}
      <p className="drawer-selection-note">{mandatory?'This stop stays required even when its facts are unverified.':'Optional choices get priority, but may be left out if time, budget or other needs do not allow them.'}</p>
      {error&&<p role="alert" className="booking-error">{error}</p>}
    </div><footer><button type="button" onClick={onCancel}>Back to places</button><button type="button" className="visual-primary" disabled={disabled||alreadySelected} onClick={confirm}>{alreadySelected?'Already added':facts?(mandatory?'Add as must visit':'Add to options'):'Confirm estimates & add'}</button></footer>
  </div></div>;
}
