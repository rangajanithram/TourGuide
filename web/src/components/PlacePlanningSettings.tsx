'use client';
import { CheckCircle2 } from 'lucide-react';
import type { TripFormData } from '@/types/trip';
import InterestPicker from './InterestPicker';
import PlannerField from './PlannerField';
import ThemedSelect from './ThemedSelect';

type Props = {
  form: TripFormData;
  interests: string[];
  dietaryOptions: string[];
  onChange: (changes: Partial<TripFormData>) => void;
};

export default function PlacePlanningSettings({form, interests, dietaryOptions, onChange}: Props) {
  const meals = form.meal_budget_per_person !== undefined && form.food_preference !== 'own_meals';
  const policy = form.discovery_policy;
  return <div className="place-planning-settings">
    <section className="planning-defaults" aria-label="Built-in planning">
      <h4>We’ll put your days together</h4>
      <p>Pick favorites, or leave the choices to us. Your must-visits stay required.</p>
      <p className="settings-estimate-note">Some visit times, costs and daytime windows are estimates. Open a place’s Details to check its sources before you go.</p>
      <ul><li><CheckCircle2 size={17}/>Pick stops that fit <strong>On</strong></li><li><CheckCircle2 size={17}/>Time and budget checks <strong>On</strong></li><li><CheckCircle2 size={17}/>Meal breaks <strong>{meals?'On':'Off'}</strong></li></ul>
    </section>
    <div className="place-settings-grid">
      <section className="planning-settings-card" aria-label="Meals">
        <div className="settings-card-heading"><h4>Meals</h4><span>{meals?'Included':'You arrange meals'}</span></div>
        <p>Breakfast, lunch and dinner fit around travel and visits. We choose a suitable restaurant when one fits; otherwise the plan shows a meal break.</p>
        <ThemedSelect label="Food choice" value={form.food_preference||'any'} onChange={value=>onChange({food_preference:value as TripFormData['food_preference'],...(value!=='own_meals'&&form.meal_budget_per_person===undefined?{meal_budget_per_person:200}:{})})} options={[{value:'any',label:'Suggest places to eat'},...dietaryOptions.map(value=>({value,label:value.charAt(0).toUpperCase()+value.slice(1)})),{value:'own_meals',label:'I’ll arrange meals myself'}]}/>
        {meals&&<PlannerField id="trip-meal-budget" label="Budget per person, per meal (₹)"><input type="number" min={0} max={10000} value={form.meal_budget_per_person} onChange={e=>onChange({meal_budget_per_person:Number(e.target.value)})}/></PlannerField>}
        {!meals&&form.food_preference!=='own_meals'&&<button type="button" className="settings-enable" onClick={()=>onChange({meal_budget_per_person:200})}>Include meal breaks</button>}
        <small>Confirm allergies and special food needs with the venue.</small>
      </section>
      <section className="planning-settings-card" aria-label="Your interests"><InterestPicker tags={interests} selected={form.interests} onChange={values=>onChange({interests:values})}/></section>
    </div>
    <details className="booking-more extra-discovery-settings"><summary>More live search settings</summary>
      <p>The researched city catalog is already included. Only use this if you want extra live listings with unknown details.</p>
      <label className="booking-check"><input type="checkbox" checked={!!policy} onChange={e=>onChange({discovery_policy:e.target.checked?{visit_minutes:90,attraction_cost_inr:200,meal_cost_inr:200,open_time_mins:60,close_time_mins:720}:undefined})}/>Add extra live places using these estimates</label>
      {policy&&<><p>These use a 09:00–20:00 planning window and unknown closing days. Continuing accepts the estimates below; they are not confirmed venue hours or prices.</p><div className="booking-grid">
        <PlannerField id="discovery-duration" label="Visit length (minutes)"><input type="number" min={30} max={240} value={policy.visit_minutes} onChange={e=>onChange({discovery_policy:{...policy,visit_minutes:Number(e.target.value)}})}/></PlannerField>
        <PlannerField id="discovery-cost" label="Visit budget per person (₹)"><input type="number" min={0} max={10000} value={policy.attraction_cost_inr} onChange={e=>onChange({discovery_policy:{...policy,attraction_cost_inr:Number(e.target.value)}})}/></PlannerField>
        <PlannerField id="discovery-meal-cost" label="Meal budget per person (₹)"><input type="number" min={0} max={10000} value={policy.meal_cost_inr} onChange={e=>onChange({discovery_policy:{...policy,meal_cost_inr:Number(e.target.value)}})}/></PlannerField>
      </div></>}
    </details>
  </div>;
}
