
'use strict';

(function () {
  const box = document.getElementById('map');
  const hud = document.getElementById('sim-narration');

  if (!box) return;

  if (typeof THREE === 'undefined') {
    box.textContent = '3D globe could not load. Check your internet connection and refresh.';
    return;
  }

  const loading = box.querySelector('.globe-loading');
  if (loading) loading.remove();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.25);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    });
  } catch (_) {
    box.textContent = 'This browser could not initialize WebGL for the 3D globe.';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'globe-canvas';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  box.appendChild(renderer.domElement);

  const root = new THREE.Group();
  root.rotation.x = 0.22;
  scene.add(root);

  const earthRadius = 1;
  const dynamicGroup = new THREE.Group();
  root.add(dynamicGroup);

  const ambient = new THREE.AmbientLight(0xb9dcff, 1.0);
  scene.add(ambient);

  const sunlight = new THREE.DirectionalLight(0xffffff, 1.45);
  sunlight.position.set(4, 2, 5);
  scene.add(sunlight);

  const fillLight = new THREE.DirectionalLight(0x35d6c0, 0.35);
  fillLight.position.set(-4, -2, -3);
  scene.add(fillLight);

  function makeFallbackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');
    const ocean = ctx.createLinearGradient(0, 0, 0, 512);
    ocean.addColorStop(0, '#173e59');
    ocean.addColorStop(0.48, '#071c30');
    ocean.addColorStop(1, '#102f49');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(111,190,220,0.13)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= 1024; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    for (let y = 0; y <= 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#397d70';
    ctx.strokeStyle = 'rgba(146,220,190,0.65)';
    ctx.lineWidth = 2;

    function land(lon, lat, rx, ry, rotation) {
      const x = ((lon + 180) / 360) * 1024;
      const y = ((90 - lat) / 180) * 512;

      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    land(-105, 48, 75, 42, -0.15);
    land(-62, -17, 36, 65, 0.2);
    land(-42, 72, 23, 18, 0);
    land(15, 52, 40, 24, -0.1);
    land(20, 5, 42, 58, 0.1);
    land(85, 48, 105, 48, 0.05);
    land(135, 37, 12, 23, 0.3);
    land(135, -25, 38, 25, 0.1);

    return new THREE.CanvasTexture(canvas);
  }

  const earthMaterial = new THREE.MeshPhongMaterial({
    map: makeFallbackTexture(),
    color: 0xffffff,
    shininess: 18,
    specular: new THREE.Color(0x23445a)
  });

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius, 64, 48),
    earthMaterial
  );
  root.add(earth);

  // Load a real equirectangular Earth texture. The procedural texture above
  // remains in place if the remote image cannot be reached.
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');
  textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    function (texture) {
      if (THREE.sRGBEncoding !== undefined) {
        texture.encoding = THREE.sRGBEncoding;
      }
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
    },
    undefined,
    function () {
      // Keep the local procedural fallback texture.
    }
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.055, 48, 36),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide
    })
  );
  root.add(atmosphere);

  const outerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1.09, 40, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10f5c0,
      transparent: true,
      opacity: 0.035,
      side: THREE.BackSide
    })
  );
  root.add(outerGlow);

  function resize() {
    const width = Math.max(box.clientWidth, 1);
    const height = Math.max(box.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  resize();
  window.addEventListener('resize', resize);

  function latLonToVector(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;

    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function orientToSurface(object, position) {
    object.position.copy(position);
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      position.clone().normalize()
    );
  }

  function clearDynamicObjects() {
    while (dynamicGroup.children.length) {
      const object = dynamicGroup.children[0];
      dynamicGroup.remove(object);

      object.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(function (material) {
              if (material.map && material.map !== earthMaterial.map) {
                material.map.dispose();
              }
              material.dispose();
            });
          } else {
            if (child.material.map && child.material.map !== earthMaterial.map) {
              child.material.map.dispose();
            }
            child.material.dispose();
          }
        }
      });
    }

    pulses = [];
  }

  let pulses = [];
  let autoSpin = true;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let animationFrame = 0;
  let lastFrameTime = 0;

  function addRegionMarker(region, selected) {
    const nearby = !!(
      region.classification &&
      region.classification.startsWith('NEARBY')
    );

    const color = nearby ? 0xfb7185 : 0x10f5c0;
    const material = new THREE.MeshBasicMaterial({
      color: selected ? color : 0x64748b,
      transparent: true,
      opacity: selected ? 1 : 0.32
    });

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(nearby ? 0.022 : 0.016, 14, 12),
      material
    );

    const position = latLonToVector(region.lat, region.lon, 1.012);
    marker.position.copy(position);
    dynamicGroup.add(marker);

    if (nearby && selected) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.0025, 6, 32),
        new THREE.MeshBasicMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0.75
        })
      );

      orientToSurface(ring, latLonToVector(region.lat, region.lon, 1.014));
      dynamicGroup.add(ring);
    }
  }

  function addQuakeMarker(quake) {
    const simulated = !!quake.simulated;
    const color = simulated ? 0xc084fc : 0xfbbf24;
    const position = latLonToVector(quake.lat, quake.lon, 1.018);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(simulated ? 0.018 : 0.014, 12, 10),
      new THREE.MeshBasicMaterial({ color })
    );

    dot.position.copy(position);
    dynamicGroup.add(dot);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(simulated ? 0.043 : 0.032, 0.003, 6, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85
      })
    );

    orientToSurface(ring, latLonToVector(quake.lat, quake.lon, 1.02));
    dynamicGroup.add(ring);

    pulses.push({
      type: 'quake',
      mesh: ring,
      phase: Math.random() * Math.PI * 2
    });
  }

  function addFailoverRoute(region, alternative) {
    const start = latLonToVector(region.lat, region.lon, 1.018);
    const end = latLonToVector(alternative.lat, alternative.lon, 1.018);

    const midpoint = start.clone()
      .add(end)
      .normalize()
      .multiplyScalar(1.23);

    const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);

    const route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.0045, 7, false),
      new THREE.MeshBasicMaterial({
        color: 0x10f5c0,
        transparent: true,
        opacity: 0.72
      })
    );

    dynamicGroup.add(route);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );

    dynamicGroup.add(pulse);

    pulses.push({
      type: 'route',
      mesh: pulse,
      curve,
      progress: Math.random()
    });
  }

  function updateHud(data, simulated) {
    if (!hud) return;

    const active = (data.regions || []).find(function (region) {
      return region.classification &&
        region.classification.startsWith('NEARBY');
    });

    if (!active) {
      hud.hidden = true;
      hud.textContent = '';
      return;
    }

    const alternative = active.nearest_alternative
      ? (data.regions || []).find(function (region) {
          return region.id === active.nearest_alternative.id;
        })
      : null;

    const firstQuake = active.nearby_quakes &&
      active.nearby_quakes.length
      ? active.nearby_quakes[0]
      : null;

    const eventText = firstQuake
      ? 'M' + firstQuake.magnitude + ' quake · ' + firstQuake.distance_km + ' km'
      : 'Nearby seismic event';

    const destination = alternative
      ? alternative.label + ' (' + alternative.id + ')'
      : 'nearest alternative';

    hud.textContent =
      (simulated ? 'SIMULATION · ' : 'RADAR ALERT · ') +
      eventText + ' near ' + active.label +
      ' · Alternative: ' + destination;

    hud.hidden = false;
  }

  function update(data, stackState, simulated) {
    if (!data || !Array.isArray(data.regions)) return;

    clearDynamicObjects();

    const selectedRegions = stackState && stackState.regions
      ? stackState.regions
      : null;

    const regionById = new Map();
    data.regions.forEach(function (region) {
      regionById.set(region.id, region);
    });

    (data.quakes && Array.isArray(data.quakes.items)
      ? data.quakes.items
      : []
    ).forEach(addQuakeMarker);

    data.regions.forEach(function (region) {
      const selected = !selectedRegions || selectedRegions.has(region.id);
      addRegionMarker(region, selected);

      const nearby = region.classification &&
        region.classification.startsWith('NEARBY');

      if (!nearby || !selected || !region.nearest_alternative) return;

      const alternative = regionById.get(region.nearest_alternative.id);
      if (alternative) addFailoverRoute(region, alternative);
    });

    updateHud(data, !!simulated);
  }

  renderer.domElement.addEventListener('pointerdown', function (event) {
    dragging = true;
    autoSpin = false;
    previousX = event.clientX;
    previousY = event.clientY;

    if (renderer.domElement.setPointerCapture) {
      renderer.domElement.setPointerCapture(event.pointerId);
    }
  });

  renderer.domElement.addEventListener('pointermove', function (event) {
    if (!dragging) return;

    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;

    root.rotation.y += dx * 0.006;
    root.rotation.x = Math.max(
      -1.15,
      Math.min(1.15, root.rotation.x + dy * 0.004)
    );

    previousX = event.clientX;
    previousY = event.clientY;
  });

  function stopDragging() {
    dragging = false;
  }

  renderer.domElement.addEventListener('pointerup', stopDragging);
  renderer.domElement.addEventListener('pointercancel', stopDragging);
  renderer.domElement.addEventListener('lostpointercapture', stopDragging);

  function animate(time) {
    animationFrame = requestAnimationFrame(animate);

    if (!lastFrameTime) lastFrameTime = time;
    const delta = Math.min((time - lastFrameTime) / 1000, 0.05);
    lastFrameTime = time;

    if (autoSpin && !dragging) {
      root.rotation.y += delta * 0.12;
    }

    const seconds = time * 0.001;

    pulses.forEach(function (pulse) {
      if (pulse.type === 'route') {
        pulse.progress = (pulse.progress + delta * 0.22) % 1;
        pulse.mesh.position.copy(
          pulse.curve.getPointAt(pulse.progress)
        );
      } else if (pulse.type === 'quake') {
        const scale = 0.85 + 0.25 *
          (0.5 + 0.5 * Math.sin(seconds * 2.5 + pulse.phase));
        pulse.mesh.scale.setScalar(scale);
      }
    });

    renderer.render(scene, camera);
  }

  window.FailoverGlobe = {
    update: update,
    resize: resize
  };

  animate(0);

  window.addEventListener('pagehide', function () {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    renderer.dispose();
  });
})();
