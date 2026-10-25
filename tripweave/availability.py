"""Calendar-aware sightseeing windows. Minutes are relative to 08:00 IST."""
from datetime import datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def destination_nights(request):
    if request.journey_timing:
        from tripweave.models import JourneyTiming
        journey = JourneyTiming.model_validate(request.journey_timing)
        return (journey.destination_departure.date() - journey.destination_arrival.date()).days
    return max(0, request.days - 1)


def lodging_nights(request):
    stay = request.stay_choice
    from tripweave.models import StayChoice
    if isinstance(stay, dict):
        stay = StayChoice.model_validate(stay)
    if stay and stay.kind == 'no_stay':
        return 0
    if stay and stay.check_in_date and stay.check_out_date:
        return (stay.check_out_date - stay.check_in_date).days
    return destination_nights(request)


def planning_windows(request, start=None, end=None):
    start, end = start or request.start_date, end or request.end_date
    if not start or not end:
        raise ValueError('Trip dates are required to check arrival and stay timing.')
    journey, stay = request.journey_timing, request.stay_choice
    from tripweave.models import StayChoice, JourneyTiming
    journey = JourneyTiming.model_validate(journey) if journey else None
    stay = StayChoice.model_validate(stay) if stay else None
    ready = leave = room_ready = checkout = None
    if journey:
        if journey.destination_arrival.date() > start or journey.destination_departure.date() < end:
            raise ValueError('Trip dates must be between your destination arrival and departure dates. Adjust the first or last trip date.')
        ready = journey.destination_arrival + timedelta(minutes=journey.arrival_transfer_minutes + journey.arrival_buffer_minutes)
        leave = journey.destination_departure - timedelta(minutes=journey.departure_transfer_minutes + journey.departure_buffer_minutes)
    if stay and stay.check_in_date and stay.check_out_date:
        arrival_date = journey.destination_arrival.date() if journey else start
        departure_date = journey.destination_departure.date() if journey else end
        if stay.check_in_date > arrival_date or stay.check_out_date < departure_date:
            raise ValueError('Your booked stay dates do not cover the destination nights. Correct the stay dates or arrange the missing nights.')
    if stay and stay.constrain_sightseeing_to_stay:
        if stay.kind != 'booked' or not stay.check_in_time or not stay.check_out_time:
            raise ValueError('Stay scheduling requires a booked stay and confirmed check-in and check-out times.')
        room_ready = datetime.combine(stay.check_in_date or start, time.fromisoformat(stay.check_in_time), IST)
        room_ready = max(room_ready, ready) if ready else room_ready
        room_ready += timedelta(minutes=stay.check_in_buffer_minutes)
        checkout = datetime.combine(stay.check_out_date or end, time.fromisoformat(stay.check_out_time), IST)
        checkout = min(checkout, leave) if leave else checkout
        checkout -= timedelta(minutes=stay.check_out_buffer_minutes)
    result = []
    for day in range((end - start).days + 1):
        current = start + timedelta(days=day)
        base = datetime.combine(current, time(8), IST)
        earliest = request.arrival_available_mins if day == 0 else 60
        latest = request.departure_deadline_mins if current == end else 720
        for lower in (ready, room_ready):
            if lower:
                earliest = max(earliest, int((lower - base).total_seconds() // 60))
        for upper in (leave, checkout):
            if upper:
                latest = min(latest, int((upper - base).total_seconds() // 60))
        earliest, latest = max(0, earliest), min(720, latest)
        note = None
        if earliest >= latest:
            earliest = latest = 0
            note = 'Travel, rest or stay timing leaves no sightseeing time on this date.'
        elif earliest > 60 or latest < 720:
            note = 'Shorter sightseeing day: arrival, departure or stay times reserve part of this day.'
        result.append({'start': earliest, 'end': latest, 'note': note})
    if not any(w['end'] > w['start'] for w in result):
        raise ValueError('Travel and stay timing leaves no sightseeing time. Change the trip dates, travel times or luggage arrangements.')
    return result


def journey_notes(request):
    notes = []
    j, s = request.journey_timing, request.stay_choice
    if j:
        notes.append(f'Destination arrival: {j.destination_arrival:%d %b %Y, %H:%M}; departure: {j.destination_departure:%d %b %Y, %H:%M} (India time). Transfers and rest/boarding buffers are reserved.')
        if j.arrival_transfer_minutes == 0 or j.departure_transfer_minutes == 0:
            notes.append('No terminal travel time was entered for one or both journeys. Add a realistic transfer estimate; the planner does not assume a confirmed station-to-stay connection.')
        if j.arrival_buffer_minutes == 0:
            notes.append('No extra arrival time for luggage or rest was entered. Add a buffer if needed.')
        if not s or not s.check_in_date:
            notes.append(f'Allow for {destination_nights(request)} destination night(s), including travel nights. Confirm lodging dates and early access yourself; accommodation is not confirmed here.')
    if s and s.kind == 'booked' and not s.constrain_sightseeing_to_stay:
        notes.append('Sightseeing may be before check-in or after check-out. ' +
                     ('You reported luggage storage as available; confirm it with the stay.' if s.allows_bag_drop is True else
                      'You chose to manage your own bags; do not assume early room access.' if s.allows_bag_drop is False else
                      'Luggage storage is not confirmed. Arrange your bags, early room access and any extra night with the stay.'))
    return notes
