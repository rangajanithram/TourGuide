import type { MultiVariantTripPlan, TripFormData, TripPlan, VariantKey } from '@/types/trip';

function invalid(message: string): never { throw new Error(`Invalid saved itinerary: ${message}`); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 500): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(label);
}
function integer(value: unknown, label: string, min = 0, max = 10_000_000): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(label);
}
function coordinates(obj: Record<string, unknown>) {
  for (const [key, bound] of [['lat', 90], ['lng', 180]] as const) {
    if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key]) || Math.abs(obj[key] as number) > bound) invalid(key);
  }
}
function strings(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(v => typeof v !== 'string' || v.length > 2000)) invalid(label);
}
function time(value: unknown): number {
  text(value, 'activity time', 40);
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) invalid('activity time');
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) invalid('activity time');
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateSnapshot(raw: unknown): asserts raw is MultiVariantTripPlan {
  const root = record(raw);
  if (root.schema_version !== undefined && root.schema_version !== 1) invalid('unsupported schema version');
  text(root.destination, 'destination', 80);
  const variants = record(root.variants);
  if (!Object.keys(variants).length || Object.keys(variants).some(k => !['budget', 'balanced', 'comfort'].includes(k))) invalid('variants');
  for (const [key, value] of Object.entries(variants)) {
    const plan = record(value);
    text(plan.plan_name, 'plan name', 160);
    if (plan.variant_type !== key || !['cab', 'auto', 'metro', 'walk'].includes(String(plan.transport_mode))) invalid('variant or transport');
    integer(plan.total_cost_inr, 'total'); integer(plan.estimated_transport_cost_inr, 'transport');
    if (!Array.isArray(plan.days) || !plan.days.length || plan.days.length > 14) invalid('days');
    let visits = 0, activityTotal = 0;
    const dayNumbers = new Set<number>();
    for (const rawDay of plan.days) {
      const day = record(rawDay);
      integer(day.day_number, 'day number', 1, 14);
      if (dayNumbers.has(day.day_number)) invalid('duplicate day number');
      dayNumbers.add(day.day_number);
      if (!validDate(day.date)) invalid('day date');
      integer(day.day_cost_inr, 'day cost');
      if (!Array.isArray(day.activities) || day.activities.length > 50) invalid('activities');
      let dayTotal = 0, previousEnd = -1;
      for (const rawActivity of day.activities) {
        const activity = record(rawActivity);
        text(activity.place_name, 'place name', 160); coordinates(activity);
        integer(activity.estimated_cost_inr, 'activity cost');
        const start = time(activity.start_time), end = time(activity.end_time);
        if (end <= start || start < previousEnd) invalid('overlapping or invalid activity times');
        previousEnd = end;
        dayTotal += activity.estimated_cost_inr;
        if (activity.place_type !== 'rest_break' && activity.place_type !== 'restaurant') visits++;
        if (activity.is_locked !== undefined && typeof activity.is_locked !== 'boolean') invalid('pin');
        if (activity.depends_on !== undefined) strings(activity.depends_on, 'dependencies');
        if (activity.recommended_viewpoint != null) { const vp = record(activity.recommended_viewpoint); text(vp.description, 'viewpoint'); }
        if (activity.crowd_forecast != null) { const crowd = record(activity.crowd_forecast); text(crowd.level, 'crowd'); text(crowd.reason, 'crowd reason', 2000); }
      }
      if (dayTotal !== day.day_cost_inr) invalid('day cost does not reconcile');
      activityTotal += dayTotal;
      if (day.weather != null) {
        const weather = record(day.weather);
        for (const field of ['max_temp_c', 'precipitation_probability_pct']) if (weather[field] !== undefined && (typeof weather[field] !== 'number' || !Number.isFinite(weather[field]))) invalid('weather');
      }
    }
    if (!visits) invalid('no sightseeing visits');
    let lodging = 0;
    if (plan.hotel_summary != null) {
      const hotel = record(plan.hotel_summary); text(hotel.hotel_name, 'hotel'); coordinates(hotel);
      for (const field of ['total_cost_inr', 'rooms_needed', 'nights']) integer(hotel[field], field);
      lodging = hotel.total_cost_inr as number;
    }
    if (activityTotal + lodging + plan.estimated_transport_cost_inr !== plan.total_cost_inr) invalid('grand total does not reconcile');
    if (plan.expense_breakdown != null) {
      const expenses = record(plan.expense_breakdown);
      for (const [field, amount] of Object.entries(expenses)) if (field.endsWith('_inr')) integer(amount, field);
    }
    if (plan.verification_report != null) {
      const report = record(plan.verification_report);
      if (typeof report.is_valid !== 'boolean') invalid('verification status');
      integer(report.audit_score, 'audit score', 0, 100);
      for (const field of ['checks_passed', 'warnings', 'errors']) strings(report[field], field);
      const metrics = record(report.metrics);
      if (Object.values(metrics).some(v => typeof v !== 'string')) invalid('metrics');
      if (!report.is_valid || (report.errors as string[]).length) invalid('failed verification');
    }
    if (plan.fatigue_report != null) {
      const fatigue = record(plan.fatigue_report);
      if (!Array.isArray(fatigue.daily_breakdown)) invalid('fatigue');
      for (const item of fatigue.daily_breakdown) { const daily = record(item); integer(daily.day_number, 'fatigue day', 1, 14); integer(daily.score, 'fatigue score', 0, 100); text(daily.level, 'fatigue level'); }
    }
    if (plan.decision_trace != null) {
      const trace = record(plan.decision_trace);
      if (!Array.isArray(trace.excluded_places)) invalid('decision trace');
      for (const item of trace.excluded_places) { const excluded = record(item); text(excluded.place_name, 'excluded place'); text(excluded.category, 'exclusion reason'); text(excluded.reason, 'explanation', 2000); }
    }
    if (plan.intercity_transport != null) {
      const transit = record(plan.intercity_transport);
      for (const field of ['all_options', 'all_return_options']) if (transit[field] !== undefined && !Array.isArray(transit[field])) invalid('intercity options');
      const routes = [transit.recommended_option, transit.return_option, ...(transit.all_options as unknown[] || []), ...(transit.all_return_options as unknown[] || [])].filter(v => v != null);
      for (const item of routes) { const route = record(item); for (const field of ['operator_name', 'departure_station', 'arrival_station', 'departure_window']) text(route[field], field); for (const field of ['typical_duration_min', 'typical_fare_min', 'typical_fare_max']) integer(route[field], field); }
    }
  }
}

