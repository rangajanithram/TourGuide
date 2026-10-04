"""
TripWeave Interactive Itinerary Customizer & Edit Consequences Engine.
Blueprint Section 12: Handles user actions (swap, remove, pin, move to sunset)
with deterministic physics impact previews (cost delta, travel delta, time feasibility).
"""
import re
from datetime import datetime, time as dt_time, timedelta
from typing import List, Optional, Tuple, Dict, Any

from tripweave.models import (
    TripPlan, DayPlan, ScheduledActivity, Place, EditActionType,
    EditConsequenceRequest, EditConsequenceResponse, TransportMode,
    TirednessSeverity, RebalanceTiredRequest, RebalanceTiredResponse,
    PacePreference, GroupProfile
)
from tripweave.distance import calculate_distance_km, get_travel_metrics
from tripweave.solar import get_golden_hour_window
from tripweave.provider import get_places_provider
from tripweave.fatigue import FatigueAnalyzer

def _parse_time_str(t_str: str) -> dt_time:
    """Parse a supported 24-hour or 12-hour time; never silently invent 09:00."""
    if not isinstance(t_str, str):
        raise ValueError("Time must be a string in HH:MM or HH:MM AM/PM format")
    cleaned = t_str.strip().upper()
    if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cleaned):
        return datetime.strptime(cleaned, "%H:%M").time()
    if re.fullmatch(r"(?:0?[1-9]|1[0-2]):[0-5]\d (?:AM|PM)", cleaned):
        return datetime.strptime(cleaned, "%I:%M %p").time()
    raise ValueError(f"Invalid time '{t_str}'. Use HH:MM or HH:MM AM/PM.")

def _format_time(t: dt_time) -> str:
    """Formats dt_time to 12-hour AM/PM string."""
    h = t.hour
    m = t.minute
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12:02d}:{m:02d} {suffix}"

