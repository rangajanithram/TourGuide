import math
from typing import List, Tuple, Optional
from tripweave.models import Place, TripRequest, HotelStaySummary
from tripweave.distance import calculate_distance_km
from tripweave.geocoding import LocationResolver

class FeasibilityFilter:
    """
    Stage 2 of the TripWeave Engine.
    Handles Centroid-based Hotel Selection (minimizing lodging + commute costs),
    supports custom origin hubs for day trips, and partitions budget envelopes.
    """

    def select_hotel(self, places: List[Place], request: TripRequest) -> Tuple[Place, HotelStaySummary]:
        if request.stay_choice:
            choice = request.stay_choice
            _, center_lat, center_lng = LocationResolver.resolve_origin(request.destination, origin_type="center")
            if calculate_distance_km(choice.lat, choice.lng, center_lat, center_lng) > 100:
                raise ValueError("Your daily base is over 100 km from the destination center. Confirm its map coordinates or choose a closer base.")
            included = choice.total_stay_cost_inr if choice.budget_treatment == "include" else 0
            excluded = choice.total_stay_cost_inr if choice.budget_treatment == "already_paid" else 0
            if included >= request.budget_inr:
                raise ValueError("The booked stay uses the entire destination budget. Increase the budget or correct the stay cost.")
            label = {"booked": "Your booked stay", "family_friends": "Staying with family or friends", "no_stay": "Daily base; no accommodation arranged"}[choice.kind]
            provenance = "User-confirmed location and whole-group stay cost; booking, occupancy and check-in are not verified."
            base = Place(place_id="user_stay_base", name=choice.base_name, place_type="hotel",
                         lat=choice.lat, lng=choice.lng, duration_minutes=0,
                         verification_status="estimated", last_verified_date=None, source_reference=provenance)
            return base, HotelStaySummary(hotel_id=base.place_id, hotel_name=choice.base_name,
                lat=choice.lat, lng=choice.lng, accommodation_kind=choice.kind,
                reported_stay_total_inr=choice.total_stay_cost_inr, excluded_prepaid_cost_inr=excluded,
                price_per_night_per_room=0, rooms_needed=0,
                nights=0 if choice.kind == "no_stay" else max(0, request.days - 1),
                people_accommodated=request.people_count, total_cost_inr=included,
                provenance=provenance, why_this_hotel=f"{label}. Each sightseeing day starts and ends at your confirmed base. ₹{included} counts toward the destination budget; ₹{excluded} was marked already paid.",
                check_in_time=choice.check_in_time or "14:00",
                check_out_time=choice.check_out_time or "11:00",
                osm_url=f"https://www.openstreetmap.org/?mlat={choice.lat}&mlon={choice.lng}#map=16/{choice.lat}/{choice.lng}")
        all_hotels = [p for p in places if p.place_type == "hotel"]
        sightseeing = [p for p in places if p.place_type != "hotel"]
        
        if not all_hotels and request.days > 1:
            raise ValueError("No hotel candidates found in database for overnight trip!")

        # 1. Day Trip vs Overnight Stay Math
        nights = max(0, request.days - 1)
        
        if nights == 0:
            # Day Trip: Use LocationResolver to resolve precise coordinates for airport, station, or custom hub
            origin_name, origin_lat, origin_lng = LocationResolver.resolve_origin(
                destination=request.destination,
                start_location=request.start_location,
                origin_type=request.origin_type
            )
            base_hub = Place(
                place_id="hub_daytrip",
                name=origin_name,
                place_type="hotel", # acts as route origin/depot
                lat=origin_lat,
                lng=origin_lng,
                duration_minutes=0,
                estimated_cost_per_person_inr=0,
                tags=["transit_hub"]
            )
            summary = HotelStaySummary(
                hotel_id=base_hub.place_id,
                hotel_name=f"{origin_name} (Day Trip Origin)",
                lat=origin_lat,
                lng=origin_lng,
                price_per_night_per_room=0,
                rooms_needed=0,
                nights=0,
                people_accommodated=request.people_count,
                total_cost_inr=0,
                provenance="Day trip - origin transit terminal (no lodging charges incurred)",
                why_this_hotel=f"Day trip starts and finishes at {origin_name} with zero lodging charges incurred."
            )
            return base_hub, summary

        # 2. Filter hotels by User Nightly Price Range (if provided)
        candidates = all_hotels
        if request.hotel_pref:
            if request.hotel_pref.min_price_per_night_inr is not None:
                candidates = [h for h in candidates if (h.price_per_night_inr or 0) >= request.hotel_pref.min_price_per_night_inr]
            if request.hotel_pref.max_price_per_night_inr is not None:
                candidates = [h for h in candidates if (h.price_per_night_inr or 0) <= request.hotel_pref.max_price_per_night_inr]

        if not candidates:
            min_p = request.hotel_pref.min_price_per_night_inr if request.hotel_pref else "Any"
            max_p = request.hotel_pref.max_price_per_night_inr if request.hotel_pref else "Any"
            raise ValueError(f"No hotels found in user's nightly budget range: ₹{min_p} - ₹{max_p}")

        # 3. Centroid-Based Hotel Scoring (Engineering Blueprint requirement)
        # Score each hotel by: Combined Cost = Lodging Stay Total + Commute Cost to Attractions Centroid
        if sightseeing:
            centroid_lat = sum(p.lat for p in sightseeing) / len(sightseeing)
            centroid_lng = sum(p.lng for p in sightseeing) / len(sightseeing)
        else:
            _, centroid_lat, centroid_lng = LocationResolver.resolve_origin(request.destination)

        mode_str = request.transport_pref.mode.value if request.transport_pref and hasattr(request.transport_pref.mode, "value") else "cab"

        from tripweave.distance import get_travel_metrics
        def score_hotel(hotel: Place) -> float:
            occupancy = hotel.max_guests_per_room or 2
            rooms = math.ceil(request.people_count / occupancy)
            lodging_total = rooms * (hotel.price_per_night_inr or 0) * nights
            
            # Commute penalty: 2 trips/day to/from sightseeing centroid using selected transport mode
            _, one_way_cost = get_travel_metrics(hotel.lat, hotel.lng, centroid_lat, centroid_lng, mode=mode_str, people_count=request.people_count)
            commute_penalty = one_way_cost * 2 * request.days
            return lodging_total + commute_penalty

        candidates.sort(key=score_hotel)

        selected_hotel = None
        selected_summary = None

        for hotel in candidates:
            occupancy = hotel.max_guests_per_room or 2
            rooms_needed = math.ceil(request.people_count / occupancy)
            nightly_rate = hotel.price_per_night_inr or 0
            total_hotel_cost = rooms_needed * nightly_rate * nights

            if total_hotel_cost <= request.budget_inr:
                dist_to_centroid = calculate_distance_km(hotel.lat, hotel.lng, centroid_lat, centroid_lng)
                selected_hotel = hotel
                selected_summary = HotelStaySummary(
                    hotel_id=hotel.place_id,
                    hotel_name=hotel.name,
                    lat=hotel.lat,
                    lng=hotel.lng,
                    price_per_night_per_room=nightly_rate,
                    rooms_needed=rooms_needed,
                    nights=nights,
                    people_accommodated=request.people_count,
                    total_cost_inr=total_hotel_cost,
                    provenance=hotel.data_source or "Curated Seed Data (Phase 0 Prototype)",
                    why_this_hotel=(
                        f"Selected {hotel.name} (₹{nightly_rate}/room/night) because its central location "
                        f"({dist_to_centroid:.1f} km from sightseeing centroid) minimizes commute overhead "
                        f"via {mode_str.capitalize()} while comfortably accommodating {request.people_count} travelers."
                    ),
                    check_in_time=getattr(hotel, "check_in_time", "14:00") or "14:00",
                    check_out_time=getattr(hotel, "check_out_time", "11:00") or "11:00",
                    rating=getattr(hotel, "rating", None),
                    review_count=getattr(hotel, "review_count", None),
                    formatted_address=getattr(hotel, "formatted_address", None),
                    osm_url=getattr(hotel, "osm_url", None) or f"https://www.openstreetmap.org/?mlat={hotel.lat}&mlon={hotel.lng}#map=16/{hotel.lat}/{hotel.lng}"
                )
                break

        if not selected_hotel:
            raise ValueError(f"All hotels exceed total trip budget of ₹{request.budget_inr} for {nights} night(s) and {request.people_count} guest(s).")

        return selected_hotel, selected_summary

    def filter_candidates(self, places: List[Place], request: TripRequest) -> Tuple[List[Place], HotelStaySummary, int]:
        hotel, hotel_summary = self.select_hotel(places, request)
        sightseeing = [p for p in places if p.place_type != "hotel"]

        est_transport_budget = 300 * request.days
        if request.transport_pref and request.transport_pref.max_budget_inr:
            est_transport_budget = request.transport_pref.max_budget_inr

        max_activity_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr)

        viable_candidates = []
        for place in sightseeing:
            cost_per_person = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
            total_place_cost = cost_per_person * request.people_count
            
            if total_place_cost <= max_activity_budget:
                viable_candidates.append(place)
            else:
                print(f"   [Filter] Dropped '{place.name}' - Total cost ₹{total_place_cost} exceeds total remaining non-lodging budget ₹{max_activity_budget}.")

        viable_candidates.append(hotel)
        return viable_candidates, hotel_summary, est_transport_budget
