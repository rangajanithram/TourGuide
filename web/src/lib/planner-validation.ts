import type { TripFormData } from '@/types/trip';
import { journeyWindow, planningWindows } from './journey-timing';
import { validateBookedTransport } from './booked-transport';
import { validateJourneyBudget } from './journey-budget';
import { validateStayChoice } from './stay-choice';
export type PlannerIssue = { step: number; section: string; field: string; label: string; message: string };
export type ValidationContext = { today: string; cities: string[]; catalogReady: boolean; pendingFrom?: boolean; pendingTo?: boolean };
export function plannerIssues(form: TripFormData, context: ValidationContext): PlannerIssue[] {
  const issues: PlannerIssue[]=[];
  const add=(step:number,section:string,field:string,label:string,message:string)=>issues.push({step,section,field,label,message});
  const basics=(field:string,label:string,message:string)=>add(0,'Journey · Trip basics',field,label,message);
  if(context.pendingFrom)basics('trip-from','From','Choose a city from the suggestions, or choose “Already at the destination”.');
  if(context.pendingTo)basics('trip-to','To','Choose your destination from the city suggestions.');
  if(!context.catalogReady)basics('trip-catalog','City places','The city data is still loading. Wait a moment or use Retry city data.');
  if(!context.cities.includes(form.destination))basics('trip-to','To','Choose a supported destination from the suggestions.');
  if(form.origin_city&&!context.cities.includes(form.origin_city))basics('trip-from','From','Choose a supported origin city from the suggestions.');
  const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
  if(!validDate(form.start_date)||form.start_date<context.today)basics('trip-start','Plan start date','Choose today or a later date.');
  if(!validDate(form.end_date)||form.end_date<form.start_date)basics('trip-end','Plan end date','Choose the same day as your first sightseeing date, or a later day.');
  if(validDate(form.start_date)&&validDate(form.end_date)&&(Date.parse(form.end_date)-Date.parse(form.start_date))/86400000>=14)basics('trip-end','Plan end date','Choose a trip of 14 days or fewer.');
  if(!Number.isInteger(form.people_count)||form.people_count<1||form.people_count>20)basics('trip-people','Travelers','Enter a whole number from 1 to 20 travelers.');
  if(!Number.isInteger(form.budget_inr)||form.budget_inr<1||form.budget_inr>5000000)basics('trip-budget','Destination budget','Enter a whole-group budget from ₹1 to ₹50,00,000.');
  const journey=form.journey_timing;
  const keys=[['outbound_departure','Leave your origin'],['destination_arrival','Arrive at destination'],['destination_departure','Leave destination'],['return_arrival','Arrive back at origin']] as const;
  if(journey){
    const missing=keys.filter(([key])=>!journey[key]);
    for(const [key,label] of missing)add(0,'Journey · Travel timing',`timing-${key}`,label,`Choose a date and time for “${label}”, or turn off “Use my travel times” if you do not know them yet.`);
    if(!missing.length){
      try{journeyWindow({...form,stay_choice:undefined});}catch(error){
        const text=error instanceof Error?error.message:'Check your travel times.';
        let field='timing-destination_arrival',label='Arrival and departure times';
        if(/Paid arrival/.test(text)){field='timing-arrival_transfer_paid_inr';label='Arrival transfer already paid';}
        else if(/arrival transfer cost/.test(text)){field='timing-arrival_transfer_cost_inr';label='Arrival transfer fare';}
        else if(/Paid departure/.test(text)){field='timing-departure_transfer_paid_inr';label='Departure transfer already paid';}
        else if(/departure transfer cost/.test(text)){field='timing-departure_transfer_cost_inr';label='Departure transfer fare';}
        else if(/buffers/.test(text)){const key=(['arrival_buffer_minutes','departure_buffer_minutes','arrival_transfer_minutes','departure_transfer_minutes'] as const).find(key=>!Number.isInteger(journey[key]??0)||(journey[key]??0)<0||(journey[key]??0)>720)||'arrival_buffer_minutes';field=`timing-${key}`;label=key.startsWith('arrival')?'Arrival transfer and rest time':'Departure transfer and boarding time';}
        else {
          const invalid=keys.find(([key])=>!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?\+05:30$/.test(journey[key])||!Number.isFinite(Date.parse(journey[key]))||new Date(Date.parse(journey[key])+19800000).toISOString().slice(0,16)!==journey[key].slice(0,16));
          const outOfOrder=keys.find((entry,index)=>index>0&&Date.parse(journey[entry[0]])<=Date.parse(journey[keys[index-1][0]]));
          const target=invalid||outOfOrder;
          if(target){field=`timing-${target[0]}`;label=target[1];}
        }
        add(0,'Journey · Travel timing',field,label,/all four|valid travel/.test(text)?`Choose a complete, valid date and time for “${label}”. Times use the 24-hour India clock.`:/must follow/.test(text)?`${label} must be after the previous travel event. Use: leave origin → arrive at destination → leave destination → arrive home.`:/Sightseeing dates/.test(text)?'Your travel times do not leave room for all sightseeing dates. Arrive before the first sightseeing day and leave after the last one, including your transfer buffers.':text);
      }
    }
  }
  try{validateBookedTransport(form);}catch(error){const text=(error as Error).message;add(0,'Journey · Booked tickets',/timing/.test(text)?'timing-settings':form.booked_transport&&(!Number.isSafeInteger(form.booked_transport.total_fare_inr)||form.booked_transport.total_fare_inr<0||form.booked_transport.total_fare_inr>5000000)?'booking-total':'booking-paid','Booked travel',text);}
  let budget=form.budget_inr;
  try{budget=validateJourneyBudget(form);}catch(error){add(0,'Journey · Total budget','trip-total-budget','Total budget for included costs',(error as Error).message.replace('combined cost cap','total budget').replace('combined cap','total budget'));}
  try{validateStayChoice(form.stay_choice,budget);}catch(error){
    const text=(error as Error).message;
    const field=/both check-in|stay dates|destination nights/.test(text)?'stay-check-in-date':/check-in and check-out buffers/.test(text)?'stay-check-in-buffer':/Stay scheduling/.test(text)?(!form.stay_choice?.check_in_time?'stay-check-in':'stay-check-out'):/name/.test(text)?'stay-name':/latitude|longitude/.test(text)?(!Number.isFinite(form.stay_choice?.lat)||Math.abs(form.stay_choice?.lat??0)>90?'stay-lat':'stay-lng'):/check-out/.test(text)?'stay-check-out':/check-in|scheduling/.test(text)?'stay-check-in':/cost|budget/.test(text)?'stay-cost':'stay-settings';
    add(0,'Journey · Where you will stay',field,'Stay details',/Stay scheduling/.test(text)?'Add both check-in and check-out times, or turn off the option to plan sightseeing around your stay.':text);
  }
  if(form.stay_choice)try{planningWindows(form);}catch(error){const message=(error as Error).message;if(/stay|check-in|check-out|luggage/.test(message))add(0,'Journey · Where you will stay','stay-settings','Stay dates and timing',message);}
  if(form.max_visit_minutes!=null&&(!Number.isInteger(form.max_visit_minutes)||form.max_visit_minutes<30||form.max_visit_minutes>480))add(1,'Travel style · Comfort','comfort-options','Visit length','Choose a maximum visit length from 30 to 480 minutes.');
  if((form.locked_activities?.length||0)>15)add(2,'Places & food · Your places','trip-places','Must-visits','Choose up to 15 must-visit places.');
  if(form.meal_budget_per_person!=null&&(!Number.isInteger(form.meal_budget_per_person)||form.meal_budget_per_person<0||form.meal_budget_per_person>10000))add(2,'Places & food · Meals','trip-meal-budget','Meal budget','Enter ₹0 to ₹10,000 per person, per meal, or turn off reserved meals.');
  const p=form.discovery_policy;
  if(p){
    if(!Number.isInteger(p.visit_minutes)||p.visit_minutes<30||p.visit_minutes>240)add(2,'Places & food · Automatic discovery','discovery-duration','Attraction visit length','Enter a whole number from 30 to 240 minutes.');
    for(const [key,field,label] of [['attraction_cost_inr','discovery-cost','Attraction cost'],['meal_cost_inr','discovery-meal-cost','Restaurant cost']] as const)if(!Number.isInteger(p[key])||p[key]<0||p[key]>10000)add(2,'Places & food · Automatic discovery',field,label,'Enter a whole-rupee estimate from ₹0 to ₹10,000 per person.');
  }
  for(const [key,field,label] of [['arrival_available_mins','trip-arrival-ready','Ready to start'],['departure_deadline_mins','trip-departure-back','Back at base']] as const){
    const value=form[key];if(value!=null&&(!Number.isInteger(value)||value<0||value>720))add(3,'Review · Arrival and departure',field,label,'Choose a time from 08:00 to 20:00.');
  }
  if(form.start_date===form.end_date&&(form.arrival_available_mins??60)>=(form.departure_deadline_mins??720))add(3,'Review · Arrival and departure','trip-departure-back','Back at base','For a day trip, the return time must be later than the start time.');
  return issues;
}
