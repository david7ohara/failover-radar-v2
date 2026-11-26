
'use strict';

(function () {
  const box = document.getElementById('map');
  const hud = document.getElementById('sim-narration');

  if (!box || typeof THREE === 'undefined') {
    if (box) {
      box.textContent = '3D globe could not load. Refresh the page and check your connection.';
    }
    return;
  }

  const oldLoading = box.querySelector('.globe-loading');
  if (oldLoading) oldLoading.remove();

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const normalCameraZ = 3.25;
  const simulationCameraZ = 3.95;
  camera.position.set(0, 0, normalCameraZ);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (_) {
    box.textContent = 'This browser could not initialize the 3D globe.';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = 'globe-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';

  box.appendChild(canvas);

  const root = new THREE.Group();
  root.rotation.x = 0.18;
  scene.add(root);

  const dynamicGroup = new THREE.Group();
  root.add(dynamicGroup);

  // Lighting
  scene.add(new THREE.AmbientLight(0xc6dcf5, 1.05));

  const sunlight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunlight.position.set(4, 2.5, 5);
  scene.add(sunlight);

  const fillLight = new THREE.DirectionalLight(0x4bbfff, 0.42);
  fillLight.position.set(-4, -1, -3);
  scene.add(fillLight);

  // Starfield: preserved from the previous globe.
  function createStars() {
    const positions = [];
    let seed = 92741;

    function random() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    for (let i = 0; i < 850; i++) {
      const u = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const radius = 8 + random() * 12;
      const ring = Math.sqrt(1 - u * u);

      positions.push(
        radius * ring * Math.cos(angle),
        radius * u,
        radius * ring * Math.sin(angle)
      );
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
      color: 0xc8e8ff,
      size: 0.035,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true
    });

    scene.add(new THREE.Points(geometry, material));
  }

  createStars();

  // Procedural fallback Earth texture.
  function makeFallbackTexture() {
    const canvasTexture = document.createElement('canvas');
    canvasTexture.width = 1024;
    canvasTexture.height = 512;

    const ctx = canvasTexture.getContext('2d');

    const ocean = ctx.createLinearGradient(0, 0, 0, 512);
    ocean.addColorStop(0, '#174768');
    ocean.addColorStop(0.5, '#09243b');
    ocean.addColorStop(1, '#123c59');

    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = 'rgba(130,205,235,0.12)';
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

    ctx.fillStyle = '#548a78';
    ctx.strokeStyle = 'rgba(170,220,190,0.5)';
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

    return new THREE.CanvasTexture(canvasTexture);
  }

  const earthMaterial = new THREE.MeshPhongMaterial({
    map: makeFallbackTexture(),
    color: 0xffffff,
    shininess: 24,
    specular: new THREE.Color(0x385d78)
  });

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 72, 56),
    earthMaterial
  );

  root.add(earth);

  // Detailed Earth image with procedural fallback.
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
      // Keep fallback texture if the image cannot load.
    }
  );

  // Subtle atmospheric edge.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.022, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0x4bbfff,
      transparent: true,
      opacity: 0.085,
      side: THREE.BackSide,
      depthWrite: false
    })
  );

  root.add(atmosphere);

  // Responsive sizing.
  function resize() {
    const width = Math.max(box.clientWidth, 1);
    const height = Math.max(box.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
  }

  resize();
  window.addEventListener('resize', resize);

  let resizeObserver = null;

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(box);
  }

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
            material.dispose();
          });
        }
      });
    }

    pulses = [];
  }

  function addRegionMarker(region, selected) {
    if (
      typeof region.lat !== 'number' ||
      typeof region.lon !== 'number'
    ) {
      return;
    }

    const nearby = !!(
      region.classification &&
      region.classification.startsWith('NEARBY')
    );

    const color = nearby ? 0xfb7185 : 0x10e8c0;

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(nearby ? 0.022 : 0.016, 16, 12),
      new THREE.MeshBasicMaterial({
        color: selected ? color : 0x8294a8,
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
        new THREE.TorusGeometry(0.035, 0.0025, 6, 36),
        new THREE.MeshBasicMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0.82
        })
      );

      orientToSurface(
        ring,
        latLonToVector(region.lat, region.lon, 1.014)
      );

      dynamicGroup.add(ring);
    }
  }

  function addQuakeMarker(quake) {
    if (
      typeof quake.lat !== 'number' ||
      typeof quake.lon !== 'number'
    ) {
      return;
    }

    const simulated = !!quake.simulated;
    const color = simulated ? 0xc084fc : 0xfbbf24;

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(
        simulated ? 0.019 : 0.014,
        14,
        12
      ),
      new THREE.MeshBasicMaterial({ color: color })
    );

    dot.position.copy(
      latLonToVector(quake.lat, quake.lon, 1.018)
    );

    dynamicGroup.add(dot);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        simulated ? 0.043 : 0.032,
        0.0025,
        6,
        32
      ),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.82
      })
    );

    orientToSurface(
      ring,
      latLonToVector(quake.lat, quake.lon, 1.02)
    );

    dynamicGroup.add(ring);

    pulses.push({
      type: 'quake',
      mesh: ring,
      phase: pulses.length * 0.83
    });
  }

  function addFailoverRoute(region, alternative) {
    const start = latLonToVector(region.lat, region.lon, 1.018);
    const end = latLonToVector(alternative.lat, alternative.lon, 1.018);

    const midpoint = start.clone().add(end);

    if (midpoint.lengthSq() < 0.0001) {
      midpoint.copy(start);
    }

    midpoint.normalize().multiplyScalar(1.22);

    const curve = new THREE.QuadraticBezierCurve3(
      start,
      midpoint,
      end
    );

    const route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 64, 0.0045, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0x20e6bd,
        transparent: true,
        opacity: 0.9
      })
    );

    dynamicGroup.add(route);

    // Three independently moving route pulses.
    for (let i = 0; i < 3; i++) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xeaffff })
      );

      dynamicGroup.add(pulse);

      pulses.push({
        type: 'route',
        mesh: pulse,
        curve: curve,
        progress: i / 3
      });
    }
  }

  function shortestAngle(current, target) {
    let difference = (target - current) % (Math.PI * 2);

    if (difference > Math.PI) difference -= Math.PI * 2;
    if (difference < -Math.PI) difference += Math.PI * 2;

    return difference;
  }

  let targetRotationY = root.rotation.y;
  let targetRotationX = root.rotation.x;
  let targetCameraZ = normalCameraZ;

  let dragging = false;
  let autoSpin = true;
  let activePointerId = null;

  let previousX = 0;
  let previousY = 0;

  let dragVelocityX = 0;
  let dragVelocityY = 0;

  let animationFrame = 0;
  let lastFrameTime = 0;
  let pageVisible = !document.hidden;

  function focusOnRoute(region, alternative) {
    const start = latLonToVector(region.lat, region.lon, 1);
    const end = latLonToVector(alternative.lat, alternative.lon, 1);

    const center = start.clone().add(end);

    if (center.lengthSq() < 0.0001) {
      center.copy(start);
    }

    center.normalize();

    targetRotationY = Math.atan2(-center.x, center.z);
    targetRotationX = 0.12;
    targetCameraZ = simulationCameraZ;

    autoSpin = false;
  }

  function returnToNormalView() {
    targetCameraZ = normalCameraZ;
    autoSpin = true;
  }

  function updateHud(simulated, active, alternative) {
    if (!hud) return;

    if (!active || !alternative) {
      hud.hidden = true;
      hud.textContent = '';
      return;
    }

    const firstQuake = active.nearby_quakes &&
      active.nearby_quakes.length
      ? active.nearby_quakes[0]
      : null;

    const eventText = firstQuake
      ? 'M' + firstQuake.magnitude + ' quake · ' +
        firstQuake.distance_km + ' km'
      : 'Nearby seismic event';

    hud.textContent =
      (simulated ? 'SIMULATION' : 'RADAR ROUTE') +
      ' · ' + eventText +
      ' near ' + active.label +
      ' · Route to ' + alternative.label +
      ' (' + alternative.id + ')';

    hud.hidden = false;
  }

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

    const active = data.regions.find(function (region) {
      return region.classification &&
        region.classification.startsWith('NEARBY') &&
        (!selectedRegions || selectedRegions.has(region.id)) &&
        region.nearest_alternative;
    });

    let alternative = null;

    if (active && active.nearest_alternative) {
      alternative = regionById.get(
        active.nearest_alternative.id
      ) || null;
    }

    const quakes = data.quakes &&
      Array.isArray(data.quakes.items)
      ? data.quakes.items
      : [];

    quakes.forEach(addQuakeMarker);

    data.regions.forEach(function (region) {
      const selected = !selectedRegions ||
        selectedRegions.has(region.id);

      addRegionMarker(region, selected);

      const nearby = region.classification &&
        region.classification.startsWith('NEARBY');

      if (
        !nearby ||
        !selected ||
        !region.nearest_alternative
      ) {
        return;
      }

      const destination = regionById.get(
        region.nearest_alternative.id
      );

      if (
        destination &&
        typeof region.lat === 'number' &&
        typeof region.lon === 'number' &&
        typeof destination.lat === 'number' &&
        typeof destination.lon === 'number'
      ) {
        addFailoverRoute(region, destination);
      }
    });

    if (simulated && active && alternative) {
      focusOnRoute(active, alternative);
    } else {
      returnToNormalView();
    }

    updateHud(!!simulated, active, alternative);
  }

  // Easier touch and mouse rotation.
  canvas.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    dragging = true;
    autoSpin = false;
    activePointerId = event.pointerId;

    previousX = event.clientX;
    previousY = event.clientY;

    dragVelocityX = 0;
    dragVelocityY = 0;

    canvas.style.cursor = 'grabbing';

    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }

    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;

    // More responsive horizontal movement, gentler vertical movement.
    const horizontal = dx * 0.008;
    const vertical = dy * 0.005;

    root.rotation.y += horizontal;

    root.rotation.x = Math.max(
      -1.1,
      Math.min(1.1, root.rotation.x + vertical)
    );

    targetRotationY = root.rotation.y;
    targetRotationX = root.rotation.x;

    dragVelocityX = horizontal;
    dragVelocityY = vertical;

    previousX = event.clientX;
    previousY = event.clientY;

    event.preventDefault();
  });

  function stopDragging(event) {
    if (
      event &&
      activePointerId !== null &&
      event.pointerId !== activePointerId
    ) {
      return;
    }

    dragging = false;
    activePointerId = null;
    canvas.style.cursor = 'grab';

    // A little momentum after the finger is released.
    targetRotationY = root.rotation.y + dragVelocityX * 5;

    targetRotationX = Math.max(
      -1.1,
      Math.min(1.1, root.rotation.x + dragVelocityY * 3)
    );

    autoSpin = false;
  }

  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('lostpointercapture', stopDragging);

  function animate(time) {
    if (!pageVisible) return;

    animationFrame = requestAnimationFrame(animate);

    if (!lastFrameTime) lastFrameTime = time;

    const delta = Math.min(
      (time - lastFrameTime) / 1000,
      0.05
    );

    lastFrameTime = time;

    if (!dragging) {
      const turnDifference = shortestAngle(
        root.rotation.y,
        targetRotationY
      );

      root.rotation.y += turnDifference *
        Math.min(1, delta * 4.5);

      root.rotation.x +=
        (targetRotationX - root.rotation.x) *
        Math.min(1, delta * 4.5);

      if (autoSpin) {
        root.rotation.y += delta * 0.035;
        targetRotationY = root.rotation.y;
      }

      camera.position.z +=
        (targetCameraZ - camera.position.z) *
        Math.min(1, delta * 2.4);
    }

    const seconds = time * 0.001;

    pulses.forEach(function (pulse) {
      if (pulse.type === 'route') {
        pulse.progress = (
          pulse.progress + delta * 0.17
        ) % 1;

        pulse.mesh.position.copy(
          pulse.curve.getPointAt(pulse.progress)
        );
      } else if (pulse.type === 'quake') {
        const scale = 0.86 + 0.22 *
          (0.5 + 0.5 * Math.sin(
            seconds * 2.4 + pulse.phase
          ));

        pulse.mesh.scale.setScalar(scale);
      }
    });

    renderer.render(scene, camera);
  }

  function startAnimation() {
    if (!pageVisible || animationFrame) return;

    lastFrameTime = 0;
    animationFrame = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;

    if (pageVisible) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  window.FailoverGlobe = {
    update: update,
    resize: resize
  };

  startAnimation();

  window.addEventListener('pagehide', function () {
    stopAnimation();

    window.removeEventListener('resize', resize);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    disposeDynamicObjects();

    earth.geometry.dispose();
    earthMaterial.dispose();

    atmosphere.geometry.dispose();
    atmosphere.material.dispose();

    renderer.dispose();
  });
})();
