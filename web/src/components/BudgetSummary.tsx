import type {ExpenseBreakdown} from '@/types/trip';
import {budgetPresentation} from '@/lib/budget-presentation';

const money = (amount:number) => `₹${amount.toLocaleString('en-IN')}`;

export default function BudgetSummary({expense, people, separateTravel}: {
  expense:ExpenseBreakdown; people:number; separateTravel:boolean;
}) {
  const {rows, budget, planned, remaining, extraMeals, mealShortfall} = budgetPresentation(expense);
  const scale = Math.max(1, budget, planned);
  return <div className="budget-summary">
    <p className="budget-caption">Estimated costs for your whole group · {people} {people === 1 ? 'traveler' : 'travelers'}</p>
    <div className="budget-overview">
      <div><span>Planned cost</span><strong>{money(planned)}</strong><small>of your {money(budget)} budget</small></div>
      <div className={remaining >= 0 ? 'budget-left' : 'budget-over'}><span>{remaining >= 0 ? 'Money left' : 'Over budget'}</span><strong>{money(Math.abs(remaining))}</strong><small>{remaining >= 0 ? 'For extras and changes' : 'Review your trip costs'}</small></div>
    </div>
    <div className="budget-meter" role="img" aria-label={`${money(planned)} planned from ${money(budget)}. ${money(Math.abs(remaining))} ${remaining >= 0 ? 'left' : 'over budget'}.`}>
      {rows.map(row => <span key={row.key} className={`budget-color-${row.key}`} style={{width:`${row.amount / scale * 100}%`}} />)}
    </div>
    <dl className="budget-items">{rows.map(row => <div key={row.key}>
      <dt><i className={`budget-color-${row.key}`} aria-hidden="true" />{row.label}</dt><dd>{money(row.amount)}</dd>
    </div>)}</dl>
    {extraMeals > 0 ? <p className={`budget-meal-note${mealShortfall > 0 ? ' budget-over' : ''}`}>
      Allow about <strong>{money(extraMeals)}</strong> for meals outside the plan. {mealShortfall > 0 ? `That is ${money(mealShortfall)} more than the money left.` : 'This can come from the money left.'}
    </p> : <p className="budget-meal-note">Planned meal costs are already included above.</p>}
    <p className="budget-scope">These are planning estimates, not bills or booking prices.{separateTravel ? ' Travel to and from the city is shown separately.' : ''}</p>
  </div>;
}