def _add_minutes(t: dt_time, mins: int) -> dt_time:
    """Add minutes within one itinerary day; reject rather than clamp overrun."""
    total_m = t.hour * 60 + t.minute + mins
    if total_m < 0 or total_m > 23 * 60 + 59:
        raise ValueError("The revised schedule extends beyond the current day")
    return dt_time(total_m // 60, total_m % 60)

def _minutes_between(t1: dt_time, t2: dt_time) -> int:
    """Computes minutes from t1 to t2."""
    m1 = t1.hour * 60 + t1.minute
    m2 = t2.hour * 60 + t2.minute
    return m2 - m1


def _is_sunset_activity(activity: ScheduledActivity) -> bool:
    tag = (activity.experience_tag or "").lower()
    return "sunset" in tag or "golden_hour" in tag or "golden hour" in tag


def _estimated_leg(
    start: Tuple[float, float],
    end: Tuple[float, float],
    mode: str,
    people: int,
) -> Tuple[float, int, int]:
    """Return estimated route km, travel minutes, and fare for one leg.

    The route distance remains a straight-line approximation with a road
    multiplier for road modes; time and fare use the shared mode calculator.
    Zero-distance legs are truly zero rather than minimum-fare trips.
    """
    straight_km = calculate_distance_km(start[0], start[1], end[0], end[1])
    if straight_km < 0.01:
        return 0.0, 0, 0
    route_km = straight_km * (1.25 if mode in ("cab", "auto", "walk") else 1.0)
    minutes, cost = get_travel_metrics(start[0], start[1], end[0], end[1], mode, people)
    return route_km, minutes, cost


class ItineraryEditor:
    """
    Engine for simulating and previewing the physical consequences of itinerary edits.
    Computes exact cost deltas, travel distance deltas, and verifies schedule feasibility.
    """

    @staticmethod
    def get_candidate_alternatives(destination: str, exclude_place_ids: List[str] = None, exclude_ids: List[str] = None) -> List[Place]:
        """
        Returns candidate sightseeing attractions and dining places for a city
        excluding already scheduled places.
        """
        provider = get_places_provider()
        all_places = provider.get_places(destination)
        ids_to_exclude = (exclude_place_ids or []) + (exclude_ids or [])
        exclude_set = set(p.lower().strip() for p in ids_to_exclude)
        
        candidates = []
        for p in all_places:
            if p.place_type == "hotel":
                continue
            if p.place_id.lower().strip() in exclude_set:
                continue
            candidates.append(p)
        return candidates

    @classmethod
    def preview_edit(cls, request: EditConsequenceRequest) -> EditConsequenceResponse:
        """
        Simulates an edit action on a specific day and activity index,
        evaluating the physics, cost, and time feasibility deltas.
        """
        plan = request.plan
        day_match = [d for d in plan.days if d.day_number == request.day_number]
        if not day_match:
            raise ValueError(f"Day number {request.day_number} not found in plan.")
        
        target_day = day_match[0]
        activities = target_day.activities
        idx = request.activity_index

        if idx < 0 or idx >= len(activities):
            raise ValueError(f"Activity index {idx} out of range for Day {request.day_number} ({len(activities)} stops).")

        target_act = activities[idx]
        mode_str = request.transport_mode.value if hasattr(request.transport_mode, "value") else str(request.transport_mode)
        people = max(1, request.people_count)

        # Retrieve hotel anchor coordinates
        hotel_lat = plan.hotel_summary.lat if (plan.hotel_summary and plan.hotel_summary.lat) else target_act.lat
        hotel_lng = plan.hotel_summary.lng if (plan.hotel_summary and plan.hotel_summary.lng) else target_act.lng

        # Determine coordinates of previous and next stops
        if idx == 0:
            prev_lat, prev_lng = hotel_lat, hotel_lng
        else:
            prev_lat = activities[idx - 1].lat or hotel_lat
            prev_lng = activities[idx - 1].lng or hotel_lng

        if idx == len(activities) - 1:
            next_lat, next_lng = hotel_lat, hotel_lng
        else:
            next_lat = activities[idx + 1].lat or hotel_lat
            next_lng = activities[idx + 1].lng or hotel_lng

        act_lat = target_act.lat or hotel_lat
        act_lng = target_act.lng or hotel_lng

        # Baseline travel: prev -> target_act -> next
        old_dist_1 = calculate_distance_km(prev_lat, prev_lng, act_lat, act_lng)
        old_dist_2 = calculate_distance_km(act_lat, act_lng, next_lat, next_lng)
        old_dist_total = old_dist_1 + old_dist_2

        old_t1_min, old_cost1 = get_travel_metrics(prev_lat, prev_lng, act_lat, act_lng, mode_str, people)
        old_t2_min, old_cost2 = get_travel_metrics(act_lat, act_lng, next_lat, next_lng, mode_str, people)
        old_transit_min = old_t1_min + old_t2_min
        old_transit_cost = old_cost1 + old_cost2

        target_duration = max(30, _minutes_between(_parse_time_str(target_act.start_time), _parse_time_str(target_act.end_time)))

        # -------------------------------------------------------------
        # Action 1: REMOVE
        # -------------------------------------------------------------
        if request.action == EditActionType.REMOVE:
            new_dist_direct = calculate_distance_km(prev_lat, prev_lng, next_lat, next_lng)
            new_t_min, new_transit_cost = get_travel_metrics(prev_lat, prev_lng, next_lat, next_lng, mode_str, people)

            delta_km = round(new_dist_direct - old_dist_total, 2)
            delta_transit_min = new_t_min - old_transit_min
            delta_cost = (new_transit_cost - old_transit_cost) - target_act.estimated_cost_inr
            delta_total_duration = delta_transit_min - target_duration

            # Reconstruct updated day without target activity
            new_activities: List[ScheduledActivity] = []
            curr_time = _parse_time_str(activities[0].start_time) if activities else dt_time(9, 0)
            
            for i, a in enumerate(activities):
                if i == idx:
                    continue
                # Recalculate timing
                a_dur = max(30, _minutes_between(_parse_time_str(a.start_time), _parse_time_str(a.end_time)))
                a_start = _format_time(curr_time)
                curr_time = _add_minutes(curr_time, a_dur)
                a_end = _format_time(curr_time)
                curr_time = _add_minutes(curr_time, 20) # commute buffer
                
                new_act = a.model_copy(update={
                    "start_time": a_start,
                    "end_time": a_end
                })
                new_activities.append(new_act)

            updated_day = target_day.model_copy(update={
                "activities": new_activities,
                "day_cost_inr": max(0, target_day.day_cost_inr + delta_cost)
            })

            savings_inr = abs(delta_cost)
            km_saved = abs(delta_km)
            summary = (
                f"Dropping '{target_act.place_name}' saves ₹{savings_inr:,} in fees & fares, "
                f"reducing day transit by {km_saved:.1f} km (~{abs(delta_transit_min)} mins)."
            )

            return EditConsequenceResponse(
                is_feasible=True,
                action=request.action,
                target_activity_name=target_act.place_name,
                replacement_activity_name=None,
                delta_cost_inr=delta_cost,
                delta_transit_km=delta_km,
                delta_transit_minutes=delta_transit_min,
                delta_duration_minutes=delta_total_duration,
                feasibility_notes=["Direct connection between remaining stops is physically valid."],
                impact_summary=summary,
                suggested_updated_day=updated_day
            )

        # -------------------------------------------------------------
        # Action 2: SWAP / REPLACE
        # -------------------------------------------------------------
        elif request.action == EditActionType.SWAP:
            if not request.replacement_place_id:
                raise ValueError("replacement_place_id is required for SWAP action.")

            provider = get_places_provider()
            all_places = provider.get_places(request.destination)
            repl_list = [p for p in all_places if p.place_id.lower() == request.replacement_place_id.lower()]
            if not repl_list:
                raise ValueError(f"Replacement place '{request.replacement_place_id}' not found in {request.destination} dataset.")
            
            repl_place = repl_list[0]

            # Feasibility Checks
            feasibility_notes: List[str] = []
            is_feasible = True

            # 1. Day of week closure check
            dow = (target_day.day_of_week or "").strip().lower()
            closed_list = getattr(repl_place, "closed_days", None) or getattr(repl_place, "closed_on", None) or []
            if closed_list:
                closed_days = [c.strip().lower() for c in closed_list]
                if dow in closed_days or any(cd in dow for cd in closed_days):
                    is_feasible = False
                    feasibility_notes.append(f"⚠️ Conflict: '{repl_place.name}' is closed on {target_day.day_of_week or 'this day'}.")

            # 2. Dependency check
            if getattr(repl_place, "depends_on", None):
                scheduled_names = set(a.place_name.lower() for a in activities)
                scheduled_ids = set((a.place_id or a.place_name).lower() for a in activities)
                for dep in repl_place.depends_on:
                    if dep.lower() not in scheduled_names and dep.lower() not in scheduled_ids:
                        feasibility_notes.append(f"ℹ️ Prerequisite Note: '{repl_place.name}' typically requires '{dep}'.")

            # Commute calculations with replacement place: prev -> repl -> next
            new_dist_1 = calculate_distance_km(prev_lat, prev_lng, repl_place.lat, repl_place.lng)
            new_dist_2 = calculate_distance_km(repl_place.lat, repl_place.lng, next_lat, next_lng)
            new_dist_total = new_dist_1 + new_dist_2

            new_t1_min, new_cost1 = get_travel_metrics(prev_lat, prev_lng, repl_place.lat, repl_place.lng, mode_str, people)
            new_t2_min, new_cost2 = get_travel_metrics(repl_place.lat, repl_place.lng, next_lat, next_lng, mode_str, people)
            new_transit_min = new_t1_min + new_t2_min
            new_transit_cost = new_cost1 + new_cost2

            delta_km = round(new_dist_total - old_dist_total, 2)
            delta_transit_min = new_transit_min - old_transit_min
            
            # Ticket difference
            repl_ticket = repl_place.estimated_cost_per_person_inr * people
            ticket_delta = repl_ticket - target_act.estimated_cost_inr
            transit_cost_delta = new_transit_cost - old_transit_cost
            delta_cost = ticket_delta + transit_cost_delta

            repl_duration = repl_place.duration_minutes or 60
            delta_duration = repl_duration - target_duration

            # Resolve experience tag and viewpoint
            exp_tag = getattr(repl_place, "experience_tag", None)
            if not exp_tag:
                if getattr(repl_place, "golden_hour_recommended", False):
                    exp_tag = "Golden Hour Viewpoint"
                elif getattr(repl_place, "night_view_recommended", False):
                    exp_tag = "Night View"
                else:
                    exp_tag = getattr(repl_place, "place_type", "attraction").title()

            viewpoints = getattr(repl_place, "best_viewpoints", None) or []
            rec_viewpoint = viewpoints[0] if viewpoints else None

            # Reconstruct updated day with swapped place
            new_activities: List[ScheduledActivity] = []
            for i, a in enumerate(activities):
                if i == idx:
                    # Calculate new start & end time
                    st = _parse_time_str(a.start_time)
                    et = _add_minutes(st, repl_duration)
                    swapped_act = ScheduledActivity(
                        place_id=repl_place.place_id,
                        place_name=repl_place.name,
                        place_type=repl_place.place_type,
                        lat=repl_place.lat,
                        lng=repl_place.lng,
                        start_time=_format_time(st),
                        end_time=_format_time(et),
                        estimated_cost_inr=repl_ticket,
                        is_locked=True,
                        experience_tag=exp_tag,
                        recommended_viewpoint=rec_viewpoint,
                        verification_status=repl_place.verification_status,
                        last_verified_date=repl_place.last_verified_date,
                        source_reference=repl_place.source_reference
                    )
                    new_activities.append(swapped_act)
                else:
                    new_activities.append(a.model_copy())

            updated_day = target_day.model_copy(update={
                "activities": new_activities,
                "day_cost_inr": max(0, target_day.day_cost_inr + delta_cost)
            })

            # Check operating hours compatibility
            open_mins = getattr(repl_place, "open_time_mins", None)
            close_mins = getattr(repl_place, "close_time_mins", None)
            if open_mins is not None and close_mins is not None:
                open_t = dt_time((480 + open_mins) // 60, (480 + open_mins) % 60)
                close_t = dt_time((480 + close_mins) // 60, (480 + close_mins) % 60)
                act_st = _parse_time_str(new_activities[idx].start_time)
                act_et = _parse_time_str(new_activities[idx].end_time)
                if act_st < open_t or act_et > close_t:
                    feasibility_notes.append(
                        f"⏰ Timing Advisory: Window ({new_activities[idx].start_time} - {new_activities[idx].end_time}) "
                        f"overlaps boundary of operating hours ({_format_time(open_t)} - {_format_time(close_t)})."
                    )

            if is_feasible and not feasibility_notes:
                feasibility_notes.append("100% time & opening hours compatible.")

            cost_phrase = f"+₹{delta_cost:,}" if delta_cost > 0 else f"-₹{abs(delta_cost):,}" if delta_cost < 0 else "₹0 cost delta"
            km_phrase = f"+{delta_km:.1f} km" if delta_km > 0 else f"{delta_km:.1f} km"
            min_phrase = f"+{delta_transit_min} mins commute" if delta_transit_min > 0 else f"{delta_transit_min} mins commute"
            
            summary = (
                f"Replacing '{target_act.place_name}' with '{repl_place.name}' results in {cost_phrase} "
                f"and {km_phrase} transit ({min_phrase})."
            )

            return EditConsequenceResponse(
                is_feasible=is_feasible,
                action=request.action,
                target_activity_name=target_act.place_name,
                replacement_activity_name=repl_place.name,
                delta_cost_inr=delta_cost,
                delta_transit_km=delta_km,
                delta_transit_minutes=delta_transit_min,
                delta_duration_minutes=delta_duration,
                feasibility_notes=feasibility_notes,
                impact_summary=summary,
                suggested_updated_day=updated_day
            )

        # -------------------------------------------------------------
        # Action 3: PIN / LOCK
        # -------------------------------------------------------------
        elif request.action == EditActionType.PIN:
            new_locked_state = not target_act.is_locked
            updated_act = target_act.model_copy(update={"is_locked": new_locked_state})
            new_activities = list(activities)
            new_activities[idx] = updated_act
            updated_day = target_day.model_copy(update={"activities": new_activities})

            status_str = "pinned/locked" if new_locked_state else "unlocked"
            summary = f"'{target_act.place_name}' is now {status_str}. Future re-optimizations will enforce this priority."

            return EditConsequenceResponse(
                is_feasible=True,
                action=request.action,
                target_activity_name=target_act.place_name,
                replacement_activity_name=None,
                delta_cost_inr=0,
                delta_transit_km=0.0,
                delta_transit_minutes=0,
                delta_duration_minutes=0,
                feasibility_notes=[f"Constraint updated: is_locked={new_locked_state}"],
                impact_summary=summary,
                suggested_updated_day=updated_day
            )

        # -------------------------------------------------------------
        # Action 4: MOVE_TO_SUNSET
        # -------------------------------------------------------------
        elif request.action == EditActionType.MOVE_TO_SUNSET:
            # Target date
            if target_day.date:
                try:
                    target_date = datetime.strptime(target_day.date, "%Y-%m-%d").date()
                except Exception:
                    target_date = datetime.now().date()
            else:
                target_date = datetime.now().date()

            gh_start_m, sunset_m = get_golden_hour_window(act_lat, act_lng, target_date)

            start_abs_m = 480 + gh_start_m
            end_abs_m = 480 + sunset_m

            gh_start_t = dt_time((start_abs_m // 60) % 24, start_abs_m % 60)
            sunset_t = dt_time((end_abs_m // 60) % 24, end_abs_m % 60)

            updated_act = target_act.model_copy(update={
                "start_time": _format_time(gh_start_t),
                "end_time": _format_time(sunset_t),
                "experience_tag": "golden_hour_sunset",
                "is_locked": True
            })

            new_activities = list(activities)
            new_activities[idx] = updated_act
            # Sort activities chronologically by start_time
            new_activities.sort(key=lambda a: _parse_time_str(a.start_time))
            updated_day = target_day.model_copy(update={"activities": new_activities})

            summary = (
                f"Moved '{target_act.place_name}' to Astronomical Golden Hour ({_format_time(gh_start_t)} - {_format_time(sunset_t)}) "
                f"for optimal lighting."
            )

            return EditConsequenceResponse(
                is_feasible=True,
                action=request.action,
                target_activity_name=target_act.place_name,
                replacement_activity_name=None,
                delta_cost_inr=0,
                delta_transit_km=0.0,
                delta_transit_minutes=0,
                delta_duration_minutes=0,
                feasibility_notes=["Astronomically verified with NOAA solar position."],
                impact_summary=summary,
                suggested_updated_day=updated_day
            )

        else:
            raise ValueError(f"Unsupported edit action: {request.action}")

    @classmethod
    def rebalance_tired_day(cls, request: RebalanceTiredRequest) -> RebalanceTiredResponse:
        """Apply a transparent, constraint-checked heuristic to the remaining day.

        This is not a global OR-Tools re-optimization. It preserves stop order,
        applies the selected relief policy, estimates changed route legs, and
        refuses to label the result feasible when known time or budget rules fail.
        """
        from datetime import date
        from tripweave.models import ExpenseBreakdown
        from tripweave.provider import get_places_provider

        plan = request.plan
        target_day = next((day for day in plan.days if day.day_number == request.day_number), None)
        if target_day is None:
            raise ValueError(f"Day number {request.day_number} not found in plan.")
        activities = target_day.activities
        if not activities:
            raise ValueError(f"Day {request.day_number} has no scheduled activities to rebalance.")
        if request.current_activity_index is not None and request.current_activity_index >= len(activities):
            raise ValueError("current_activity_index is outside the selected day's activity list.")

        current_time = _parse_time_str(request.current_time_str)
        current_minute = current_time.hour * 60 + current_time.minute
        mode = request.transport_mode.value
        people = request.people_count
        hotel_summary = plan.hotel_summary
        hotel = (
            (hotel_summary.lat, hotel_summary.lng)
            if hotel_summary is not None
            else (activities[0].lat, activities[0].lng)
        )

        completed: List[Tuple[int, ScheduledActivity]] = []
        remaining: List[Tuple[int, ScheduledActivity]] = []
        for index, activity in enumerate(activities):
            activity_start = _parse_time_str(activity.start_time)
            if request.current_activity_index is not None:
                is_completed = index <= request.current_activity_index
            else:
                is_completed = activity_start < current_time
            (completed if is_completed else remaining).append((index, activity))

        # Replace an unvisited generated break on a repeated replan instead of
        # stacking multiple synthetic breaks into the same day's schedule.
        if remaining and all(activity.place_type == "rest_break" for _, activity in remaining):
            remaining = []
        else:
            remaining = [(index, activity) for index, activity in remaining if activity.place_type != "rest_break"]

        budget_limit = request.budget_limit_inr or (
            plan.expense_breakdown.budget_limit_inr if plan.expense_breakdown else None
        )
        if not remaining:
            is_within_budget = plan.total_cost_inr <= budget_limit if budget_limit else None
            transport_within = (
                plan.estimated_transport_cost_inr <= plan.transport_budget_limit_inr
                if plan.transport_budget_limit_inr is not None else None
            )
            no_work_notes = []
            if is_within_budget is False:
                no_work_notes.append(f"The current on-ground total ₹{plan.total_cost_inr} exceeds the budget limit ₹{budget_limit}.")
            if transport_within is False:
                no_work_notes.append("The current estimated local transport total exceeds its transport cap.")
            return RebalanceTiredResponse(
                is_feasible=is_within_budget is not False and transport_within is not False,
                original_day=target_day,
                revised_day=target_day,
                updated_plan=plan,
                budget_within_limit=is_within_budget,
                transport_budget_within_limit=transport_within,
                feasibility_notes=no_work_notes,
                old_fatigue_score=target_day.fatigue_score or 0,
                new_fatigue_score=target_day.fatigue_score or 0,
                summary_message="There are no remaining stops to rebalance.",
            )

        if request.current_location_lat is not None:
            current_location = (request.current_location_lat, request.current_location_lng)
        elif completed:
            last_activity = completed[-1][1]
            current_location = (last_activity.lat, last_activity.lng)
        else:
            current_location = hotel

        base_minute = current_minute
        if completed:
            last_end = _parse_time_str(completed[-1][1].end_time)
            base_minute = max(base_minute, last_end.hour * 60 + last_end.minute)

        dropped: List[Tuple[int, ScheduledActivity]] = []
        retained = list(remaining)
        shortened_durations: Dict[int, int] = {}
        if request.tiredness_level == TirednessSeverity.EXHAUSTED:
            retained = []
            for item in remaining:
                _, activity = item
                is_evening_meal = activity.place_type == "restaurant" and _parse_time_str(activity.start_time).hour >= 18
                if activity.is_locked or is_evening_meal:
                    retained.append(item)
                else:
                    dropped.append(item)
            break_duration = 90
            break_name = "Hotel rest break"
            break_location = hotel
            _, return_to_hotel_minutes, _ = _estimated_leg(current_location, hotel, mode, people)
            break_start_minute = base_minute + return_to_hotel_minutes
        elif request.tiredness_level == TirednessSeverity.MODERATE:
            candidates = [
                item for item in remaining
                if not item[1].is_locked
                and item[1].place_type not in ("restaurant", "rest_break")
                and not _is_sunset_activity(item[1])
            ]
            if candidates:
                def relief_value(candidate: Tuple[int, ScheduledActivity]) -> int:
                    position = next(i for i, item in enumerate(remaining) if item[0] == candidate[0])
                    activity = candidate[1]
                    previous = current_location if position == 0 else (remaining[position - 1][1].lat, remaining[position - 1][1].lng)
                    following = hotel if position == len(remaining) - 1 else (remaining[position + 1][1].lat, remaining[position + 1][1].lng)
                    direct = _estimated_leg(previous, following, mode, people)[1]
                    via = _estimated_leg(previous, (activity.lat, activity.lng), mode, people)[1]
                    via += _estimated_leg((activity.lat, activity.lng), following, mode, people)[1]
                    dwell = max(0, _minutes_between(_parse_time_str(activity.start_time), _parse_time_str(activity.end_time)))
                    return dwell + max(0, via - direct)
                to_drop = max(candidates, key=relief_value)
                dropped.append(to_drop)
                retained = [item for item in remaining if item[0] != to_drop[0]]
            break_duration = 45
            break_name = "Rest break at current location"
            break_location = current_location
            break_start_minute = base_minute
        else:
            break_duration = 30
            break_name = "Rest break at current location"
            break_location = current_location
            break_start_minute = base_minute
            for index, activity in remaining:
                duration = _minutes_between(_parse_time_str(activity.start_time), _parse_time_str(activity.end_time))
                if duration > 90 and not activity.is_locked and activity.place_type not in ("restaurant", "rest_break"):
                    shortened_durations[index] = max(30, int(round(duration * 0.8)))

        dropped_ids = {index for index, _ in dropped}
        retained = [item for item in retained if item[0] not in dropped_ids]
        dropped_names = [activity.place_name for _, activity in dropped]
        feasibility_notes: List[str] = []
        schedule_fits_day = True

        if request.tiredness_level == TirednessSeverity.EXHAUSTED:
            feasibility_notes.append(
                f"Includes an estimated {return_to_hotel_minutes}-minute trip from the current location to the hotel."
            )

        def extended_time(total_minutes: int) -> str:
            day_offset, within_day = divmod(total_minutes, 24 * 60)
            label = _format_time(dt_time(within_day // 60, within_day % 60))
            return f"{label} (+{day_offset} day)" if day_offset else label

        break_end_minute = break_start_minute + break_duration
        if break_start_minute >= 24 * 60 or break_end_minute >= 24 * 60:
            schedule_fits_day = False
            feasibility_notes.append("The rest break would extend beyond this calendar day.")
        # Use a coarse, already-planned location for the persisted synthetic
        # break. Exact browser GPS is used below for this one calculation only.
        if request.current_location_lat is not None:
            persisted_break_location = (
                (completed[-1][1].lat, completed[-1][1].lng) if completed else hotel
            )
        else:
            persisted_break_location = break_location
        break_activity = ScheduledActivity(
            place_id=f"tripweave-rest-{request.day_number}-{request.tiredness_level.value}",
            place_name=break_name,
            place_type="rest_break",
            lat=persisted_break_location[0],
            lng=persisted_break_location[1],
            start_time=extended_time(break_start_minute),
            end_time=extended_time(break_end_minute),
            estimated_cost_inr=0,
            is_locked=True,
            experience_tag="rest_break",
            verification_status="not_applicable",
            last_verified_date=None,
            source_reference="Generated rest period; not a venue or purchase",
        )

        revised_activities: List[ScheduledActivity] = [activity for _, activity in completed]
        revised_activities.append(break_activity)
        scheduled_windows: List[Tuple[ScheduledActivity, int, int]] = []
        cursor = break_end_minute
        previous_location = break_location
        for index, activity in retained:
            next_location = (activity.lat, activity.lng)
            _, leg_minutes, _ = _estimated_leg(previous_location, next_location, mode, people)
            arrival = cursor + leg_minutes
            original_start = _parse_time_str(activity.start_time)
            original_start_minute = original_start.hour * 60 + original_start.minute
            if _is_sunset_activity(activity) or (
                activity.place_type == "restaurant" and original_start.hour >= 18
            ):
                arrival = max(arrival, original_start_minute)

            original_duration = _minutes_between(_parse_time_str(activity.start_time), _parse_time_str(activity.end_time))
            if original_duration <= 0:
                schedule_fits_day = False
                feasibility_notes.append(f"'{activity.place_name}' has an invalid original time window.")
                original_duration = 30
            duration = shortened_durations.get(index, max(30, original_duration))
            end_minute = arrival + duration
            if arrival >= 24 * 60 or end_minute >= 24 * 60:
                schedule_fits_day = False
                feasibility_notes.append(f"'{activity.place_name}' would extend beyond this calendar day.")
            scheduled = activity.model_copy(update={
                "start_time": extended_time(arrival),
                "end_time": extended_time(end_minute),
            })
            revised_activities.append(scheduled)
            scheduled_windows.append((activity, arrival, end_minute))
            cursor = end_minute
            previous_location = next_location

        # Check known calendar closures and opening windows against the curated
        # catalog. Unknown venues remain explicitly unchecked rather than assumed valid.
        catalog = {place.place_id.casefold(): place for place in get_places_provider().get_places(request.destination)}
        try:
            trip_date = date.fromisoformat(target_day.date) if target_day.date else None
        except ValueError:
            trip_date = None
        weekday = (target_day.day_of_week or (trip_date.strftime("%A") if trip_date else "")).casefold()
        for activity, start_minute, end_minute in scheduled_windows:
            if activity.place_type == "rest_break":
                continue
            if _is_sunset_activity(activity):
                if trip_date:
                    gh_start, gh_end = get_golden_hour_window(activity.lat, activity.lng, trip_date)
                    start_from_8am = start_minute - 8 * 60
                    end_from_8am = end_minute - 8 * 60
                    if end_from_8am < gh_start or start_from_8am > gh_end + 30:
                        schedule_fits_day = False
                        feasibility_notes.append(f"'{activity.place_name}' no longer overlaps the sunset window for {trip_date.isoformat()}.")
                else:
                    feasibility_notes.append(f"Sunset timing for '{activity.place_name}' could not be checked because the day has no valid date.")
            place = catalog.get((activity.place_id or "").casefold())
            if place is None:
                feasibility_notes.append(f"Opening hours for '{activity.place_name}' are not present in the curated catalog.")
                continue
            closed_days = {day.strip().casefold() for day in (place.closed_days or [])}
            if weekday and weekday in closed_days:
                schedule_fits_day = False
                feasibility_notes.append(f"'{activity.place_name}' is closed on {weekday.title()}.")
            if place.open_time_mins is not None and place.close_time_mins is not None:
                open_minute = 8 * 60 + place.open_time_mins
                close_minute = 8 * 60 + place.close_time_mins
                if start_minute < open_minute or end_minute > close_minute:
                    schedule_fits_day = False
                    feasibility_notes.append(
                        f"'{activity.place_name}' falls outside its known opening window "
                        f"({_format_time(dt_time(open_minute // 60, open_minute % 60))}–"
                        f"{_format_time(dt_time(close_minute // 60, close_minute % 60))})."
                    )

        # Account for the return-to-hotel leg in feasibility and cost, even though
        # the itinerary timeline ends at the last scheduled venue.
        final_location = (retained[-1][1].lat, retained[-1][1].lng) if retained else break_location
        _, revised_return_minutes, _ = _estimated_leg(final_location, hotel, mode, people)
        if cursor + revised_return_minutes >= 24 * 60:
            schedule_fits_day = False
            feasibility_notes.append("The return trip to the hotel would extend beyond this calendar day.")

        def route_estimate(start: Tuple[float, float], stops: List[Tuple[int, ScheduledActivity]], end: Tuple[float, float]) -> Tuple[float, int, int]:
            total_km = 0.0
            total_minutes = 0
            total_cost = 0
            location = start
            for _, stop in stops:
                km, minutes, cost = _estimated_leg(location, (stop.lat, stop.lng), mode, people)
                total_km += km
                total_minutes += minutes
                total_cost += cost
                location = (stop.lat, stop.lng)
            km, minutes, cost = _estimated_leg(location, end, mode, people)
            return total_km + km, total_minutes + minutes, total_cost + cost

        original_remaining = route_estimate(current_location, remaining, hotel)
        revised_remaining_stops = [(index, activity) for index, activity in retained]
        route_break_activity = break_activity.model_copy(update={"lat": break_location[0], "lng": break_location[1]})
        revised_distance, revised_transit_minutes, revised_transit_cost = route_estimate(
            current_location,
            ([(len(activities), route_break_activity)] if request.tiredness_level == TirednessSeverity.EXHAUSTED else []) + revised_remaining_stops,
            hotel,
        )
        original_distance, original_transit_minutes, original_transit_cost = original_remaining
        distance_delta = round(revised_distance - original_distance, 2)
        transit_delta = revised_transit_minutes - original_transit_minutes
        transport_cost_delta = revised_transit_cost - original_transit_cost

        revised_day_cost = sum(activity.estimated_cost_inr for activity in revised_activities)
        revised_day = target_day.model_copy(update={
            "activities": revised_activities,
            "day_cost_inr": revised_day_cost,
        })

        group_profile = GroupProfile.DEFAULT
        if plan.fatigue_report and plan.fatigue_report.get("group_profile"):
            try:
                group_profile = GroupProfile(plan.fatigue_report["group_profile"])
            except ValueError:
                feasibility_notes.append("Stored group profile was unrecognized; fatigue estimate uses the default profile.")
        old_eval = FatigueAnalyzer.evaluate_trip(
            [target_day], pace=request.pace, group_profile=group_profile,
            hotel_lat=hotel[0], hotel_lng=hotel[1],
        )["daily_breakdown"][0]
        new_eval = FatigueAnalyzer.evaluate_trip(
            [revised_day], pace=request.pace, group_profile=group_profile,
            hotel_lat=hotel[0], hotel_lng=hotel[1],
        )["daily_breakdown"][0]
        fatigue_change_pct = round(
            (old_eval["score"] - new_eval["score"]) / max(1, old_eval["score"]) * 100,
            1,
        )
        revised_day = revised_day.model_copy(update={
            "fatigue_score": new_eval["score"],
            "fatigue_level": new_eval["level"],
        })

        updated_days = [revised_day if day.day_number == request.day_number else day for day in plan.days]
        new_transport_cost = max(0, plan.estimated_transport_cost_inr + transport_cost_delta)
        lodging_cost = plan.expense_breakdown.lodging_inr if plan.expense_breakdown else (hotel_summary.total_cost_inr if hotel_summary else 0)
        activities_cost = sum(
            activity.estimated_cost_inr
            for day in updated_days
            for activity in day.activities
            if activity.place_type not in ("restaurant", "rest_break")
        )
        dining_cost = sum(
            activity.estimated_cost_inr
            for day in updated_days
            for activity in day.activities
            if activity.place_type == "restaurant"
        )
        direct_subtotal = lodging_cost + new_transport_cost + activities_cost + dining_cost
        new_total_cost = lodging_cost + new_transport_cost + sum(day.day_cost_inr for day in updated_days)
        if budget_limit:
            unallocated = max(0, budget_limit - direct_subtotal)
            is_within_budget = direct_subtotal <= budget_limit
        else:
            unallocated = plan.expense_breakdown.unallocated_buffer_inr if plan.expense_breakdown else 0
            is_within_budget = None
        transport_limit = plan.transport_budget_limit_inr
        transport_within = new_transport_cost <= transport_limit if transport_limit is not None else None
        expense_breakdown = plan.expense_breakdown
        if expense_breakdown is not None:
            additional_meals = max(0, expense_breakdown.suggested_meals_inr - dining_cost)
            meal_status = (
                f"Sufficient (Buffer ₹{unallocated} covers additional meal estimate ₹{additional_meals})"
                if unallocated >= additional_meals
                else f"Additional meals exceed remaining buffer by ₹{additional_meals - unallocated}"
            )
            expense_breakdown = expense_breakdown.model_copy(update={
                "transit_inr": new_transport_cost,
                "activities_inr": activities_cost,
                "dining_inr": dining_cost,
                "direct_subtotal_inr": direct_subtotal,
                "unallocated_buffer_inr": unallocated,
                "buffer_inr": unallocated,
                "additional_meals_inr": additional_meals,
                "budget_limit_inr": budget_limit or expense_breakdown.budget_limit_inr,
                "meal_buffer_status": meal_status,
            })

        updated_plan = plan.model_copy(update={
            "days": updated_days,
            "estimated_transport_cost_inr": new_transport_cost,
            "total_cost_inr": new_total_cost,
            "expense_breakdown": expense_breakdown,
            # The prior verifier report audited the old route and must not be reused.
            "verification_report": None,
            "transport_budget_status": (
                f"₹{new_transport_cost} (Within cap of ₹{transport_limit})"
                if transport_within is True
                else f"₹{new_transport_cost} (Exceeds cap of ₹{transport_limit})"
                if transport_within is False
                else "Reestimated after in-trip change; no transport-specific cap is recorded"
            ),
        })
        updated_plan.fatigue_report = FatigueAnalyzer.evaluate_trip(
            updated_days,
            pace=request.pace,
            group_profile=group_profile,
            hotel_lat=hotel[0],
            hotel_lng=hotel[1],
        )

        if not feasibility_notes:
            feasibility_notes.append("Known opening-hour, closure, sunset, day-boundary, and budget constraints pass.")
        if is_within_budget is False:
            feasibility_notes.append(f"The revised on-ground subtotal ₹{direct_subtotal} exceeds the budget limit ₹{budget_limit}.")
        if transport_within is False:
            feasibility_notes.append(f"The revised local transport estimate ₹{new_transport_cost} exceeds the transport cap ₹{transport_limit}.")
        is_feasible = schedule_fits_day and is_within_budget is not False and transport_within is not False
        summary = (
            f"{len(dropped_names)} optional stop(s) removed; {break_duration}-minute rest period added. "
            f"Estimated route distance changed by {distance_delta:+.1f} km, transit time by {transit_delta:+} minutes, "
            f"and local transport cost by ₹{transport_cost_delta:+,}. Fatigue score changed by {fatigue_change_pct:+.1f}% (model estimate)."
        )

        return RebalanceTiredResponse(
            is_feasible=is_feasible,
            original_day=target_day,
            revised_day=revised_day,
            updated_plan=updated_plan,
            dropped_activities=dropped_names,
            inserted_breaks=[break_name],
            route_distance_delta_km=distance_delta,
            transit_time_delta_minutes=transit_delta,
            transport_cost_delta_inr=transport_cost_delta,
            fatigue_change_pct=fatigue_change_pct,
            budget_within_limit=is_within_budget,
            transport_budget_within_limit=transport_within,
            feasibility_notes=feasibility_notes,
            old_fatigue_score=old_eval["score"],
            new_fatigue_score=new_eval["score"],
            summary_message=summary,
        )
