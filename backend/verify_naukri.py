"""
verify_naukri.py — Quick smoke test to confirm the GitHub jobspy branch
fixes the Naukri parsing bug.

Run from the backend/ directory:
    python verify_naukri.py

Expected output: a non-empty DataFrame with at least 1 row.
"""
import sys
import time

print("Importing jobspy…")
from jobspy import scrape_jobs  # noqa: E402

print("Running Naukri scrape (20 results, java developer, Gurugram)…")
t0 = time.monotonic()

df = scrape_jobs(
    site_name=["naukri"],
    search_term="java developer",
    location="Gurugram, India",
    results_wanted=20,
    hours_old=168,
    country_indeed="India",
)

elapsed = time.monotonic() - t0
print(f"Elapsed: {elapsed:.1f}s")

if df is None or df.empty:
    print("FAIL -- Naukri returned 0 rows. Bug not fixed or network/CAPTCHA issue.")
    print("Check logs above for HTTP status codes (406 = CAPTCHA, 429 = rate limit).")
    sys.exit(1)

print(f"PASS -- Naukri returned {len(df)} rows.")
print(df[["title", "company", "location"]].head(5).to_string())
