/* Cena 3D do cérebro (Three.js, copiado para assets/vendor: o site não carrega código de outros domínios).
   Recebe o grafo de graph.mjs e desenha: agentes (esferas), serviços (octaedros), clientes (dodecaedros), o maestro (esfera de fios),
   achados em órbita (satélites), conexões como arcos e pulsos de luz nas que dispararam hoje.
   Interação: arrastar gira, roda/pinça aproxima, toque ou clique seleciona. Para sozinho quando a tela sai (host fora da página)
   e respeita "reduzir movimento". Lança erro se o aparelho não abrir WebGL: quem chama mostra a lista no lugar. */
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function mountScene(host, graph, opts = {}) {
  const THREE = await import("../../../vendor/three.module.min.js");
  const stage = host.querySelector(".sc-labels") || host, calm = reduced();
  let w = Math.max(280, host.clientWidth), h = Math.max(300, host.clientHeight);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h);
  const cv = renderer.domElement; cv.className = "sc-canvas"; cv.setAttribute("aria-hidden", "true"); host.prepend(cv);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, w / h, .1, 200);
  let dist = opts.distance || (graph.mode === "servicos" ? 41 : 31); camera.position.set(0, 4, dist); camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, .85));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 12, 10); scene.add(sun);
  const back = new THREE.DirectionalLight(0x8b5cf6, 1.2); back.position.set(-8, -4, -10); scene.add(back);
  const world = new THREE.Group(); world.rotation.x = .3; scene.add(world);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };
  const V = a => new THREE.Vector3(a[0], a[1], a[2]);

  /* ---------- nós ---------- */
  const geoSphere = keep(new THREE.SphereGeometry(1, 28, 20)), geoOcta = keep(new THREE.OctahedronGeometry(1)), geoDode = keep(new THREE.DodecahedronGeometry(1));
  const items = new Map(), pickables = [];
  graph.nodes.forEach(n => {
    const grp = new THREE.Group(); grp.position.copy(V(n.pos));
    let mesh;
    if (n.type === "hub") {
      mesh = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(n.size, 1)), keep(new THREE.MeshBasicMaterial({ color: n.color, wireframe: true, transparent: true, opacity: .8 })));
      const core = new THREE.Mesh(geoSphere, keep(new THREE.MeshStandardMaterial({ color: 0x2c1a68, emissive: n.color, emissiveIntensity: .8, roughness: .3 }))); core.scale.setScalar(n.size * .55); grp.add(core);
    } else {
      const geo = n.type === "service" ? geoOcta : n.type === "client" ? geoDode : geoSphere, active = n.type !== "agent" || n.count > 0;
      mesh = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: n.color, emissive: n.color, emissiveIntensity: active ? .5 : .08, roughness: .35, metalness: .15, transparent: true, opacity: n.dim ? .45 : active ? 1 : .55 })));
      mesh.scale.setScalar(n.size);
    }
    mesh.userData.id = n.id; grp.add(mesh); world.add(grp);
    pickables.push(mesh);
    const it = { n, grp, mesh, base: n.size, sats: [], pulse: null, label: null, ph: Math.random() * 6.28 };
    if (n.type === "agent" && n.findings) n.findings.forEach((f, i) => {            /* um satélite por achado aberto */
      const s = new THREE.Mesh(geoSphere, keep(new THREE.MeshBasicMaterial({ color: f.score >= 80 ? 0xef4444 : f.score >= 60 ? 0xf59e0b : 0xe2e8f0, transparent: true, opacity: n.dim ? .35 : .95 })));
      s.scale.setScalar(.09 + f.score * .0011); grp.add(s);
      it.sats.push({ m: s, r: n.size + .85 + i * .13, sp: .5 + i * .07, a: i * 1.3, tilt: .5 + (i % 3) * .5 });
    });
    if (n.type === "agent" && n.top >= 80 && !n.dim) {                              /* anel que pulsa nos mais urgentes */
      it.pulse = new THREE.Mesh(keep(new THREE.RingGeometry(1.15, 1.3, 40)), keep(new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: .6, side: THREE.DoubleSide })));
      it.pulse.scale.setScalar(n.size); grp.add(it.pulse);
    }
    const label = document.createElement("div"); label.className = `sc-label t-${n.type}${n.dim ? " dim" : ""}`; label.textContent = n.label + (n.type === "agent" && n.count ? ` · ${n.count}` : n.type === "service" ? ` · ${n.count}` : "");
    stage.appendChild(label); it.label = label; items.set(n.id, it);
  });

  /* ---------- ligações ---------- */
  const EDGE = { spoke: [0x64748b, .14], synapse: [0xa78bfa, .85], "service-agent": [0xf472b6, graph.mode === "servicos" ? .4 : .22], "service-client": [0xf472b6, .6] };
  const edges = [], runners = [];
  graph.edges.forEach(e => {
    const a = items.get(e.a), b = items.get(e.b); if (!a || !b) return;
    const pa = V(a.n.pos), pb = V(b.n.pos), mid = pa.clone().add(pb).multiplyScalar(.5).multiplyScalar(e.kind === "spoke" ? 1 : .55);
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb), geo = keep(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)));
    const mat = keep(new THREE.LineBasicMaterial({ color: EDGE[e.kind][0], transparent: true, opacity: EDGE[e.kind][1] }));
    const line = new THREE.Line(geo, mat); world.add(line);
    edges.push({ e, line, mat, base: EDGE[e.kind][1] });
    if (e.kind === "synapse" && !calm) { const p = new THREE.Mesh(geoSphere, keep(new THREE.MeshBasicMaterial({ color: 0xffffff }))); p.scale.setScalar(.09); world.add(p); runners.push({ curve, m: p, t: Math.random(), sp: .22 + Math.random() * .15 }); }
  });

  /* ---------- seleção e foco ---------- */
  let selected = null, hovered = null, focusYaw = null, dirty = true;
  const related = id => new Set([id].concat(graph.edges.filter(e => e.a === id || e.b === id).flatMap(e => [e.a, e.b])));
  function applyFocus() {
    const rel = selected ? related(selected) : null;
    items.forEach((it, id) => { const on = !rel || rel.has(id); it.mesh.material.opacity = (on ? (it.n.dim && !rel ? .45 : (it.n.type === "agent" && it.n.count === 0 ? .55 : 1)) : .12); it.label.classList.toggle("off", !!rel && !on); it.label.classList.toggle("sel", id === selected); it.base = it.n.size * (id === selected ? 1.35 : 1); });
    edges.forEach(x => { x.mat.opacity = rel ? (x.e.a === selected || x.e.b === selected ? Math.min(1, x.base + .5) : x.base * .2) : x.base; });
    dirty = true;
  }
  function select(id) {
    selected = id && items.has(id) ? id : null; applyFocus();
    if (selected && !calm) { const p = items.get(selected).n.pos; focusYaw = Math.abs(p[0]) + Math.abs(p[2]) < .01 ? null : Math.atan2(p[0], p[2]) - .55; } else focusYaw = null;
    if (opts.onSelect) opts.onSelect(selected);
  }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function at(ev) {
    const r = cv.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera); const hit = ray.intersectObjects(pickables, false)[0]; return hit ? hit.object.userData.id : null;
  }

  /* ---------- entrada: arrastar gira, rodar/pinçar aproxima ---------- */
  let vy = 0, vx = 0, down = null, moved = 0; const pts = new Map(); let pinch = 0;
  cv.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); cv.setPointerCapture(e.pointerId); down = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; focusYaw = null; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
  cv.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) { const id = at(e); if (id !== hovered) { hovered = id; cv.style.cursor = id ? "pointer" : "grab"; items.forEach((it, k) => it.label.classList.toggle("hov", k === id)); } return; }
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, e);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) dist = clamp(dist * (pinch / d), 12, 56); pinch = d; dirty = true; return; }
    const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY; moved += Math.abs(dx) + Math.abs(dy);
    world.rotation.y += dx * .006; world.rotation.x = clamp(world.rotation.x + dy * .004, -.9, .9); vy = dx * .006; vx = dy * .004; dirty = true;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (down && moved < 6 && performance.now() - down.t < 500) select(at(e)); down = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", e => { pts.delete(e.pointerId); down = null; });
  cv.addEventListener("wheel", e => { e.preventDefault(); dist = clamp(dist * (1 + e.deltaY * .0012), 12, 56); dirty = true; }, { passive: false });
  cv.style.cursor = "grab";

  /* ---------- laço de desenho ---------- */
  const tmp = new THREE.Vector3(), clock = new THREE.Clock(); let alive = true, t = 0;
  function labels() {
    items.forEach(it => { it.mesh.getWorldPosition(tmp); const d = tmp.clone(); tmp.project(camera);
      if (tmp.z > 1) { it.label.style.display = "none"; return; }
      it.label.style.display = ""; const depth = clamp(1.15 - (d.distanceTo(camera.position) - dist + 10) * .02, .35, 1);
      it.label.style.transform = `translate(${((tmp.x * .5 + .5) * w).toFixed(1)}px, ${((-tmp.y * .5 + .5) * h + it.base * 14 + 8).toFixed(1)}px) translate(-50%, 0)`; it.label.style.opacity = it.label.classList.contains("off") ? .15 : depth;
    });
  }
  function frame() {
    if (!alive) return;
    if (!host.isConnected) { destroy(); return; }
    if (document.hidden) return;
    const dt = Math.min(.05, clock.getDelta()); t += dt;
    const idle = !down && pts.size === 0;
    if (!calm) {
      if (focusYaw != null) { let d = focusYaw - world.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); world.rotation.y += d * Math.min(1, dt * 3.2); if (Math.abs(d) < .01) focusYaw = null; }
      else if (idle) { world.rotation.y += vy; world.rotation.x = clamp(world.rotation.x + vx, -.9, .9); vy *= .94; vx *= .94; if (!selected && Math.abs(vy) < .0008) world.rotation.y += dt * .1; }
      items.forEach(it => { it.mesh.rotation.y += dt * .5; it.mesh.scale.setScalar(it.base * (1 + Math.sin(t * 1.6 + it.ph) * .03));
        it.sats.forEach(s => { s.a += dt * s.sp; s.m.position.set(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r * Math.sin(s.tilt), Math.sin(s.a) * s.r * Math.cos(s.tilt)); });
        if (it.pulse) { const k = (t * .6 + it.ph) % 1; it.pulse.scale.setScalar(it.base * (1.1 + k * 1.2)); it.pulse.material.opacity = .55 * (1 - k); it.pulse.quaternion.copy(camera.quaternion).premultiply(it.grp.quaternion.clone().invert()); } });
      runners.forEach(p => { p.t = (p.t + dt * p.sp) % 1; p.m.position.copy(p.curve.getPoint(p.t)); });
    } else if (!dirty) return;
    else items.forEach(it => { it.sats.forEach((s, i) => s.m.position.set(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r * Math.sin(s.tilt), Math.sin(s.a) * s.r * Math.cos(s.tilt))); });
    camera.position.z += (dist - camera.position.z) * .12; camera.position.y = 4 * (dist / 30); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera); labels(); dirty = false;
  }
  renderer.setAnimationLoop(frame);
  const ro = new ResizeObserver(() => { w = Math.max(280, host.clientWidth); h = Math.max(300, host.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; });
  ro.observe(host);
  function destroy() {
    if (!alive) return; alive = false; renderer.setAnimationLoop(null); ro.disconnect();
    disposables.forEach(o => { try { o.dispose(); } catch (e) { /* já liberado */ } });
    renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* sem suporte */ }
    cv.remove(); items.forEach(it => it.label.remove());
  }
  applyFocus(); frame();
  return { select, destroy, get selected() { return selected; } };
}
