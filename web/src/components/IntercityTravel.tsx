'use client';
import { useState } from 'react';
import { ArrowRight, Bus, Plane, Train } from 'lucide-react';
import type { InterCityRoute, TripPlan } from '@/types/trip';
import TravelImage from './TravelImage';
const money=(value:number)=>`₹${value.toLocaleString('en-IN')}`;
function RouteCard({route,label,destination}:{route:InterCityRoute;label:string;destination:string}) {
  const Icon=route.mode==='train'?Train:route.mode==='flight'?Plane:Bus;
  return <article className="route-card">
    <div className="route-art"><TravelImage destination={destination} category={route.mode==='train'?'rail':undefined}/><span><Icon size={18}/>{route.mode}</span></div>
    <div className="route-card-body"><span className="place-source">{label} · example schedule</span><h4>{route.operator_name}{route.service_number?` #${route.service_number}`:''}</h4>
      <div className="route-stations"><strong>{route.departure_station}</strong><ArrowRight size={18}/><strong>{route.arrival_station}</strong></div>
      <dl><div><dt>Travel window</dt><dd>{route.departure_window}</dd></div><div><dt>Typical duration</dt><dd>{Math.floor(route.typical_duration_min/60)}h {route.typical_duration_min%60}m</dd></div><div><dt>Fare class</dt><dd>{route.fare_class}</dd></div></dl>
      <p className="route-price"><strong>{money(route.typical_fare_min)}–{money(route.typical_fare_max)}</strong><span>per person · one way · estimate</span></p>
      <p className="route-availability">Check running days, current fares and seats with the operator.</p>
    </div>
  </article>;
}
export default function IntercityTravel({plan,people}:{plan:TripPlan;people?:number}) {
  const [filter,setFilter]=useState('all');
  const transit=plan.intercity_transport;
  if(!transit)return null;
  const outbound=transit.recommended_option, inbound=transit.return_option;
  const group=people??plan.hotel_summary?.people_accommodated;
  const transfers=transit.last_mile&&transit.return_last_mile?transit.last_mile.estimated_cost_inr+transit.return_last_mile.estimated_cost_inr:null;
  const meals=plan.expense_breakdown?.additional_meals_inr??Math.max(0,(plan.expense_breakdown?.suggested_meals_inr??plan.expense_breakdown?.estimated_meals_inr??0)-(plan.expense_breakdown?.dining_inr??0));
  const known=group&&inbound;
  const ticketsMin=known?(outbound.typical_fare_min+inbound.typical_fare_min)*group:null;
  const ticketsMax=known?(outbound.typical_fare_max+inbound.typical_fare_max)*group:null;
  return <section className="visual-intercity" aria-label="Travel between cities">
    <header><div><span className="place-source">TRAVEL BETWEEN CITIES</span><h3>{transit.origin_city} <ArrowRight size={22}/> {transit.destination_city}</h3><p>Compare routes. Tickets cost extra and are booked with the operator.</p></div><span className="estimate-pill">Estimates · not live offers</span></header>
    <div className="route-grid"><RouteCard route={outbound} label="To your destination" destination={transit.destination_city}/>{inbound?<RouteCard route={inbound} label="Return journey" destination={transit.origin_city}/>:<div className="browse-empty"><h4>Return route not available</h4><p>Choose your own return travel. We cannot calculate a complete return-trip estimate.</p></div>}</div>
    <details className="transit-info"><summary>Transfers and route advice</summary><p>{transit.transit_advice}</p><div className="transfer-grid"><section><h4>Station / airport to your base</h4><p>{transit.last_mile?.guidance||'Transfer information is not available.'}</p></section><section><h4>Your base to the return terminal</h4><p>{transit.return_last_mile?.guidance||'Return transfer information is not available.'}</p></section></div><p>Transfers in your home city are excluded. Check any booking and transfer buffers before travel.</p></details>
    <details className="transit-info"><summary>Trip cost with these tickets{group?` · ${group} people`:''}</summary><dl className="travel-cost-summary"><div><dt>Destination plan</dt><dd>{money(plan.total_cost_inr)}</dd></div><div><dt>Tickets both ways</dt><dd>{ticketsMin!=null&&ticketsMax!=null?`${money(ticketsMin)}–${money(ticketsMax)}`:'Unknown'}</dd></div><div><dt>Destination terminal transfers</dt><dd>{transfers==null?'Incomplete':money(transfers)}</dd></div><div><dt>Extra meal allowance</dt><dd>{money(meals)}</dd></div><div className="travel-total"><dt>Estimated combined cost</dt><dd>{ticketsMin!=null&&ticketsMax!=null&&transfers!=null?`${money(plan.total_cost_inr+ticketsMin+transfers+meals)}–${money(plan.total_cost_inr+ticketsMax+transfers+meals)}`:'Cannot calculate a complete total'}</dd></div></dl><p>Whole-group planning estimate. Prepaid stays, home-city transfers, unknown taxes and personal spending are excluded. No seat or room availability is confirmed.</p></details>
    {transit.all_options.length>1&&<details className="transit-info"><summary>Compare other outbound routes ({transit.all_options.length})</summary><div className="discovery-categories" aria-label="Filter travel routes">{['all','train','bus','flight'].map(mode=><button type="button" key={mode} aria-pressed={filter===mode} onClick={()=>setFilter(mode)}>{mode==='all'?'All routes':mode.charAt(0).toUpperCase()+mode.slice(1)}</button>)}</div><div className="route-comparison">{transit.all_options.filter(route=>filter==='all'||route.mode===filter).map(route=><RouteCard key={route.route_id} route={route} label="Outbound option" destination={transit.destination_city}/>)}</div>{!transit.all_options.some(route=>filter==='all'||route.mode===filter)&&<p>No reference routes for this mode.</p>}</details>}
  </section>;
}
