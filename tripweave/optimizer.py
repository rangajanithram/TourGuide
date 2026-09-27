from datetime import date, timedelta
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from typing import List, Optional
from tripweave.models import Place, DayPlan, ScheduledActivity, TripPlan, HotelStaySummary, ViewpointRecommendation, TransportMode, PacePreference, PlanVariantType
from tripweave.distance import get_travel_metrics
from tripweave.solar import get_golden_hour_window
from tripweave.clustering import GeoClusterer

class TripOptimizer:
    def __init__(
        self, 
        places: List[Place], 
        days: int, 
        hotel_id: str,
        hotel_summary: Optional[HotelStaySummary] = None,
        transport_mode: TransportMode = TransportMode.CAB,
        people_count: int = 1,
        pace: PacePreference = PacePreference.BALANCED,
        interests: Optional[List[str]] = None,
        max_total_budget: Optional[int] = None,
        max_transport_budget: Optional[int] = None,
        start_date: Optional[date] = None,
        variant_type: PlanVariantType = PlanVariantType.BALANCED,
        locked_activities: Optional[List[str]] = None
    ):
        self.places = places
        self.days = days
        self.hotel_summary = hotel_summary
        self.transport_mode = transport_mode.value if hasattr(transport_mode, "value") else str(transport_mode)
        self.people_count = people_count
        self.pace = pace
        self.interests = interests or []
        self.max_total_budget = max_total_budget
        self.max_transport_budget = max_transport_budget
        self.start_date = start_date
        self.variant_type = variant_type
        self.locked_activities = [a.strip().lower() for a in (locked_activities or []) if a.strip()]
        
        # Find which place is our hotel (the start and end point of every day)
        self.hotel_index = next((i for i, p in enumerate(places) if p.place_id == hotel_id), 0)
        self.cost_matrix = []
        
    def _create_matrices(self) -> List[List[int]]:
        """Creates time matrix (for routing) and cost matrix (for transit budgeting)."""
        time_matrix = []
        self.cost_matrix = []
        for from_place in self.places:
            time_row = []
            cost_row = []
            for to_place in self.places:
                if from_place.place_id == to_place.place_id:
                    time_row.append(0)
                    cost_row.append(0)
                else:
                    travel_time, travel_cost = get_travel_metrics(
                        from_place.lat, from_place.lng, 
                        to_place.lat, to_place.lng,
                        mode=self.transport_mode,
                        people_count=self.people_count
                    )
                    total_time = from_place.duration_minutes + travel_time
                    time_row.append(total_time)
                    cost_row.append(travel_cost)
            time_matrix.append(time_row)
            self.cost_matrix.append(cost_row)
        return time_matrix

    def generate_plan(self) -> TripPlan:
        # 1. Setup the basic OR-Tools routing system
        time_matrix = self._create_matrices()
        
        clusterer = GeoClusterer(eps_km=6.0)
        clusters_dict = clusterer.cluster_places(self.places)
        place_cluster_map = {}
        for c_id, c_places in clusters_dict.items():
            for cp in c_places:
                place_cluster_map[cp.place_id] = c_id

        manager = pywrapcp.RoutingIndexManager(len(self.places), self.days, self.hotel_index)
        routing = pywrapcp.RoutingModel(manager)

        # 2. Tell the optimizer how to calculate "Time" (strict physical minutes)
        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return time_matrix[from_node][to_node]

        time_callback_index = routing.RegisterTransitCallback(time_callback)

        # 3. Multi-Objective Routing Cost Callback (Time + Fare + DBSCAN Neighborhood Cluster Penalty)
        def routing_cost_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            base_time = time_matrix[from_node][to_node]
            base_cost = self.cost_matrix[from_node][to_node]

            # Cross-cluster hop penalty to ensure vehicles group visits locally
            cluster_penalty = 0
            if from_node != self.hotel_index and to_node != self.hotel_index:
                from_p = self.places[from_node]
                to_p = self.places[to_node]
                c1 = place_cluster_map.get(from_p.place_id)
                c2 = place_cluster_map.get(to_p.place_id)
                if c1 is not None and c2 is not None and c1 != c2:
                    cluster_penalty = 350 # Encourages OR-Tools to finish a neighborhood before moving

            return int(base_time * 5 + base_cost + cluster_penalty)

        cost_callback_index = routing.RegisterTransitCallback(routing_cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(cost_callback_index)

        # 4. Add Time Dimension
        routing.AddDimension(
            time_callback_index,
            120,    # MAXIMUM SLACK: Up to 120 minutes waiting allowed
            720,    # Max 720 minutes (8:00 AM to 8:00 PM)
            True,   # Start at 0
            "Time"
        )
        time_dimension = routing.GetDimensionOrDie("Time")

        # --- Enforce Time Windows & Disjunctions (Drop Penalties) ---
        for i in range(len(self.places)):
            place = self.places[i]
            if i == self.hotel_index:
                continue # Hotel depot is always accessible
                
            index = manager.NodeToIndex(i)
            time_var = time_dimension.CumulVar(index)
            
            # Hard Opening/Closing Window
            min_arrival = place.open_time_mins if place.open_time_mins is not None else 0
            if place.close_time_mins is not None:
                max_arrival = place.close_time_mins - place.duration_minutes
            else:
                max_arrival = 720
            time_var.SetRange(min_arrival, max_arrival)

            # --- Weekly Closure Constraint (e.g. Closed on Fridays / Mondays) ---
            if place.closed_days and self.start_date:
                for day_id in range(self.days):
                    current_date = self.start_date + timedelta(days=day_id)
                    current_day_name = current_date.strftime("%A").lower()
                    if current_day_name in [d.lower() for d in place.closed_days]:
                        # Forbid vehicle (day_id) from visiting this node on its closed day!
                        routing.VehicleVar(index).RemoveValue(day_id)

            # Soft Golden Hour Preference (Respects closing time!)
            if place.golden_hour_recommended:
                trip_mid_date = (self.start_date + timedelta(days=self.days // 2)) if self.start_date else (date.today() + timedelta(days=self.days // 2))
                gh_start, gh_end = get_golden_hour_window(place.lat, place.lng, target_date=trip_mid_date)
                # If place closes before sunset, ideal arrival is bounded by max_arrival
                # so the visitor is inside at the summit during sunset before gates close!
                ideal_arrival = min(max_arrival, max(min_arrival, gh_start - (place.duration_minutes // 2)))
                time_dimension.SetCumulVarSoftLowerBound(index, ideal_arrival, 15)
                time_dimension.SetCumulVarSoftUpperBound(index, min(max_arrival, gh_end), 15)

            # --- Disjunction (Drop Penalty) ---
            # Crucial: Allows the solver to drop places instead of failing when schedule is packed!
            is_locked = (place.place_id.lower() in self.locked_activities or place.name.lower() in self.locked_activities)
            if is_locked:
                base_drop_penalty = 1_000_000  # Strict user pin constraint
            else:
                base_drop_penalty = 2000
                # Higher penalty if it matches user's interests (solver works harder to keep it)
                if any(interest.lower() in [t.lower() for t in place.tags] for interest in self.interests):
                    base_drop_penalty += 1500
                if place.golden_hour_recommended:
                    base_drop_penalty += 1000
                
            routing.AddDisjunction([index], base_drop_penalty)

        # --- Dynamic Pace Dimension ---
        # Start depot is 0. Each stop adds 1.
        # So N activities accumulate N+1 at the return depot.
        pace_val = self.pace.value if hasattr(self.pace, "value") else str(self.pace).lower()
        if pace_val == "relaxed":
            max_stops_per_day = 3  # 2 activities + return depot (0 -> 1 -> 2 -> 3)
        elif pace_val == "intensive":
            max_stops_per_day = 5  # 4 activities + return depot (0 -> 1 -> 2 -> 3 -> 4 -> 5)
        else: # balanced
            max_stops_per_day = 4  # 3 activities + return depot (0 -> 1 -> 2 -> 3 -> 4)
            
        routing.AddConstantDimension(
            1,
            max_stops_per_day,
            True,
            "ActivityCount"
        )

        # --- In-Solver Budget Dimension ---
        # Direct constraint: OR-Tools drops costly or out-of-reach stops during search
        if self.max_total_budget:
            def step_cost_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                t_cost = self.cost_matrix[from_node][to_node]
                if to_node == self.hotel_index:
                    p_cost = 0
                else:
                    place_obj = self.places[to_node]
                    cost_pp = place_obj.estimated_cost_per_person_inr or place_obj.entry_fee_inr or 0
                    p_cost = cost_pp * self.people_count
                return t_cost + p_cost

            budget_callback_index = routing.RegisterTransitCallback(step_cost_callback)
            hotel_total = self.hotel_summary.total_cost_inr if self.hotel_summary else 0
            available_budget = max(500, self.max_total_budget - hotel_total)

            routing.AddDimension(
                budget_callback_index,
                0,                   # No slack
                available_budget,    # Allow vehicles to flex up to available budget
                True,                # Start at 0
                "DailyBudget"
            )
            budget_dim = routing.GetDimensionOrDie("DailyBudget")
            solver = routing.solver()
            solver.Add(solver.Sum([budget_dim.CumulVar(routing.End(v)) for v in range(self.days)]) <= available_budget)

        # --- In-Solver Transport Fare Dimension ---
        if self.max_transport_budget:
            def transport_fare_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                return self.cost_matrix[from_node][to_node]

            transport_fare_callback_index = routing.RegisterTransitCallback(transport_fare_callback)

            routing.AddDimension(
                transport_fare_callback_index,
                0,
                self.max_transport_budget,
                True,
                "TransportFare"
            )
            transport_dim = routing.GetDimensionOrDie("TransportFare")
            solver = routing.solver()
            solver.Add(solver.Sum([transport_dim.CumulVar(routing.End(v)) for v in range(self.days)]) <= self.max_transport_budget)

        # 4. Solve with Local Search
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = 2

        solution = routing.SolveWithParameters(search_parameters)

        if not solution:
            raise Exception("No feasible itinerary could be found with the given constraints.")

        # 5. Translate solution into TripPlan
        return self._parse_solution(manager, routing, solution)

    def _minutes_to_clock_time(self, total_minutes: int) -> str:
        actual_hour = 8 + (total_minutes // 60)
        actual_minute = total_minutes % 60
        period = "AM" if actual_hour < 12 else "PM"
        
        if actual_hour > 12:
            actual_hour -= 12
        if actual_hour == 0:
            actual_hour = 12
            
        return f"{actual_hour}:{actual_minute:02d} {period}"

    def _parse_solution(self, manager, routing, solution) -> TripPlan:
        day_plans = []
        time_dimension = routing.GetDimensionOrDie("Time")
        total_activities_cost = 0
        total_transport_cost = 0

        clusterer = GeoClusterer()
        for day_id in range(self.days):
            index = routing.Start(day_id)
            activities = []
            day_places = []
            day_cost = 0
            
            while not routing.IsEnd(index):
                node_index = manager.IndexToNode(index)
                place = self.places[node_index]
                
                time_var = time_dimension.CumulVar(index)
                start_minute = solution.Min(time_var)
                
                next_index = solution.Value(routing.NextVar(index))
                next_node = manager.IndexToNode(next_index)
                
                if self.cost_matrix:
                    total_transport_cost += self.cost_matrix[node_index][next_node]
                
                if not (index == routing.Start(day_id)):
                    cost_per_person = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
                    place_cost = cost_per_person * self.people_count
                    
                    exp_tag = None
                    day_date = (self.start_date + timedelta(days=day_id)) if self.start_date else None
                    end_minute = start_minute + place.duration_minutes
                    if place.golden_hour_recommended:
                        gh_start, gh_end = get_golden_hour_window(place.lat, place.lng, target_date=day_date)
                        if end_minute >= gh_start and start_minute <= (gh_end + 30):
                            exp_tag = "🌅 Scheduled for Astronomical Golden Hour Sunset"
                    elif place.night_view_recommended and start_minute >= 600:
                        exp_tag = "🌙 Scheduled for Evening Illumination"
                        
                    best_vp = place.best_viewpoints[0] if place.best_viewpoints else None
                    is_pinned = (place.place_id.lower() in self.locked_activities or place.name.lower() in self.locked_activities)

                    activities.append(ScheduledActivity(
                        place_name=place.name,
                        place_type=getattr(place, "place_type", "attraction"),
                        lat=place.lat,
                        lng=place.lng,
                        start_time=self._minutes_to_clock_time(start_minute),
                        end_time=self._minutes_to_clock_time(start_minute + place.duration_minutes),
                        estimated_cost_inr=place_cost,
                        is_locked=is_pinned,
                        experience_tag=exp_tag,
                        recommended_viewpoint=best_vp,
                        verification_status=getattr(place, "verification_status", "curated_seed"),
                        last_verified_date=getattr(place, "last_verified_date", "2026-09-01"),
                        source_reference=getattr(place, "source_reference", "Curated City Seed Dataset")
                    ))
                    day_places.append(place)
                    day_cost += place_cost
                
                index = next_index
                
            if activities:
                day_date = (self.start_date + timedelta(days=day_id)) if self.start_date else None
                date_str = day_date.isoformat() if day_date else None
                day_name = day_date.strftime("%A") if day_date else None
                cluster_label = clusterer.get_cluster_name(day_places) if day_places else "Central City Exploration"

                day_plans.append(DayPlan(
                    day_number=day_id + 1,
                    date=date_str,
                    day_of_week=day_name,
                    cluster_name=cluster_label,
                    activities=activities,
                    day_cost_inr=day_cost
                ))
                total_activities_cost += day_cost

        hotel_total = self.hotel_summary.total_cost_inr if self.hotel_summary else 0
        grand_total = total_activities_cost + total_transport_cost + hotel_total

        # --- Graceful Budget & Transport Trimming & Physically Coherent Schedule Recalculation ---
        budget_exceeded = bool(self.max_total_budget and grand_total > self.max_total_budget)
        transport_exceeded = bool(self.max_transport_budget and total_transport_cost > self.max_transport_budget)

        if budget_exceeded or transport_exceeded:
            pruned_any = False
            for day in reversed(day_plans):
                while day.activities and (
                    (self.max_total_budget and grand_total > self.max_total_budget) or
                    (self.max_transport_budget and total_transport_cost > self.max_transport_budget)
                ):
                    pruned = day.activities.pop()
                    pruned_any = True
                    total_activities_cost -= pruned.estimated_cost_inr
                    day.day_cost_inr -= pruned.estimated_cost_inr

                    # Recalculate route transit fares along surviving stops
                    total_transport_cost = 0
                    for d in day_plans:
                        if not d.activities:
                            continue
                        stop_nodes = [self.hotel_index] + [
                            next(i for i, p in enumerate(self.places) if p.name == a.place_name)
                            for a in d.activities
                        ] + [self.hotel_index]
                        for s in range(len(stop_nodes) - 1):
                            total_transport_cost += self.cost_matrix[stop_nodes[s]][stop_nodes[s+1]]

                    grand_total = total_activities_cost + total_transport_cost + hotel_total

            # If pruning occurred, physically re-accumulate clock times along surviving stops!
            if pruned_any:
                hotel_place = self.places[self.hotel_index]
                for day in day_plans:
                    curr_minute = 60  # Start tour at 9:00 AM (60 minutes from 8:00 AM)
                    prev_lat, prev_lng = hotel_place.lat, hotel_place.lng
                    surviving_places = []
                    valid_activities = []
                    recalc_day_cost = 0

                    for act in day.activities:
                        act_place = next(p for p in self.places if p.name == act.place_name)
                        travel_mins, _ = get_travel_metrics(prev_lat, prev_lng, act_place.lat, act_place.lng, mode=self.transport_mode, people_count=self.people_count)
                        arrival_minute = curr_minute + travel_mins
                        start_minute = max(arrival_minute, act_place.open_time_mins if act_place.open_time_mins is not None else 0)
                        end_minute = start_minute + act_place.duration_minutes

                        # Hard constraint: Skip if exceeding closing hours
                        if act_place.close_time_mins is not None and end_minute > act_place.close_time_mins:
                            continue

                        act.start_time = self._minutes_to_clock_time(start_minute)
                        act.end_time = self._minutes_to_clock_time(end_minute)
                        curr_minute = end_minute
                        prev_lat, prev_lng = act_place.lat, act_place.lng
                        valid_activities.append(act)
                        surviving_places.append(act_place)
                        recalc_day_cost += act.estimated_cost_inr

                    day.activities = valid_activities
                    day.day_cost_inr = recalc_day_cost
                    if surviving_places:
                        day.cluster_name = clusterer.get_cluster_name(surviving_places)

                # Recompute total activities and transport costs after time-filtering
                total_activities_cost = sum(d.day_cost_inr for d in day_plans)
                total_transport_cost = 0
                for d in day_plans:
                    if not d.activities:
                        continue
                    stop_nodes = [self.hotel_index] + [
                        next(i for i, p in enumerate(self.places) if p.name == a.place_name)
                        for a in d.activities
                    ] + [self.hotel_index]
                    for s in range(len(stop_nodes) - 1):
                        total_transport_cost += self.cost_matrix[stop_nodes[s]][stop_nodes[s+1]]
                grand_total = total_activities_cost + total_transport_cost + hotel_total

        # Evaluate Transport Budget Status
        transport_status = "Within budget"
        if self.max_transport_budget:
            if total_transport_cost <= self.max_transport_budget:
                transport_status = f"✅ ₹{total_transport_cost} (Within cap of ₹{self.max_transport_budget})"
            else:
                transport_status = f"⚠️ ₹{total_transport_cost} (Exceeds cap of ₹{self.max_transport_budget})"

        # Validate that the itinerary contains actual visits
        total_visits = sum(len(d.activities) for d in day_plans)
        if total_visits == 0:
            raise Exception("No feasible sightseeing visits could be scheduled within the specified budget, time, and transit constraints.")

        return TripPlan(
            plan_name=f"TripWeave Prototype Itinerary ({self.variant_type.value.capitalize()} Variant)",
            variant_type=self.variant_type,
            hotel_summary=self.hotel_summary,
            estimated_transport_cost_inr=total_transport_cost,
            transport_mode=TransportMode(self.transport_mode),
            transport_budget_status=transport_status,
            days=[d for d in day_plans if d.activities],
            total_cost_inr=grand_total
        )