export function validateTripRequest(form: TripFormData, snapshot: MultiVariantTripPlan, selected?: VariantKey): TripFormData {
  if (!validDate(form.start_date) || !validDate(form.end_date)) invalid('trip dates');
  const days = (Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000 + 1;
  integer(days, 'duration', 1, 14); integer(form.budget_inr, 'budget', 1, 5_000_000); integer(form.people_count, 'travelers', 1, 20);
  if (form.destination.toLowerCase() !== snapshot.destination.toLowerCase()) invalid('request destination mismatch');
  if (!['relaxed', 'balanced', 'intensive'].includes(form.pace) || !['cab', 'auto', 'metro', 'walk'].includes(form.transport_mode)) invalid('preferences');
  if (form.group_profile && !['default', 'young_solo', 'family', 'elderly'].includes(form.group_profile)) invalid('group profile');
  if (form.origin_type && !['hotel', 'center', 'station', 'airport'].includes(form.origin_type)) invalid('origin');
  strings(form.interests, 'interests'); strings(form.locked_activities || [], 'pins');
  if (form.interests.length > 20) invalid('too many interests');
  if (form.start_location !== undefined && (typeof form.start_location !== 'string' || form.start_location.length > 160)) invalid('starting location');
  if ((form.locked_activities || []).length > 15) invalid('too many pins');
  for (const plan of Object.values(snapshot.variants) as TripPlan[]) {
    if (plan.days.some((day, index) => day.day_number !== index + 1 || day.date !== new Date(Date.parse(form.start_date) + index * 86400000).toISOString().slice(0,10))) invalid('day sequence');
    if (plan.total_cost_inr > form.budget_inr) invalid('itinerary exceeds the requested budget');
    if (plan.days.length !== days) invalid('itinerary does not cover every requested day. Please regenerate the trip with the updated planner');
    if (plan.days[0].date !== form.start_date || plan.days[days - 1].date !== form.end_date) invalid('itinerary dates differ from the requested travel dates');
  }
  if (selected) {
    const chosen = snapshot.variants[selected];
    const stops = new Set(chosen?.days.flatMap(day => day.activities.flatMap(a => [a.place_id || '', a.place_name].map(v => v.toLowerCase()))) || []);
    if ((form.locked_activities || []).some(pin => !stops.has(pin.toLowerCase()))) invalid('mandatory stop missing from selected itinerary');
  }
  return { ...form, interests: [...form.interests], locked_activities: [...(form.locked_activities || [])] };
}
