/* ============================================================
   RUBIKS DNA — hero morph: DNA helix -> Rubik's cube -> healthy human
   Zero dependencies. 3D particles projected onto a 2D canvas.
   ============================================================ */

(() => {
  const canvas = document.getElementById("morph-canvas");
  const ctx = canvas.getContext("2d");
  const stateLabel = document.getElementById("morph-state");
  const targetLabel = document.getElementById("morph-target");
  const progressBar = document.getElementById("morph-progress");

  const HELIX_HEIGHT = 560;
  const HELIX_RADIUS = 132;
  const HELIX_TURNS = 2.0;
  const CUBE_SIZE = 300;
  const FOV = 950;

  // Authentic Rubik's face colors (right, left, top, bottom, front, back);
  // the white face becomes a cool gray so it stays visible on white.
  const FACE_COLORS = ["#b71234", "#ff5800", "#c3cad3", "#ffd500", "#009b48", "#0046ad"];
  // Watson-Crick base pairs: A (green) - T (red), G (amber) - C (blue)
  const BASE_PAIRS = [
    ["#34a853", "#ea4335"], // A-T
    ["#ea4335", "#34a853"], // T-A
    ["#fbbc04", "#4285f4"], // G-C
    ["#4285f4", "#fbbc04"], // C-G
  ];
  const STRAND_A = "#1a73e8";
  const STRAND_B = "#12b5cb";

  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ---------- build DNA targets ---------- */
  // Two smooth backbone strands + discrete base-pair rungs, each rung a
  // short bar of particles split into its two complementary base colors.
  const particles = [];
  const nStrand = 160;
  const NUM_RUNGS = 22;
  const RUNG_PARTICLES = 8;
  const rungRanges = []; // particle index ranges, used to draw rung lines

  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < nStrand; i++) {
      const f = i / (nStrand - 1);
      const theta = f * HELIX_TURNS * Math.PI * 2 + s * Math.PI;
      particles.push({
        dna: {
          x: Math.cos(theta) * HELIX_RADIUS,
          y: (f - 0.5) * HELIX_HEIGHT,
          z: Math.sin(theta) * HELIX_RADIUS,
        },
        dnaColor: hexToRgb(s === 0 ? STRAND_A : STRAND_B),
        size: 3.0,
      });
    }
  }

  for (let k = 0; k < NUM_RUNGS; k++) {
    const f = (k + 0.5) / NUM_RUNGS;
    const theta = f * HELIX_TURNS * Math.PI * 2;
    const ax = Math.cos(theta) * HELIX_RADIUS;
    const az = Math.sin(theta) * HELIX_RADIUS;
    const y = (f - 0.5) * HELIX_HEIGHT;
    const pair = BASE_PAIRS[((k * 2654435761) >>> 0) % 4];
    const start = particles.length;

    // invisible anchor on strand A so the rung line meets the backbone
    particles.push({ dna: { x: ax, y, z: az }, dnaColor: hexToRgb(pair[0]), size: 0 });
    for (let j = 0; j < RUNG_PARTICLES; j++) {
      // two groups of four with a small gap at the pair junction
      const t = j < 4 ? 0.10 + j * 0.12 : 0.54 + (j - 4) * 0.12;
      particles.push({
        dna: { x: lerp(ax, -ax, t), y, z: lerp(az, -az, t) },
        dnaColor: hexToRgb(j < 4 ? pair[0] : pair[1]),
        size: 2.6,
      });
    }
    // invisible anchor on strand B
    particles.push({ dna: { x: -ax, y, z: -az }, dnaColor: hexToRgb(pair[1]), size: 0 });
    rungRanges.push({ start, count: RUNG_PARTICLES + 2 });
  }

  /* ---------- build Rubik's cube targets ---------- */
  // Particles are distributed over sticker cells on the 6 faces.
  const half = CUBE_SIZE / 2;
  const cell = CUBE_SIZE / 3;

  particles.forEach((p, idx) => {
    const face = idx % 6;
    const sticker = Math.floor(idx / 6) % 9;
    const row = Math.floor(sticker / 3);
    const col = sticker % 3;
    // jitter inside the sticker, leaving a margin so the 3x3 grid reads visually
    const m = 0.30;
    const u = (col + m + Math.random() * (1 - 2 * m)) * cell - half;
    const v = (row + m + Math.random() * (1 - 2 * m)) * cell - half;

    let pos;
    switch (face) {
      case 0: pos = { x: half, y: u, z: v }; break;   // +X
      case 1: pos = { x: -half, y: u, z: v }; break;  // -X
      case 2: pos = { x: u, y: half, z: v }; break;   // +Y
      case 3: pos = { x: u, y: -half, z: v }; break;  // -Y
      case 4: pos = { x: u, y: v, z: half }; break;   // +Z
      default: pos = { x: u, y: v, z: -half };        // -Z
    }
    p.cube = pos;
    p.cubeColor = hexToRgb(FACE_COLORS[face]);
    p.twist = null; // populated during layer twists
  });

  /* ---------- build human targets ---------- */
  // The third form: a healthy human figure (face, long hair, waving arm,
  // legs) — the mission: DNA -> solved puzzle -> grown, healthy person.
  const HUMAN_COLORS = {
    hair: "#f9ab00",
    face: "#1a73e8",
    body: "#34a853",
    legs: "#12b5cb",
  };
  const humanPoints = [];

  function addPolyline(pts, count, color, jitter = 3) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segs.push(L);
      total += L;
    }
    for (let k = 0; k < count; k++) {
      let d = ((k + 0.5) / count) * total;
      let i = 0;
      while (d > segs[i] && i < segs.length - 1) { d -= segs[i]; i++; }
      const t = segs[i] ? d / segs[i] : 0;
      humanPoints.push({
        x: lerp(pts[i][0], pts[i + 1][0], t) + (Math.random() - 0.5) * jitter,
        y: lerp(pts[i][1], pts[i + 1][1], t) + (Math.random() - 0.5) * jitter,
        z: (Math.random() - 0.5) * 14,
        color: hexToRgb(color),
      });
    }
  }

  function addBezier(p0, p1, p2, count, color, jitter = 5) {
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      humanPoints.push({
        x: a * p0[0] + b * p1[0] + c * p2[0] + (Math.random() - 0.5) * jitter,
        y: a * p0[1] + b * p1[1] + c * p2[1] + (Math.random() - 0.5) * jitter,
        z: (Math.random() - 0.5) * 16,
        color: hexToRgb(color),
      });
    }
  }

  function addCircle(cx0, cy0, r, count, color) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      humanPoints.push({
        x: cx0 + Math.cos(a) * r,
        y: cy0 + Math.sin(a) * r,
        z: (Math.random() - 0.5) * 10,
        color: hexToRgb(color),
      });
    }
  }

  // head + face (y is negative upward in model space)
  addCircle(0, -185, 34, 56, HUMAN_COLORS.face);
  addCircle(-12, -192, 3, 6, HUMAN_COLORS.face);                 // left eye
  addCircle(12, -192, 3, 6, HUMAN_COLORS.face);                  // right eye
  addPolyline([[-14, -172], [-7, -167], [0, -165], [7, -167], [14, -172]], 16, HUMAN_COLORS.face, 1.5); // smile
  // long hair: flowing strands down both sides
  for (let s = 0; s < 4; s++) {
    addBezier([-4 - s * 3, -219 + s], [-42 - s * 8, -150 - s * 6], [-32 - s * 9, -40 + s * 14], 22, HUMAN_COLORS.hair);
    addBezier([4 + s * 3, -219 + s], [42 + s * 8, -150 - s * 6], [32 + s * 9, -40 + s * 14], 22, HUMAN_COLORS.hair);
  }
  // torso
  addPolyline([[0, -151], [0, -135]], 10, HUMAN_COLORS.body);    // neck
  addPolyline([[-50, -128], [50, -128]], 22, HUMAN_COLORS.body); // shoulders
  addPolyline([[0, -128], [0, -12]], 26, HUMAN_COLORS.body);     // spine
  addPolyline([[-50, -128], [-32, -12]], 22, HUMAN_COLORS.body);
  addPolyline([[50, -128], [32, -12]], 22, HUMAN_COLORS.body);
  addPolyline([[-32, -12], [32, -12]], 14, HUMAN_COLORS.body);   // hips
  // arms: left relaxed, right raised and waving
  addPolyline([[-50, -128], [-82, -62], [-88, 8]], 36, HUMAN_COLORS.body);
  addPolyline([[50, -128], [88, -180], [98, -235]], 36, HUMAN_COLORS.body);
  addCircle(-88, 14, 7, 8, HUMAN_COLORS.body);                   // left hand
  addCircle(100, -242, 7, 8, HUMAN_COLORS.body);                 // right hand
  // legs + feet
  addPolyline([[-18, -12], [-28, 115], [-32, 235]], 42, HUMAN_COLORS.legs);
  addPolyline([[18, -12], [28, 115], [32, 235]], 42, HUMAN_COLORS.legs);
  addPolyline([[-32, 235], [-52, 240]], 8, HUMAN_COLORS.legs);
  addPolyline([[32, 235], [52, 240]], 8, HUMAN_COLORS.legs);

  particles.forEach((p, idx) => {
    const hp = humanPoints[idx % humanPoints.length];
    p.human = { x: hp.x, y: hp.y, z: hp.z };
    p.humanColor = hp.color;
  });

  /* ---------- morph state machine ---------- */
  // cycle: helix -> cube (with layer twist) -> human -> helix
  const PHASES = [
    { name: "holdDna", from: "dna", to: "cube", dur: 3600, transition: false },
    { name: "toCube", from: "dna", to: "cube", dur: 2600, transition: true },
    { name: "holdCube", from: "cube", to: "human", dur: 4600, transition: false },
    { name: "toHuman", from: "cube", to: "human", dur: 2600, transition: true },
    { name: "holdHuman", from: "human", to: "dna", dur: 4200, transition: false },
    { name: "toDna", from: "human", to: "dna", dur: 2600, transition: true },
  ];
  const SHAPE_LABEL = { dna: "HELIX", cube: "CUBE", human: "HUMAN" };
  let phaseIndex = 0;
  let phaseStart = performance.now();
  let currentMove = null;

  // ?state=dna / ?state=cube / ?state=human pins the morph (testing/screenshots)
  const forcedState = new URLSearchParams(location.search).get("state");

  function rotatePoint(p, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === "x") return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
    if (axis === "y") return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }

  function pickMove() {
    const axes = ["x", "y", "z"];
    const axis = axes[Math.floor(Math.random() * 3)];
    const layer = [-1, 0, 1][Math.floor(Math.random() * 3)];
    const dir = Math.random() > 0.5 ? 1 : -1;
    const members = particles.filter((p) => {
      const coord = p.cube[axis];
      // which third of the cube this particle sits in
      const idx = coord < -half / 3 ? -1 : coord > half / 3 ? 1 : 0;
      return idx === layer;
    });
    return { axis, dir, members };
  }

  function commitMove(move) {
    move.members.forEach((p) => {
      p.cube = rotatePoint(p.cube, move.axis, (Math.PI / 2) * move.dir);
      p.twist = null;
    });
  }

  /* ---------- canvas sizing ---------- */
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ---------- render loop ---------- */
  function frame(now) {
    const phase = PHASES[phaseIndex];
    let elapsed = now - phaseStart;

    if (elapsed >= phase.dur) {
      if (phase.name === "holdCube" && currentMove) {
        commitMove(currentMove);
        currentMove = null;
      }
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      phaseStart = now;
      elapsed = 0;
      if (PHASES[phaseIndex].name === "holdCube") currentMove = pickMove();
    }

    const pt = elapsed / phase.dur;

    // blend between the phase's two shapes; t = 0 shows `from`
    let fromShape = phase.from;
    let toShape = phase.to;
    let t = phase.transition ? easeInOut(pt) : 0;
    if (forcedState && SHAPE_LABEL[forcedState]) {
      fromShape = toShape = forcedState;
      t = 0;
    }

    // layer twist runs in the middle of the cube hold
    let twistAngle = 0;
    if (phase.name === "holdCube" && currentMove) {
      const tw = Math.min(Math.max((pt - 0.25) / 0.5, 0), 1);
      twistAngle = easeInOut(tw) * (Math.PI / 2) * currentMove.dir;
      currentMove.members.forEach((p) => {
        p.twist = rotatePoint(p.cube, currentMove.axis, twistAngle);
      });
    }

    // UI labels
    stateLabel.textContent = SHAPE_LABEL[fromShape];
    targetLabel.textContent = SHAPE_LABEL[toShape];
    progressBar.style.width = `${t * 100}%`;
    stateLabel.style.color = t < 0.5 ? "#1a73e8" : "";
    targetLabel.style.color = t >= 0.5 ? "#1a73e8" : "";

    // scene rotation
    const rotY = now * 0.00038;
    const rotX = 0.42 + Math.sin(now * 0.00019) * 0.1;
    const cy2 = Math.cos(rotY), sy2 = Math.sin(rotY);
    const cx2 = Math.cos(rotX), sx2 = Math.sin(rotX);

    const centerX = W > 900 ? W * 0.70 : W * 0.5;
    const centerY = H * 0.48;

    ctx.clearRect(0, 0, W, H);
    // normal compositing: additive blending washes out on a white background

    // slow spin of the DNA around its own axis so the helix visibly rotates
    const dnaSpin = now * 0.0006;

    // the human faces the viewer with a gentle sway instead of the full
    // scene rotation (a flat figure would vanish edge-on)
    const sway = Math.sin(now * 0.00045) * 0.24;
    const hcy = Math.cos(sway), hsy = Math.sin(sway);
    const hcx = Math.cos(0.05), hsx = Math.sin(0.05);

    const worldPos = (shape, p) => {
      let m, cy, sy, cx, sx;
      if (shape === "dna") {
        m = rotatePoint(p.dna, "y", dnaSpin);
        cy = cy2; sy = sy2; cx = cx2; sx = sx2;
      } else if (shape === "cube") {
        m = p.twist || p.cube;
        cy = cy2; sy = sy2; cx = cx2; sx = sx2;
      } else {
        m = p.human;
        cy = hcy; sy = hsy; cx = hcx; sx = hsx;
      }
      let x = m.x * cy + m.z * sy;
      let z = -m.x * sy + m.z * cy;
      const y = m.y * cx - z * sx;
      z = m.y * sx + z * cx;
      return { x, y, z };
    };

    const colorOf = (shape, p) =>
      shape === "dna" ? p.dnaColor : shape === "cube" ? p.cubeColor : p.humanColor;

    const proj = new Array(particles.length);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      const a = worldPos(fromShape, p);
      const b = t === 0 ? a : worldPos(toShape, p);
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      const z = lerp(a.z, b.z, t);

      const scale = FOV / (FOV + z);
      const sx = centerX + x * scale;
      const sy = centerY + y * scale;

      const cA = colorOf(fromShape, p);
      const cB = colorOf(toShape, p);
      const r = lerp(cA[0], cB[0], t) | 0;
      const g = lerp(cA[1], cB[1], t) | 0;
      const b2 = lerp(cA[2], cB[2], t) | 0;

      proj[i] = { sx, sy, z, scale, r, g, b: b2, size: p.size };
    }

    // connector lines make the helix read as DNA; they fade out as the
    // helix morphs into anything else
    const dnaWeight = (fromShape === "dna" ? 1 - t : 0) + (toShape === "dna" ? t : 0);
    const lineAlpha = Math.pow(dnaWeight, 2);
    if (lineAlpha > 0.02) {
      ctx.lineCap = "round";

      // backbone strands
      for (let s = 0; s < 2; s++) {
        for (let i = s * nStrand; i < s * nStrand + nStrand - 1; i++) {
          const a = proj[i], b2 = proj[i + 1];
          const sc = (a.scale + b2.scale) / 2;
          const alpha = lineAlpha * Math.min(Math.max(0.75 * sc - 0.2, 0.12), 0.6);
          ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},${alpha})`;
          ctx.lineWidth = 2.4 * sc;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b2.sx, b2.sy);
          ctx.stroke();
        }
      }

      // base-pair rungs (anchor -> bar particles -> anchor)
      for (const range of rungRanges) {
        for (let i = range.start; i < range.start + range.count - 1; i++) {
          const a = proj[i], b2 = proj[i + 1];
          const sc = (a.scale + b2.scale) / 2;
          const alpha = lineAlpha * Math.min(Math.max(0.65 * sc - 0.18, 0.1), 0.5);
          ctx.strokeStyle = `rgba(${b2.r},${b2.g},${b2.b},${alpha})`;
          ctx.lineWidth = 1.8 * sc;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b2.sx, b2.sy);
          ctx.stroke();
        }
      }
    }

    // painter's order: far particles first, dimmer
    const drawList = proj.filter((d) => d.size > 0).sort((a, b) => b.z - a.z);
    for (const d of drawList) {
      const alpha = Math.min(Math.max(0.35 + d.scale * 0.6, 0.22), 1);
      const rad = d.size * d.scale;
      // subtle soft halo behind each particle
      ctx.fillStyle = `rgba(${d.r},${d.g},${d.b},${alpha * 0.1})`;
      ctx.beginPath();
      ctx.arc(d.sx, d.sy, rad * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${d.r},${d.g},${d.b},${alpha})`;
      ctx.beginPath();
      ctx.arc(d.sx, d.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    requestAnimationFrame(frame);
  } else {
    // render a single static helix frame
    phaseStart = performance.now();
    requestAnimationFrame((t) => frame(t));
  }
})();

