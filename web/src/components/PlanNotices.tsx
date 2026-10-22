import { plainPlannerText } from '../lib/planner-copy';

/** Keep all warnings available without repeating the same estimate notice per day. */
export default function PlanNotices({ warnings = [] }: { warnings?: string[] }) {
  const unique = [...new Set(warnings)];
  const estimates = unique.filter(warning => warning.endsWith(': hours, visit duration and cost use user-confirmed estimates.'));
  const other = unique.filter(warning => !estimates.includes(warning));
  const places = [...new Set(estimates.map(warning => warning.split(': hours, visit duration')[0].replace(/^(Breakfast|Lunch|Dinner) - /i, '')))];
  if (!unique.length) return null;
  return <section className="plan-notices" aria-label="Things to check before your trip">
    <h3>Before you go</h3>
    {places.length > 0 && <div>
      <p>Some opening hours, visit times and prices are estimates you agreed to use. Check them before you travel.</p>
      <details><summary>See {places.length} {places.length === 1 ? 'place' : 'places'} to check</summary>
        <ul className="notice-place-list">{places.map(place => <li key={place}>{place}</li>)}</ul>
      </details>
    </div>}
    {other.length > 0 && <ul className="notice-other-list">{other.map(warning => <li key={warning}>{plainPlannerText(warning)}</li>)}</ul>}
  </section>;
}
