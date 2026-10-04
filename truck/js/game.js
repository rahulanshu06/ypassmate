'use strict';
// Game glue: boot, career/economy, jobs, cameras, collisions, fines, menus and the main loop.
(() => {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const SAVE_KEY = 'autobahn-hauler-save-v1', SET_KEY = 'autobahn-hauler-settings-v1';
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  const QUALITY = {
    low: { pr: 0.85, aa: false, shadows: false, shadowSize: 1024, shadowBox: 50, drawDist: 900, trees: 0.22, traffic: 22, rainDrops: 1200, treeDetail: 0 },
    medium: { pr: 1.0, aa: true, shadows: true, shadowSize: 1024, shadowBox: 55, drawDist: 1400, trees: 0.6, traffic: 34, rainDrops: 1800 },
    high: { pr: 1.5, aa: true, shadows: true, shadowSize: 2048, shadowBox: 70, drawDist: 1900, trees: 0.9, traffic: 48, rainDrops: 2500 },
    ultra: { pr: 2, aa: true, shadows: true, shadowSize: 4096, shadowBox: 85, drawDist: 2600, trees: 1.15, traffic: 62, rainDrops: 3200, treeShadows: true },
  };
  const defaults = {
    quality: isTouch ? 'low' : 'high', gearbox: 'auto', steering: isTouch ? 'touch' : 'keys', weather: 'dynamic', timeScale: 15,
    volume: 0.8, mirrors: !isTouch, mirrorInsets: true, fov: 68, fps: false, traffic: 1, limiter: 90,
  };
  const settings = Object.assign({}, defaults, store.get(SET_KEY, {}));
  const Q = Object.assign({}, QUALITY[settings.quality] || QUALITY.high);
  Q.traffic = Math.round(Q.traffic * settings.traffic);
  G.clock = 0;

  // ------------------------------------------------------------------ renderer + scene
  const canvas = $('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  } catch (err) {
    $('load-msg').textContent = 'WebGL is not available in this browser. Turn on hardware acceleration and reload.';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !!Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.06, Q.drawDist + 500);
  G.dbg = { renderer, scene, camera, Q };
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    layoutInsets();
  });

  // ------------------------------------------------------------------ career state
  const game = G.game = {
    state: 'loading', paused: true, money: 6000, xp: 0, job: null, market: [], marketAt: -1, route: null, waypoint: null,
    view: 'cabin', stats: { deliveries: 0, km: 0, earned: 0, fines: 0, best: 0 },
    cfg: { paint: '#e8ecef', engine: 'e420', gearbox: 'g12', tank: 't400', tyres: 'std', lightbar: false, beacons: false, airhorn: false },
    owned: { engine: ['e420'], gearbox: ['g12'], tank: ['t400'], tyres: ['std'], paint: ['white'], extras: [] },
    camHit: new Map(), nightWarn: 0, wrongWay: 0, lastSave: 0, startCity: 'n', panel: null,
  };
  const levelXp = (n) => 200 * n * (n - 1); // xp needed to reach level n
  game.level = () => { let n = 1; while (game.xp >= levelXp(n + 1)) n++; return n; };
  let world, env, truck, traffic;

  function setLoading(p, msg) {
    $('load-bar').style.width = Math.round(p * 100) + '%';
    if (msg) $('load-msg').textContent = msg;
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    setLoading(0.02, 'Surveying the map');
    // give the web fonts a moment so road signs and liveries use them
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* no font API */ }
    world = G.world = await G.World.build(scene, Q, setLoading);
    env = G.env = G.Env.create(scene, renderer, Q);
    env.timeScale = settings.timeScale;
    if (settings.weather !== 'dynamic') { env.lockWeather = settings.weather; env.setWeather(settings.weather, true); }
    truck = G.truck = G.Vehicle.createTruck(scene, game.cfg);
    traffic = G.traffic = G.Traffic.create(scene, world, Q.traffic);
    buildDecorTrailers();
    setupMirrors();
    buildMarkers();
    G.Input.attachCanvas(canvas);
    G.Input.attachTouch($('touch'));
    G.Input.mode = settings.steering === 'mouse' ? 'mouse' : 'keys';
    if (settings.steering === 'tilt') G.Input.tilt.enabled = false;
    loadCareer();
    applySettingsLive();
    refreshTitle();
    game.state = 'title';
    $('loading').hidden = true;
    $('title').hidden = false;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ decor trailers parked in yards (instanced, cheap)
  function buildDecorTrailers() {
    const geoParts = [];
    const b = (w, h, d, c, x, y, z) => geoParts.push(U.part(new THREE.BoxGeometry(w, h, d), c, x, y, z));
    b(2.55, 2.75, 13.6, 0xffffff, 0, 2.62, -5.55);
    b(0.9, 0.3, 12.8, 0x26282b, 0, 1.0, -5.55);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 12); wg.rotateZ(Math.PI / 2);
    for (const z of [-7.9, -9.21, -10.52]) for (const sx of [-0.98, 0.98]) geoParts.push(U.part(wg, 0x111111, sx, 0.5, z));
    for (const sx of [-0.9, 0.9]) b(0.12, 1.2, 0.12, 0x26282b, sx, 0.65, -0.7);
    const geo = U.merge(geoParts);
    const list = [];
    for (const d of world.depots) if (d.kind === 'depot') for (const bi of d.decorBays) { list.push(world.bayPose(d, bi)); d.bays[bi].used = true; }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), Math.max(1, list.length));
    const dm = new THREE.Object3D(), col = new THREE.Color();
    const cols = [0xf1f1ee, 0xe9ecee, 0x2a6db0, 0xb23a2a, 0x2f8a4a, 0xc9a13a, 0xdadad4, 0x5b6b7a];
    list.forEach((p, i) => {
      dm.position.set(p.x, p.y, p.z); dm.rotation.set(0, p.h, 0); dm.updateMatrix();
      im.setMatrixAt(i, dm.matrix);
      im.setColorAt(i, col.setHex(cols[i % cols.length]));
      const c = 1.25 - 6.8;
      world.addObstacle({ ...U.obb(p.x + Math.sin(p.h) * c, p.z + Math.cos(p.h) * c, p.h, 1.28, 6.8), tag: 'trailer' });
    });
    im.count = list.length;
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  }

  // ------------------------------------------------------------------ mirrors (render targets) + on-screen insets
  const mirrors = [];
  const overlay = new THREE.Scene(), ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  function setupMirrors() {
    truck.model.P.mirrors.forEach((m, i) => {
      const rt = new THREE.WebGLRenderTarget(240, 480);
      rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      const tex = rt.texture;
      tex.repeat.x = -1; tex.offset.x = 1;
      const cam = new THREE.PerspectiveCamera(19, 0.5, 0.5, Q.drawDist + 500);
      cam.position.set(0, 0, -0.08);
      cam.rotation.y = -m.side * 0.17;
      m.group.add(cam);
      m.glass.material = new THREE.MeshBasicMaterial({ map: tex });
      const inset = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, depthTest: false }));
      overlay.add(inset);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0d10, depthTest: false }));
      frame.renderOrder = -1;
      overlay.add(frame);
      mirrors.push({ m, rt, cam, inset, frame, side: m.side, i });
    });
    layoutInsets();
  }
  function layoutInsets() {
    const w = innerWidth, h = innerHeight;
    ortho.left = 0; ortho.right = w; ortho.top = h; ortho.bottom = 0; ortho.updateProjectionMatrix();
    const mh = Math.min(h * 0.34, 260), mw = mh * 0.5;
    for (const M of mirrors) {
      M.inset.visible = M.frame.visible = M.side < 0;
      const x = M.side > 0 ? 14 + mw / 2 : w - 14 - mw / 2, y = h * 0.52;
      M.inset.position.set(x, y, 0); M.inset.scale.set(mw, mh, 1);
      M.frame.position.set(x, y, 0); M.frame.scale.set(mw + 8, mh + 8, 1);
    }
  }

  // ------------------------------------------------------------------ markers: pickup beam, delivery bay outline
  let beam, bayMark;
  function buildMarkers() {
    const c = U.canvas(32, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.8)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 256);
    const bm = new THREE.MeshBasicMaterial({ map: U.tex(c, { clamp: true }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x3ddc6a, side: THREE.DoubleSide, fog: false });
    beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), bm);
    beam.visible = false;
    scene.add(beam);
    const bc = U.canvas(64, 256), bx = bc.getContext('2d');
    bx.fillStyle = 'rgba(255,157,46,0.22)'; bx.fillRect(0, 0, 64, 256);
    bx.strokeStyle = 'rgba(255,170,60,1)'; bx.lineWidth = 6; bx.strokeRect(3, 3, 58, 250);
    bayMark = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 17), new THREE.MeshBasicMaterial({ map: U.tex(bc, { clamp: true }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    bayMark.rotation.x = -Math.PI / 2;
    bayMark.visible = false;
    scene.add(bayMark);
  }

  // ------------------------------------------------------------------ career save / load
  function careerData() {
    const T = truck;
    const j = game.job;
    return {
      v: 1, money: game.money, xp: game.xp, cfg: game.cfg, owned: game.owned, stats: game.stats,
      pos: { x: T.x, z: T.z, h: T.h }, fuel: T.fuel, damage: T.damage, odo: T.odo, time: env.time, day: env.day, driveMins: game.driveMins || 0,
      job: j ? { cargoKey: j.cargoKey, tons: j.tons, from: j.from.id, to: j.to.id, pay: j.pay, xp: j.xp, deadline: j.deadline, picked: j.picked, bayFrom: j.bayFrom, bayTo: j.bayTo, dist: j.dist, urgent: j.urgent, cargoDamage: j.trailer ? j.trailer.damage : 0, startAbs: j.startAbs } : null,
      attached: !!(j && T.trailer && T.trailer === j.trailer),
      trailerPos: j && j.trailer && T.trailer !== j.trailer ? { x: j.trailer.kx, z: j.trailer.kz, h: j.trailer.h } : null,
    };
  }
  function saveCareer() {
    if (game.state !== 'drive') return;
    store.set(SAVE_KEY, careerData());
    game.lastSave = G.clock;
  }
  let saved = null;
  function loadCareer() {
    saved = store.get(SAVE_KEY, null);
    if (saved && saved.v === 1) {
      game.money = saved.money; game.xp = saved.xp;
      Object.assign(game.cfg, saved.cfg || {}); Object.assign(game.owned, saved.owned || {}); Object.assign(game.stats, saved.stats || {});
    }
    truck.applyConfig(game.cfg);
    truck.limiter = settings.limiter;
  }
  function placeTruckAtDepot(depot) {
    const y = depot.yard;
    const p = world.yardToWorld(y, 5, -12);
    truck.x = p.x; truck.z = p.z; truck.h = U.wrapAngle(y.h + Math.PI);
    truck.v = 0; truck.steer = 0; truck.gear = 0;
  }
  function startCareer(fresh) {
    const T = truck;
    if (!fresh && saved && saved.v === 1) {
      T.x = saved.pos.x; T.z = saved.pos.z; T.h = saved.pos.h;
      T.fuel = saved.fuel; T.damage = saved.damage || 0; T.odo = saved.odo || 0;
      env.setTime(saved.time || 480); env.day = saved.day || 1; game.driveMins = saved.driveMins || 0;
      if (saved.job) restoreJob(saved);
    } else {
      store.del(SAVE_KEY);
      game.money = 6000; game.xp = 0; game.stats = { deliveries: 0, km: 0, earned: 0, fines: 0, best: 0 };
      game.cfg = { paint: game.cfg.paint, engine: 'e420', gearbox: 'g12', tank: 't400', tyres: 'std', lightbar: false, beacons: false, airhorn: false };
      game.owned = { engine: ['e420'], gearbox: ['g12'], tank: ['t400'], tyres: ['std'], paint: [paintIdFor(game.cfg.paint)], extras: [] };
      T.applyConfig(game.cfg);
      const city = world.cityById[game.startCity] || world.cities[0];
      placeTruckAtDepot(city.depots[0]);
      T.fuel = T.tank * 0.7; T.damage = 0; T.odo = 0;
      env.setTime(8 * 60); env.day = 1;
      game.job = null;
    }
    T.engineOn = false; T.park = true; T.air = 4.6; T.lights = 0;
    T.autoMode = settings.gearbox === 'auto';
    traffic.reset(T.x, T.z);
    G.Audio.init();
    G.Audio.setVolume(settings.volume);
    game.state = 'drive';
    game.paused = false;
    game.view = 'cabin';
    $('title').hidden = true;
    $('hud').hidden = false;
    $('touch').hidden = !(isTouch || settings.steering === 'touch' || settings.steering === 'tilt');
    if (settings.steering === 'tilt') G.Input.enableTilt().then((ok) => { if (!ok) G.HUD.toast('Tilt steering is not available here. Using the on-screen wheel.', 'warn'); });
    generateMarket(true);
    T.pose(0.016, world);
    updateRoute(true);
    if (!saved || fresh) {
      setTimeout(() => G.HUD.toast('<b>E</b> start engine · <b>Space</b> release parking brake · <b>W</b> drive', 'info', 7000), 600);
      setTimeout(() => G.HUD.toast('Open the freight market with <b>J</b> and take your first job', 'info', 7000), 2500);
    } else G.HUD.toast('Welcome back. Career loaded.', 'good');
    saveCareer();
  }
  const paintIdFor = (hex) => (G.D.paints.find((p) => p.color === hex) || G.D.paints[0]).id;

  // ------------------------------------------------------------------ jobs
  function depotDistance(a, b) {
    return world.routeBetween(a.node, b.node);
  }
  function generateMarket(force) {
    const now = env.day * 1440 + env.time;
    if (!force && now - game.marketAt < 240 && game.market.length) return;
    game.marketAt = now;
    const offers = [];
    const r = Math.random;
    const depots = world.depots.filter((d) => d.kind === 'depot');
    for (const d of depots) {
      const n = 2 + (r() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const cargoKey = d.company.cargo[Math.floor(r() * d.company.cargo.length)];
        const cargo = G.D.cargo[cargoKey];
        const others = depots.filter((o) => o.city !== d.city);
        const to = others[Math.floor(r() * others.length)];
        const dist = depotDistance(d, to);
        if (!isFinite(dist)) continue;
        const tons = Math.round(U.lerp(cargo.t[0], cargo.t[1], r()));
        const urgent = r() < 0.18;
        const km = dist / 1000;
        const pay = Math.round((420 + km * 250 * cargo.rate * (1 + tons / 60) * (urgent ? 1.3 : 1)) / 10) * 10;
        const xp = Math.round(40 + km * 32 + (cargo.adr ? 70 : 0) + (cargo.fragile ? 50 : 0) + (urgent ? 50 : 0) + (cargo.heavy ? 40 : 0));
        const req = cargo.heavy ? 4 : cargo.adr ? 3 : cargo.fragile ? 2 : 1;
        offers.push({ id: Math.random().toString(36).slice(2), cargoKey, cargo, tons, from: d, to, dist, pay, xp, urgent, req });
      }
    }
    game.market = offers;
  }
  function trailerSpec(job) {
    const c = job.cargo;
    return { kind: c.trailer, company: job.from.company, cargoKey: job.cargoKey, adr: c.adr, cargoKg: job.tons * 1000 };
  }
  function freeBay(depot, avoid = -1) {
    const order = [3, 4, 2, 5, 1, 6, 0, 7];
    for (const b of order) if (!depot.bays[b].used && b !== avoid) return b;
    return 3;
  }
  function acceptJob(offer) {
    if (game.job) { G.HUD.toast('Finish or cancel your current job first.', 'warn'); return; }
    if (truck.trailer) { G.HUD.toast('Detach your current trailer first (T).', 'warn'); return; }
    if (game.level() < offer.req) { G.HUD.toast(`Needs level ${offer.req}.`, 'warn'); return; }
    const T = truck;
    const nowAbs = env.day * 1440 + env.time;
    const toPickup = Math.hypot(offer.from.yard.cx - T.x, offer.from.yard.cz - T.z) * 1.3;
    const mins = ((offer.dist + toPickup) / 16) * (env.timeScale / 60);
    const job = {
      ...offer, picked: false, startAbs: nowAbs,
      deadline: nowAbs + mins * (offer.urgent ? 1.35 : 1.8) + 45,
    };
    job.bayFrom = freeBay(offer.from);
    job.bayTo = freeBay(offer.to);
    job.trailer = G.Vehicle.createTrailer(scene, trailerSpec(job));
    const pose = world.bayPose(offer.from, job.bayFrom);
    job.trailer.place(pose.x, pose.z, pose.h, world);
    offer.from.bays[job.bayFrom].used = true;
    game.job = job;
    game.market = game.market.filter((o) => o !== offer);
    G.Audio.fx.chime();
    G.HUD.toast(`Job accepted: <b>${job.cargo.name}</b> ${job.tons} t · ${job.from.company.name}, ${job.from.city.name} → ${job.to.city.name}`, 'good', 6000);
    closePanel();
    updateRoute(true);
    saveCareer();
  }
  function restoreJob(s) {
    const sj = s.job;
    const from = world.depots[sj.from], to = world.depots[sj.to];
    if (!from || !to) return;
    const job = { cargoKey: sj.cargoKey, cargo: G.D.cargo[sj.cargoKey], tons: sj.tons, from, to, pay: sj.pay, xp: sj.xp, deadline: sj.deadline, picked: sj.picked, bayFrom: sj.bayFrom, bayTo: sj.bayTo, dist: sj.dist, urgent: sj.urgent, startAbs: sj.startAbs };
    job.trailer = G.Vehicle.createTrailer(scene, trailerSpec(job));
    job.trailer.damage = sj.cargoDamage || 0;
    from.bays[job.bayFrom].used = true;
    if (s.attached) {
      const kp = truck.kingpin();
      job.trailer.place(kp.x, kp.z, truck.h, world);
      truck.trailer = job.trailer;
    } else if (s.trailerPos) job.trailer.place(s.trailerPos.x, s.trailerPos.z, s.trailerPos.h, world);
    else { const p = world.bayPose(from, job.bayFrom); job.trailer.place(p.x, p.z, p.h, world); }
    game.job = job;
  }
  function cancelJob() {
    const j = game.job;
    if (!j) return;
    const fee = Math.round(Math.max(400, j.pay * 0.2) / 10) * 10;
    game.money -= fee;
    if (truck.trailer === j.trailer) truck.trailer = null;
    j.trailer.dispose();
    j.from.bays[j.bayFrom].used = false;
    game.job = null;
    G.HUD.toast(`Job cancelled. Cancellation fee ${U.fmtMoney(fee)}.`, 'bad');
    updateRoute(true);
    saveCareer();
  }
  function inBay(job) {
    const tr = job.trailer, y = job.to.yard;
    const bay = job.to.bays[job.bayTo];
    // all four trailer corners inside the bay rectangle (+0.6 m), aligned within 10 degrees
    const cr = U.obbCorners(tr.obb, []);
    for (let k = 0; k < 8; k += 2) {
      const l = world.worldToYard(y, cr[k], cr[k + 1]);
      if (Math.abs(l.lx - bay.lx) > 2.3 + 0.6 || l.lz < 7 - 0.6 || l.lz > 24 + 0.8) return false;
    }
    return true;
  }
  function deliver() {
    const j = game.job, T = truck;
    const nowAbs = env.day * 1440 + env.time;
    const late = nowAbs > j.deadline;
    const precise = inBay(j);
    const cargoDmg = Math.min(1, j.trailer.damage * (j.cargo.fragile ? 2 : 1));
    const base = j.pay;
    const latePen = late ? Math.round(base * 0.3) : 0;
    const dmgPen = Math.round(base * cargoDmg);
    const parkBonus = precise ? Math.round(base * 0.08 / 10) * 10 + 100 : 0;
    const total = Math.max(0, base - latePen - dmgPen + parkBonus);
    const xp = Math.round(j.xp * (late ? 0.5 : 1) + (precise ? 60 : 0) + (cargoDmg < 0.01 ? 40 : 0));
    const lvlBefore = game.level();
    game.money += total; game.xp += xp;
    game.stats.deliveries++; game.stats.earned += total; game.stats.best = Math.max(game.stats.best, total);
    T.trailer = null;
    j.trailer.dispose();
    j.from.bays[j.bayFrom].used = false;
    game.job = null;
    G.Audio.fx.cash();
    const rows = [
      ['Cargo', `${j.cargo.name} · ${j.tons} t`],
      ['Route', `${j.from.city.name} → ${j.to.city.name} · ${(j.dist / 1000).toFixed(1)} km`],
      ['Agreed pay', U.fmtMoney(base)],
      late ? ['Late delivery', '−' + U.fmtMoney(latePen)] : ['On time', 'yes'],
      ['Cargo damage ' + Math.round(cargoDmg * 100) + '%', dmgPen ? '−' + U.fmtMoney(dmgPen) : '€0'],
      ['Parking', precise ? 'In the bay, +' + U.fmtMoney(parkBonus) : 'Anywhere in the yard'],
    ];
    $('res-rows').innerHTML = rows.map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('');
    $('res-total').textContent = U.fmtMoney(total);
    $('res-xp').textContent = '+' + xp + ' XP' + (game.level() > lvlBefore ? ` · Level ${game.level()} reached` : '');
    openPanel('p-result');
    generateMarket(true);
    updateRoute(true);
    saveCareer();
  }

  // ------------------------------------------------------------------ routing for the GPS
  const RQ = {};
  function routeTarget() {
    const j = game.job;
    if (j) return j.picked ? { node: j.to.node, depot: j.to } : { node: j.from.node, depot: j.from };
    if (game.waypoint) return { node: game.waypoint.depot.node, depot: game.waypoint.depot };
    return null;
  }
  function updateRoute(force) {
    const tgt = routeTarget();
    if (!tgt) { game.route = null; return; }
    const T = truck;
    const sources = [];
    let startEdge = null, startS = 0, startDir = 1;
    const dep = world.depotAt(T.x, T.z);
    const surf = world.surface(T.x, T.z);
    if (dep) sources.push({ node: dep.depot.node, d: 0 });
    else if (surf.node) sources.push({ node: surf.node, d: 0 });
    else {
      const q = world.query(T.x, T.z);
      if (q && q.d < q.e.W + 40) {
        startEdge = q.e; startS = q.s;
        const fwd = Math.sin(T.h) * q.tx + Math.cos(T.h) * q.tz;
        startDir = fwd >= 0 ? 1 : -1;
        const toB = startEdge.len - startS, toA = startS;
        const ahead = startDir > 0 ? startEdge.b : startEdge.a, behind = startDir > 0 ? startEdge.a : startEdge.b;
        sources.push({ node: ahead, d: startDir > 0 ? toB : toA });
        sources.push({ node: behind, d: (startDir > 0 ? toA : toB) + 600 });
      } else {
        // off-road: head for the nearest city roundabout
        const nc = world.nearestCity(T.x, T.z);
        sources.push({ node: nc.city.node, d: nc.d });
      }
    }
    const r = world.routeMulti(sources, tgt.node);
    if (!r) { game.route = null; return; }
    // polyline for the GPS
    const path = new Path2D();
    path.moveTo(T.x, T.z);
    if (startEdge) {
      const s0 = startS, s1 = r.first === (startDir > 0 ? startEdge.b : startEdge.a) ? (startDir > 0 ? startEdge.len : 0) : (startDir > 0 ? 0 : startEdge.len);
      const st = s1 > s0 ? 8 : -8;
      for (let s = s0; st > 0 ? s < s1 : s > s1; s += st) { const p = world.edgePoint(startEdge, s, 0, RQ); path.lineTo(p.x, p.z); }
    }
    for (const step of r.steps) {
      const e = step.e;
      if (step.dir > 0) for (let i = 0; i < e.n; i += 4) path.lineTo(e.px[i], e.pz[i]);
      else for (let i = e.n - 1; i >= 0; i -= 4) path.lineTo(e.px[i], e.pz[i]);
    }
    path.lineTo(tgt.depot.yard.cx, tgt.depot.yard.cz);
    let remaining = r.length;
    game.route = { path, steps: r.steps, first: r.first, length: remaining, target: tgt, startEdge, startS, startDir, at: G.clock };
  }
  // next manoeuvre text
  function exitNumber(nodeObj, inEdge, outEdge) {
    const inL = nodeObj.links.find((l) => l.e === inEdge);
    const outL = nodeObj.links.find((l) => l.e === outEdge);
    if (!inL || !outL) return 0;
    const sorted = nodeObj.links.map((l) => ({ l, d: ((inL.ang - l.ang) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2) })).filter((o) => o.l !== inL).sort((a, b) => a.d - b.d);
    return sorted.findIndex((o) => o.l === outL) + 1;
  }
  function instruction() {
    const r = game.route;
    if (!r) return null;
    const T = truck;
    const tgt = r.target;
    const yd = tgt.depot.yard;
    const toDest = Math.hypot(yd.cx - T.x, yd.cz - T.z);
    if (world.depotAt(T.x, T.z) && world.depotAt(T.x, T.z).depot === tgt.depot) return { icon: 'flag', text: 'You have arrived', sub: tgt.depot.kind === 'fuel' ? 'Fuel & service' : tgt.depot.company.name, dist: 0 };
    // distance to the next roundabout
    let nextNode = r.first, inEdge = r.startEdge, outEdge = r.steps.length ? r.steps[0].e : null, dist;
    if (r.startEdge) {
      const q = world.query(T.x, T.z);
      const s = q && q.e === r.startEdge ? q.s : r.startS;
      dist = nextNode === r.startEdge.b ? r.startEdge.len - s : s;
    } else {
      dist = Math.hypot(nextNode.x - T.x, nextNode.z - T.z);
      inEdge = null;
      // when leaving a yard we are on its spur
      const dep = world.depotAt(T.x, T.z);
      if (dep && r.steps.length) { inEdge = r.steps[0].e; nextNode = r.steps[0].to; outEdge = r.steps[1] ? r.steps[1].e : null; dist = r.steps[0].e.len; }
      const sn = world.surface(T.x, T.z).node;
      if (sn && r.steps.length) { nextNode = sn; inEdge = null; outEdge = r.steps[0].e; dist = 0; }
    }
    if (!outEdge || nextNode === tgt.node) return { icon: 'flag', text: tgt.depot.kind === 'fuel' ? 'Fuel & service' : tgt.depot.company.name, sub: tgt.depot.city.name, dist: Math.max(dist, toDest) };
    const toward = (() => {
      const st = r.steps.find((x) => x.e === outEdge);
      const o = st ? st.to : null;
      return o ? (o.type === 'city' ? o.city.name : o.depot ? (o.depot.kind === 'fuel' ? 'Fuel & service' : o.depot.company.name) : '') : '';
    })();
    const ref = outEdge.ref ? outEdge.ref + ' · ' : '';
    if (nextNode.type === 'city') {
      const n = inEdge ? exitNumber(nextNode, inEdge, outEdge) : 0;
      const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] || n + 'th';
      return { icon: 'round', n, text: n ? `Roundabout: ${ord} exit` : 'Leave the roundabout', sub: ref + toward, dist };
    }
    return { icon: 'straight', text: 'Continue', sub: ref + toward, dist };
  }

  // ------------------------------------------------------------------ cameras
  const camS = { yaw: 0, pitch: 0, chaseYaw: 0, zoom: 1, cine: null, cineT: 0 };
  const qTmp = new THREE.Quaternion(), eTmp = new THREE.Euler(), vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();
  function setView(v) {
    game.view = v;
    camS.yaw = 0; camS.pitch = v === 'top' ? 0 : 0;
    camS.cine = null;
    const names = { cabin: 'Cabin', chase: 'Chase', top: 'Top-down', cinema: 'Roadside' };
    G.HUD.toast('Camera: ' + names[v], 'info', 1200);
  }
  function updateCamera(dt) {
    const T = truck, I = G.Input;
    camS.yaw -= I.lookDX * 0.004; camS.pitch -= I.lookDY * 0.004;
    I.lookDX = 0; I.lookDY = 0;
    if (I.zoom) { camS.zoom = U.clamp(camS.zoom * (1 + I.zoom * 0.1), 0.45, 2.6); I.zoom = 0; }
    if (game.view === 'cabin') {
      camS.yaw = U.clamp(camS.yaw, -2.5, 2.5); camS.pitch = U.clamp(camS.pitch, -0.9, 0.7);
      // ease back to centre when not dragging and driving
      if (Math.abs(T.v) > 3 && !I.lookDX) camS.yaw = U.damp(camS.yaw, T.steer * 0.35, 0.6, dt);
      T.model.P.eye.getWorldPosition(camera.position);
      T.model.cab.getWorldQuaternion(qTmp);
      eTmp.set(camS.pitch - 0.1, Math.PI + camS.yaw, 0, 'YXZ');
      camera.quaternion.copy(qTmp).multiply(new THREE.Quaternion().setFromEuler(eTmp));
      camera.fov = settings.fov; camera.near = 0.05;
    } else if (game.view === 'chase' || game.view === 'top') {
      camS.chaseYaw += U.wrapAngle(T.h - camS.chaseYaw) * Math.min(1, dt * 2.2);
      const top = game.view === 'top';
      const len = T.trailer ? 20 : 11;
      const d = (top ? 42 : len) * camS.zoom;
      const pitch = U.clamp((top ? 1.15 : 0.2) + camS.pitch, 0.02, 1.45);
      const yaw = camS.chaseYaw + Math.PI + camS.yaw;
      const s = Math.sin(T.h), c = Math.cos(T.h);
      const fx = T.trailer ? -4 : 2;
      const tx = T.x + s * fx, tz = T.z + c * fx, ty = T.y + (top ? 0 : 2.6);
      camera.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * d, ty + Math.sin(pitch) * d, tz + Math.cos(yaw) * Math.cos(pitch) * d);
      const gh = world.surface(camera.position.x, camera.position.z).h;
      if (camera.position.y < gh + 1.2) camera.position.y = gh + 1.2;
      camera.lookAt(tx, ty + (top ? 0 : 0.6), tz);
      camera.fov = 55; camera.near = 0.3;
    } else {
      // roadside cinematic camera
      camS.cineT -= dt;
      const dist = camS.cine ? Math.hypot(camS.cine.x - T.x, camS.cine.z - T.z) : 1e9;
      if (!camS.cine || dist > 140 || camS.cineT < -20) {
        const s = Math.sin(T.h), c = Math.cos(T.h);
        const side = Math.random() < 0.5 ? 1 : -1;
        const ahead = 60 + Math.random() * 40;
        const x = T.x + s * ahead + c * side * (12 + Math.random() * 10), z = T.z + c * ahead - s * side * (12 + Math.random() * 10);
        camS.cine = { x, z, y: world.surface(x, z).h + 2 + Math.random() * 6 };
        camS.cineT = 0;
      }
      camera.position.set(camS.cine.x, camS.cine.y, camS.cine.z);
      camera.lookAt(T.x, T.y + 2, T.z);
      camera.fov = U.clamp(1600 / Math.max(20, dist), 18, 60); camera.near = 0.5;
    }
    camera.far = Q.drawDist + 500;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ collisions
  const near = [], nearCars = [], CORN = [], cabObb = U.obb(0, 0, 0, 1, 1);
  function collides() {
    const T = truck;
    const bodies = [T.obb];
    if (T.trailer) bodies.push(T.trailer.obb);
    for (const b of bodies) {
      world.obstaclesNear(b.cx, b.cz, near);
      for (const o of near) {
        if (o.circle ? U.obbCircle(b, o.cx, o.cz, o.r) : U.obbOverlap(b, o)) return { kind: 'static', o, body: b };
      }
      // median barrier
      U.obbCorners(b, CORN);
      for (let k = 0; k < 8; k += 2) {
        const nx = k + 2 < 8 ? k + 2 : 0;
        for (const t of [0, 0.5]) {
          const x = U.lerp(CORN[k], CORN[nx], t), z = U.lerp(CORN[k + 1], CORN[nx + 1], t);
          const q = world.query(x, z);
          if (q && q.e.cfg.median > 0 && q.s > q.e.barrierFrom && q.s < q.e.barrierTo && Math.abs(q.lat) < 0.32) return { kind: 'barrier', body: b };
        }
      }
      if (Math.abs(b.cx) > world.HALF || Math.abs(b.cz) > world.HALF) return { kind: 'edge', body: b };
      traffic.nearPlayer(b.cx, b.cz, 26, nearCars);
      for (const c of nearCars) if (U.obbOverlap(b, c.obb)) return { kind: 'car', car: c.car, body: b };
    }
    // a job trailer parked on its own: only the cab can hit it, the chassis slides underneath
    const j = game.job;
    if (j && T.trailer !== j.trailer) {
      const c = 4.15;
      U.setObb(cabObb, T.x + Math.sin(T.h) * c, T.z + Math.cos(T.h) * c, T.h, 1.27, 1.25);
      if (U.obbOverlap(cabObb, j.trailer.obb)) return { kind: 'static', body: T.obb };
    }
    return null;
  }
  let lastCrash = 0;
  function onCollision(hit, speed) {
    const T = truck;
    if (speed < 0.6) return;
    const now = G.clock;
    const dmg = Math.min(0.25, speed * speed * 0.0016 + speed * 0.004);
    T.damage = Math.min(1, T.damage + dmg);
    if (T.trailer && hit.body === T.trailer.obb) T.trailer.damage = Math.min(1, T.trailer.damage + dmg * 1.4);
    else if (T.trailer) T.trailer.damage = Math.min(1, T.trailer.damage + dmg * 0.4);
    if (now - lastCrash > 0.6) {
      G.Audio.fx.crash(U.clamp(speed / 10, 0.2, 1));
      shake = Math.min(1, speed / 12);
      if (hit.kind === 'car') {
        traffic.hitCar(hit.car);
        const fine = Math.round((250 + speed * 60) / 10) * 10;
        fineMe(fine, 'Collision with a vehicle');
      } else if (speed > 3) G.HUD.toast(`Crash! Truck damage ${Math.round(T.damage * 100)}%`, 'bad');
    }
    lastCrash = now;
  }
  let shake = 0;
  function fineMe(amount, why) {
    game.money -= amount;
    game.stats.fines += amount;
    G.HUD.toast(`<b>Fine ${U.fmtMoney(amount)}</b> · ${why}`, 'bad', 5000);
  }

  // ------------------------------------------------------------------ physics stepping
  let acc = 0;
  const STEP = 1 / 120;
  const inp = { fwd: 0, back: 0, steer: 0, steerAnalog: false, throttle: 0, brake: 0, handbrake: false };
  function physics(dt) {
    const T = truck, I = G.Input;
    inp.fwd = I.fwd; inp.back = I.back; inp.steer = I.steer; inp.steerAnalog = I.steerAnalog;
    T.horn = I.horn;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) {
      acc -= STEP; n++;
      const s = { x: T.x, z: T.z, h: T.h, v: T.v, odo: T.odo };
      const tr = T.trailer ? { x: T.trailer.x, z: T.trailer.z, h: T.trailer.h, kx: T.trailer.kx, kz: T.trailer.kz } : null;
      T.step(STEP, inp, world);
      T.updateObb();
      const hit = collides();
      if (hit) {
        const sp = Math.abs(s.v);
        Object.assign(T, s);
        T.v = -Math.sign(s.v) * Math.min(0.6, sp * 0.15);
        if (tr) Object.assign(T.trailer, tr);
        T.updateObb();
        onCollision(hit, sp);
      }
    }
    if (n === 10) acc = 0;
  }

  // ------------------------------------------------------------------ actions
  function cycleView() {
    const order = ['cabin', 'chase', 'top', 'cinema'];
    setView(order[(order.indexOf(game.view) + 1) % order.length]);
  }
  function handleAction(a) {
    const T = truck;
    if (a === 'pause') {
      if (game.state !== 'drive') return;
      if (game.panel) closePanel(); else openPanel('p-pause');
      return;
    }
    if (game.state !== 'drive') return;
    if (a === 'map') { if (game.panel === 'p-map') closePanel(); else openMap(); return; }
    if (a === 'jobs') { if (game.panel === 'p-jobs') closePanel(); else openJobs(); return; }
    if (a === 'help') { if (game.panel === 'p-help') closePanel(); else openPanel('p-help'); return; }
    if (game.panel) return;
    switch (a) {
      case 'engine': {
        const r = T.startEngine();
        if (r === 'start') G.Audio.fx.starter();
        if (r === 'nofuel') G.HUD.toast('Out of fuel. Call roadside assistance (Backspace).', 'bad');
        if (r === 'off') G.HUD.toast('Engine off', 'info', 1200);
        break;
      }
      case 'park':
        if (!T.park) { T.park = true; G.Audio.fx.airBrake(); }
        else if (T.air < 5.2) G.HUD.toast('Air pressure too low to release the spring brakes. Start the engine and wait.', 'warn');
        else { T.park = false; G.Audio.fx.airSmall(); }
        break;
      case 'lights': T.lights = T.lights ? 0 : 1; G.Audio.fx.click(); break;
      case 'high': T.high = !T.high; G.Audio.fx.click(); break;
      case 'wipers': T.wipers = (T.wipers + 1) % 3; G.Audio.fx.click(); G.HUD.toast(['Wipers off', 'Wipers slow', 'Wipers fast'][T.wipers], 'info', 1000); break;
      case 'retarder': {
        T.retarder = (T.retarder + 1) % 4;
        G.HUD.toast((T.gearbox.retarder ? 'Retarder ' : 'Engine brake ') + (T.retarder ? 'level ' + T.retarder : 'off'), 'info', 1000);
        break;
      }
      case 'cruise':
        if (T.cruise > 0) { T.cruise = 0; G.HUD.toast('Cruise control off', 'info', 1000); }
        else if (T.v * 3.6 > 30 && T.gear > 0) { T.cruise = Math.round(T.v * 3.6) / 3.6; G.HUD.toast('Cruise control ' + Math.round(T.cruise * 3.6) + ' km/h', 'info', 1200); }
        else G.HUD.toast('Cruise control works above 30 km/h', 'warn', 1500);
        break;
      case 'cruiseUp': if (T.cruise > 0) T.cruise = Math.min(T.limiter, Math.round(T.cruise * 3.6) + 5) / 3.6; break;
      case 'cruiseDown': if (T.cruise > 0) T.cruise = Math.max(30, Math.round(T.cruise * 3.6) - 5) / 3.6; break;
      case 'indL': T.indL = !T.indL; T.indR = false; G.Audio.fx.click(); break;
      case 'indR': T.indR = !T.indR; T.indL = false; G.Audio.fx.click(); break;
      case 'hazard': T.hazard = !T.hazard; G.Audio.fx.click(); break;
      case 'beacons': if (T.cfg.beacons) { T.beaconsOn = !T.beaconsOn; G.Audio.fx.click(); } break;
      case 'gearUp': case 'gearDown': {
        const up = a === 'gearUp';
        if (T.autoMode) {
          // in automatic mode R/F step the selector D <-> N <-> R
          if (Math.abs(T.v) > 0.5 && ((up && T.gear < 0) || (!up && T.gear > 0))) { G.HUD.toast('Stop before changing direction', 'warn', 1200); break; }
          T.gear = up ? (T.gear < 0 ? 0 : T.gear === 0 ? T.launchGear() : T.gear) : (T.gear > 0 ? 0 : T.gear === 0 ? -1 : T.gear);
          break;
        }
        const nG = T.gearbox.ratios.length, nR = T.gearbox.rev.length;
        let g = T.shift > 0 ? T.shiftTo : T.gear;
        g = up ? Math.min(nG, g + 1) : Math.max(-nR, g - 1);
        if ((g < 0 && T.v > 0.6) || (g > 0 && T.v < -0.6)) { G.HUD.toast('Stop before changing direction', 'warn', 1200); break; }
        T.shift = 0.25; T.shiftTo = g;
        break;
      }
      case 'camera': cycleView(); break;
      case 'cam1': setView('cabin'); break;
      case 'cam2': setView('chase'); break;
      case 'cam3': setView('top'); break;
      case 'cam4': setView('cinema'); break;
      case 'lookReset': camS.yaw = 0; camS.pitch = 0; break;
      case 'navZoom': navZoom = navZoom > 0.5 ? 0.18 : navZoom * 1.8; break;
      case 'mirrors': settings.mirrorInsets = !settings.mirrorInsets; store.set(SET_KEY, settings); break;
      case 'trailer': toggleTrailer(); break;
      case 'interact': interact(); break;
      case 'rescue': openConfirm('Call roadside assistance?', `Your truck${T.trailer ? ' and trailer' : ''} will be towed to the nearest service station and refuelled with 100 L. Cost: <b>${U.fmtMoney(rescueCost())}</b>.`, 'Call assistance', rescue); break;
      default: break;
    }
  }
  const rescueCost = () => 900 + Math.round(truck.damage * 1500 / 10) * 10;
  function rescue() {
    const T = truck;
    const nc = world.nearestCity(T.x, T.z).city;
    const d = nc.fuel;
    game.money -= rescueCost();
    placeTruckAtDepot(d);
    const p = world.yardToWorld(d.yard, 6, -20);
    T.x = p.x; T.z = p.z; T.h = d.yard.h + Math.PI;
    T.fuel = Math.min(T.tank, T.fuel + 100);
    T.v = 0; T.park = true;
    if (T.trailer) { const kp = T.kingpin(); T.trailer.place(kp.x, kp.z, T.h, world); }
    closePanel();
    G.HUD.toast('Towed to ' + nc.name + ' service station.', 'info');
    updateRoute(true);
  }
  function couplingState() {
    const T = truck, j = game.job;
    if (T.trailer || !j) return null;
    const tr = j.trailer, kp = T.kingpin();
    const d = Math.hypot(tr.kx - kp.x, tr.kz - kp.z);
    const ang = Math.abs(U.wrapAngle(T.h - tr.h));
    return { d, ang, ok: d < 1.4 && ang < 0.35 && Math.abs(T.v) < 2.5, near: d < 18 };
  }
  function toggleTrailer() {
    const T = truck;
    if (T.trailer) {
      if (Math.abs(T.v) > 0.5) { G.HUD.toast('Stop to detach the trailer', 'warn'); return; }
      const tr = T.trailer;
      T.trailer = null;
      tr.place(tr.kx, tr.kz, tr.h, world);
      G.Audio.fx.coupling();
      G.HUD.toast('Trailer detached', 'info');
      updateRoute(true);
      return;
    }
    const c = couplingState();
    if (!c) { G.HUD.toast('No trailer here. Take a job from the freight market (J).', 'warn'); return; }
    if (!c.ok) { G.HUD.toast(c.d > 3 ? 'Reverse under the trailer first' : `Line up: ${c.d.toFixed(1)} m off, ${Math.round(c.ang * 57)}° angle`, 'warn'); return; }
    const j = game.job;
    T.trailer = j.trailer;
    const kp = T.kingpin();
    j.trailer.kx = kp.x; j.trailer.kz = kp.z;
    j.trailer.x = kp.x - Math.sin(j.trailer.h) * G.Vehicle.TRAILER_LT;
    j.trailer.z = kp.z - Math.cos(j.trailer.h) * G.Vehicle.TRAILER_LT;
    G.Audio.fx.coupling();
    if (!j.picked) {
      j.picked = true;
      j.from.bays[j.bayFrom].used = false;
      G.HUD.toast(`Trailer coupled. Deliver to <b>${j.to.company.name}</b>, ${j.to.city.name}`, 'good', 6000);
      updateRoute(true);
    } else G.HUD.toast('Trailer coupled', 'good');
    saveCareer();
  }
  // what Enter would do right now
  function context() {
    const T = truck;
    const stopped = Math.abs(T.v) < 0.4;
    const dep = world.depotAt(T.x, T.z);
    const j = game.job;
    if (dep && j && j.picked && T.trailer === j.trailer && dep.depot === j.to) {
      if (!stopped) return { text: 'Stop in the yard to deliver', act: null };
      return { text: inBay(j) ? '<kbd>Enter</kbd> Deliver cargo · precise parking bonus' : '<kbd>Enter</kbd> Deliver cargo (park in the orange bay for a bonus)', act: 'deliver' };
    }
    if (dep && dep.depot.kind === 'fuel') {
      const r = dep.depot.refuel, s = dep.depot.service;
      if (dep.lx > r.lx0 && dep.lx < r.lx1 && dep.lz > r.lz0 && dep.lz < r.lz1) {
        if (!stopped) return { text: 'Stop at a pump to refuel', act: null };
        if (refuelling) return { text: 'Refuelling… <kbd>Enter</kbd> stop', act: 'refuel' };
        return { text: `<kbd>Enter</kbd> Refuel · Diesel €1.69/L`, act: 'refuel' };
      }
      if (dep.lx > s.lx0 && dep.lx < s.lx1 && dep.lz > s.lz0 && dep.lz < s.lz1 && stopped) return { text: '<kbd>Enter</kbd> Service & upgrades', act: 'garage' };
    }
    const c = couplingState();
    if (c && c.near) {
      if (c.ok) return { text: '<kbd>T</kbd> Couple trailer', act: 'trailer' };
      return { text: `Trailer: ${c.d.toFixed(1)} m · ${Math.round(c.ang * 57)}°`, act: null };
    }
    return null;
  }
  let refuelling = false;
  function interact() {
    const c = context();
    if (!c || !c.act) return;
    if (c.act === 'deliver') deliver();
    else if (c.act === 'refuel') {
      refuelling = !refuelling;
      if (refuelling && truck.engineOn) G.HUD.toast('Tip: switch the engine off while refuelling', 'info', 2500);
    } else if (c.act === 'garage') openGarage();
    else if (c.act === 'trailer') toggleTrailer();
  }

  // ------------------------------------------------------------------ per-frame game logic
  let navZoom = 0.42, routeTimer = 0, saveTimer = 0, limitShown = -1, warnTimer = 0;
  function gameLogic(dt) {
    const T = truck;
    // refuelling
    if (refuelling) {
      const dep = world.depotAt(T.x, T.z);
      if (!dep || Math.abs(T.v) > 0.4 || T.fuel >= T.tank - 0.1 || game.money <= 0) {
        if (T.fuel >= T.tank - 0.1) G.HUD.toast('Tank full', 'good', 1500);
        refuelling = false;
      } else {
        const l = Math.min(T.tank - T.fuel, 40 * dt);
        T.fuel += l; game.money -= l * 1.69;
      }
    }
    // job deadline warning
    // route refresh
    routeTimer -= dt;
    if (routeTimer <= 0) { routeTimer = 1.5; updateRoute(); }
    // markers
    const j = game.job;
    beam.visible = false; bayMark.visible = false;
    if (j && !j.picked) {
      beam.visible = true;
      beam.material.color.set(0x3ddc6a);
      beam.position.set(j.trailer.kx, world.surface(j.trailer.kx, j.trailer.kz).h + 30, j.trailer.kz);
    }
    if (j && j.picked) {
      const p = world.bayPose(j.to, j.bayTo);
      const dd = Math.hypot(p.cx - T.x, p.cz - T.z);
      if (dd < 400) {
        bayMark.visible = true;
        bayMark.position.set(p.cx, p.y + 0.05, p.cz);
        bayMark.rotation.set(-Math.PI / 2, 0, j.to.yard.h);
      }
      if (dd > 120) {
        beam.visible = true; beam.material.color.set(0xff9d2e);
        beam.position.set(p.cx, p.y + 30, p.cz);
      }
    }
    // speed limit + cameras + wrong way
    const surf = world.surface(T.x, T.z);
    let limit = 0;
    const nc = world.nearestCity(T.x, T.z);
    if (world.depotAt(T.x, T.z)) limit = 20;
    else if (surf.edge && surf.edge.type === 'spur') limit = 40;
    else if (surf.node || nc.d < 420) limit = 50;
    else if (surf.edge) limit = surf.edge.cfg.limit;
    if (limit !== limitShown) {
      limitShown = limit;
      $('limit').hidden = !limit;
      $('limit').querySelector('span').textContent = limit;
    }
    const kmh = Math.abs(T.v) * 3.6;
    $('limit').classList.toggle('over', limit > 0 && kmh > limit + 3);
    for (const cam of world.cams) {
      if (Math.abs(cam.x - T.x) > 30 || Math.abs(cam.z - T.z) > 30) continue;
      const q = world.query(T.x, T.z);
      if (!q || q.e !== cam.e) continue;
      const along = Math.abs(q.s - cam.s);
      const fwd = (Math.sin(T.h) * q.tx + Math.cos(T.h) * q.tz) * cam.dir;
      if (along < 6 && fwd > 0.5 && Math.sign(q.lat) === Math.sign(cam.dir)) {
        const last = game.camHit.get(cam) || -99;
        if (G.clock - last > 20) {
          game.camHit.set(cam, G.clock);
          const lim = surf.node || nc.d < 420 ? 50 : cam.limit;
          if (kmh > lim + 6) {
            flash = 1;
            G.Audio.fx.flash();
            fineMe(Math.round((90 + (kmh - lim) * 14) / 10) * 10, `Speed camera: ${Math.round(kmh)} km/h in a ${lim} zone`);
          }
        }
      }
    }
    if (surf.edge && surf.edge.type === 'motorway' && kmh > 15) {
      const fwd = Math.sin(T.h) * surf.edge.tx[Math.min(surf.edge.n - 1, Math.round(surf.s / surf.edge.step))] + Math.cos(T.h) * surf.edge.tz[Math.min(surf.edge.n - 1, Math.round(surf.s / surf.edge.step))];
      const wrong = (surf.lat > 1 && fwd < -0.5) || (surf.lat < -1 && fwd > 0.5);
      game.wrongWay = wrong ? game.wrongWay + dt : 0;
      if (game.wrongWay > 4) { game.wrongWay = -20; fineMe(400, 'Driving against traffic'); }
    } else game.wrongWay = 0;
    // lights at night
    if (env.night > 0.6 && T.lights === 0 && kmh > 10) {
      game.nightWarn += dt;
      if (game.nightWarn > 8 && game.nightWarn < 8 + dt * 1.5) G.HUD.toast('It is dark. Switch on your headlights (L).', 'warn');
      if (game.nightWarn > 30) { game.nightWarn = 0; fineMe(80, 'Driving without lights at night'); }
    } else game.nightWarn = 0;
    // warnings
    warnTimer -= dt;
    if (warnTimer <= 0) {
      if (T.park && T.engineOn && G.Input.fwd > 0.5 && !game.panel) { G.HUD.toast('Parking brake is on (Space)', 'warn', 1500); warnTimer = 3; }
      else if (!T.engineOn && (G.Input.fwd > 0.5 || G.Input.back > 0.5) && T.starting <= 0) { G.HUD.toast('Engine is off (E)', 'warn', 1500); warnTimer = 3; }
      else if (T.fuel / T.tank < 0.1 && T.engineOn) { G.HUD.toast('Fuel low. Find a fuel station (map: blue dots).', 'warn', 3000); warnTimer = 40; }
    }
    if (T.inWater) { G.HUD.toast('The truck went into the water and was recovered.', 'bad', 5000); rescue(); T.inWater = false; }
    // weather hints
    if (env.rain > 0.3 && !game.rainHint) { game.rainHint = true; if (!T.wipers) G.HUD.toast('Rain: switch on the wipers (P) and leave more room to brake', 'info', 5000); }
    if (env.rain < 0.1) game.rainHint = false;
    // driver fatigue: 11 h of driving before a rest is due
    if (Math.abs(T.v) > 1) game.driveMins = (game.driveMins || 0) + dt * env.timeScale / 60;
    const left = 660 - (game.driveMins || 0);
    if (left < 60 && left > 59.9 - dt) G.HUD.toast('You need a rest within an hour. Sleep at a fuel station (service menu).', 'warn', 6000);
    if (left < 0) {
      game.tired = Math.min(1, -left / 120);
      if (Math.random() < dt * 0.05 * game.tired) blink = 1;
      if (-left > 120 && !game.tiredFine) { game.tiredFine = true; fineMe(250, 'Driving time limit exceeded'); }
    } else { game.tired = 0; game.tiredFine = false; }
    // autosave
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; saveCareer(); }
    game.stats.km = T.odo / 1000;
    generateMarket(false);
  }
  let flash = 0, blink = 0;

  // ------------------------------------------------------------------ HUD update
  const clusterCv = $('cluster'), gpsCv = $('gps');
  let hudT = 0, gpsT = 0, dashT = 0, fpsAcc = 0, fpsN = 0;
  // canvas sizes are measured once per resize to avoid forcing layout every frame
  const cvSize = new Map();
  addEventListener('resize', () => cvSize.clear());
  function fitCanvas(cv) {
    let s = cvSize.get(cv);
    if (!s || !s[0]) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      s = [Math.round(cv.clientWidth * dpr), Math.round(cv.clientHeight * dpr), cv.clientWidth];
      cvSize.set(cv, s);
      if (cv.width !== s[0] || cv.height !== s[1]) { cv.width = s[0]; cv.height = s[1]; }
    }
    return s;
  }
  const txtCache = new Map();
  function setText(id, v) {
    if (txtCache.get(id) === v) return;
    txtCache.set(id, v);
    $(id).textContent = v;
  }
  function updateHUD(dt) {
    const T = truck;
    hudT += dt; gpsT += dt; dashT += dt;
    if (hudT > 1 / 20) {
      hudT = 0;
      if (game.view !== 'cabin' || settings.clusterAlways) {
        if (clusterCv.hidden) { clusterCv.hidden = false; cvSize.delete(clusterCv); }
        const [w, h] = fitCanvas(clusterCv);
        G.HUD.drawCluster(clusterCv.getContext('2d'), w, h, T, game);
      } else clusterCv.hidden = true;
      // money / job / clock
      setText('money', U.fmtMoney(game.money));
      setText('lvl', 'Level ' + game.level());
      const nl = levelXp(game.level() + 1), pl = levelXp(game.level());
      const xw = Math.round(((game.xp - pl) / (nl - pl)) * 100) + '%';
      if (txtCache.get('xpw') !== xw) { txtCache.set('xpw', xw); $('xpbar').style.width = xw; }
      setText('clock', 'Day ' + env.day + ' · ' + U.fmtTime(env.time));
      setText('wx', { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', fog: 'Fog' }[env.weather]);
      const j = game.job;
      const jc = $('job-card');
      if (j) {
        jc.hidden = false;
        const nowAbs = env.day * 1440 + env.time;
        const left = j.deadline - nowAbs;
        setText('job-cargo', `${j.cargo.name} · ${j.tons} t`);
        setText('job-route', j.picked ? `→ ${j.to.company.name}, ${j.to.city.name}` : `Pick up at ${j.from.company.name}, ${j.from.city.name}`);
        setText('job-time', left >= 0 ? 'Due in ' + U.fmtDur(left) : 'Late by ' + U.fmtDur(-left));
        const cls = left < 0 ? 'late' : left < 30 ? 'soon' : '';
        if ($('job-time').className !== cls) $('job-time').className = cls;
        setText('job-pay', U.fmtMoney(j.pay));
        setText('job-dmg', j.trailer && j.picked ? 'Cargo damage ' + Math.round(j.trailer.damage * 100) + '%' : '');
      } else jc.hidden = true;
      const c = context();
      G.HUD.prompt(c ? c.text : '', c ? c.act : '');
      setText('dmg', T.damage > 0.01 ? 'Truck damage ' + Math.round(T.damage * 100) + '%' : '');
      if (settings.fps) setText('fps', Math.round(fpsN / Math.max(0.001, fpsAcc)) + ' fps');
    }
    if (gpsT > 1 / 10) {
      gpsT = 0;
      const [w, h, cw] = fitCanvas(gpsCv);
      const ctx = gpsCv.getContext('2d');
      const dpr = w / (cw || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tgt = routeTarget();
      G.HUD.drawGPS(ctx, w, h, T, world, game.route, navZoom * dpr * (1 / (1 + Math.abs(T.v) / 40)), tgt ? { x: tgt.depot.yard.cx, z: tgt.depot.yard.cz } : null);
      const ins = instruction();
      const el = $('gps-instr');
      if (ins) {
        el.hidden = false;
        const ic = ins.icon === 'round' ? `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="22" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M20 30v8M20 14V4m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ins.icon === 'flag' ? `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 38V4h20l-5 8 5 8H14" stroke="currentColor" stroke-width="4" fill="none" stroke-linejoin="round"/></svg>` : `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V6m0 0l-9 9m9-9l9 9" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const dist = ins.dist > 950 ? (ins.dist / 1000).toFixed(1) + ' km' : Math.round(ins.dist / 10) * 10 + ' m';
        const html = `<div class="gi-icon">${ic}${ins.n ? `<b>${ins.n}</b>` : ''}</div><div class="gi-text"><div class="gi-dist">${dist}</div><div class="gi-main">${ins.text}</div><div class="gi-sub">${ins.sub || ''}</div></div>`;
        if (txtCache.get('gi') !== html) { txtCache.set('gi', html); el.innerHTML = html; }
        const r = game.route;
        setText('gps-eta', r ? `${(r.length / 1000).toFixed(1)} km · ETA ${U.fmtTime(env.time + (r.length / 17) * (env.timeScale / 60))}` : '');
      } else { el.hidden = true; setText('gps-eta', 'No destination · J for jobs'); }
    }
    // in-cab displays
    if (dashT > 1 / 12 && game.view === 'cabin') {
      dashT = 0;
      const P = truck.model.P;
      const gx = P.gaugeCanvas.getContext('2d');
      G.HUD.drawCluster(gx, P.gaugeCanvas.width, P.gaugeCanvas.height, T, game);
      P.gaugeTex.needsUpdate = true;
      const nx = P.navCanvas.getContext('2d');
      G.HUD.drawGPS(nx, P.navCanvas.width, P.navCanvas.height, T, world, game.route, 0.35, null);
      P.navTex.needsUpdate = true;
    }
    // tiredness blink
    if (blink > 0 || txtCache.get('blink') !== '0') {
      blink = Math.max(0, blink - dt * 0.9);
      const b = (Math.sin(Math.min(1, blink) * Math.PI)).toFixed(2);
      if (txtCache.get('blink') !== b) { txtCache.set('blink', b === '0.00' ? '0' : b); $('blink').style.opacity = b; }
    }
    // camera flash
    if (flash > 0 || txtCache.get('flash') !== '0') {
      flash = Math.max(0, flash - dt * 2.5);
      const f = flash.toFixed(2);
      if (txtCache.get('flash') !== f) { txtCache.set('flash', f === '0.00' ? '0' : f); $('flash').style.opacity = f; }
    }
  }

  // ------------------------------------------------------------------ panels
  function openPanel(id) {
    closePanel(true);
    game.panel = id;
    game.paused = true;
    $(id).hidden = false;
    const f = $(id).querySelector('button, select');
    if (f) f.focus({ preventScroll: true });
  }
  function closePanel(silent) {
    if (game.panel) $(game.panel).hidden = true;
    game.panel = null;
    if (!silent) game.paused = false;
    if (game.panel === null && !silent) canvas.focus && canvas.focus();
  }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closePanel()));

  function openJobs() {
    generateMarket(false);
    const T = truck;
    const list = $('jobs-list');
    const lvl = game.level();
    const offers = game.market.map((o) => ({ o, d: Math.hypot(o.from.yard.cx - T.x, o.from.yard.cz - T.z) })).sort((a, b) => a.d - b.d).slice(0, 14);
    $('jobs-current').hidden = !game.job;
    if (game.job) {
      const j = game.job;
      $('jobs-current-text').innerHTML = `<b>${j.cargo.name}</b> ${j.tons} t · ${j.from.city.name} → ${j.to.city.name} · ${U.fmtMoney(j.pay)}`;
    }
    list.innerHTML = '';
    for (const { o, d } of offers) {
      const locked = lvl < o.req;
      const tags = [o.cargo.adr ? `<span class="tag adr">ADR ${o.cargo.adr}</span>` : '', o.cargo.fragile ? '<span class="tag">Fragile</span>' : '', o.cargo.heavy ? '<span class="tag">Heavy</span>' : '', o.cargo.chilled ? '<span class="tag">Chilled</span>' : '', o.urgent ? '<span class="tag urgent">Urgent</span>' : ''].join('');
      const card = document.createElement('button');
      card.className = 'job' + (locked ? ' locked' : '');
      card.innerHTML = `
        <div class="sign"><span class="arrow" aria-hidden="true">➜</span><span class="dest">${o.to.city.name}</span><span class="km">${(o.dist / 1000).toFixed(1).replace('.', ',')} km</span></div>
        <div class="jb">
          <div class="jt">${o.cargo.name} <small>${o.tons} t</small></div>
          <div class="jm">${o.from.company.name}, ${o.from.city.name} → ${o.to.company.name} · pickup ${(d / 1000).toFixed(1)} km away</div>
          <div class="jtags">${tags}${locked ? `<span class="tag lock">Needs level ${o.req}</span>` : ''}</div>
        </div>
        <div class="jpay"><b>${U.fmtMoney(o.pay)}</b><small>${o.xp} XP</small></div>`;
      card.disabled = locked || !!game.job;
      card.addEventListener('click', () => acceptJob(o));
      list.appendChild(card);
    }
    openPanel('p-jobs');
  }
  $('jobs-cancel').addEventListener('click', () => openConfirm('Cancel this job?', 'The trailer goes back to the depot and you pay a cancellation fee of 20% of the pay (at least €400).', 'Cancel job', () => { cancelJob(); closePanel(); }));

  function openConfirm(title, html, okText, fn) {
    $('cf-title').textContent = title;
    $('cf-text').innerHTML = html;
    $('cf-ok').textContent = okText;
    $('cf-ok').onclick = () => { fn(); };
    openPanel('p-confirm');
  }

  // garage / service
  function openGarage() {
    const T = truck;
    const body = $('garage-body');
    const repairCost = Math.round(T.damage * 4200 / 10) * 10;
    let html = `<section class="g-sec"><h3>Service</h3>
      <div class="g-row"><span>Truck damage <b>${Math.round(T.damage * 100)}%</b></span><button class="btn" data-g="repair" ${repairCost ? '' : 'disabled'}>Repair · ${U.fmtMoney(repairCost)}</button></div>
      <div class="g-row"><span>Fuel <b>${Math.round(T.fuel)} / ${T.tank} L</b></span><button class="btn" data-g="fill" ${T.fuel < T.tank - 1 ? '' : 'disabled'}>Fill up · ${U.fmtMoney((T.tank - T.fuel) * 1.69)}</button></div>
      <div class="g-row"><span>Driving time today <b>${U.fmtDur(game.driveMins || 0)}</b> of 11 h</span><button class="btn" data-g="sleep">Sleep 9 h · €60</button></div></section>`;
    const sec = (title, cat, items, cfgKey) => {
      html += `<section class="g-sec"><h3>${title}</h3>`;
      for (const it of items) {
        const owned = game.owned[cat].includes(it.id);
        const active = cat === 'paint' ? game.cfg.paint === it.color : game.cfg[cfgKey] === it.id;
        const sw = it.color ? `<i class="sw" style="background:${it.color}"></i>` : '';
        html += `<div class="g-row ${active ? 'active' : ''}"><span>${sw}${it.name}</span>${active ? '<em>Fitted</em>' : `<button class="btn" data-g="${cat}:${it.id}">${owned ? 'Fit' : 'Buy · ' + U.fmtMoney(it.price)}</button>`}</div>`;
      }
      html += '</section>';
    };
    sec('Engine', 'engine', G.D.engines, 'engine');
    sec('Transmission', 'gearbox', G.D.gearboxes, 'gearbox');
    sec('Fuel tanks', 'tank', G.D.tanks, 'tank');
    sec('Tyres', 'tyres', G.D.tyres, 'tyres');
    sec('Paint', 'paint', G.D.paints, 'paint');
    html += '<section class="g-sec"><h3>Accessories</h3>';
    for (const it of G.D.extras) {
      const owned = game.owned.extras.includes(it.id);
      html += `<div class="g-row ${owned ? 'active' : ''}"><span>${it.name}</span>${owned ? '<em>Fitted</em>' : `<button class="btn" data-g="extras:${it.id}">Buy · ${U.fmtMoney(it.price)}</button>`}</div>`;
    }
    html += '</section>';
    body.innerHTML = html;
    body.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => garageAction(b.dataset.g)));
    $('garage-money').textContent = U.fmtMoney(game.money);
    if (game.panel !== 'p-garage') openPanel('p-garage');
  }
  function garageAction(a) {
    const T = truck;
    if (a === 'repair') {
      const cost = Math.round(T.damage * 4200 / 10) * 10;
      if (game.money < cost) return G.HUD.toast('Not enough money', 'bad');
      game.money -= cost; T.damage = 0; T.stalled = false; G.Audio.fx.cash();
    } else if (a === 'sleep') {
      game.money -= 60; game.driveMins = 0; game.tired = 0;
      env.setTime(env.time + 9 * 60);
      if (env.time >= 1440) { env.time -= 1440; env.day++; }
      G.HUD.toast('Rested for 9 hours. Fresh and ready.', 'good');
    } else if (a === 'fill') {
      const l = T.tank - T.fuel, cost = l * 1.69;
      if (game.money < cost) return G.HUD.toast('Not enough money', 'bad');
      game.money -= cost; T.fuel = T.tank; G.Audio.fx.cash();
    } else {
      const [cat, id] = a.split(':');
      const list = { engine: G.D.engines, gearbox: G.D.gearboxes, tank: G.D.tanks, tyres: G.D.tyres, paint: G.D.paints, extras: G.D.extras }[cat];
      const it = list.find((x) => x.id === id);
      const owned = game.owned[cat].includes(id);
      if (!owned) {
        if (game.money < it.price) return G.HUD.toast('Not enough money', 'bad');
        game.money -= it.price; game.owned[cat].push(id); G.Audio.fx.cash();
      }
      if (cat === 'paint') game.cfg.paint = it.color;
      else if (cat === 'extras') game.cfg[id] = true;
      else game.cfg[cat] = id;
      T.applyConfig(game.cfg);
    }
    saveCareer();
    openGarage();
  }

  // map
  function openMap() {
    const M = G.HUD.mapState;
    M.cx = truck.x; M.cz = truck.z; M.zoom = Math.min(innerWidth, innerHeight) / 4200;
    openPanel('p-map');
    drawMapSoon();
  }
  let mapRaf = 0;
  function drawMapSoon() { cancelAnimationFrame(mapRaf); mapRaf = requestAnimationFrame(() => G.HUD.drawMap($('map-canvas'), world, truck, game)); }
  {
    const cv = $('map-canvas'), M = G.HUD.mapState;
    let drag = null, moved = 0;
    const pointers = new Map();
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY }; moved = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [c, d] = [...pointers.values()];
        const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0 > 0) M.zoom = U.clamp(M.zoom * (d1 / d0), 0.03, 1.5);
        moved += 10;
      } else {
        M.cx -= (e.clientX - prev.x) / M.zoom; M.cz -= (e.clientY - prev.y) / M.zoom;
        moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      drawMapSoon();
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (drag && moved < 6) {
        const r = cv.getBoundingClientRect();
        const d = G.HUD.mapPick(world, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
        M.sel = d;
        $('map-sel').textContent = d ? (d.kind === 'fuel' ? 'Fuel & service, ' + d.city.name : d.company.name + ', ' + d.city.name) : 'Tap a depot or fuel station';
        $('map-route').disabled = !d || !!game.job;
      }
      drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); M.zoom = U.clamp(M.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.03, 1.5); drawMapSoon(); }, { passive: false });
    $('map-center').addEventListener('click', () => { M.cx = truck.x; M.cz = truck.z; drawMapSoon(); });
    $('map-zin').addEventListener('click', () => { M.zoom = Math.min(1.5, M.zoom * 1.4); drawMapSoon(); });
    $('map-zout').addEventListener('click', () => { M.zoom = Math.max(0.03, M.zoom / 1.4); drawMapSoon(); });
    $('map-route').addEventListener('click', () => {
      if (!M.sel) return;
      game.waypoint = { depot: M.sel, pos: { x: M.sel.yard.cx, z: M.sel.yard.cz } };
      updateRoute(true); drawMapSoon();
      G.HUD.toast('GPS route set', 'good', 1500);
    });
    $('map-fuel').addEventListener('click', () => {
      let best = null, bd = 1e9;
      for (const d of world.depots) if (d.kind === 'fuel') { const dd = Math.hypot(d.yard.cx - truck.x, d.yard.cz - truck.z); if (dd < bd) { bd = dd; best = d; } }
      if (best && !game.job) { game.waypoint = { depot: best, pos: { x: best.yard.cx, z: best.yard.cz } }; updateRoute(true); drawMapSoon(); G.HUD.toast('Route to the nearest fuel station', 'good', 1500); }
      else if (game.job) G.HUD.toast('The GPS follows your job. Fuel stations are the blue dots.', 'info');
    });
  }

  // settings
  function fillSettings() {
    for (const k of ['quality', 'gearbox', 'steering', 'weather', 'timeScale', 'traffic', 'fov', 'limiter']) { const el = $('set-' + k); if (el) el.value = String(settings[k]); }
    $('set-volume').value = settings.volume;
    $('set-mirrors').checked = settings.mirrors;
    $('set-insets').checked = settings.mirrorInsets;
    $('set-fps').checked = settings.fps;
    $('set-cluster').checked = !!settings.clusterAlways;
  }
  function readSettings() {
    const before = { quality: settings.quality, traffic: settings.traffic };
    settings.quality = $('set-quality').value;
    settings.gearbox = $('set-gearbox').value;
    settings.steering = $('set-steering').value;
    settings.weather = $('set-weather').value;
    settings.timeScale = Number($('set-timeScale').value);
    settings.traffic = Number($('set-traffic').value);
    settings.fov = Number($('set-fov').value);
    settings.limiter = Number($('set-limiter').value);
    settings.volume = Number($('set-volume').value);
    settings.mirrors = $('set-mirrors').checked;
    settings.mirrorInsets = $('set-insets').checked;
    settings.fps = $('set-fps').checked;
    settings.clusterAlways = $('set-cluster').checked;
    store.set(SET_KEY, settings);
    applySettingsLive();
    return before.quality !== settings.quality || before.traffic !== settings.traffic;
  }
  function applySettingsLive() {
    if (!env) return;
    env.timeScale = settings.timeScale;
    if (settings.weather === 'dynamic') env.lockWeather = null; else env.lockWeather = settings.weather;
    G.Audio.setVolume(settings.volume);
    if (truck) { truck.autoMode = settings.gearbox === 'auto'; truck.limiter = settings.limiter; }
    G.Input.mode = settings.steering === 'mouse' ? 'mouse' : 'keys';
    $('fps').hidden = !settings.fps;
    if (game.state === 'drive') $('touch').hidden = !(isTouch || settings.steering === 'touch' || settings.steering === 'tilt');
    if (settings.steering === 'tilt' && game.state === 'drive' && !G.Input.tilt.enabled) G.Input.enableTilt();
    if (settings.steering !== 'tilt') G.Input.tilt.enabled = false;
  }
  $('settings-save').addEventListener('click', () => {
    const restart = readSettings();
    if (restart) {
      saveCareer();
      openConfirm('Restart needed', 'Graphics quality and traffic density take effect after a reload. Your career is saved.', 'Reload now', () => location.reload());
    } else { G.HUD.toast('Settings saved', 'good', 1200); closePanel(); if (game.state === 'title') $('title').hidden = false; }
  });

  // pause menu buttons
  $('pm-resume').addEventListener('click', () => closePanel());
  $('pm-jobs').addEventListener('click', () => openJobs());
  $('pm-map').addEventListener('click', () => openMap());
  $('pm-settings').addEventListener('click', () => { fillSettings(); openPanel('p-settings'); });
  $('pm-help').addEventListener('click', () => openPanel('p-help'));
  $('pm-rescue').addEventListener('click', () => handleActionForced('rescue'));
  $('pm-title').addEventListener('click', () => { saveCareer(); location.reload(); });
  function handleActionForced(a) { closePanel(true); game.paused = true; handleAction(a); }
  $('res-ok').addEventListener('click', () => closePanel());
  $('prompt').addEventListener('click', () => { const a = $('prompt').dataset.act; if (a) handleAction(a === 'deliver' || a === 'refuel' || a === 'garage' ? 'interact' : a); });
  $('hb-jobs').addEventListener('click', () => handleAction('jobs'));
  $('hb-map').addEventListener('click', () => handleAction('map'));
  $('hb-menu').addEventListener('click', () => handleAction('pause'));
  $('hb-cam').addEventListener('click', () => handleAction('camera'));
  $('cf-cancel').addEventListener('click', () => closePanel());

  // title screen
  function refreshTitle() {
    const has = saved && saved.v === 1;
    $('t-continue').hidden = !has;
    if (has) $('t-continue-sub').textContent = `${U.fmtMoney(saved.money)} · ${saved.stats ? saved.stats.deliveries : 0} deliveries`;
    const sel = $('t-city');
    sel.innerHTML = world.cities.map((c) => `<option value="${c.id}" ${c.id === game.startCity ? 'selected' : ''}>${c.name}</option>`).join('');
    const pw = $('t-paint');
    pw.innerHTML = G.D.paints.slice(0, 6).map((p, i) => `<button class="sw-btn ${i === 0 ? 'on' : ''}" data-c="${p.color}" style="--c:${p.color}" aria-label="${p.name}"></button>`).join('');
    pw.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      pw.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      game.cfg.paint = b.dataset.c; truck.applyConfig(game.cfg);
    }));
    // park the truck at the chosen city for the title shot
    const city = world.cityById[game.startCity] || world.cities[0];
    placeTruckAtDepot(city.depots[0]);
    truck.pose(0.016, world);
  }
  $('t-city').addEventListener('change', (e) => { game.startCity = e.target.value; const c = world.cityById[game.startCity]; placeTruckAtDepot(c.depots[0]); truck.pose(0.016, world); });
  $('t-continue').addEventListener('click', () => startCareer(false));
  $('t-new').addEventListener('click', () => {
    if (saved && saved.v === 1) openConfirm('Start a new career?', 'Your saved career will be replaced.', 'Start new career', () => { closePanel(true); startCareer(true); });
    else startCareer(true);
  });
  $('t-settings').addEventListener('click', () => { fillSettings(); $('title').hidden = true; openPanel('p-settings'); });
  $('t-help').addEventListener('click', () => { $('title').hidden = true; openPanel('p-help'); });
  document.querySelectorAll('#p-settings [data-close], #p-help [data-close], #p-confirm [data-close]').forEach((b) => b.addEventListener('click', () => { if (game.state === 'title') $('title').hidden = false; }));
  $('cf-cancel').addEventListener('click', () => { if (game.state === 'title') $('title').hidden = false; });

  // pause audio when tab hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden) { G.Audio.suspend(); if (game.state === 'drive') saveCareer(); } else G.Audio.resume(); });
  addEventListener('pagehide', () => saveCareer());

  // ------------------------------------------------------------------ main loop
  let last = 0, titleT = 0, mirrorFrame = 0;
  const focus = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    G.clock += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { fpsAcc *= 0.5; fpsN *= 0.5; }
    G.Input.poll(dt);
    for (const a of G.Input.consume()) handleAction(a);
    const T = truck;
    const live = game.state === 'drive' && !game.paused;
    const P = G.prof;
    let pt = P ? performance.now() : 0;
    const mark = (k) => { if (P) { const n = performance.now(); P[k] = (P[k] || 0) + n - pt; pt = n; } };
    if (live) {
      physics(dt); mark('physics');
      T.pose(dt, world); mark('pose');
      traffic.update(dt, T); mark('traffic');
      gameLogic(dt); mark('logic');
      // blinker relay
      const blinkOn = (G.clock % 0.8) < 0.4;
      if ((T.indL || T.indR || T.hazard) && blinkOn !== T._blink) G.Audio.fx.tick(blinkOn);
      T._blink = blinkOn;
      // cancel indicator after a turn
      if ((T.indL || T.indR) && Math.abs(T.steer) > 0.25) T._turned = true;
      if (T._turned && Math.abs(T.steer) < 0.05) { T.indL = T.indR = false; T._turned = false; }
    } else if (game.state === 'title') {
      traffic.update(dt, T);
      T.pose(dt, world);
    }
    // cameras
    if (game.state === 'title') {
      titleT += dt * 0.08;
      const r = 17;
      camera.position.set(T.x + Math.sin(titleT) * r, T.y + 4.2, T.z + Math.cos(titleT) * r);
      camera.lookAt(T.x + Math.sin(T.h) * 2, T.y + 2, T.z + Math.cos(T.h) * 2);
      camera.fov = 50; camera.updateProjectionMatrix();
    } else updateCamera(dt);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.15; camera.position.y += (Math.random() - 0.5) * shake * 0.15; shake = Math.max(0, shake - dt * 2); }
    focus.set(T.x, T.y, T.z);
    mark('cam');
    env.update(live || game.state === 'title' ? dt : 0, camera, focus, Q.drawDist, matsRef());
    mark('env');
    for (const s of world.spinners) s.mesh.rotation.z += s.speed * dt;
    if (world.turbines) {
      const tb = world.turbines;
      tb.list.forEach((p, k) => {
        p.a += dt * p.sp;
        tb.dummy.position.set(p.x + Math.sin(0.8) * 4.5, p.y + 79, p.z + Math.cos(0.8) * 4.5);
        tb.dummy.rotation.set(0, 0.8, p.a);
        tb.dummy.updateMatrix();
        tb.mesh.setMatrixAt(k, tb.dummy.matrix);
      });
      tb.mesh.instanceMatrix.needsUpdate = true;
    }
    mark('spin');
    if (game.state === 'drive') {
      G.Audio.update(T, game.view, env, dt);
      updateHUD(dt);
      mark('hud');
      if (game.panel === 'p-map' && (G.clock * 4 | 0) !== ((G.clock - dt) * 4 | 0)) drawMapSoon();
    }
    // mirrors
    const cabin = game.view === 'cabin' && game.state === 'drive';
    if (cabin && settings.mirrors && mirrors.length) {
      const M = mirrors[mirrorFrame++ % mirrors.length];
      const vis = beam.visible;
      renderer.setRenderTarget(M.rt);
      renderer.render(scene, M.cam);
      renderer.setRenderTarget(null);
      beam.visible = vis;
    }
    for (const M of mirrors) M.m.glass.visible = settings.mirrors;
    mark('mirrors');
    renderer.autoClear = true;
    renderer.render(scene, camera);
    if (P) { renderer.getContext().finish(); mark('render'); P.frames = (P.frames || 0) + 1; }
    if (cabin && settings.mirrors && settings.mirrorInsets) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlay, ortho);
      renderer.autoClear = true;
    }
  }
  // headless test hook: advance the simulation without rendering
  G.dbg.sim = (secs, ctl = {}, step = 1 / 30) => {
    const I = G.Input;
    for (let t = 0; t < secs; t += step) {
      G.clock += step;
      for (const a of I.consume()) handleAction(a);
      I.fwd = ctl.fwd || 0; I.back = ctl.back || 0; I.steer = ctl.steer || 0; I.steerAnalog = !!ctl.analog; I.horn = false;
      if (game.state === 'drive' && !game.paused) {
        physics(step); truck.pose(step, world); traffic.update(step, truck); gameLogic(step);
        env.update(step, camera, focus.set(truck.x, truck.y, truck.z), Q.drawDist, matsRef());
      }
    }
  };
  G.dbg.act = (a) => handleAction(a);
  G.dbg.game = game;
  G.dbg.accept = (o) => acceptJob(o);
  G.dbg.context = () => context();
  let mr = null;
  function matsRef() {
    if (mr) return mr;
    mr = { road: Object.values(world.roadMats).concat([world.padMat, world.yardTopMats.depot, world.yardTopMats.fuel]), terrain: world.terrainMat, facades: world.facadeMats, lamp: world.lampMat, pools: world.lampPools };
    return mr;
  }

  boot().catch((err) => {
    console.error(err);
    $('load-msg').textContent = 'Something went wrong while building the world: ' + err.message;
  });
})();
