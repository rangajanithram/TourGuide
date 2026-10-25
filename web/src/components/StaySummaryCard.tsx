'use client';
import { Building2, MapPin, Star } from 'lucide-react';
import type { HotelStaySummary } from '@/types/trip';
import { plainPlannerText } from '@/lib/planner-copy';
import TravelImage from './TravelImage';
export default function StaySummaryCard({hotel,destination}:{hotel:HotelStaySummary;destination:string}) {
  const suggested=hotel.nights>0&&(!hotel.accommodation_kind||hotel.accommodation_kind==='planner_selected');
  const nightlyRate=hotel.price_per_night_per_room??hotel.cost_per_night_inr;
  return <article className="itinerary-stay visual-stay-card">
    <TravelImage destination={destination} category={suggested?'stay':undefined}/>
    <div className="stay-card-content"><span className="place-source"><Building2 size={15}/>{suggested?'Suggested stay · estimate':'Your daily base'}</span><h3>{hotel.hotel_name}</h3>
      {hotel.formatted_address&&<p className="place-area"><MapPin size={15}/>{hotel.formatted_address}</p>}
      {hotel.rating!=null&&<p className="stay-rating"><Star size={15}/>{hotel.rating.toFixed(1)}/5 · catalog rating{hotel.review_count?` · ${hotel.review_count} samples`:''} · may be outdated</p>}
      <dl className="stay-facts"><div><dt>Counted stay cost</dt><dd>₹{hotel.total_cost_inr.toLocaleString('en-IN')}</dd></div><div><dt>Stay length</dt><dd>{hotel.nights>0?`${hotel.nights} ${hotel.nights===1?'night':'nights'}${hotel.rooms_needed?` · ${hotel.rooms_needed} ${hotel.rooms_needed===1?'room':'rooms'}`: ' · room count not provided'}`:hotel.accommodation_kind==='booked'?'No overnight night counted':'Day trip · no overnight stay'}</dd></div>{suggested&&<div><dt>Estimated room rate</dt><dd>{nightlyRate==null?'Not confirmed':`₹${nightlyRate.toLocaleString('en-IN')} / night`}</dd></div>}{!suggested&&<div><dt>Already paid; excluded</dt><dd>₹{(hotel.excluded_prepaid_cost_inr||0).toLocaleString('en-IN')}</dd></div>}<div><dt>Check-in / check-out</dt><dd>{hotel.check_in_date?`${hotel.check_in_date} · `:''}{hotel.check_in_time||'Time not confirmed'} / {hotel.check_out_date?`${hotel.check_out_date} · `:''}{hotel.check_out_time||'Time not confirmed'}</dd></div></dl>
      <p className="stay-availability">{suggested?'Room availability and current prices are not confirmed.':hotel.accommodation_kind==='booked'?'Stay details supplied by you; confirm dates, rooms and access with the property.':hotel.nights===0?'A starting point for your day trip, not a hotel booking.':'Location and costs supplied for planning; this does not confirm a booking.'}</p>
      <div className="stay-links">{Number.isFinite(hotel.lat)&&Number.isFinite(hotel.lng)&&<a href={`https://www.openstreetmap.org/?mlat=${hotel.lat}&mlon=${hotel.lng}#map=16/${hotel.lat}/${hotel.lng}`} target="_blank" rel="noopener noreferrer">See map ↗</a>}{hotel.why_this_hotel&&<details><summary>{suggested?'Why this stay?':'About this base'}</summary><p>{plainPlannerText(hotel.why_this_hotel)}</p></details>}</div>
    </div>
  </article>;
}
