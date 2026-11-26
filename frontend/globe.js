'use strict';
(function () {
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
  window.L = noop;

  const box = document.getElementById('map');
  const hud = document.getElementById('sim-narration');
  if (!box || typeof Globe === 'undefined') return;

  function makeArcticTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0f2d4a');
    grad.addColorStop(0.22, '#071528');
    grad.addColorStop(0.5, '#050b16');
    grad.addColorStop(0.78, '#071528');
    grad.addColorStop(1, '#0f2d4a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }

    // Glowing Arctic, Equator, and Antarctic rings
    ctx.strokeStyle = 'rgba(16, 245, 192, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 68); ctx.lineTo(1024, 68); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(1024, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 444); ctx.lineTo(1024, 444); ctx.stroke();

    // Glowing Aurora-emerald continental silhouettes
    ctx.fillStyle = 'rgba(16, 245, 192, 0.22)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.8;

    function drawLand(lon, lat, rx, ry, rot) {
      const x = ((lon + 180) / 360) * 1024;
      const y = ((90 - lat) / 180) * 512;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    drawLand(-100, 45, 68, 42, -0.2);   // North America
    drawLand(-60, -18, 34, 58, 0.25);   // South America
    drawLand(16, 50, 42, 24, -0.1);     // Europe
    drawLand(20, 4, 42, 54, 0.1);       // Africa
    drawLand(92, 46, 95, 48, 0.08);     // Asia
    drawLand(139, 36, 10, 22, 0.5);     // Japan
    drawLand(134, -25, 36, 24, 0.15);   // Australia

    return c.toDataURL('image/png');
  }

  const globe = Globe()(box)
    .globeImageUrl(makeArcticTexture())
    .backgroundColor('rgba(6, 11, 20, 0)')
    .showAtmosphere(true)
    .atmosphereColor('#38bdf8')
    .atmosphereAltitude(0.26)
    .pointLat('lat').pointLng('lon').pointColor('c')
    .pointAltitude('alt').pointRadius('r').pointLabel('tip')
    .ringLat('lat').ringLng('lon').ringMaxRadius('maxR')
    .ringColor(() => t => `rgba(251, 113, 133, ${Math.max(0, 1 - t)})`)
    .ringPropagationSpeed(2.4).ringRepeatPeriod(950)
    .arcStartLat('sLat').arcStartLng('sLng').arcEndLat('eLat').arcEndLng('eLng')
    .arcColor(() => ['#fb7185', '#10f5c0'])
    .arcDashLength(0.45).arcDashGap(0.22).arcDashAnimateTime(1350)
    .arcStroke(1.6).arcAltitudeAutoScale(0.42);

  const ctrl = globe.controls();
  ctrl.autoRotate = true;
  ctrl.autoRotateSpeed = 0.7;
  globe.pointOfView({ lat: 24, lng: 18, altitude: 2.0 }, 0);

  const fit = () => {
    globe.width(box.clientWidth || window.innerWidth);
    globe.height(box.clientHeight || 390);
  };
  fit();
  setTimeout(fit, 250);
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
          r: q.simulated ? 0.6 : 0.4,
          tip: `${q.place} · M${q.magnitude}`
        });
        if (q.simulated) rings.push({ lat: q.lat, lon: q.lon, maxR: 7.5 });
      }

      for (const reg of d.regions) {
        const near = reg.classification.startsWith('NEARBY');
        const alt = near ? 0.26 : 0.12;
        nextPts.push({
          lat: reg.lat,
          lon: reg.lon,
          c: near ? '#fb7185' : '#10f5c0',
          baseAlt: alt,
          alt,
          r: near ? 0.68 : 0.48,
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
          globe.pointOfView({ lat: active.lat, lng: active.lon, altitude: 1.6 }, 1100);
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
