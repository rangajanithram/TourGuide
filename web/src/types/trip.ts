export interface ScheduledActivity {
  place_name: string;
  lat?: number;
  lng?: number;
  start_time: string;
  end_time: string;
  estimated_cost_inr: number;
  experience_tag?: string | null;
  recommended_viewpoint?: {
    name?: string;
    viewpoint_name?: string;
    description: string;
  } | null;
  verification_status?: string;
  last_verified_date?: string;
  source_reference?: string;
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
  daily_breakdown: DailyFatigue[];
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
  disclaimer?: string;
}

export interface MultiVariantTripPlan {
  destination: string;
  travel_dates: string;
  variants: {
    budget: TripPlan;
    balanced: TripPlan;
    comfort: TripPlan;
  };
}

export interface TripFormData {
  destination: string;
  start_date: string;
  end_date: string;
  budget_inr: number;
  people_count: number;
  pace: 'relaxed' | 'balanced' | 'intensive';
  transport_mode: 'cab' | 'auto' | 'metro' | 'walk';
  origin_type?: 'hotel' | 'center' | 'station' | 'airport';
  start_location?: string;
  interests: string[];
}
