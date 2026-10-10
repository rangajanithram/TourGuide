"""Local-only concurrent version regression. Run AFTER local migrations.
Example: python test_stage2_database.py --port 55439
Uses disposable fixtures in a local PostgreSQL database, never a hosted Supabase project.
"""
import argparse
import json
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=55439)
    parser.add_argument("--database", default="stage2")
    parser.add_argument("--psql", default=shutil.which("psql") or "C:/Program Files/PostgreSQL/17/bin/psql.exe")
    args = parser.parse_args()
    command = [args.psql, "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres", "-d", args.database, "-X", "-At", "-v", "ON_ERROR_STOP=1"]
    def run(sql):
        return subprocess.run(command, input=sql, text=True, encoding="utf-8", capture_output=True, timeout=30)
    fixture = Path(__file__).parent.joinpath("supabase/tests/account_isolation.sql").read_text(encoding="utf-8")
    req = re.search(r"req := '([^']+)'", fixture).group(1)
    snapshot = re.search(r"snapshot := '([^']+)'", fixture).group(1)
    # Fixed IDs are isolated test fixtures; no credentials or application user IDs.
    owner = "e1000000-0000-4000-8000-000000000001"
    claims = json.dumps({"sub": owner, "is_anonymous": False})
    session = f"set role authenticated; select set_config('request.jwt.claims','{claims}',false);"
    try:
        setup = run(f"insert into auth.users(id,email,email_confirmed_at) values('{owner}','race@example.invalid',now());" + session + f"select (public.create_saved_trip_with_version('Race','e1000000-0000-4000-8000-000000000002','Hyderabad',1,5000,'2026-10-15','2026-10-15','balanced','{req}','{snapshot}')).id;")
        if setup.returncode: raise RuntimeError(setup.stderr)
        trip = setup.stdout.strip().splitlines()[-1]
        sql = session + f"begin; select id from public.saved_trips where id='{trip}' for update; select pg_sleep(0.3); select public.commit_trip_version('{trip}',1,'edit','Race commit','balanced','{snapshot}','{req}'); commit;"
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(run, [sql, sql]))
        if sum(r.returncode == 0 for r in results) != 1 or not any("CONCURRENCY_CONFLICT" in r.stderr for r in results):
            raise AssertionError("Expected one successful writer and one stale writer: " + str([(r.returncode,r.stderr) for r in results]))
        count = run(f"select current_version || ':' || (select count(*) from public.plan_versions where trip_id=t.id) from public.saved_trips t where id='{trip}';")
        if count.stdout.strip() != '2:2': raise AssertionError("Concurrent commit changed or lost history")
        print("PASS: two real concurrent database sessions produce exactly one revision and one conflict")
    finally:
        cleanup = run(f"delete from auth.users where id='{owner}';")
        if cleanup.returncode: raise RuntimeError(cleanup.stderr)

if __name__ == "__main__":
    main()
