(() => {
  const canvas = document.getElementById("spaceBg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PALETTES = {
    idle: {
      skyTop: [8, 14, 34],
      skyBottom: [5, 8, 20],
      nebulaA: [64, 96, 220],
      nebulaB: [96, 78, 200],
      nebulaC: [40, 130, 210],
      starTint: [206, 224, 255],
      sunCore: [255, 246, 214],
      sunGlow: [96, 150, 255],
      nebulaAlpha: 0.3,
      starBrightness: 0.75,
      twinkle: 0.35,
      starDrift: 0.08,
      orbitSpeed: 0.55,
      sunPulse: 0.05,
      cometChance: 0.0025,
      vignette: 0.5,
    },
    recording: {
      skyTop: [6, 26, 34],
      skyBottom: [4, 12, 24],
      nebulaA: [46, 230, 166],
      nebulaB: [50, 180, 255],
      nebulaC: [120, 235, 190],
      starTint: [222, 255, 244],
      sunCore: [255, 255, 236],
      sunGlow: [64, 240, 190],
      nebulaAlpha: 0.42,
      starBrightness: 1,
      twinkle: 0.5,
      starDrift: 0.55,
      orbitSpeed: 2.1,
      sunPulse: 0.14,
      cometChance: 0.02,
      vignette: 0.36,
    },
    paused: {
      skyTop: [20, 12, 40],
      skyBottom: [8, 6, 22],
      nebulaA: [150, 104, 255],
      nebulaB: [190, 96, 220],
      nebulaC: [92, 70, 190],
      starTint: [226, 212, 255],
      sunCore: [255, 234, 250],
      sunGlow: [176, 120, 255],
      nebulaAlpha: 0.26,
      starBrightness: 0.5,
      twinkle: 0.12,
      starDrift: 0.03,
      orbitSpeed: 0.12,
      sunPulse: 0.03,
      cometChance: 0,
      vignette: 0.62,
    },
  };

  const NUMERIC_KEYS = [
    "nebulaAlpha",
    "starBrightness",
    "twinkle",
    "starDrift",
    "orbitSpeed",
    "sunPulse",
    "cometChance",
    "vignette",
  ];
  const COLOR_KEYS = [
    "skyTop",
    "skyBottom",
    "nebulaA",
    "nebulaB",
    "nebulaC",
    "starTint",
    "sunCore",
    "sunGlow",
  ];

  const clone = (p) => JSON.parse(JSON.stringify(p));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;

  let target = PALETTES.idle;
  let cur = clone(PALETTES.idle);
  let stateName = "idle";

  let width = 0;
  let height = 0;
  let scale = 1;
  let time = 0;

  const stars = [];
  const dust = [];
  const comets = [];

  const SYSTEMS = [
    {
      x: 0.84,
      y: 0.15,
      sun: 11,
      tint: [255, 224, 168],
      planets: [
        { orbit: 34, size: 4.2, speed: 1.35, phase: 0.4, base: [96, 150, 255], ring: false },
        { orbit: 56, size: 6.4, speed: 0.78, phase: 2.1, base: [190, 150, 255], ring: true },
        { orbit: 82, size: 3.4, speed: 0.46, phase: 4.2, base: [110, 235, 200], ring: false },
      ],
    },
    {
      x: 0.1,
      y: 0.82,
      sun: 7.5,
      tint: [255, 190, 150],
      planets: [
        { orbit: 26, size: 3.4, speed: 1.6, phase: 1.2, base: [255, 160, 120], ring: false },
        { orbit: 44, size: 5, speed: 0.9, phase: 3.4, base: [240, 205, 120], ring: false },
      ],
    },
    {
      x: 0.6,
      y: 1.02,
      sun: 5.5,
      tint: [190, 220, 255],
      planets: [{ orbit: 22, size: 3, speed: 1.9, phase: 0.9, base: [150, 200, 255], ring: false }],
    },
  ];

  const NEBULAE = [
    { x: 0.16, y: 0.12, r: 0.62, key: "nebulaA", drift: 0.00012, weight: 1 },
    { x: 0.9, y: 0.28, r: 0.5, key: "nebulaB", drift: -0.00009, weight: 0.85 },
    { x: 0.42, y: 0.92, r: 0.58, key: "nebulaC", drift: 0.00007, weight: 0.7 },
  ];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    scale = Math.min(width, height) / 560;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    stars.length = 0;
    for (let i = 0; i < 150; i += 1) {
      const depth = Math.random();
      stars.push({
        x: Math.random(),
        y: Math.random(),
        depth,
        radius: 0.4 + depth * 1.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
        warm: Math.random() > 0.82,
      });
    }

    dust.length = 0;
    for (let i = 0; i < 40; i += 1) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        radius: 0.3 + Math.random() * 0.5,
        alpha: 0.05 + Math.random() * 0.12,
      });
    }
  }

  function stepPalette() {
    const t = reducedMotion ? 1 : 0.035;
    for (const key of NUMERIC_KEYS) cur[key] = lerp(cur[key], target[key], t);
    for (const key of COLOR_KEYS) {
      for (let i = 0; i < 3; i += 1) {
        cur[key][i] = lerp(cur[key][i], target[key][i], t);
      }
    }
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, width * 0.35, height);
    grad.addColorStop(0, rgba(cur.skyTop, 1));
    grad.addColorStop(1, rgba(cur.skyBottom, 1));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function drawNebulae() {
    ctx.globalCompositeOperation = "lighter";
    for (const neb of NEBULAE) {
      const nx = (neb.x + Math.sin(time * neb.drift * 60) * 0.03) * width;
      const ny = (neb.y + Math.cos(time * neb.drift * 45) * 0.025) * height;
      const nr = neb.r * Math.max(width, height) * 0.7;
      const color = cur[neb.key];
      const alpha = cur.nebulaAlpha * neb.weight;

      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      g.addColorStop(0, rgba(color, alpha * 0.55));
      g.addColorStop(0.35, rgba(color, alpha * 0.22));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawStars() {
    ctx.globalCompositeOperation = "lighter";

    for (const speck of dust) {
      ctx.beginPath();
      ctx.arc(speck.x * width, speck.y * height, speck.radius, 0, Math.PI * 2);
      ctx.fillStyle = rgba(cur.starTint, speck.alpha * cur.starBrightness);
      ctx.fill();
    }

    for (const star of stars) {
      const twinkle = 1 - cur.twinkle + Math.sin(time * 0.0016 * star.speed + star.phase) * cur.twinkle;
      const drift = (time * 0.00002 * cur.starDrift * (0.35 + star.depth)) % 1;
      const sx = ((star.x + drift) % 1) * width;
      const sy = star.y * height;
      const r = star.radius * (0.7 + star.depth * 0.6);
      const alpha = Math.max(0, cur.starBrightness * twinkle * (0.35 + star.depth * 0.65));
      const tint = star.warm ? [255, 228, 200] : cur.starTint;

      if (star.depth > 0.72) {
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5);
        glow.addColorStop(0, rgba(tint, alpha * 0.5));
        glow.addColorStop(1, rgba(tint, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tint, alpha);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawSun(cx, cy, radius, tint) {
    const pulse = 1 + Math.sin(time * 0.002) * cur.sunPulse;
    const r = radius * scale * pulse;

    ctx.globalCompositeOperation = "lighter";

    const corona = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 7);
    corona.addColorStop(0, rgba(cur.sunGlow, 0.35));
    corona.addColorStop(0.35, rgba(cur.sunGlow, 0.12));
    corona.addColorStop(1, rgba(cur.sunGlow, 0));
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 7, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
    body.addColorStop(0, rgba(cur.sunCore, 1));
    body.addColorStop(0.45, rgba(tint, 0.9));
    body.addColorStop(1, rgba(cur.sunGlow, 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  }

  function drawPlanet(px, py, size, base, sunX, sunY, hasRing, tilt) {
    const r = size * scale;
    const dx = sunX - px;
    const dy = sunY - py;
    const len = Math.hypot(dx, dy) || 1;
    const lightX = px + (dx / len) * r * 0.45;
    const lightY = py + (dy / len) * r * 0.45;

    if (hasRing) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 2.1, r * 0.62, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = rgba(base, 0.5);
      ctx.lineWidth = Math.max(1, r * 0.28);
      ctx.stroke();
      ctx.restore();
    }

    const glow = ctx.createRadialGradient(px, py, r * 0.6, px, py, r * 2.6);
    glow.addColorStop(0, rgba(base, 0.28));
    glow.addColorStop(1, rgba(base, 0));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const sphere = ctx.createRadialGradient(lightX, lightY, r * 0.1, px, py, r * 1.15);
    sphere.addColorStop(0, rgba([base[0] + 55, base[1] + 55, base[2] + 55], 1));
    sphere.addColorStop(0.55, rgba(base, 1));
    sphere.addColorStop(1, rgba([base[0] * 0.16, base[1] * 0.18, base[2] * 0.28], 1));
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    if (hasRing) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 2.1, r * 0.62, 0, 0, Math.PI);
      ctx.strokeStyle = rgba([base[0] + 40, base[1] + 40, base[2] + 40], 0.75);
      ctx.lineWidth = Math.max(1, r * 0.28);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSystems() {
    for (const sys of SYSTEMS) {
      const cx = sys.x * width;
      const cy = sys.y * height;

      for (const planet of sys.planets) {
        const orbitR = planet.orbit * scale;
        ctx.beginPath();
        ctx.ellipse(cx, cy, orbitR, orbitR * 0.42, -0.42, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(cur.starTint, 0.055);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      drawSun(cx, cy, sys.sun, sys.tint);

      for (const planet of sys.planets) {
        const angle = planet.phase + time * 0.00022 * planet.speed * cur.orbitSpeed;
        const orbitR = planet.orbit * scale;
        const ox = Math.cos(angle) * orbitR;
        const oy = Math.sin(angle) * orbitR * 0.42;
        const rot = -0.42;
        const px = cx + ox * Math.cos(rot) - oy * Math.sin(rot);
        const py = cy + ox * Math.sin(rot) + oy * Math.cos(rot);
        drawPlanet(px, py, planet.size, planet.base, cx, cy, planet.ring, -0.5);
      }
    }
  }

  function spawnComet() {
    comets.push({
      x: Math.random() * width * 0.6,
      y: -20,
      vx: 2.2 + Math.random() * 1.8,
      vy: 1.5 + Math.random() * 1.2,
      life: 1,
      len: 60 + Math.random() * 70,
    });
  }

  function drawComets() {
    if (!reducedMotion && Math.random() < cur.cometChance && comets.length < 3) spawnComet();

    ctx.globalCompositeOperation = "lighter";
    for (let i = comets.length - 1; i >= 0; i -= 1) {
      const c = comets[i];
      c.x += c.vx;
      c.y += c.vy;
      c.life -= 0.006;

      if (c.life <= 0 || c.x > width + 100 || c.y > height + 100) {
        comets.splice(i, 1);
        continue;
      }

      const tailX = c.x - c.vx * (c.len / 3);
      const tailY = c.y - c.vy * (c.len / 3);
      const tail = ctx.createLinearGradient(c.x, c.y, tailX, tailY);
      tail.addColorStop(0, rgba(cur.sunGlow, 0.7 * c.life));
      tail.addColorStop(1, rgba(cur.sunGlow, 0));
      ctx.strokeStyle = tail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      const head = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 7);
      head.addColorStop(0, rgba([255, 255, 255], 0.9 * c.life));
      head.addColorStop(1, rgba(cur.sunGlow, 0));
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      Math.min(width, height) * 0.12,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.78
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(3, 5, 14, ${cur.vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  }

  function frame() {
    stepPalette();
    drawSky();
    drawNebulae();
    drawStars();
    drawSystems();
    drawComets();
    drawVignette();
    if (!reducedMotion) time += 16;
    requestAnimationFrame(frame);
  }

  function setState(next) {
    if (!PALETTES[next] || next === stateName) return;
    stateName = next;
    target = PALETTES[next];
    document.body.dataset.bgState = next;
  }

  resize();
  seed();
  window.addEventListener("resize", resize);
  document.body.dataset.bgState = "idle";

  if (reducedMotion) {
    stepPalette();
    drawSky();
    drawNebulae();
    drawStars();
    drawSystems();
    drawVignette();
  } else {
    requestAnimationFrame(frame);
  }

  window.spaceBg = { setState, setAccent() {} };
})();
