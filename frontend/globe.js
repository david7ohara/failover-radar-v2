
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

  // ------------------------------------------------------------
  // SCENE
  // ------------------------------------------------------------

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.35);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (_) {
    box.textContent = 'This browser could not initialize WebGL.';
    return;
  }

  const isMobile = window.matchMedia('(max-width: 760px)').matches;

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.7)
  );

  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.className = 'globe-canvas';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  box.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const earthRadius = 1;

  const dynamicGroup = new THREE.Group();
  root.add(dynamicGroup);

  // ------------------------------------------------------------
  // LIGHTING
  // ------------------------------------------------------------

  scene.add(new THREE.AmbientLight(0x9bbbd2, 0.72));

  const sunlight = new THREE.DirectionalLight(0xffffff, 1.65);
  sunlight.position.set(4, 2, 5);
  scene.add(sunlight);

  const blueFill = new THREE.DirectionalLight(0x287dbb, 0.28);
  blueFill.position.set(-4, -1, -4);
  scene.add(blueFill);

  // ------------------------------------------------------------
  // STARFIELD
  // ------------------------------------------------------------

  function createStarfield() {
    const count = isMobile ? 650 : 1100;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const radius = 5 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] =
        radius * Math.sin(phi) * Math.cos(theta);

      positions[i * 3 + 1] =
        radius * Math.cos(phi);

      positions[i * 3 + 2] =
        radius * Math.sin(phi) * Math.sin(theta);

      sizes[i] = 0.45 + Math.random() * 1.25;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
      'size',
      new THREE.BufferAttribute(sizes, 1)
    );

    const material = new THREE.PointsMaterial({
      color: 0xd7edff,
      size: 0.018,
      transparent: true,
      opacity: 0.78,
      sizeAttenuation: true,
      depthWrite: false
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    return stars;
  }

  const stars = createStarfield();

  // ------------------------------------------------------------
  // EARTH TEXTURE
  // ------------------------------------------------------------

  function makeFallbackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    const ocean = ctx.createLinearGradient(0, 0, 0, 512);
    ocean.addColorStop(0, '#153b56');
    ocean.addColorStop(0.5, '#071a2c');
    ocean.addColorStop(1, '#102b43');

    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(100,180,220,0.12)';
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
    ctx.strokeStyle = 'rgba(146,220,190,0.5)';
    ctx.lineWidth = 1.5;

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

  const fallbackTexture = makeFallbackTexture();

  const earthMaterial = new THREE.MeshPhongMaterial({
    map: fallbackTexture,
    color: 0xffffff,
    shininess: 22,
    specular: new THREE.Color(0x294b68)
  });

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius, 96, 64),
    earthMaterial
  );

  root.add(earth);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    function (texture) {
      if (THREE.sRGBEncoding !== undefined) {
        texture.encoding = THREE.sRGBEncoding;
      }

      const oldTexture = earthMaterial.map;
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;

      if (oldTexture && oldTexture !== texture) {
        oldTexture.dispose();
      }
    },
    undefined,
    function () {
      // Keep the fallback texture.
    }
  );

  // ------------------------------------------------------------
  // ATMOSPHERE
  // ------------------------------------------------------------

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.018, 72, 48),
    new THREE.MeshBasicMaterial({
      color: 0x399bd6,
      transparent: true,
      opacity: 0.035,
      side: THREE.BackSide,
      depthWrite: false
    })
  );

  root.add(atmosphere);

  // ------------------------------------------------------------
  // RESIZING
  // ------------------------------------------------------------

  function resize() {
    const width = Math.max(box.clientWidth, 1);
    const height = Math.max(box.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
  }

  resize();
  window.addEventListener('resize', resize);

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(box);
  }

  // ------------------------------------------------------------
  // COORDINATES
  // ------------------------------------------------------------

  function latLonToVector(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;

    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  // ------------------------------------------------------------
  // DYNAMIC RADAR OBJECTS
  // ------------------------------------------------------------

  let pulses = [];

  function disposeDynamicObjects() {
    while (dynamicGroup.children.length) {
      const object = dynamicGroup.children[0];
      dynamicGroup.remove(object);

      object.traverse(function (child) {
        if (child.geometry) {
          child.geometry.dispose();
        }

        if (child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

          materials.forEach(function (material) {
            if (material.map && material.map !== earthMaterial.map) {
              material.map.dispose();
            }

            material.dispose();
          });
        }
      });
    }

    pulses = [];
  }

  function addRegionMarker(region, selected) {
    const nearby = !!(
      region.classification &&
      region.classification.startsWith('NEARBY')
    );

    const color = nearby ? 0xfb7185 : 0x10e7c0;

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(nearby ? 0.022 : 0.016, 14, 12),
      new THREE.MeshBasicMaterial({
        color: selected ? color : 0x64748b,
        transparent: true,
        opacity: selected ? 1 : 0.3
      })
    );

    marker.position.copy(
      latLonToVector(region.lat, region.lon, 1.012)
    );

    dynamicGroup.add(marker);

    if (nearby && selected) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.0025, 6, 32),
        new THREE.MeshBasicMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0.8
        })
      );

      const position = latLonToVector(
        region.lat,
        region.lon,
        1.014
      );

      ring.position.copy(position);
      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        position.clone().normalize()
      );

      dynamicGroup.add(ring);

      pulses.push({
        type: 'ring',
        mesh: ring,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function addQuakeMarker(quake) {
    if (
      typeof quake.lat !== 'number' ||
      typeof quake.lon !== 'number'
    ) return;

    const simulated = !!quake.simulated;
    const color = simulated ? 0xc084fc : 0xfbbf24;

    const position = latLonToVector(
      quake.lat,
      quake.lon,
      1.018
    );

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(
        simulated ? 0.019 : 0.014,
        12,
        10
      ),
      new THREE.MeshBasicMaterial({ color })
    );

    dot.position.copy(position);
    dynamicGroup.add(dot);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        simulated ? 0.043 : 0.032,
        0.003,
        6,
        32
      ),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85
      })
    );

    ring.position.copy(position);
    ring.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      position.clone().normalize()
    );

    dynamicGroup.add(ring);

    pulses.push({
      type: 'ring',
      mesh: ring,
      phase: Math.random() * Math.PI * 2
    });
  }

  function addFailoverRoute(region, alternative) {
    const start = latLonToVector(
      region.lat,
      region.lon,
      1.018
    );

    const end = latLonToVector(
      alternative.lat,
      alternative.lon,
      1.018
    );

    const midpoint = start.clone()
      .add(end)
      .normalize()
      .multiplyScalar(1.22);

    const curve = new THREE.QuadraticBezierCurve3(
      start,
      midpoint,
      end
    );

    const route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.004, 7, false),
      new THREE.MeshBasicMaterial({
        color: 0x10e7c0,
        transparent: true,
        opacity: 0.82
      })
    );

    dynamicGroup.add(route);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffffff
      })
    );

    dynamicGroup.add(pulse);

    pulses.push({
      type: 'route',
      mesh: pulse,
      curve: curve,
      progress: Math.random()
    });
  }

  // ------------------------------------------------------------
  // SIMULATION CAMERA FOCUS
  // Focus on the midpoint between source and destination.
  // ------------------------------------------------------------

  let targetQuaternion = new THREE.Quaternion();
  let lastFocusKey = '';

  function focusOnRegion(region, alternative) {
    if (
      !region ||
      typeof region.lat !== 'number' ||
      typeof region.lon !== 'number'
    ) return;

    const key = String(region.id || '') +
      ':' + region.lat + ':' + region.lon +
      ':' + (alternative ? alternative.id : '');

    if (key === lastFocusKey) return;
    lastFocusKey = key;

    const sourceDirection = latLonToVector(
      region.lat,
      region.lon,
      1
    ).normalize();

    let focusDirection = sourceDirection.clone();

    if (
      alternative &&
      typeof alternative.lat === 'number' &&
      typeof alternative.lon === 'number'
    ) {
      const destinationDirection = latLonToVector(
        alternative.lat,
        alternative.lon,
        1
      ).normalize();

      const midpoint = sourceDirection
        .clone()
        .add(destinationDirection);

      if (midpoint.lengthSq() > 0.0001) {
        focusDirection = midpoint.normalize();
      }
    }

    const cameraDirection = new THREE.Vector3(0, 0, 1);

    targetQuaternion.setFromUnitVectors(
      focusDirection,
      cameraDirection
    );

    // Slight rightward adjustment to the simulation view.
    const rightTurn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.10
    );

    targetQuaternion.premultiply(rightTurn);
  }

  // ------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------

  function updateHud(data, simulated, active) {
    if (!hud) return;

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
      ? 'M' + firstQuake.magnitude +
        ' quake · ' + firstQuake.distance_km + ' km'
      : 'Nearby seismic event';

    const destination = alternative
      ? alternative.label + ' (' + alternative.id + ')'
      : 'nearest alternative';

    hud.textContent =
      (simulated ? 'SIMULATION · ' : 'RADAR ALERT · ') +
      eventText +
      ' near ' + active.label +
      ' · Alternative: ' + destination;

    hud.hidden = false;
  }

  // ------------------------------------------------------------
  // PUBLIC UPDATE — called by app.js
  // ------------------------------------------------------------

  function update(data, stackState, simulated) {
    if (!data || !Array.isArray(data.regions)) return;

    disposeDynamicObjects();

    const selectedRegions = stackState && stackState.regions
      ? stackState.regions
      : null;

    const regionById = new Map();

    data.regions.forEach(function (region) {
      regionById.set(region.id, region);
    });

    const selectedNearby = data.regions.find(function (region) {
      const selected = !selectedRegions ||
        selectedRegions.has(region.id);

      return selected &&
        region.classification &&
        region.classification.startsWith('NEARBY');
    });

    const activeNearby = data.regions.find(function (region) {
      return region.classification &&
        region.classification.startsWith('NEARBY');
    });

    const focusRegion = selectedNearby || activeNearby;

    const focusAlternative = focusRegion &&
      focusRegion.nearest_alternative
      ? regionById.get(focusRegion.nearest_alternative.id)
      : null;

    if (simulated && focusRegion) {
      focusOnRegion(focusRegion, focusAlternative);
    } else if (!simulated) {
      lastFocusKey = '';
    }

    const quakes = data.quakes &&
      Array.isArray(data.quakes.items)
      ? data.quakes.items
      : [];

    quakes.forEach(addQuakeMarker);

    data.regions.forEach(function (region) {
      const selected = !selectedRegions ||
        selectedRegions.has(region.id);

      if (
        typeof region.lat !== 'number' ||
        typeof region.lon !== 'number'
      ) return;

      addRegionMarker(region, selected);

      const nearby = region.classification &&
        region.classification.startsWith('NEARBY');

      if (
        !nearby ||
        !selected ||
        !region.nearest_alternative
      ) return;

      const alternative = regionById.get(
        region.nearest_alternative.id
      );

      if (
        alternative &&
        typeof alternative.lat === 'number' &&
        typeof alternative.lon === 'number'
      ) {
        addFailoverRoute(region, alternative);
      }
    });

    updateHud(data, !!simulated, focusRegion);
  }

  // ------------------------------------------------------------
  // SMOOTH TOUCH / MOUSE ROTATION
  // ------------------------------------------------------------

  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let lastFrameTime = 0;
  let animationFrame = 0;
  let idleTime = 0;

  const dragSensitivity = 0.0045;

  renderer.domElement.addEventListener('pointerdown', function (event) {
    dragging = true;
    idleTime = 0;

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

    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      dx * dragSensitivity
    );

    const pitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      dy * dragSensitivity
    );

    targetQuaternion.multiply(yaw);
    targetQuaternion.multiply(pitch);

    previousX = event.clientX;
    previousY = event.clientY;
  });

  function stopDragging() {
    dragging = false;
    idleTime = 0;
  }

  renderer.domElement.addEventListener('pointerup', stopDragging);
  renderer.domElement.addEventListener('pointercancel', stopDragging);
  renderer.domElement.addEventListener('lostpointercapture', stopDragging);

  // ------------------------------------------------------------
  // ANIMATION LOOP
  // ------------------------------------------------------------

  function animate(time) {
    animationFrame = requestAnimationFrame(animate);

    if (!lastFrameTime) lastFrameTime = time;

    const delta = Math.min(
      (time - lastFrameTime) / 1000,
      0.04
    );

    lastFrameTime = time;

    idleTime += delta;

    if (!dragging && idleTime > 3 && !lastFocusKey) {
      const idleRotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        delta * 0.055
      );

      targetQuaternion.multiply(idleRotation);
    }

    const smooth = 1 - Math.exp(-delta * 4.2);
    root.quaternion.slerp(targetQuaternion, smooth);

    const seconds = time * 0.001;

    pulses.forEach(function (pulse) {
      if (pulse.type === 'route') {
        pulse.progress =
          (pulse.progress + delta * 0.24) % 1;

        pulse.mesh.position.copy(
          pulse.curve.getPointAt(pulse.progress)
        );
      }

      if (pulse.type === 'ring') {
        const wave = 0.5 + 0.5 * Math.sin(
          seconds * 2.2 + pulse.phase
        );

        const scale = 0.85 + wave * 0.35;
        pulse.mesh.scale.setScalar(scale);
      }
    });

    stars.rotation.y += delta * 0.002;

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
