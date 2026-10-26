import type {ExpenseBreakdown} from '@/types/trip';

export function budgetPresentation(expense: ExpenseBreakdown) {
  const rows = [
    {key:'stay', label:'Stay', amount:expense.lodging_inr},
    {key:'travel', label:'Local travel', amount:expense.transit_inr},
    {key:'visits', label:'Sightseeing', amount:expense.activities_inr},
    {key:'meals', label:'Planned meals', amount:expense.dining_inr ?? 0},
  ];
  const planned = rows.reduce((total, row) => total + row.amount, 0);
  const budget = expense.budget_limit_inr ?? expense.total_inr;
  const remaining = budget - planned;
  const extraMeals = expense.additional_meals_inr ?? Math.max(0, (expense.suggested_meals_inr ?? expense.estimated_meals_inr) - (expense.dining_inr ?? 0));
  return {rows, budget, planned, remaining, extraMeals, mealShortfall:Math.max(0, extraMeals - Math.max(0, remaining))};
}
