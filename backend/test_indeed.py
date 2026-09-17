"""Quick end-to-end test of job_fetcher against Indeed."""
import sys
import time

sys.path.insert(0, ".")
from services import job_fetcher  # noqa: E402

print("Testing Indeed (python developer, Bangalore, India)...")
t0 = time.monotonic()
jobs, status = job_fetcher.fetch(
    sites=["indeed"],
    search_term="python developer",
    location="Bangalore, India",
    hours_old=168,
    results_wanted=15,
)
elapsed = time.monotonic() - t0
print(f"Elapsed : {elapsed:.1f}s")
print(f"Status  : {status}")
print(f"Returned: {len(jobs)} jobs")
for j in jobs[:5]:
    print(f"  - {j.get('title')} @ {j.get('company')} [{j.get('site')}]")
