import math
from typing import List, Tuple, Optional
from tripweave.models import Place, TripRequest, HotelStaySummary

class FeasibilityFilter:
    """
    Stage 2 of the TripWeave Engine.
    Handles Hotel Selection (zero cost for 1-day trips), partitions budget envelopes,
    and removes individually impossible candidates without premature greedy pruning.
    """

    def select_hotel(self, places: List[Place], request: TripRequest) -> Tuple[Place, HotelStaySummary]:
        all_hotels = [p for p in places if p.place_type == "hotel"]
        if not all_hotels:
            raise Exception("No hotel candidates found in database!")

        # 1. Day Trip vs Overnight Stay Math
        # A 1-day trip has 0 nights (day trip). A 2-day trip is 1 night.
        nights = max(0, request.days - 1)
        
        if nights == 0:
            # Day Trip: Use first hotel/hub as base meeting point without charging for lodging!
            base_hub = all_hotels[0]
            summary = HotelStaySummary(
                hotel_id=base_hub.place_id,
                hotel_name=base_hub.name,
                price_per_night_per_room=0,
                rooms_needed=0,
                nights=0,
                people_accommodated=request.people_count,
                total_cost_inr=0,
                provenance="Day trip - no lodging charges incurred"
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

        # 3. Find the best matching hotel that fits inside the total trip budget
        candidates.sort(key=lambda h: h.price_per_night_inr or 0)

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
        """
        Filters candidates, selects hotel, and allocates budget envelopes.
        Returns: (candidate_places, hotel_summary, estimated_transport_budget)
        """
        # 1. Select the compliant Hotel (or Day Trip Hub)
        hotel, hotel_summary = self.select_hotel(places, request)
        
        # 2. Separate sightseeing places (Drop all other hotels!)
        sightseeing = [p for p in places if p.place_type != "hotel"]

        # 3. Calculate Envelopes
        est_transport_budget = 300 * request.days
        if request.transport_pref and request.transport_pref.max_budget_inr:
            est_transport_budget = request.transport_pref.max_budget_inr

        # Maximum possible spend for sightseeing
        sightseeing_budget = request.budget_inr - hotel_summary.total_cost_inr - est_transport_budget
        if sightseeing_budget < 0:
            sightseeing_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr)
            est_transport_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr - sightseeing_budget)

        # 4. Filter only INDIVIDUALLY impossible places
        # Instead of greedy pruning, pass all feasible candidates to OR-Tools
        # so its interest-based drop penalties can choose the best combination!
        viable_candidates = []
        for place in sightseeing:
            cost_per_person = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
            total_place_cost = cost_per_person * request.people_count
            
            if total_place_cost <= sightseeing_budget:
                viable_candidates.append(place)
            else:
                print(f"   [Filter] Dropped '{place.name}' - Total cost ₹{total_place_cost} exceeds entire sightseeing budget ₹{sightseeing_budget}.")

        # Re-attach selected hotel/hub as the depot for routing
        viable_candidates.append(hotel)
        return viable_candidates, hotel_summary, est_transport_budget
