# Journey timing — increment 1

Date: 2026-10-13. Baseline: 115e858.

## Requirements and scope

Implement the first dependency from MASTER_PLAN_IMPLEMENTATION_GAP_ANALYSIS.md:
explicit intercity times that limit local sightseeing, without replacing working saves or
claiming to have implemented a complete door-to-door optimizer.

Acceptance criteria:
- Optional four chronological India timestamps with explicit transfer buffers.
- Overnight travel works without adding sightseeing or hotel nights silently.
- First/last day limits apply to solving and independent edit verification.
- Invalid dates/offsets/conflicts fail before solving; older requests remain valid.
- New request data survives snapshot validation, serialization and reopening.
- Review and result screens explain user-supplied times and excluded intercity fares.

## Design and implementation

`JourneyTiming` is versioned additive JSON inside planning preferences. There is no database
migration, paid provider, new account permission or auth change. Python and TypeScript perform
the same bounded preflight. Backend validation is authoritative; the verifier recalculates
bounds from the travel times rather than trusting a frontend-derived schedule.

Buffers are supplied by the traveler. They do not certify transfer duration, check-in, luggage
storage or booking validity. Existing daily availability is intersected with the travel bounds.
Sightseeing remains between 08:00 and 20:00. Travel times may be outside those hours.

## Validation

Automated checks cover overnight rollover, transfer buffers crossing midnight, wrong offsets,
nonchronological times, invalid sightseeing coverage, empty availability, legacy requests,
generation, JSON reopen and independent verification of an invalid departure after editing.
Frontend checks include preflight and saved-request round trips. Existing engine, authentication,
persistence, edit and preference tests remain part of the release gate.

Live signed-in saving and production deployment are not established by these local tests.

## Try it after frontend and backend deployment

1. Open Planner; select Bengaluru to Hyderabad.
2. Choose October 19, 2026 as both first and last sightseeing dates.
3. Expand **Add your travel timing** and enable its checkbox.
4. Leave origin October 18 at 22:00; arrive October 19 at 10:00.
5. Leave destination October 19 at 19:00; arrive home October 20 at 07:00.
6. Enter 60 minutes arrival buffer and 90 minutes departure buffer.
7. Review and generate. The day must start no earlier than 11:00 and return to base by 17:30.
8. Save and reopen; expand trip preferences and confirm the four travel times and buffers.
9. Try an arrival after the sightseeing date or a reversed return time: the form must show a
   useful conflict instead of generating a plan.

Use future dates with equivalent times if following these instructions later.

## Next SDLC increment

Specify budget scope and stay choices (planner-selected, already booked, family/friends, no
stay) before adding their UI. Implement their cost/depot effects and independent verification,
then test save/reopen and legacy snapshots. This requires scenario design; merely collecting
choices without respecting them would be misleading. Allowed transport modes, exact terminal
routes, hotel check-in/checkout, sourced schedules and whole-journey feasibility remain pending.
