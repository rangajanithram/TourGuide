'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {AlertCircle} from 'lucide-react';
import Header from './Header';
import PlannerLandscape from './PlannerLandscape';
import SharedPlanDetails from './SharedPlanDetails';
import {decodeSharedPlan,readSharedPlan,type SharedPlan} from '@/lib/shared-plan';
export default function SharedPlanReader(){
  const [plan,setPlan]=useState<SharedPlan|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{const read=()=>{try{const params=new URLSearchParams(window.location.hash.slice(1)),value=params.get('plan');if(value){setPlan(decodeSharedPlan(value));setError('');}else setPlan(null);}catch(error){setPlan(null);setError((error as Error).message);}finally{setLoading(false);}};read();window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);},[]);
  const openFile=async(file:File|undefined)=>{if(!file)return;try{if(file.size>500000)throw new Error('This plan file is too large. Ask for a new TripWeave plan copy.');setPlan(readSharedPlan(await file.text()));setError('');}catch(error){setPlan(null);setError(error instanceof Error?error.message:'This file could not be read.');}};
  return <div className="planner-theme"><PlannerLandscape/><Header/><main className="shared-plan-page">
    <div className="shared-plan-topline"><Link href="/guide">How TripWeave works</Link><label className="shared-file-button">Open a plan file<input type="file" accept=".json,application/json" onChange={e=>void openFile(e.target.files?.[0])}/></label></div>
    {error&&<div className="expense-error" role="alert"><AlertCircle size={22}/><div><strong>We could not open this copy</strong><p>{error}</p><p>You can ask the sender for the downloaded plan file and open it above.</p></div></div>}
    {loading?<p role="status">Opening the shared plan…</p>:!plan?<section className="shared-plan-welcome"><h1>Open a shared trip</h1><p>Ask the sender to choose Share plan in their itinerary and send you the complete link. You can also open a downloaded TripWeave plan file above.</p><p>Shared copies are read-only. They do not update automatically or include your group’s expense records.</p></section>:<>
      <SharedPlanDetails plan={plan}/>

    </>}
    <p className="shared-source-credit">Place information uses the sources listed with each stop. Map links use <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>; live listings may come from <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>. Artwork marked AI illustration is not a venue photograph.</p>
  </main></div>;
}
