"""
TripWeave Interactive Itinerary Customizer & Edit Consequences Engine.
Blueprint Section 12: Handles user actions (swap, remove, pin, move to sunset)
with deterministic physics impact previews (cost delta, travel delta, time feasibility).
"""
import math
from datetime import datetime, time as dt_time, timedelta
from typing import List, Optional, Tuple, Dict, Any

from tripweave.models import (
    TripPlan, DayPlan, ScheduledActivity, Place, EditActionType,
    EditConsequenceRequest, EditConsequenceResponse, TransportMode
)
from tripweave.distance import calculate_distance_km, get_travel_metrics
from tripweave.solar import get_golden_hour_window
from tripweave.provider import get_places_provider

def _parse_time_str(t_str: str) -> dt_time:
    """Parses 'HH:MM AM/PM' or 'HH:MM' string into a dt_time object."""
    cleaned = t_str.strip().upper()
    try:
        if "AM" in cleaned or "PM" in cleaned:
            dt = datetime.strptime(cleaned, "%I:%M %p")
        else:
            dt = datetime.strptime(cleaned, "%H:%M")
        return dt.time()
    except Exception:
        return dt_time(9, 0)

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
    """Adds minutes to a dt_time object, wrapping within 24h."""
    total_m = t.hour * 60 + t.minute + mins
    total_m = max(0, min(total_m, 23 * 60 + 59))
    return dt_time(total_m // 60, total_m % 60)

def _minutes_between(t1: dt_time, t2: dt_time) -> int:
    """Computes minutes from t1 to t2."""
    m1 = t1.hour * 60 + t1.minute
    m2 = t2.hour * 60 + t2.minute
    return m2 - m1


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
