export interface ScheduledActivity {
  place_name: string;
  lat?: number;
  lng?: number;
  start_time: string;
  end_time: string;
  estimated_cost_inr: number;
  experience_tag?: string | null;
  recommended_viewpoint?: {
    name: string;
    description: string;
  } | null;
}

export interface DayPlan {
  day_number: number;
  date?: string | null;
  day_of_week?: string | null;
  cluster_name?: string | null;
  activities: ScheduledActivity[];
  day_cost_inr: number;
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
  total_cost_inr: number;
  why_this_hotel?: string | null;
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
}

export interface MultiVariantTripPlan {
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
  interests: string[];
}
