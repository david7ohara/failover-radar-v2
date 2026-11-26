'use strict';
(function () {
  // Let existing app.js run cleanly without Leaflet
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
  window.L = noop;

  const box = document.getElementById('map');
  const hud = document.getElementById('sim-narration');
  if (!box || typeof Globe === 'undefined') return;

  const globe = Globe()(box)
    .globeImageUrl('https://unpkg.com')
    .bumpImageUrl('https://unpkg.com')
    .backgroundColor('rgba(6, 11, 20, 0)')
    .atmosphereColor('#38bdf8')
    .atmosphereAltitude(0.24)
    .pointLat('lat').pointLng('lon').pointColor('c')
    .pointAltitude('alt').pointRadius('r').pointLabel('tip')
    .ringLat('lat').ringLng('lon').ringMaxRadius('maxR')
    .ringColor(() => t => `rgba(251, 113, 133, ${Math.max(0, 1 - t)})`)
    .ringPropagationSpeed(2.4).ringRepeatPeriod(950)
    .arcStartLat('sLat').arcStartLng('sLng').arcEndLat('eLat').arcEndLng('eLng')
    .arcColor(() => ['#fb7185', '#10f5c0'])
    .arcDashLength(0.45).arcDashGap(0.22).arcDashAnimateTime(1350)
    .arcStroke(1.45).arcAltitudeAutoScale(0.42);

  const ctrl = globe.controls();
  ctrl.autoRotate = true;
  ctrl.autoRotateSpeed = 0.6;
  globe.pointOfView({ lat: 24, lng: 18, altitude: 2.1 }, 0);

  const fit = () => {
    globe.width(box.clientWidth || window.innerWidth);
    globe.height(box.clientHeight || 420);
  };
  fit();
  window.addEventListener('resize', fit);

  let pts = [];
  let tick = 0;
  let lastSim = false;

  setInterval(() => {
    if (!pts.length) return;
    tick += 0.35;
    globe.pointsData(
      pts.map((p, i) => ({
        ...p,
        alt: p.baseAlt * (0.72 + 0.38 * Math.abs(Math.sin(tick + i * 0.9)))
      }))
    );
  }, 160);

  async function syncGlobe() {
    const sim = !document.getElementById('sim-banner')?.hidden;
    try {
      const r = await fetch('/api/radar?simulate=' + sim);
      if (!r.ok) return;
      const d = await r.json();
      const byId = Object.fromEntries(d.regions.map(x => [x.id, x]));
      const nextPts = [];
      const rings = [];
      const arcs = [];

      for (const q of d.quakes.items) {
        const alt = Math.min(0.32, Math.max(0.06, (q.magnitude - 3.8) * 0.065));
        nextPts.push({
          lat: q.lat,
          lon: q.lon,
          c: q.simulated ? '#a78bfa' : '#fbbf24',
          baseAlt: alt,
          alt,
          r: q.simulated ? 0.55 : 0.36,
          tip: `${q.place} · M${q.magnitude}`
        });
        if (q.simulated) rings.push({ lat: q.lat, lon: q.lon, maxR: 7.5 });
      }

      for (const reg of d.regions) {
        const near = reg.classification.startsWith('NEARBY');
        const alt = near ? 0.25 : 0.11;
        nextPts.push({
          lat: reg.lat,
          lon: reg.lon,
          c: near ? '#fb7185' : '#10f5c0',
          baseAlt: alt,
          alt,
          r: near ? 0.62 : 0.44,
          tip: `${reg.label} (${reg.id}) · ${reg.classification}`
        });
        if (near) {
          rings.push({ lat: reg.lat, lon: reg.lon, maxR: 6.5 });
          const altReg = reg.nearest_alternative && byId[reg.nearest_alternative.id];
          if (altReg) {
            arcs.push({ sLat: reg.lat, sLng: reg.lon, eLat: altReg.lat, eLng: altReg.lon });
          }
        }
      }

      pts = nextPts;
      globe.pointsData(pts).ringsData(rings).arcsData(arcs);

      const active = d.regions.find(x => x.classification.startsWith('NEARBY'));
      if (sim !== lastSim) {
        lastSim = sim;
        ctrl.autoRotate = !sim;
        if (sim && active) {
          globe.pointOfView({ lat: active.lat, lng: active.lon, altitude: 1.65 }, 1100);
        }
      }

      if (hud) {
        if (sim || active) {
          const altReg = active?.nearest_alternative && byId[active.nearest_alternative.id];
          const q0 = active?.nearby_quakes?.at(0);
          const eventStr = q0 ? `M${q0.magnitude} quake (${q0.distance_km} km)` : 'Seismic event';
          const destStr = altReg ? `${altReg.label} (${altReg.id})` : 'nearest region';
          hud.textContent = `${sim ? 'SIMULATION · ' : 'ALERT · '}${eventStr} nearby ${active?.label || 'Tokyo'} — rerouting illustrative failover traffic → ${destStr}`;
          hud.hidden = false;
        } else {
          hud.hidden = true;
        }
      }
    } catch (_) {}
  }

  syncGlobe();
  setInterval(syncGlobe, 15000);
  document.getElementById('btn-simulate')?.addEventListener('click', () => setTimeout(syncGlobe, 140));
  document.getElementById('btn-clear')?.addEventListener('click', () => setTimeout(syncGlobe, 140));
})();
