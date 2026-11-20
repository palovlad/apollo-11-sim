export interface Star {
  x: number;
  y: number;
  size: number;
  depth: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  tint: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

export const WORLD_W = 1200;
export const WORLD_H = 675;

// Deterministic PRNG for repeatable stars and lunar terrain features
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStarfield(count = 190, seed = 1969): Star[] {
  const rand = mulberry32(seed);
  const tints = ['#ffffff', '#e4f0ff', '#fff4df', '#cfe3ff', '#d5ffe8'];
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const layerPick = rand();
    const depth = layerPick < 0.55 ? 0.25 : layerPick < 0.85 ? 0.6 : 1.0;
    stars.push({
      x: rand() * WORLD_W,
      y: rand() * WORLD_H,
      size: depth === 1.0 ? 1.5 + rand() * 1.1 : depth === 0.6 ? 1.0 + rand() * 0.8 : 0.7 + rand() * 0.5,
      depth,
      baseAlpha: 0.35 + rand() * 0.6,
      twinklePhase: rand() * Math.PI * 2,
      twinkleSpeed: 0.8 + rand() * 2.2,
      tint: tints[Math.floor(rand() * tints.length)],
    });
  }
  return stars;
}

export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  time: number,
  parallaxX: number,
  parallaxY: number
): void {
  // Deep space subtle vertical gradient
  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, '#03060a');
  bg.addColorStop(0.65, '#060c12');
  bg.addColorStop(1, '#080e14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Subtle retro orbital telemetry crosshair ticks in far background
  ctx.save();
  ctx.strokeStyle = 'rgba(61, 255, 139, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 150; x < WORLD_W; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x, 32);
    ctx.moveTo(x, WORLD_H - 32);
    ctx.lineTo(x, WORLD_H - 22);
    ctx.stroke();
  }
  ctx.restore();

  // Stars with parallax wrapping
  for (const s of stars) {
    const px = ((s.x - parallaxX * s.depth) % WORLD_W + WORLD_W) % WORLD_W;
    const py = ((s.y - parallaxY * s.depth) % WORLD_H + WORLD_H) % WORLD_H;
    const twinkle = 0.72 + 0.28 * Math.sin(time * s.twinkleSpeed + s.twinklePhase);
    ctx.globalAlpha = s.baseAlpha * twinkle;
    ctx.fillStyle = s.tint;
    ctx.beginPath();
    ctx.arc(px, py, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawEarth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  time: number
): void {
  ctx.save();

  // Atmospheric outer glow
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.48);
  glow.addColorStop(0, 'rgba(64, 165, 255, 0.42)');
  glow.addColorStop(0.5, 'rgba(30, 110, 220, 0.14)');
  glow.addColorStop(1, 'rgba(10, 40, 120, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.48, 0, Math.PI * 2);
  ctx.fill();

  // Clip planet disc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Ocean base
  const ocean = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.3,
    radius * 0.1,
    cx,
    cy,
    radius * 1.05
  );
  ocean.addColorStop(0, '#3898ff');
  ocean.addColorStop(0.55, '#1353a8');
  ocean.addColorStop(1, '#061c42');
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Stylized continents (subtle drift)
  const drift = Math.sin(time * 0.04) * radius * 0.06;
  ctx.fillStyle = 'rgba(72, 168, 108, 0.62)';
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.25 + drift, cy - radius * 0.18, radius * 0.34, radius * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.22 + drift, cy + radius * 0.12, radius * 0.28, radius * 0.32, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(195, 178, 120, 0.38)';
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.18 + drift, cy - radius * 0.02, radius * 0.15, radius * 0.11, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Cloud swirls
  ctx.strokeStyle = 'rgba(235, 248, 255, 0.45)';
  ctx.lineWidth = Math.max(2, radius * 0.065);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx - radius * 0.1, cy - radius * 0.28, radius * 0.55, -0.8, 0.65);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.5, radius * 0.05);
  ctx.beginPath();
  ctx.arc(cx + radius * 0.15, cy + radius * 0.35, radius * 0.48, 2.4, 3.8);
  ctx.stroke();

  // Night terminator shadow
  const shadow = ctx.createRadialGradient(
    cx - radius * 0.45,
    cy - radius * 0.35,
    radius * 0.45,
    cx + radius * 0.15,
    cy + radius * 0.15,
    radius * 1.2
  );
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(0.68, 'rgba(2, 8, 20, 0.25)');
  shadow.addColorStop(1, 'rgba(1, 5, 12, 0.85)');
  ctx.fillStyle = shadow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // Thin crisp retro rim
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 210, 255, 0.55)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawMoonOrb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  showRetroGrid = true
): void {
  ctx.save();

  // Soft lunar albedo halo
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.25);
  halo.addColorStop(0, 'rgba(210, 224, 215, 0.16)');
  halo.addColorStop(1, 'rgba(210, 224, 215, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Lunar surface base gradient
  const base = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.35,
    radius * 0.08,
    cx,
    cy,
    radius * 1.08
  );
  base.addColorStop(0, '#cfd4d8');
  base.addColorStop(0.55, '#8f969d');
  base.addColorStop(1, '#3b4047');
  ctx.fillStyle = base;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Basaltic Maria (Sea of Tranquility, Serenity, etc.)
  const maria = [
    { dx: 0.16, dy: -0.08, rx: 0.26, ry: 0.2, rot: 0.25 },
    { dx: -0.22, dy: -0.18, rx: 0.22, ry: 0.28, rot: -0.35 },
    { dx: 0.02, dy: 0.25, rx: 0.3, ry: 0.16, rot: 0.1 },
    { dx: -0.3, dy: 0.15, rx: 0.18, ry: 0.22, rot: 0.5 },
  ];
  ctx.fillStyle = 'rgba(42, 47, 54, 0.42)';
  for (const m of maria) {
    ctx.beginPath();
    ctx.ellipse(
      cx + m.dx * radius,
      cy + m.dy * radius,
      m.rx * radius,
      m.ry * radius,
      m.rot,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Procedural craters
  const craters = [
    { dx: -0.12, dy: -0.34, r: 0.11 },
    { dx: 0.3, dy: -0.22, r: 0.09 },
    { dx: -0.35, dy: 0.02, r: 0.12 },
    { dx: 0.18, dy: 0.12, r: 0.08 },
    { dx: -0.05, dy: 0.06, r: 0.06 },
    { dx: 0.05, dy: -0.15, r: 0.055 },
    { dx: -0.18, dy: 0.32, r: 0.095 },
    { dx: 0.36, dy: 0.22, r: 0.07 },
  ];
  for (const c of craters) {
    const x = cx + c.dx * radius;
    const y = cy + c.dy * radius;
    const r = c.r * radius;
    ctx.fillStyle = 'rgba(26, 30, 36, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(235, 240, 244, 0.32)';
    ctx.lineWidth = Math.max(1, radius * 0.012);
    ctx.beginPath();
    ctx.arc(x, y, r, 0.3, 2.8);
    ctx.stroke();
  }

  // Subtle retro NASA radar latitude arcs
  if (showRetroGrid) {
    ctx.strokeStyle = 'rgba(61, 255, 139, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 0.98, radius * 0.32, -0.15, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shadow limb
  const limb = ctx.createRadialGradient(
    cx - radius * 0.35,
    cy - radius * 0.4,
    radius * 0.55,
    cx + radius * 0.2,
    cy + radius * 0.2,
    radius * 1.15
  );
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.7, 'rgba(4, 7, 10, 0.22)');
  limb.addColorStop(1, 'rgba(2, 4, 8, 0.78)');
  ctx.fillStyle = limb;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // Subtle highlight rim
  ctx.save();
  ctx.strokeStyle = 'rgba(220, 232, 228, 0.38)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the Apollo CSM + LM stack oriented along `angleRad` (0 = pointing right).
 */
export function drawApolloStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  throttle: number,
  rcsDir: -1 | 0 | 1,
  withBooster: boolean,
  scale = 1,
  time = 0
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.scale(scale, scale);

  // Main Engine Plume
  if (throttle > 0.02) {
    const flicker = 0.85 + 0.3 * Math.sin(time * 55);
    const plumeLen = (26 + throttle * 52) * flicker;
    const nozzleX = withBooster ? -36 : -22;

    const grad = ctx.createLinearGradient(nozzleX, 0, nozzleX - plumeLen, 0);
    grad.addColorStop(0, 'rgba(255, 255, 240, 0.96)');
    grad.addColorStop(0.28, 'rgba(255, 195, 70, 0.88)');
    grad.addColorStop(0.7, 'rgba(255, 105, 30, 0.42)');
    grad.addColorStop(1, 'rgba(255, 70, 10, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(nozzleX, -5.5);
    ctx.quadraticCurveTo(nozzleX - plumeLen * 0.45, -10 * throttle, nozzleX - plumeLen, 0);
    ctx.quadraticCurveTo(nozzleX - plumeLen * 0.45, 10 * throttle, nozzleX, 5.5);
    ctx.closePath();
    ctx.fill();
  }

  // RCS Thruster Puffs
  if (rcsDir !== 0) {
    const puffY = rcsDir > 0 ? -10 : 10;
    const puffDir = rcsDir > 0 ? -1 : 1;
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(6, puffY);
    ctx.lineTo(6, puffY + puffDir * (14 + Math.random() * 6));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, -puffY);
    ctx.lineTo(-14, -puffY - puffDir * (12 + Math.random() * 5));
    ctx.stroke();
  }

  if (withBooster) {
    // S-IVB Third Stage body
    ctx.fillStyle = '#dde4ea';
    ctx.strokeStyle = '#3dff8b';
    ctx.lineWidth = 1;
    ctx.fillRect(-31, -8, 22, 16);

    // Black roll pattern stripe
    ctx.fillStyle = '#141b22';
    ctx.fillRect(-26, -8, 5, 16);

    // J-2 Engine bell
    ctx.fillStyle = '#53606c';
    ctx.beginPath();
    ctx.moveTo(-31, -4);
    ctx.lineTo(-37, -6.5);
    ctx.lineTo(-37, 6.5);
    ctx.lineTo(-31, 4);
    ctx.closePath();
    ctx.fill();
  }

  // Service Module (SM)
  const smX = withBooster ? -9 : -17;
  ctx.fillStyle = '#a4b2be';
  ctx.fillRect(smX, -6.5, 16, 13);
  ctx.strokeStyle = 'rgba(20, 30, 38, 0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(smX, -6.5, 16, 13);

  // SPS Engine Bell (when no S-IVB)
  if (!withBooster) {
    ctx.fillStyle = '#5c6a75';
    ctx.beginPath();
    ctx.moveTo(smX, -3.5);
    ctx.lineTo(smX - 6, -5.8);
    ctx.lineTo(smX - 6, 5.8);
    ctx.lineTo(smX, 3.5);
    ctx.closePath();
    ctx.fill();
  }

  // Command Module (CM) cone
  const cmBase = smX + 16;
  ctx.fillStyle = '#d9e3eb';
  ctx.beginPath();
  ctx.moveTo(cmBase, -6.5);
  ctx.lineTo(cmBase + 11, -2.5);
  ctx.lineTo(cmBase + 11, 2.5);
  ctx.lineTo(cmBase, 6.5);
  ctx.closePath();
  ctx.fill();

  // Docked Lunar Module nose silhouette
  ctx.fillStyle = '#d4a33b';
  ctx.beginPath();
  ctx.moveTo(cmBase + 11, -3.2);
  ctx.lineTo(cmBase + 18, -5);
  ctx.lineTo(cmBase + 22, -3.5);
  ctx.lineTo(cmBase + 22, 3.5);
  ctx.lineTo(cmBase + 18, 5);
  ctx.lineTo(cmBase + 11, 3.2);
  ctx.closePath();
  ctx.fill();

  // Crisp retro telemetry outline glow
  ctx.strokeStyle = 'rgba(61, 255, 139, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cmBase + 22, 0);
  ctx.lineTo(cmBase + 30, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the Lunar Module "Eagle" upright when angleRad = 0.
 * Origin (0, 0) is center of mass; footpads sit at y = +24.
 */
export function drawLunarModuleEagle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  throttle: number,
  rcsLeft: boolean,
  rcsRight: boolean,
  time: number,
  contactLight = false
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);

  // Main Descent Engine Plume (nozzle at y = +14)
  if (throttle > 0.02) {
    const flicker = 0.84 + 0.32 * Math.sin(time * 62);
    const len = (24 + throttle * 62) * flicker;
    const width = 6 + throttle * 7;

    const grad = ctx.createLinearGradient(0, 14, 0, 14 + len);
    grad.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
    grad.addColorStop(0.25, 'rgba(255, 205, 86, 0.85)');
    grad.addColorStop(0.65, 'rgba(255, 120, 32, 0.42)');
    grad.addColorStop(1, 'rgba(255, 90, 20, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.quadraticCurveTo(-width, 14 + len * 0.45, 0, 14 + len);
    ctx.quadraticCurveTo(width, 14 + len * 0.45, 5, 14);
    ctx.closePath();
    ctx.fill();
  }

  // RCS Quad Puffs
  if (rcsLeft) {
    // Firing right-side quad to tilt/push left
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.9)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(14, -7);
    ctx.lineTo(28 + Math.random() * 8, -7);
    ctx.stroke();
  }
  if (rcsRight) {
    // Firing left-side quad to tilt/push right
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.9)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-14, -7);
    ctx.lineTo(-28 - Math.random() * 8, -7);
    ctx.stroke();
  }

  // Landing Gear Struts (4 legs, side silhouette shows left/right main + center front strut)
  ctx.strokeStyle = '#c9b37c';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';

  // Left main leg
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.lineTo(-23, 22);
  ctx.moveTo(-11, 12);
  ctx.lineTo(-20, 18);
  ctx.stroke();

  // Right main leg
  ctx.beginPath();
  ctx.moveTo(13, 6);
  ctx.lineTo(23, 22);
  ctx.moveTo(11, 12);
  ctx.lineTo(20, 18);
  ctx.stroke();

  // Center foreground leg
  ctx.strokeStyle = '#e0c98d';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(0, 22);
  ctx.stroke();

  // Circular Footpads
  ctx.fillStyle = '#d4a644';
  ctx.fillRect(-27, 21.5, 8, 2.5);
  ctx.fillRect(19, 21.5, 8, 2.5);
  ctx.fillRect(-3.5, 21.5, 7, 2.5);

  // Contact Probes
  ctx.strokeStyle = contactLight ? '#3dff8b' : 'rgba(210, 225, 220, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-25, 24);
  ctx.lineTo(-26, 28);
  ctx.moveTo(25, 24);
  ctx.lineTo(26, 28);
  ctx.stroke();

  // Descent Engine Bell
  ctx.fillStyle = '#4e5863';
  ctx.beginPath();
  ctx.moveTo(-4, 11);
  ctx.lineTo(-6.5, 16);
  ctx.lineTo(6.5, 16);
  ctx.lineTo(4, 11);
  ctx.closePath();
  ctx.fill();

  // Descent Stage (Gold Kapton Thermal Foil Octagon)
  const goldGrad = ctx.createLinearGradient(-15, 2, 15, 12);
  goldGrad.addColorStop(0, '#f3c64f');
  goldGrad.addColorStop(0.5, '#c78c24');
  goldGrad.addColorStop(1, '#8c5e12');
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.lineTo(14, 2);
  ctx.lineTo(16, 11);
  ctx.lineTo(-16, 11);
  ctx.closePath();
  ctx.fill();

  // Foil panel lines
  ctx.strokeStyle = 'rgba(55, 34, 6, 0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.lineTo(-7, 11);
  ctx.moveTo(6, 2);
  ctx.lineTo(7, 11);
  ctx.stroke();

  // Ascent Stage Cabin (metallic gray-silver faceted hull)
  const hullGrad = ctx.createLinearGradient(-13, -15, 13, 2);
  hullGrad.addColorStop(0, '#dce4ea');
  hullGrad.addColorStop(0.55, '#9eaab5');
  hullGrad.addColorStop(1, '#68737d');
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(-11, 2);
  ctx.lineTo(-13, -6);
  ctx.lineTo(-8, -14);
  ctx.lineTo(8, -14);
  ctx.lineTo(13, -6);
  ctx.lineTo(11, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#252e36';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Iconic Triangular Forward Windows
  ctx.fillStyle = '#0c1821';
  ctx.beginPath();
  ctx.moveTo(-7.5, -8.5);
  ctx.lineTo(-2.5, -6.5);
  ctx.lineTo(-6.5, -3.5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(7.5, -8.5);
  ctx.lineTo(2.5, -6.5);
  ctx.lineTo(6.5, -3.5);
  ctx.closePath();
  ctx.fill();

  // Forward Hatch
  ctx.fillStyle = '#505b66';
  ctx.fillRect(-3, -3.5, 6, 4.5);

  // S-Band Steerable Dish & Rendezvous Radar on top
  ctx.strokeStyle = '#cbd6df';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(0, -19);
  ctx.arc(0, -20.5, 3.8, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();

  // Side RCS quad pods
  ctx.fillStyle = '#3b444d';
  ctx.fillRect(-15, -9, 2.5, 4);
  ctx.fillRect(12.5, -9, 2.5, 4);

  // Beacon light on top
  const blink = Math.sin(time * 6) > 0.2;
  ctx.fillStyle = contactLight ? '#3dff8b' : blink ? '#ffb020' : 'rgba(255, 176, 32, 0.25)';
  ctx.beginPath();
  ctx.arc(7, -14.5, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawPlantedFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  progress: number
): void {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return;

  ctx.save();
  const poleH = 26 * p;
  ctx.strokeStyle = '#e3ebf2';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, groundY - poleH);
  ctx.stroke();

  if (p > 0.55) {
    const flagW = 16 * ((p - 0.55) / 0.45);
    const flagH = 10;
    const topY = groundY - poleH;

    // Horizontal telescoping rod
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x + flagW, topY);
    ctx.stroke();

    // Flag stripes
    ctx.fillStyle = '#d93838';
    ctx.fillRect(x, topY, flagW, flagH);
    ctx.fillStyle = '#f2f5f7';
    ctx.fillRect(x, topY + 2, flagW, 1.6);
    ctx.fillRect(x, topY + 5.2, flagW, 1.6);
    ctx.fillRect(x, topY + 8.2, flagW, 1.6);

    // Blue canton
    ctx.fillStyle = '#1f4fa3';
    ctx.fillRect(x, topY, Math.min(flagW, 7), 5.5);
  }
  ctx.restore();
}
