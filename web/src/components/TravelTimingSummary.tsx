import type {TripPlan} from '@/types/trip';

export default function TravelTimingSummary({plan}: {plan: TripPlan}) {
 const routes = plan.routing_summary;
 if (!routes?.source && !plan.journey_notes?.length) return null;
 return <section className="travel-timing-summary" aria-label="Travel and stay timing">
  <div><h3>Travel times</h3>{routes?.source&&<>
   <p><strong>{routes.source==='distance_estimate'?'Distance-based estimates':'Road route estimates'}</strong></p>
   <p>{routes.note}</p>
   {routes.checked_at&&<p>Checked {new Date(routes.checked_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} (India time).</p>}
   {routes.source!=='distance_estimate'&&<p>Road data: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. The map lines connect stops; they are not turn-by-turn road shapes.</p>}
  </>}</div>
  {!!plan.journey_notes?.length&&<div><h3>Arrival, departure and stay</h3><ul>{plan.journey_notes.map((note,index)=><li key={index}>{note}</li>)}</ul></div>}
 </section>;
}
