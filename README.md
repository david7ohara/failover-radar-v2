# Failover Radar

Real-time infrastructure resilience dashboard for on-call engineers and startup founders. Shows live USGS seismic telemetry and cloud provider status (GitHub, Cloudflare) side by side, computes exact Haversine distances to your cloud regions, and generates a plain-English operator failover checklist with a 1-click Copy Incident Brief exporter.

---

## Run locally

**Prerequisites:** Python 3.11+

```bash
git clone https://github.com/your-org/failover-radar-v2.git
cd failover-radar-v2
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The app is now running at `http://localhost:8000`.

**Smoke-test the API:**

```bash
# Liveness probe
curl http://localhost:8000/api/health

# Live radar data
curl http://localhost:8000/api/radar

# Tokyo M6.8 simulation (safe — clearly prefixed with SIMULATION:)
curl "http://localhost:8000/api/radar?simulate=true"
```

**Run the test suite:**

```bash
pytest backend/tests/
```

---

## Deploy

### Docker

```bash
docker build -t failover-radar .
docker run -p 8000:8000 failover-radar
```

Override the port:

```bash
docker run -e PORT=9000 -p 9000:9000 failover-radar
```

### Railway

1. Push this repository to GitHub.
2. Create a new Railway project and link the repository.
3. Railway detects the `Dockerfile` automatically and sets `$PORT` at runtime.
4. Click **Deploy**. The app will be live at your Railway-assigned URL.

```bash
# Or deploy directly with the Railway CLI
railway up
```

---

## Simulation mode

Append `?simulate=true` to any `/api/radar` request to inject a fixed M6.8 earthquake offshore Tokyo `(35.30°N, 140.85°E)`. All simulated items are prefixed with `SIMULATION:` throughout the payload and UI so they can never be mistaken for live events.

---

## Data sources & attribution

| Source | URL |
|--------|-----|
| USGS Earthquake Hazards Program | https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson |
| GitHub Status | https://www.githubstatus.com/api/v2/summary.json |
| Cloudflare Status | https://www.cloudflarestatus.com/api/v2/summary.json |
| Map tiles | CartoDB Dark Matter — © [CartoDB](https://carto.com/attributions), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors |

Haversine distances use Earth radius = 6371.0 km. Regions flagged `NEARBY (within 300 km)` have a great-circle distance ≤ 300 km from the earthquake epicentre.
