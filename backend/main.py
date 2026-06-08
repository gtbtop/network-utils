import os
import time
import json
import hashlib
import asyncio
from collections import deque
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse


SITES_FILE = os.path.join(os.path.dirname(__file__), "sites.json")

with open(SITES_FILE) as f:
    SITES: list[dict] = json.load(f)

SITE_BY_ID = {s["id"]: s for s in SITES}

# 240 checks x 30 sec = 2h
HISTORY: dict[str, deque] = {s["id"]: deque(maxlen=240) for s in SITES}

CHECK_INTERVAL = 30
REQUEST_TIMEOUT = 10


async def check_site(site: dict) -> dict:
    """1 http check"""
    ts = time.time()
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=REQUEST_TIMEOUT) as client:
            t0 = time.monotonic()
            r = await client.get(site["url"])
            latency_ms = round((time.monotonic() - t0) * 1000)
        up = r.status_code < 500
        return {"ts": ts, "up": up, "status": r.status_code, "latency_ms": latency_ms}
    except Exception as e:
        return {"ts": ts, "up": False, "status": None, "latency_ms": None, "error": str(e)}


async def monitor_loop():
    """check all sites every CHECK_INTERVAL sec"""
    while True:
        tasks = [check_site(s) for s in SITES]
        results = await asyncio.gather(*tasks)
        for site, result in zip(SITES, results):
            HISTORY[site["id"]].append(result)
        await asyncio.sleep(CHECK_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(monitor_loop())
    yield
    task.cancel()


app = FastAPI(title="SpeedTest API", docs_url="/api/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CHUNK_SIZES = {
    "1mb":   1 * 1024 * 1024,
    "10mb":  10 * 1024 * 1024,
    "25mb":  25 * 1024 * 1024,
    "100mb": 100 * 1024 * 1024,
}


@app.get("/api/ping")
async def ping():
    return JSONResponse(content={"server_ts": time.time()},
                        headers={"Cache-Control": "no-store"})


@app.get("/api/download/{size}")
async def download(size: str):
    num_bytes = CHUNK_SIZES.get(size)
    if num_bytes is None:
        return JSONResponse(status_code=400, content={"error": "Unknown size"})
    data = os.urandom(num_bytes)
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Length": str(num_bytes), "Cache-Control": "no-store"},
    )


@app.post("/api/upload")
async def upload(request: Request):
    body = await request.body()
    return JSONResponse(
        content={"received_bytes": len(body), "md5": hashlib.md5(body).hexdigest()},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/uptime/sites")
async def uptime_sites():
    """Return all monitored sites with their latest check result."""
    result = []
    for site in SITES:
        h = HISTORY[site["id"]]
        latest = h[-1] if h else None
        if h:
            up_count = sum(1 for r in h if r["up"])
            uptime_pct = round(up_count / len(h) * 100, 1)
        else:
            uptime_pct = None
        result.append({
            "id":         site["id"],
            "name":       site["name"],
            "url":        site["url"],
            "latest":     latest,
            "uptime_pct": uptime_pct,
        })
    return result


@app.get("/api/uptime/history/{site_id}")
async def uptime_history(site_id: str):
    """return stored history for a site"""
    if site_id not in SITE_BY_ID:
        return JSONResponse(status_code=404, content={"error": "Site not found"})
    return {
        "site": SITE_BY_ID[site_id],
        "history": list(HISTORY[site_id]),
    }


@app.get("/api/uptime/check")
async def uptime_check(url: str = Query(..., description="URL to check")):
    """check by user url"""
    if not url.startswith(("http://", "https://")):
        return JSONResponse(status_code=400, content={"error": "URL must start with http:// or https://"})
    result = await check_site({"url": url})
    return {"url": url, **result}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
