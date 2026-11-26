'use strict';
(function () {
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
  window.L = noop;

  const box = document.getElementById('map');
  const hud = document.getElementById('sim-narration');
  if (!box || typeof THREE === 'undefined') return;

  box.innerHTML = '';
  const w0 = box.clientWidth || window.innerWidth;
  const h0 = box.clientHeight || 390;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w0 / h0, 0.1, 100);
  camera.position.z = 3.15;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w0, h0);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  box.appendChild(renderer.domElement);

  // Arctic Aurora 3D Sphere Texture
  function makeTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0f2d4a');
    grad.addColorStop(0.25, '#071528');
    grad.addColorStop(0.5, '#050b16');
    grad.addColorStop(0.75, '#071528');
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

    ctx.fillStyle = 'rgba(16, 245, 192, 0.24)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 2;
    function land(lon, lat, rx, ry, rot) {
      const x = ((lon + 180) / 360) * 1024;
      const y = ((90 - lat) / 180) * 512;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    land(-100, 45, 68, 42, -0.2);
    land(-60, -18, 34, 58, 0.25);
    land(16, 50, 42, 24, -0.1);
    land(20, 4, 42, 54, 0.1);
    land(92, 46, 95, 48, 0.08);
    land(139, 36, 10, 22, 0.5);
    land(134, -25, 36, 24, 0.15);

    return new THREE.CanvasTexture(c);
  }

  const root = new THREE.Group();
  root.rotation.x = 0.28;
  scene.add(root);

  const R = 1;
  const globeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 48),
    new THREE.MeshPhongMaterial({
      map: makeTexture(),
      emissive: new THREE.Color('#071d33'),
      shininess: 22
    })
  );
  root.add(globeMesh);

  // Outer Aurora Atmosphere Halo
  const haloMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.07, 36, 36),
    new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide
    })
  );
  root.add(haloMesh);

  scene.add(new THREE.AmbientLight('#bce3ff', 0.85));
  const dirLight = new THREE.DirectionalLight('#6ee7b7', 1.1);
  dirLight.position.set(4, 3, 5);
  scene.add(dirLight);

  function latLonToVec3(lat, lon, r) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  const dynamicGroup = new THREE.Group();
  root.add(dynamicGroup);
  let eqBars = [];
  let pulses = [];

  // Touch / Mouse drag to spin 3D globe
  let dragging = false;
  let autoSpin = true;
  let targetRotY = null;
  let prevX = 0;
  let prevY = 0;

  renderer.domElement.addEventListener('pointerdown', e => {
    dragging = true;
    autoSpin = false;
    targetRotY = null;
    prevX = e.clientX;
    prevY = e.clientY;
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    root.rotation.y += (e.clientX - prevX) * 0.007;
    root.rotation.x = Math.max(-1.1, Math.min(1.1, root.rotation.x + (e.clientY - prevY) * 0.005));
    prevX = e.clientX;
    prevY = e.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  window.addEventListener('resize', () => {
    const w = box.clientWidth || window.innerWidth;
    const h = box.clientHeight || 390;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.04;

    if (targetRotY !== null) {
      root.rotation.y += (targetRotY - root.rotation.y) * 0.07;
      if (Math.abs(targetRotY - root.rotation.y) < 0.01) targetRotY = null;
    } else if (autoSpin) {
      root.rotation.y += 0.004;
    }

    // Music-style 3D equalizer cylinder animation
    for (let i = 0; i < eqBars.length; i++) {
      const b = eqBars[i];
      const wave = 0.65 + 0.45 * Math.abs(Math.sin(t * 2.3 + i * 1.1));
      b.mesh.scale.y = wave;
    }

    // Traveling 3D plasma pulses along failover pipes
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const u = (t * 0.25) % 1;
      const pos = p.curve.getPointAt(u);
      p.mesh.position.copy(pos);
    }

    renderer.render(scene, camera);
  }
  animate();

  let lastSim = false;
  async function syncGlobe() {
    const sim = !document.getElementById('sim-banner')?.hidden;
    try {
      const r = await fetch('/api/radar?simulate=' + sim);
      if (!r.ok) return;
      const d = await r.json();
      const byId = Object.fromEntries(d.regions.map(x => [x.id, x]));

      while (dynamicGroup.children.length) {
        dynamicGroup.remove(dynamicGroup.children.at(0));
      }
      eqBars = [];
      pulses = [];

      function addBar(lat, lon, height, radius, colorHex) {
        const pos = latLonToVec3(lat, lon, R);
        const geo = new THREE.CylinderGeometry(radius, radius, height, 10);
        geo.translate(0, height / 2, 0);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
        dynamicGroup.add(mesh);
        eqBars.push({ mesh });
      }

      for (const q of d.quakes.items) {
        const h = Math.min(0.32, Math.max(0.08, (q.magnitude - 3.8) * 0.06));
        addBar(q.lat, q.lon, h, q.simulated ? 0.022 : 0.014, q.simulated ? '#c084fc' : '#fbbf24');
      }

      for (const reg of d.regions) {
        const near = reg.classification.startsWith('NEARBY');
        addBar(reg.lat, reg.lon, near ? 0.28 : 0.14, near ? 0.024 : 0.016, near ? '#fb7185' : '#10f5c0');

        if (near && reg.nearest_alternative) {
          const altReg = byId[reg.nearest_alternative.id];
          if (altReg) {
            const p0 = latLonToVec3(reg.lat, reg.lon, R);
            const p2 = latLonToVec3(altReg.lat, altReg.lon, R);
            const mid = p0.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.36);
            const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);

            const pipe = new THREE.Mesh(
              new THREE.TubeGeometry(curve, 36, 0.012, 8, false),
              new THREE.MeshBasicMaterial({ color: '#10f5c0', transparent: true, opacity: 0.85 })
            );
            dynamicGroup.add(pipe);

            const pulseMesh = new THREE.Mesh(
              new THREE.SphereGeometry(0.028, 12, 12),
              new THREE.MeshBasicMaterial({ color: '#ffffff' })
            );
            dynamicGroup.add(pulseMesh);
            pulses.push({ curve, mesh: pulseMesh });
          }
        }
      }

      const active = d.regions.find(x => x.classification.startsWith('NEARBY'));
      if (sim !== lastSim) {
        lastSim = sim;
        if (sim && active) {
          autoSpin = false;
          targetRotY = -((active.lon + 90) * Math.PI) / 180;
        } else {
          autoSpin = true;
          targetRotY = null;
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
