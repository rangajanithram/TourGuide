'use client';
import {useState} from 'react';
import {plannerFetch} from '@/lib/planner-fetch';
import {apiBaseUrl} from '@/lib/planner-network';
import type {ConfirmedDiscoveryStop} from '@/types/trip';
type Result={id:string;name:string;address:string;lat:number;lng:number;category:string};
export default function PlannerDiscovery({destination,onConfirm,disabled}:{destination:string;onConfirm:(stop:ConfirmedDiscoveryStop,mandatory:boolean)=>void;disabled:boolean}){
 const [items,setItems]=useState<Result[]>([]),[chosen,setChosen]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('');
 const [category,setCategory]=useState('attractions');
 async function load(){setBusy(true);setError('');setChosen(null);try{const r=await plannerFetch(`${apiBaseUrl()}/api/discovery?${new URLSearchParams({location:destination+', India',category})}`);setItems((await r.json()).places);}catch(e){setError(e instanceof Error?e.message:'Search failed');}finally{setBusy(false);}}
 return <details className="booking-more"><summary>Find more real places in {destination}</summary><p>Choose a live listing, then confirm your planning estimates. These are not verified venue facts.</p>
 <label>Category<select value={category} onChange={e=>{setCategory(e.target.value);setItems([]);setChosen(null);}}>{[['attractions','Attractions'],['restaurants','Restaurants'],['parks','Parks'],['hills','Hills & mountains']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <button type="button" className="booking-submit" disabled={busy||disabled} onClick={()=>void load()}>{busy?'Finding places...':'Load nearby places'}</button>
 {error&&<p role="alert">{error}</p>}
 {!!items.length&&<><label>Filter results<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Type a place name"/></label><div className="live-place-options">{items.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())).map(p=><button type="button" key={p.id} onClick={()=>setChosen(p)} aria-pressed={chosen?.id===p.id}>{p.name}<small>{p.address}</small></button>)}</div></>}
 {chosen&&<div key={chosen.id} className="confirmed-stop-fields"><h4>{chosen.name}</h4><p>Confirm the time you intend to visit and your per-person cost estimate. Check the venue before travel.</p>
 <label><input id="live-mandatory" type="checkbox" defaultChecked/> Must visit this place (uncheck to let the planner decide)</label>
 <label>Visit length (minutes)<input id="live-duration" type="number" min={15} max={480}/></label><label>Estimated cost per person (INR)<input id="live-cost" type="number" min={0} max={100000}/></label><label>Earliest visit time<input id="live-open" type="time" min="08:00" max="20:00"/></label><label>Finish by<input id="live-close" type="time" min="08:00" max="20:00"/></label>
 <button type="button" disabled={disabled} className="booking-submit" onClick={()=>{
 const value=(id:string)=>(document.getElementById(id) as HTMLInputElement).value;
 const mins=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3))-480;
 const duration=Number(value('live-duration')),cost=Number(value('live-cost')),start=value('live-open'),end=value('live-close');
 if(!value('live-cost')||!Number.isInteger(cost)||cost<0||cost>100000||!Number.isInteger(duration)||duration<15||duration>480||!start||!end||mins(start)<0||mins(end)>720||mins(end)-mins(start)<duration){setError('Enter a valid duration, cost and time window that fits the visit between 08:00 and 20:00.');return;}
 onConfirm({place_id:chosen.id,name:chosen.name,lat:chosen.lat,lng:chosen.lng,place_type:chosen.category==='restaurants'?'restaurant':'attraction',duration_minutes:duration,estimated_cost_per_person_inr:cost,open_time_mins:mins(start),close_time_mins:mins(end)},(document.getElementById("live-mandatory") as HTMLInputElement).checked);setChosen(null);setError('');
 }}>Confirm estimates and add this place</button></div>}
 <p>Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></p></details>;
}
