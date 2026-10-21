# Live verification follow-up — 20 October 2026

## Observed

Production generation failed once with a generic connection error, then succeeded
on a manual retry. Health and CORS checks succeeded. This does not establish that
Render startup was the cause.

The signed-in booked-travel scenario passed generation, save, reopen, pin edit,
save revision v2, reload and history listing. Ticket total, paid amount, remaining
balance and pins survived persistence. Real-provider search was not fully verified.
The generated three-day sample left its final day empty.

## Reliability increment

- Distinguish offline, timeout, connection and incomplete-response failures using
  safe error codes. Do not expose tokens, request bodies or raw provider errors.
- Ignore cancelled/superseded generation errors instead of calling them timeouts.
- Keep generation POSTs single-attempt: an interrupted response does not prove
  that the server stopped computing. The user can retry explicitly.
- Correct timing copy for already-booked travel.

These changes improve diagnosis and recovery messaging; they do not establish or
fix the cause of the observed production interruption. On recurrence, record the
error code and timestamp and correlate with backend logs before choosing a fix.

## Next acceptance gates

1. Whole-journey budgeting: distinguish total cost from remaining cash; count
   confirmed tickets and stays once; expose unknown costs; verify every edit.
2. Transfers/stay timing: terminals, check-in/out, travel nights and impossible
   connections.
3. Expand automatic real-place candidates with free services and user-confirmed
   estimates. Preserve mandatory pins and explain unfilled days.
4. Repeat signed-in, mobile and provider-failure acceptance checks after deployment.

Local checks are evidence about code; they do not establish that every production
flow works or that a backend is running an exact commit.
