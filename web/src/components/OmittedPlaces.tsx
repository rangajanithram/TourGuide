'use client';
import {useState} from 'react';
import type {ExclusionReason} from '@/types/trip';

const labels:Record<string,string> = {
  pace_limit:'Day is full', geographic_detour:'Another area', closed_on_day:'Closed for these dates',
  budget_limit:'Extra cost', operating_hours:'Check times', meal_choice:'Other meal choice',
  preference:'Your preferences', route_choice:'Route choice',
};

export default function OmittedPlaces({items}: {items:ExclusionReason[]}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(6);
  const shown = filter === 'all' ? items : items.filter(item => item.category === filter);
  const categories = Array.from(new Set(items.map(item => item.category)));
  return <details className="omitted-places">
    <summary><span>Places not included<small>{items.length} other choices · see why</small></span><span className="omitted-toggle" aria-hidden="true">+</span></summary>
    <div className="omitted-body">
      <p>You can swap a stop or make a place a must-visit in <strong>Places & food</strong>. These are planning hints; a different mix of stops may fit.</p>
      <div className="omitted-filters" aria-label="Filter other places">
        {['all', ...categories].map(category => <button key={category} type="button" aria-pressed={filter === category}
          onClick={() => {setFilter(category); setLimit(6);}}>{category === 'all' ? 'All' : labels[category] ?? 'Other'} <span>{category === 'all' ? items.length : items.filter(item => item.category === category).length}</span></button>)}
      </div>
      <p className="omitted-count" aria-live="polite">Showing {Math.min(limit, shown.length)} of {shown.length} places</p>
      <ul className="omitted-list">{shown.slice(0, limit).map(item => <li key={`${item.place_name}:${item.category}`}>
        <div className="omitted-place-heading"><h4>{item.place_name}</h4><span>{labels[item.category] ?? 'Other choice'}</span></div>
        <p>{item.reason.replace(/^Candidate Omission Diagnostic:\s*/i, '')}</p>
        {item.suggested_action ? <p className="omitted-action">{item.suggested_action}</p> : null}
      </li>)}</ul>
      {limit < shown.length ? <button className="omitted-more" type="button" onClick={() => setLimit(value => value + 6)}>Show {Math.min(6, shown.length - limit)} more places</button> : null}
      {limit > 6 ? <button className="omitted-more" type="button" onClick={() => setLimit(6)}>Show fewer places</button> : null}
    </div>
  </details>;
}
