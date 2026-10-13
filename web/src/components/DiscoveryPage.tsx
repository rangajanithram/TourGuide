'use client';
import { useState } from 'react';
import Header from './Header';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl } from '@/lib/planner-network';
interface Results { location:string; fetched_at:string; places:{id:string; name:string; address:string}[] }
export default function DiscoveryPage() {
 const [location,setLocation]=useState(''),[category,setCategory]=useState('attractions');
 const [results,setResults]=useState<Results|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function search(event:React.FormEvent) {
  event.preventDefault();if(busy)return;setBusy(true);setError('');setResults(null);
  try {const response=await plannerFetch(`${apiBaseUrl()}/api/discovery?${new URLSearchParams({location:location.trim(),category})}`);setResults(await response.json());}
  catch(e){setError(e instanceof Error?e.message:'Search failed. Please try again.');}finally{setBusy(false);}
 }
 return <div className="planner-theme min-h-screen"><Header/><main className="discovery-page">
 <h1>Find somewhere worth exploring.</h1><p>Search a city, district or landmark worldwide. Coverage varies by location.</p>
 <form onSubmit={search} className="discovery-search"><label>Where to explore<input required minLength={2} maxLength={150} value={location} onChange={e=>setLocation(e.target.value)} placeholder="City or landmark, including country"/></label>
 <label>What to find<select value={category} onChange={e=>setCategory(e.target.value)}>{[['attractions','Attractions & sights'],['restaurants','Restaurants'],['stays','Hotels & stays'],['parks','Parks & gardens'],['hills','Hills & mountains']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <button disabled={busy} type="submit">{busy?'Finding places...':'Find places'}</button></form>
 {busy&&<p role="status">Looking up the location and nearby places...</p>}{error&&<p role="alert" className="booking-error">{error}</p>}
 {results&&<section aria-label="Discovered places"><h2>{results.location}</h2><p>Retrieved {new Date(results.fetched_at).toLocaleString()}. Retrieval time does not certify venue facts.</p>
 {!results.places.length&&<p>No named places found within 15 km. Try another location or category.</p>}
 <div className="discovery-cards">{results.places.map((p,i)=><article key={`${p.id}:${i}`}><h3>{p.name}</h3><p>{p.address||'Address unavailable'}</p><p>Hours, fees, reviews and room availability are not verified by this search.</p><a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(p.name+' '+p.address)}`} target="_blank" rel="noopener noreferrer">Look up on OpenStreetMap</a></article>)}</div></section>}
 <p>Scheduling currently uses the supported planning catalog. These listings cannot yet be added to a verified itinerary.</p>
 <p>Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></p>
 </main></div>;
}
