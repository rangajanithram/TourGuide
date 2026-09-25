import math
from typing import List, Tuple, Optional
from tripweave.models import Place, TripRequest, HotelStaySummary
from tripweave.distance import calculate_distance_km

class FeasibilityFilter:
    """
    Stage 2 of the TripWeave Engine.
    Handles Centroid-based Hotel Selection (minimizing lodging + commute costs),
    supports custom origin hubs for day trips, and partitions budget envelopes.
    """

    def select_hotel(self, places: List[Place], request: TripRequest) -> Tuple[Place, HotelStaySummary]:
        all_hotels = [p for p in places if p.place_type == "hotel"]
        sightseeing = [p for p in places if p.place_type != "hotel"]
        
        if not all_hotels and request.days > 1:
            raise Exception("No hotel candidates found in database for overnight trip!")

        # 1. Day Trip vs Overnight Stay Math
        nights = max(0, request.days - 1)
        
        if nights == 0:
            # Day Trip: Use specified starting location or create a central transit hub
            start_name = request.start_location or "Secunderabad Railway Station"
            base_hub = Place(
                place_id="hub_daytrip",
                name=start_name,
                place_type="hotel", # acts as route origin/depot
                lat=17.4334,
                lng=78.5045, # Centrally accessible transit terminal
                duration_minutes=0,
                estimated_cost_per_person_inr=0,
                tags=["transit_hub"]
            )
            summary = HotelStaySummary(
                hotel_id=base_hub.place_id,
                hotel_name=f"{base_hub.name} (Day Trip Origin)",
                price_per_night_per_room=0,
                rooms_needed=0,
                nights=0,
                people_accommodated=request.people_count,
                total_cost_inr=0,
                provenance="Day trip - origin transit terminal (no lodging charges incurred)"
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
            raise Exception(f"No hotels found in user's nightly budget range: ₹{min_p} - ₹{max_p}")

        # 3. Centroid-Based Hotel Scoring (Engineering Blueprint requirement)
        # Instead of just picking the cheapest hotel blind to geography, we score each hotel by:
        # Combined Cost = Lodging Stay Total + Estimated Commute Cost to Attractions Centroid
        if sightseeing:
            centroid_lat = sum(p.lat for p in sightseeing) / len(sightseeing)
            centroid_lng = sum(p.lng for p in sightseeing) / len(sightseeing)
        else:
            centroid_lat, centroid_lng = 17.3850, 78.4867

        def score_hotel(hotel: Place) -> float:
            occupancy = hotel.max_guests_per_room or 2
            rooms = math.ceil(request.people_count / occupancy)
            lodging_total = rooms * (hotel.price_per_night_inr or 0) * nights
            
            # Commute penalty: 2 trips/day * distance to centroid * ₹18/km average fare
            dist_km = calculate_distance_km(hotel.lat, hotel.lng, centroid_lat, centroid_lng)
            commute_penalty = dist_km * 2 * 18 * request.days
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
                selected_hotel = hotel
                selected_summary = HotelStaySummary(
                    hotel_id=hotel.place_id,
                    hotel_name=hotel.name,
                    price_per_night_per_room=nightly_rate,
                    rooms_needed=rooms_needed,
                    nights=nights,
                    people_accommodated=request.people_count,
                    total_cost_inr=total_hotel_cost,
                    provenance=hotel.data_source or "Curated Seed Data (Phase 0 Prototype)"
                )
                break

        if not selected_hotel:
            raise Exception(f"All hotels exceed total trip budget of ₹{request.budget_inr} for {nights} night(s) and {request.people_count} guest(s).")

        return selected_hotel, selected_summary

    def filter_candidates(self, places: List[Place], request: TripRequest) -> Tuple[List[Place], HotelStaySummary, int]:
        hotel, hotel_summary = self.select_hotel(places, request)
        sightseeing = [p for p in places if p.place_type != "hotel"]

        est_transport_budget = 300 * request.days
        if request.transport_pref and request.transport_pref.max_budget_inr:
            est_transport_budget = request.transport_pref.max_budget_inr

        sightseeing_budget = request.budget_inr - hotel_summary.total_cost_inr - est_transport_budget
        if sightseeing_budget < 0:
            sightseeing_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr)
            est_transport_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr - sightseeing_budget)

        viable_candidates = []
        for place in sightseeing:
            cost_per_person = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
            total_place_cost = cost_per_person * request.people_count
            
            if total_place_cost <= sightseeing_budget:
                viable_candidates.append(place)
            else:
                print(f"   [Filter] Dropped '{place.name}' - Total cost ₹{total_place_cost} exceeds entire sightseeing budget ₹{sightseeing_budget}.")

        viable_candidates.append(hotel)
        return viable_candidates, hotel_summary, est_transport_budget
