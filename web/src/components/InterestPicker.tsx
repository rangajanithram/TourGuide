'use client';
import { Landmark, Leaf, Utensils, Sun, Palette, Mountain, Check } from 'lucide-react';
import { useState } from 'react';
const labels:Record<string,string>={fortress:'Forts',panoramic:'Scenic views',coastal:'Seaside',unesco:'World heritage',social:'Meeting people',royal:'Royal history',hilltop:'Hilltops'};
export default function InterestPicker({tags,selected,onChange}:{tags:string[];selected:string[];onChange:(values:string[])=>void}) {
  const [expanded,setExpanded]=useState(false);
  const popular=['history','nature','food','family','museum','architecture','shopping','culture','park','sunset','art','adventure'];
  const ordered=[...new Set([...popular.filter(tag=>tags.includes(tag)),...tags])];
  const visible=expanded?ordered:ordered.filter((tag,index)=>index<12||selected.includes(tag));
  return <section className="interest-picker"><div><h4>What do you enjoy?</h4><span>{selected.length} selected · up to 20</span></div><div className="booking-chips">{visible.map(tag=>{
    const Icon=/food|breakfast|lunch|sweet|cafe/.test(tag)?Utensils:/sunset/.test(tag)?Sun:/nature|park|garden|walking/.test(tag)?Leaf:/hill|view|panoramic|coastal/.test(tag)?Mountain:/art|museum|culture/.test(tag)?Palette:Landmark;
    const active=selected.includes(tag);
    return <button type="button" key={tag} aria-pressed={active} disabled={!active&&selected.length>=20} onClick={()=>onChange(active?selected.filter(value=>value!==tag):[...selected,tag])}><Icon size={16} aria-hidden="true"/>{labels[tag]||tag.charAt(0).toUpperCase()+tag.slice(1)}{active&&<Check size={14} aria-hidden="true"/>}</button>;
  })}</div>{ordered.length>12&&<button type="button" className="interest-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer choices':`Show all ${ordered.length} interests`}</button>}<p className="step-note">Choose a few, or let us pick a mix.</p></section>;
}
