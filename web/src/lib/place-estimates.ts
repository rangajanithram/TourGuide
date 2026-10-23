import type { DiscoveryPlanningPolicy } from '@/types/trip';
export type EstimateInput = { duration: string; cost: string; start: string; end: string };
export function resolvePlaceEstimates(input:EstimateInput, restaurant:boolean, policy?:DiscoveryPlanningPolicy) {
  const defaults={duration:restaurant?45:policy?.visit_minutes??90,cost:restaurant?policy?.meal_cost_inr??200:policy?.attraction_cost_inr??200,start:policy?.open_time_mins??60,end:policy?.close_time_mins??720};
  const errors:Partial<Record<keyof EstimateInput,string>>={};
  const duration=input.duration===''?defaults.duration:Number(input.duration),cost=input.cost===''?defaults.cost:Number(input.cost);
  const minute=(value:string,fallback:number,key:'start'|'end')=>{
    if(!value){if(!Number.isInteger(fallback)||fallback<0||fallback>720)errors[key]='Choose a time between 08:00 and 20:00.';return fallback;}
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)){errors[key]='Choose a valid time.';return fallback;}
    const n=Number(value.slice(0,2))*60+Number(value.slice(3))-480;
    if(n<0||n>720)errors[key]='Choose a time between 08:00 and 20:00.';
    return n;
  };
  const start=minute(input.start,defaults.start,'start'),end=minute(input.end,defaults.end,'end');
  if(!Number.isInteger(duration)||duration<15||duration>480)errors.duration='Use 15 to 480 minutes, or leave blank for the shown estimate.';
  if(!Number.isInteger(cost)||cost<0||cost>100000)errors.cost='Use ₹0 to ₹1,00,000 per person, or leave blank for the shown estimate.';
  if(!errors.start&&!errors.end&&end-start<duration)errors.end='Finish by must leave enough time for your visit. Choose a later finish, earlier start or shorter visit.';
  return {defaults,errors,values:{duration_minutes:duration,estimated_cost_per_person_inr:cost,open_time_mins:start,close_time_mins:end}};
}
