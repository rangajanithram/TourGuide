export interface WeatherSummary {
  condition: string;
  max_temp_c: number;
  precipitation_probability_pct: number;
  heat_advisory: boolean;
  advisory_text: string;
  is_forecast: boolean;
}

export interface ExclusionReason {
  place_name: string;
  category: string;
  reason: string;
  suggested_action?: string | null;
}

export interface DecisionTrace {
  hotel_rationale: string;
  pacing_rationale: string;
  weather_rationale?: string | null;
  group_profile_rationale?: string | null;
  excluded_places: ExclusionReason[];
}

export interface ExpenseBreakdown {
  lodging_inr: number;
  transit_inr: number;
  activities_inr: number;
  dining_inr?: number;
  direct_subtotal_inr?: number;
  unallocated_buffer_inr?: number;
  suggested_meals_inr?: number;
  meal_buffer_status?: string;
  estimated_meals_inr: number;
  buffer_inr: number;
  total_inr: number;
  per_person_inr: number;
}

export interface CrowdForecast {
  score: number;
  level: string;
  reason: string;
  confidence: string;
  source: string;
}

export interface ScheduledActivity {
  place_name: string;
  place_type?: string;
  lat?: number;
  lng?: number;
  start_time: string;
  end_time: string;
  estimated_cost_inr: number;
  is_locked?: boolean;
  experience_tag?: string | null;
  recommended_viewpoint?: {
    name?: string;
    viewpoint_name?: string;
    description: string;
  } | null;
  verification_status?: string;
  last_verified_date?: string;
  source_reference?: string;
  crowd_forecast?: CrowdForecast | null;
  depends_on?: string[];
  detour_cost_inr?: number | null;
}

export interface DayPlan {
  day_number: number;
  date?: string | null;
  day_of_week?: string | null;
  cluster_name?: string | null;
  activities: ScheduledActivity[];
  day_cost_inr: number;
  fatigue_score?: number | null;
  fatigue_level?: string | null;
  weather?: WeatherSummary | null;
}

export interface HotelStaySummary {
  hotel_id?: string;
  hotel_name: string;
  lat?: number;
  lng?: number;
  price_per_night_per_room?: number;
  cost_per_night_inr?: number;
  rooms_needed: number;
  nights: number;
  people_accommodated?: number;
  total_cost_inr: number;
  provenance?: string;
  why_this_hotel?: string | null;
}

export interface VerificationReport {
  is_valid: boolean;
  audit_score: number;
  checks_passed: string[];
  warnings: string[];
  errors: string[];
  metrics: Record<string, string>;
}

export interface DailyFatigue {
  day_number: number;
  score: number;
  level: string;
  badge_color: string;
  advice: string;
  stops_count: number;
  est_transit_km: number;
}

export interface FatigueReport {
  trip_fatigue_score: number;
  overall_pace: string;
  group_profile?: string;
  daily_breakdown: DailyFatigue[];
}

export interface InterCityRoute {
  route_id: string;
  origin_city: string;
  destination_city: string;
  mode: 'train' | 'bus' | 'flight';
  operator_name: string;
  service_number?: string | null;
  departure_station: string;
  arrival_station: string;
  departure_window: string;
  typical_duration_min: number;
  typical_fare_min: number;
  typical_fare_max: number;
  fare_class: string;
  availability_status: string;
  recommendation_badge?: string | null;
  last_mile_note: string;
  notes?: string | null;
}

export interface LastMileConnection {
  arrival_terminal: string;
  destination_hotel: string;
  distance_km: number;
  estimated_time_min: number;
  estimated_cost_inr: number;
  recommended_mode: 'auto' | 'cab';
  guidance: string;
}

export interface InterCityTransportSummary {
  origin_city: string;
  destination_city: string;
  recommended_option: InterCityRoute;
  all_options: InterCityRoute[];
  transit_advice: string;
  last_mile?: LastMileConnection | null;
}

export interface SynthesisStage {
  stage: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  detail: string;
}

export interface TripPlan {
  plan_name: string;
  variant_type: 'budget' | 'balanced' | 'comfort';
  hotel_summary?: HotelStaySummary | null;
  estimated_transport_cost_inr: number;
  transport_mode: 'cab' | 'auto' | 'metro' | 'walk';
  transport_budget_status: string;
  days: DayPlan[];
  total_cost_inr: number;
  verification_report?: VerificationReport | null;
  fatigue_report?: FatigueReport | null;
  decision_trace?: DecisionTrace | null;
  expense_breakdown?: ExpenseBreakdown | null;
  intercity_transport?: InterCityTransportSummary | null;
  disclaimer?: string;
}

export interface MultiVariantTripPlan {
  destination: string;
  origin_city?: string | null;
  travel_dates: string;
  synthesis_stages?: SynthesisStage[];
  variants: {
    budget: TripPlan;
    balanced: TripPlan;
    comfort: TripPlan;
  };
}

export interface TripFormData {
  origin_city?: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_inr: number;
  people_count: number;
  pace: 'relaxed' | 'balanced' | 'intensive';
  transport_mode: 'cab' | 'auto' | 'metro' | 'walk';
  group_profile?: 'default' | 'young_solo' | 'family' | 'elderly';
  locked_activities?: string[];
  origin_type?: 'hotel' | 'center' | 'station' | 'airport';
  start_location?: string;
  interests: string[];
}
