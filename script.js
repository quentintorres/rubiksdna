/* ============================================================
   RUBIKS DNA — hero: DNA helix (with gene-block shuffle) <-> Rubik's cube
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
  // Two smooth backbone strands + discrete base-pair rungs. Positions are
  // generated from a parameter f (0..1 along the helix) so whole sections
  // can slide along the helix during the "gene shuffle" animation.
  const particles = [];
  const nStrand = 160;
  const NUM_RUNGS = 22;
  const RUNG_PARTICLES = 8;
  const rungRanges = []; // particle index ranges, used to draw rung lines

  const strandPos = (s, f, rMul = 1) => {
    const theta = f * HELIX_TURNS * Math.PI * 2 + s * Math.PI;
    return {
      x: Math.cos(theta) * HELIX_RADIUS * rMul,
      y: (f - 0.5) * HELIX_HEIGHT,
      z: Math.sin(theta) * HELIX_RADIUS * rMul,
    };
  };
  const rungPos = (f, t, rMul = 1) => {
    const a = strandPos(0, f, rMul), b = strandPos(1, f, rMul);
    return { x: lerp(a.x, b.x, t), y: a.y, z: lerp(a.z, b.z, t) };
  };

  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < nStrand; i++) {
      particles.push({
        gen: { kind: "strand", s },
        f: i / (nStrand - 1),
        dnaColor: hexToRgb(s === 0 ? STRAND_A : STRAND_B),
        size: 3.0,
      });
    }
  }

  for (let k = 0; k < NUM_RUNGS; k++) {
    const f = (k + 0.5) / NUM_RUNGS;
    const pair = BASE_PAIRS[((k * 2654435761) >>> 0) % 4];
    const start = particles.length;

    // invisible anchors (t = 0 / 1) so rung lines meet the backbones
    particles.push({ gen: { kind: "rung", t: 0 }, f, dnaColor: hexToRgb(pair[0]), size: 0 });
    for (let j = 0; j < RUNG_PARTICLES; j++) {
      // two groups of four with a small gap at the pair junction
      const t = j < 4 ? 0.10 + j * 0.12 : 0.54 + (j - 4) * 0.12;
      particles.push({
        gen: { kind: "rung", t },
        f,
        dnaColor: hexToRgb(j < 4 ? pair[0] : pair[1]),
        size: 2.6,
      });
    }
    particles.push({ gen: { kind: "rung", t: 1 }, f, dnaColor: hexToRgb(pair[1]), size: 0 });
    rungRanges.push({ start, count: RUNG_PARTICLES + 2 });
  }

  // model-space helix position for a particle's current parameters
  const dnaModel = (p) =>
    p.shufflePos ||
    (p.gen.kind === "strand" ? strandPos(p.gen.s, p.f) : rungPos(p.f, p.gen.t));

  /* ---------- mobile helix blocks ---------- */
  // Three sections of the helix are solid Rubik colors. During the DNA
  // hold they do a cube-style shuffle: lift off the axis, corkscrew along
  // the helix to another block's slot, and lock back in.
  const NUM_BANDS = 9;
  const BLOCKS = [
    { band: 1, color: "#ff5800" },
    { band: 4, color: "#a142f4" },
    { band: 7, color: "#009b48" },
  ];
  BLOCKS.forEach((blk, bi) => {
    const lo = blk.band / NUM_BANDS, hi = (blk.band + 1) / NUM_BANDS;
    const rgb = hexToRgb(blk.color);
    particles.forEach((p) => {
      if (p.f >= lo && p.f < hi) {
        p.block = bi;
        p.dnaColor = rgb; // whole section one color so the move reads
      }
    });
  });

  const blockSlots = BLOCKS.map((b) => b.band); // which band each block sits in now
  let activeMove = null; // { window, members: [{ p, fFrom, fTo }] }

  function startBlockSwap() {
    const i = Math.floor(Math.random() * BLOCKS.length);
    let j = Math.floor(Math.random() * (BLOCKS.length - 1));
    if (j >= i) j++;
    const di = (blockSlots[j] - blockSlots[i]) / NUM_BANDS;
    const members = [];
    particles.forEach((p) => {
      if (p.block === i) members.push({ p, fFrom: p.f, fTo: p.f + di });
      else if (p.block === j) members.push({ p, fFrom: p.f, fTo: p.f - di });
    });
    [blockSlots[i], blockSlots[j]] = [blockSlots[j], blockSlots[i]];
    return { members };
  }

  function commitBlockSwap(mv) {
    mv.members.forEach((m) => { m.p.f = m.fTo; m.p.shufflePos = null; });
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

  /* ---------- morph state machine ---------- */
  // cycle: helix (with block shuffle) -> cube (with layer twist) -> helix
  const PHASES = [
    { name: "holdDna", from: "dna", to: "cube", dur: 11000, transition: false },
    { name: "toCube", from: "dna", to: "cube", dur: 2600, transition: true },
    { name: "holdCube", from: "cube", to: "dna", dur: 4600, transition: false },
    { name: "toDna", from: "cube", to: "dna", dur: 2600, transition: true },
  ];
  const SHAPE_LABEL = { dna: "HELIX", cube: "CUBE" };
  // block shuffles run in these windows of the DNA hold (after ~one spin)
  const MOVE_WINDOWS = [[0.50, 0.66], [0.74, 0.90]];
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

    // spin of the DNA around its own axis so the helix visibly rotates
    const dnaSpin = now * 0.0011;

    // gene-block shuffle: after ~one spin of the DNA hold, two colored
    // blocks lift off the axis and corkscrew along the helix to swap slots
    if (phase.name === "holdDna") {
      const w = MOVE_WINDOWS.findIndex(([w0, w1]) => pt >= w0 && pt < w1);
      if (w !== -1) {
        if (!activeMove || activeMove.window !== w) {
          if (activeMove) commitBlockSwap(activeMove);
          activeMove = Object.assign(startBlockSwap(), { window: w });
        }
        const [w0, w1] = MOVE_WINDOWS[w];
        const wt = (pt - w0) / (w1 - w0);
        const prog = easeInOut(wt);
        const lift = 1 + 0.45 * Math.sin(Math.PI * wt); // out, across, back in
        activeMove.members.forEach((m) => {
          const f = lerp(m.fFrom, m.fTo, prog);
          m.p.shufflePos = m.p.gen.kind === "strand"
            ? strandPos(m.p.gen.s, f, lift)
            : rungPos(f, m.p.gen.t, lift);
        });
      } else if (activeMove) {
        commitBlockSwap(activeMove);
        activeMove = null;
      }
    } else if (activeMove) {
      commitBlockSwap(activeMove);
      activeMove = null;
    }

    const worldPos = (shape, p) => {
      const m = shape === "dna" ? rotatePoint(dnaModel(p), "y", dnaSpin) : p.twist || p.cube;
      let x = m.x * cy2 + m.z * sy2;
      let z = -m.x * sy2 + m.z * cy2;
      const y = m.y * cx2 - z * sx2;
      z = m.y * sx2 + z * cx2;
      return { x, y, z };
    };

    const colorOf = (shape, p) => (shape === "dna" ? p.dnaColor : p.cubeColor);

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

      // backbone strands (skip stretches where a shuffled block has moved
      // away from its array neighbours — the gap makes blocks read as
      // detachable cassettes)
      const fStep = 1 / (nStrand - 1);
      for (let s = 0; s < 2; s++) {
        for (let i = s * nStrand; i < s * nStrand + nStrand - 1; i++) {
          if (Math.abs(particles[i + 1].f - particles[i].f) > 2.5 * fStep) continue;
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
    "$ cubesolver --demo synthetic-sample --tissue dermal",
    "# simulated output — no real data, no real results",
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