import sys
import time
import httpx

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://networkutils.mooo.com"

GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"
BOLD = "\033[1m"

passed = 0
failed = 0


def check(name: str, ok: bool, detail: str = ""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  {GREEN}✓{RESET} {name}" + (f"  {detail}" if detail else ""))
    else:
        failed += 1
        print(f"  {RED}✗{RESET} {name}" + (f"  {RED}{detail}{RESET}" if detail else ""))


def section(title: str):
    print(f"\n{BOLD}{title}{RESET}")

section("Health")
r = httpx.get(f"{BASE}/api/health")
check("GET /api/health  -> 200", r.status_code == 200)
check("Тело содержит status: ok", r.json().get("status") == "ok")

section("Latency")
r = httpx.get(f"{BASE}/api/ping")
check("GET /api/ping  -> 200", r.status_code == 200)
check("Тело содержит server_ts", "server_ts" in r.json())
check("Cache-Control: no-store", "no-store" in r.headers.get("cache-control", ""))

section("Download")
for size, expected_bytes in [("1mb", 1), ("10mb", 10), ("25mb", 25)]:
    t0 = time.monotonic()
    r = httpx.get(f"{BASE}/api/download/{size}", timeout=60)
    elapsed = time.monotonic() - t0
    mb = len(r.content) / 1024 / 1024
    mbps = round(mb * 8 / elapsed, 1)
    check(
        f"GET /api/download/{size}  -> {expected_bytes} MB",
        r.status_code == 200 and abs(mb - expected_bytes) < 0.1,
        f"{mb:.1f} MB @ {mbps} Mbps",
    )

r = httpx.get(f"{BASE}/api/download/999mb")
check("GET /api/download/999mb  -> 400 (неверный размер)", r.status_code == 400)

section("Upload")
payload = bytes(1 * 1024 * 1024)  # 1 MB нулей
t0 = time.monotonic()
r = httpx.post(f"{BASE}/api/upload", content=payload, timeout=60)
elapsed = time.monotonic() - t0
mbps = round(len(payload) * 8 / elapsed / 1e6, 1)
data = r.json()
check("POST /api/upload  -> 200",              r.status_code == 200)
check("received_bytes == 1 048 576",         data.get("received_bytes") == len(payload),
      str(data.get("received_bytes")))
check(f"Скорость загрузки", True, f"{mbps} Mbps")

section("Uptime — список сайтов")
r = httpx.get(f"{BASE}/api/uptime/sites")
check("GET /api/uptime/sites  -> 200", r.status_code == 200)
sites = r.json()
check("Список не пустой", len(sites) > 0, f"{len(sites)} сайтов")
check("Каждый сайт содержит id/name/url",
      all("id" in s and "name" in s and "url" in s for s in sites))

section("Uptime — история")
first_id = sites[0]["id"]
r = httpx.get(f"{BASE}/api/uptime/history/{first_id}")
check(f"GET /api/uptime/history/{first_id}  -> 200",  r.status_code == 200)
data = r.json()
check("Ответ содержит site и history", "site" in data and "history" in data)

r = httpx.get(f"{BASE}/api/uptime/history/несуществующий")
check("Несуществующий id  -> 404", r.status_code == 404)

section("Uptime — разовая проверка")
r = httpx.get(f"{BASE}/api/uptime/check", params={"url": "https://www.google.com"}, timeout=15)
check("GET /api/uptime/check?url=google  -> 200", r.status_code == 200)
data = r.json()
check("Ответ содержит up/latency_ms", "up" in data and "latency_ms" in data,
      f"up={data.get('up')}  latency={data.get('latency_ms')} ms")

r = httpx.get(f"{BASE}/api/uptime/check", params={"url": "не-урл"})
check("Невалидный URL  -> 400", r.status_code == 400)

total = passed + failed
print(f"\n{BOLD}Итог: {passed}/{total} проверок прошли{RESET}")
if failed:
    print(f"{RED}Провалено: {failed}{RESET}")
    sys.exit(1)
else:
    print(f"{GREEN}Все проверки пройдены{RESET}")
