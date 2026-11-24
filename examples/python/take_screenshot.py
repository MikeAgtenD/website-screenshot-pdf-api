"""Take website screenshots (or PDFs) with the Apify Actor polderbyte/website-screenshot-pdf
and download the files.

Usage:
    export APIFY_TOKEN=...            (PowerShell: $env:APIFY_TOKEN = "...")
    pip install -r requirements.txt
    python take_screenshot.py                          # default: https://apify.com
    python take_screenshot.py https://www.example.com https://en.wikipedia.org/wiki/Belgium

Each argument is one URL. Edit `run_input` below for full-page captures, PDFs, mobile devices or dark mode.
"""

import json
import os
import sys
import urllib.request
from decimal import Decimal
from pathlib import Path

from apify_client import ApifyClient

sys.stdout.reconfigure(encoding="utf-8")  # so non-ASCII page titles also print on Windows consoles

token = os.environ.get("APIFY_TOKEN")
if not token:
    sys.exit("Set the APIFY_TOKEN environment variable (Apify Console > Settings > API & Integrations).")

run_input = {
    "urls": sys.argv[1:] or ["https://apify.com"],
    "format": "png",  # "png", "jpeg", "webp" or "pdf"
    "device": "desktop",  # "desktop", "desktop-hd", "laptop", "ipad", "iphone-15", "pixel-8" or "custom"
    "fullPage": False,  # True = whole page, lazy-loaded content included
    "hideCookieBanners": True,
    "maxItems": 10,  # keeps the run small and cheap; raise it for real use
}

client = ApifyClient(token)

# call() starts the run and waits for it to finish.
# max_total_charge_usd caps what this run can cost you.
run = client.actor("polderbyte/website-screenshot-pdf").call(
    run_input=run_input,
    max_total_charge_usd=Decimal("0.10"),
    logger=None,  # remove this argument to stream the Actor's log to your terminal
)

if run is None or run.status != "SUCCEEDED":
    sys.exit(f"Run did not succeed: {run.status if run else 'no run returned'}")

items = list(client.dataset(run.default_dataset_id).iterate_items())
output = Path("output")
output.mkdir(exist_ok=True)

for row in items:
    if row["status"] != "ok":
        print(f"FAILED {row['url']}: {row['error']} (not charged)")
        continue
    # fileUrl points to the run's key-value store. The token header also covers accounts
    # whose storage requires authentication.
    request = urllib.request.Request(row["fileUrl"], headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request) as response:
        path = output / row["key"]
        path.write_bytes(response.read())
    size = f"{row['pages']} page(s)" if row.get("pages") else f"{row['width']}x{row['height']}px"
    print(f"OK {row['url']} -> {path.as_posix()} ({size}, {row['bytes']} bytes, title \"{row['title']}\", "
          f"cookie banner: {row.get('cookieBanner') or 'none'})")

(output / "results.json").write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\n{len(items)} row(s) saved to output/results.json (run {run.id}).")