/* ============================================================
   Stat counters
   ============================================================ */
(() => {
  const nums = document.querySelectorAll(".stat__num");
  const seen = new WeakSet();

  const animate = (el) => {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !seen.has(e.target)) {
        seen.add(e.target);
        animate(e.target);
      }
    });
  }, { threshold: 0.5 });

  nums.forEach((n) => io.observe(n));
})();

/* ============================================================
   CUBESOLVER terminal typewriter
   ============================================================ */
(() => {
  const el = document.getElementById("terminal-text");
  if (!el) return;

  const LINES = [
    "$ cubesolver --patient MRN-88412 --tissue dermal",
    "",
    "[scan]   loading single-cell methylome......... done",
    "[scan]   scrambled state entropy: 14.82 bits",
    "[solve]  searching intervention space (IDA*)...",
    "[solve]  pruned 2.1e12 branches",
    "[solve]  optimal sequence found: 7 moves",
    "",
    "         OSK(48h) → NAD+ → SEN-clear(RD-117)",
    "         → OSK(24h) → TET2↑ → DNMT3a↓ → verify",
    "",
    "[rotate] simulating in silico................ done",
    "[verify] distance-to-solved: 14.82 → 3.07 bits",
    "[verify] predicted biological age: -11.4 yrs",
    "",
    "$ status: SOLVED ▊",
  ];

  let line = 0;
  let char = 0;
  let buffer = "";

  const type = () => {
    if (line >= LINES.length) {
      setTimeout(() => {
        line = 0;
        char = 0;
        buffer = "";
        el.textContent = "";
        type();
      }, 6000);
      return;
    }
    const current = LINES[line];
    if (char < current.length) {
      char++;
      el.textContent = buffer + current.slice(0, char);
      setTimeout(type, current.startsWith("$") ? 34 : 12);
    } else {
      buffer += current + "\n";
      el.textContent = buffer;
      line++;
      char = 0;
      setTimeout(type, current === "" ? 60 : 320);
    }
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        io.disconnect();
        type();
      }
    });
  }, { threshold: 0.4 });

  io.observe(el);
})();