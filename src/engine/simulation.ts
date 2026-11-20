import { soundEngine } from '../audio/soundEngine';
import {
  ControlState,
  FailureReport,
  GamePhase,
  MissionSummary,
  RadioMessage,
  StageClearInfo,
  StageId,
  TelemetrySnapshot,
} from '../types';
import {
  drawApolloStack,
  drawEarth,
  drawLunarModuleEagle,
  drawMoonOrb,
  drawPlantedFlag,
  drawStarfield,
  generateStarfield,
  mulberry32,
  Particle,
  Star,
  WORLD_H,
  WORLD_W,
} from './rendererUtils';

export interface SimulationCallbacks {
  onTelemetry: (snapshot: TelemetrySnapshot) => void;
  onRadio: (message: RadioMessage) => void;
  onStageClear: (info: StageClearInfo) => void;
  onSuccess: (summary: MissionSummary) => void;
  onFailure: (report: FailureReport) => void;
}

interface TerrainPoint {
  x: number;
  y: number;
}

const EARTH_POS = { x: 150, y: 395, r: 92 };
const TLI_MOON_POS = { x: 1035, y: 225, r: 62 };
const TLI_GATE_X = 925;
const TLI_GATE_Y_MIN = 135;
const TLI_GATE_Y_MAX = 315;

const LOI_MOON_POS = { x: 600, y: 565, r: 255 };
const LOI_ORBIT_R = 355;
const LOI_WIN_START = (-128 * Math.PI) / 180;
const LOI_WIN_END = (-52 * Math.PI) / 180;
const LOI_TARGET_MIN = 1460;
const LOI_TARGET_MAX = 1760;

const DESCENT_PX_PER_M = 1.35;
const DESCENT_PAD_X_MIN = 565;
const DESCENT_PAD_X_MAX = 795;
const DESCENT_PAD_CENTER = (DESCENT_PAD_X_MIN + DESCENT_PAD_X_MAX) / 2;
const DESCENT_PAD_Y = 588;
const EAGLE_FOOTPADS_OFFSET = 24;

export class ApolloSimulation {
  private callbacks: SimulationCallbacks;
  private stars: Star[];
  private particles: Particle[] = [];

  private phase: GamePhase = 'TITLE';
  private stage: StageId = 'TLI';
  private controls: ControlState = { thrust: false, left: false, right: false };

  private simTime = 0;
  private metSeconds = 0;
  private stageElapsed = 0;
  private telemetryTimer = 0;
  private radioIdSeq = 1;
  private fuelLowWarned = false;

  // Stage 1: TLI state
  private tliX = 258;
  private tliY = 432;
  private tliVx = 42;
  private tliVy = -14;
  private tliAngle = -0.32;
  private tliSpeedKmS = 7.8;
  private tliFuel = 100;
  private tliThrottle = 0;
  private tliCorridorLocked = false;
  private tliLockAnnounced = false;
  private tliTrail: Array<{ x: number; y: number }> = [];

  // Stage 2: LOI state
  private loiAngle = (-152 * Math.PI) / 180;
  private loiVelocity = 2420; // m/s
  private loiShipAttitude = 0; // offset from ideal retrograde (rad)
  private loiFuel = 100;
  private loiThrottle = 0;
  private loiInWindow = false;
  private loiWindowAnnounced = false;
  private loiCaptureHold = 0;

  // Stage 3: Lunar Descent state
  private terrain: TerrainPoint[] = [];
  private ridgeFar: TerrainPoint[] = [];
  private ridgeMid: TerrainPoint[] = [];
  private lmX = 300;
  private lmY = 115;
  private lmVx = 9.5; // m/s
  private lmVy = 4.0; // m/s (positive = downward)
  private lmAngle = 0; // rad (0 = upright)
  private lmFuel = 100;
  private lmThrottle = 0;
  private lmContactLight = false;
  private lmLanded = false;
  private lmFlagProgress = 0;
  private lmSuccessDelay = 0;
  private lmPendingSummary: MissionSummary | null = null;
  private lmCalloutFlags = { alt250: false, alt120: false, alt45: false };

  // Camera shake on impact / heavy thrust
  private shakeTime = 0;
  private shakeIntensity = 0;

  constructor(callbacks: SimulationCallbacks) {
    this.callbacks = callbacks;
    this.stars = generateStarfield(195, 1969);
    this.buildLunarTerrain();
  }

  private buildLunarTerrain(): void {
    const rand = mulberry32(7201969);

    // Far parallax ridge
    this.ridgeFar = [];
    for (let x = -40; x <= WORLD_W + 40; x += 40) {
      const h =
        475 +
        Math.sin(x * 0.0065) * 34 +
        Math.cos(x * 0.017) * 18 +
        (rand() - 0.5) * 16;
      this.ridgeFar.push({ x, y: h });
    }

    // Mid parallax ridge
    this.ridgeMid = [];
    for (let x = -40; x <= WORLD_W + 40; x += 30) {
      const h =
        530 +
        Math.sin(x * 0.011 + 1.2) * 24 +
        Math.cos(x * 0.023) * 14 +
        (rand() - 0.5) * 12;
      this.ridgeMid.push({ x, y: h });
    }

    // Foreground interactive lunar surface (Sea of Tranquility)
    this.terrain = [];
    const step = 20;
    for (let x = 0; x <= WORLD_W; x += step) {
      let y = DESCENT_PAD_Y;

      // Flat main landing pad (565..795) and forgiving shoulders (500..565, 795..860)
      if (x >= 500 && x <= 860) {
        y = DESCENT_PAD_Y;
      } else if (x < 500) {
        const dist = (500 - x) / 500;
        const hill =
          Math.sin(x * 0.021) * 34 * dist +
          Math.cos(x * 0.048) * 16 * dist -
          dist * 62;
        y = DESCENT_PAD_Y + hill + (rand() - 0.5) * 10 * dist;
      } else {
        const dist = (x - 860) / (WORLD_W - 860);
        const hill =
          Math.sin(x * 0.024) * 32 * dist +
          Math.cos(x * 0.052) * 18 * dist -
          dist * 58;
        y = DESCENT_PAD_Y + hill + (rand() - 0.5) * 10 * dist;
      }

      y = Math.max(460, Math.min(625, y));
      this.terrain.push({ x, y });
    }
  }

  private getTerrainHeightAndSlope(x: number): { y: number; slope: number } {
    const clampedX = Math.max(0, Math.min(WORLD_W, x));
    const step = 20;
    const idx = Math.min(this.terrain.length - 2, Math.floor(clampedX / step));
    const p1 = this.terrain[idx];
    const p2 = this.terrain[idx + 1];
    const t = (clampedX - p1.x) / (p2.x - p1.x);
    const y = p1.y + (p2.y - p1.y) * t;
    const slope = Math.abs((p2.y - p1.y) / (p2.x - p1.x));
    return { y, slope };
  }

  public setControls(partial: Partial<ControlState>): void {
    this.controls = { ...this.controls, ...partial };
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public getStage(): StageId {
    return this.stage;
  }

  public startMission(startStage: StageId = 'TLI'): void {
    soundEngine.unlock();
    this.metSeconds = startStage === 'TLI' ? 0 : startStage === 'LOI' ? 35 : 70;
    this.initStage(startStage);
  }

  public retryCurrentStage(): void {
    soundEngine.unlock();
    this.initStage(this.stage);
  }

  public proceedToNextStage(): void {
    soundEngine.unlock();
    if (this.stage === 'TLI') {
      this.initStage('LOI');
    } else if (this.stage === 'LOI') {
      this.initStage('DESCENT');
    }
  }

  public returnToTitle(): void {
    this.phase = 'TITLE';
    this.controls = { thrust: false, left: false, right: false };
    soundEngine.silenceThrusters();
    this.emitTelemetry();
  }

  private formatMet(seconds: number): string {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private emitRadio(
    sender: RadioMessage['sender'],
    text: string,
    tone: RadioMessage['tone'] = 'normal',
    playTone = true
  ): void {
    if (playTone && sender === 'HOUSTON') {
      soundEngine.playRadioCallout();
    } else if (playTone && sender === 'EAGLE') {
      soundEngine.playQuindar('intro');
    }
    this.callbacks.onRadio({
      id: this.radioIdSeq++,
      sender,
      text,
      timestamp: this.formatMet(this.metSeconds),
      tone,
    });
  }

  private initStage(stage: StageId): void {
    this.stage = stage;
    this.phase = 'PLAYING';
    this.stageElapsed = 0;
    this.particles = [];
    this.fuelLowWarned = false;
    this.shakeTime = 0;
    this.controls = { thrust: false, left: false, right: false };
    soundEngine.silenceThrusters();

    if (stage === 'TLI') {
      this.tliX = 258;
      this.tliY = 432;
      this.tliVx = 40;
      this.tliVy = -14;
      this.tliAngle = -0.32;
      this.tliSpeedKmS = 7.8;
      this.tliFuel = 100;
      this.tliThrottle = 0;
      this.tliCorridorLocked = false;
      this.tliLockAnnounced = false;
      this.tliTrail = [{ x: this.tliX, y: this.tliY }];
      this.emitRadio(
        'HOUSTON',
        'Apollo 11, you are GO for TLI. Burn main engine [W/SPACE] to 10.8 km/s and align path with the Lunar Corridor [A/D].',
        'normal'
      );
    } else if (stage === 'LOI') {
      this.loiAngle = (-150 * Math.PI) / 180;
      this.loiVelocity = 2420;
      this.loiShipAttitude = 0.08;
      this.loiFuel = 100;
      this.loiThrottle = 0;
      this.loiInWindow = false;
      this.loiWindowAnnounced = false;
      this.loiCaptureHold = 0;
      this.emitRadio(
        'HOUSTON',
        'Approaching Lunar Perilune. Hold retrograde [A/D] and fire SPS engine [W/SPACE] inside the green LOI window to brake below 1,750 m/s.',
        'normal'
      );
    } else {
      this.lmX = 300;
      this.lmY = 118;
      this.lmVx = 9.5;
      this.lmVy = 3.8;
      this.lmAngle = 0;
      this.lmFuel = 100;
      this.lmThrottle = 0;
      this.lmContactLight = false;
      this.lmLanded = false;
      this.lmFlagProgress = 0;
      this.lmSuccessDelay = 0;
      this.lmPendingSummary = null;
      this.lmCalloutFlags = { alt250: false, alt120: false, alt45: false };
      this.emitRadio(
        'HOUSTON',
        'Eagle, you are GO for powered descent. Keep V-SPD under 5 m/s and H-SPD under 3 m/s for Tranquility Base touchdown.',
        'normal'
      );
    }

    this.emitTelemetry();
  }

  public update(dtRaw: number): void {
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));
    this.simTime += dt;

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
    }

    this.updateParticles(dt);

    if (this.phase === 'TITLE') {
      soundEngine.silenceThrusters();
      return;
    }

    if (this.phase === 'STAGE_CLEAR' || this.phase === 'FAILED') {
      soundEngine.silenceThrusters();
      return;
    }

    if (this.phase === 'SUCCESS') {
      soundEngine.silenceThrusters();
      this.lmFlagProgress = Math.min(1, this.lmFlagProgress + dt * 0.65);
      return;
    }

    // PLAYING phase
    this.metSeconds += dt;
    this.stageElapsed += dt;

    if (this.stage === 'TLI') {
      this.updateTli(dt);
    } else if (this.stage === 'LOI') {
      this.updateLoi(dt);
    } else {
      this.updateDescent(dt);
    }

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.05) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private spawnParticle(p: Particle): void {
    if (this.particles.length > 260) return;
    this.particles.push(p);
  }

  private spawnCrashBurst(x: number, y: number): void {
    this.shakeTime = 0.55;
    this.shakeIntensity = 9;
    const colors = ['#ffb020', '#ff5733', '#fff4d0', '#3dff8b', '#98a6b3'];
    for (let i = 0; i < 42; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 140;
      this.spawnParticle({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.6 + Math.random() * 0.9,
        maxLife: 1.5,
        size: 1.8 + Math.random() * 3.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
      });
    }
  }

  // =========================================================================
  // STAGE 1: TRANS-LUNAR INJECTION (TLI)
  // =========================================================================
  private predictTliTrajectory(): { points: Array<{ x: number; y: number }>; crossY: number | null; hitsCorridor: boolean } {
    const pts: Array<{ x: number; y: number }> = [];
    let px = this.tliX;
    let py = this.tliY;
    let vx = this.tliVx;
    let vy = this.tliVy;
    let crossY: number | null = null;
    const stepDt = 0.35;

    for (let i = 0; i < 65; i++) {
      pts.push({ x: px, y: py });
      // Gentle Earth & Moon gravitational pull for realistic curving trajectory
      const dxE = EARTH_POS.x - px;
      const dyE = EARTH_POS.y - py;
      const distESq = Math.max(12000, dxE * dxE + dyE * dyE);
      const pullE = 18000 / distESq;
      vx += (dxE / Math.sqrt(distESq)) * pullE * stepDt;
      vy += (dyE / Math.sqrt(distESq)) * pullE * stepDt;

      const dxM = TLI_MOON_POS.x - px;
      const dyM = TLI_MOON_POS.y - py;
      const distMSq = Math.max(6000, dxM * dxM + dyM * dyM);
      const pullM = 28000 / distMSq;
      vx += (dxM / Math.sqrt(distMSq)) * pullM * stepDt;
      vy += (dyM / Math.sqrt(distMSq)) * pullM * stepDt;

      const prevX = px;
      const prevY = py;
      px += vx * stepDt;
      py += vy * stepDt;

      if (crossY === null && prevX < TLI_GATE_X && px >= TLI_GATE_X) {
        const frac = (TLI_GATE_X - prevX) / Math.max(0.001, px - prevX);
        crossY = prevY + (py - prevY) * frac;
      }

      if (px > WORLD_W + 40 || py < -40 || py > WORLD_H + 40) break;
    }

    const hitsCorridor =
      crossY !== null &&
      crossY >= TLI_GATE_Y_MIN &&
      crossY <= TLI_GATE_Y_MAX;

    return { points: pts, crossY, hitsCorridor };
  }

  private updateTli(dt: number): void {
    const rcsDir: -1 | 0 | 1 = this.controls.left ? -1 : this.controls.right ? 1 : 0;
    const turnRate = 1.45;
    if (rcsDir !== 0 && this.tliFuel > 0) {
      this.tliAngle += rcsDir * turnRate * dt;
      this.tliAngle = Math.max(-1.15, Math.min(0.65, this.tliAngle));
      // Mild direct RCS nudge to velocity vector so aiming feels responsive
      const nudge = 16 * dt;
      this.tliVx += Math.cos(this.tliAngle) * nudge * 0.2;
      this.tliVy += Math.sin(this.tliAngle) * nudge * 0.9;
      this.tliFuel = Math.max(0, this.tliFuel - 1.2 * dt);
    }

    const thrusting = this.controls.thrust && this.tliFuel > 0;
    this.tliThrottle += ((thrusting ? 1 : 0) - this.tliThrottle) * Math.min(1, dt * 10);

    if (thrusting) {
      // Build injection speed with AGC cutoff governor at 11.4 km/s
      this.tliSpeedKmS = Math.min(11.4, this.tliSpeedKmS + 0.92 * dt);
      const targetVisualSpeed = 36 + (this.tliSpeedKmS - 7.5) * 14;
      const desiredVx = Math.cos(this.tliAngle) * targetVisualSpeed;
      const desiredVy = Math.sin(this.tliAngle) * targetVisualSpeed;
      this.tliVx += (desiredVx - this.tliVx) * Math.min(1, dt * 2.8);
      this.tliVy += (desiredVy - this.tliVy) * Math.min(1, dt * 2.8);
      this.tliFuel = Math.max(0, this.tliFuel - 6.8 * dt);

      if (Math.random() < 0.7) {
        const backX = this.tliX - Math.cos(this.tliAngle) * 32;
        const backY = this.tliY - Math.sin(this.tliAngle) * 32;
        this.spawnParticle({
          x: backX + (Math.random() - 0.5) * 4,
          y: backY + (Math.random() - 0.5) * 4,
          vx: -Math.cos(this.tliAngle) * (50 + Math.random() * 40),
          vy: -Math.sin(this.tliAngle) * (50 + Math.random() * 40),
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          size: 1.8 + Math.random() * 1.6,
          color: Math.random() > 0.35 ? '#ffb020' : '#fff2c4',
          alpha: 0.85,
        });
      }
    }

    // Gentle orbital gravity
    const dxE = EARTH_POS.x - this.tliX;
    const dyE = EARTH_POS.y - this.tliY;
    const distE = Math.hypot(dxE, dyE);
    const pullE = 18000 / Math.max(12000, distE * distE);
    this.tliVx += (dxE / distE) * pullE * dt;
    this.tliVy += (dyE / distE) * pullE * dt;

    const dxM = TLI_MOON_POS.x - this.tliX;
    const dyM = TLI_MOON_POS.y - this.tliY;
    const distM = Math.hypot(dxM, dyM);
    const pullM = 28000 / Math.max(6000, distM * distM);
    this.tliVx += (dxM / distM) * pullM * dt;
    this.tliVy += (dyM / distM) * pullM * dt;

    const pred = this.predictTliTrajectory();
    const speedGood = this.tliSpeedKmS >= 10.0 && this.tliSpeedKmS <= 11.7;
    this.tliCorridorLocked = pred.hitsCorridor && speedGood;

    if (this.tliCorridorLocked && !this.tliLockAnnounced) {
      this.tliLockAnnounced = true;
      this.emitRadio(
        'HOUSTON',
        'Corridor locked! TLI trajectory is right on the money. Coasting to Lunar Sphere of Influence.',
        'success'
      );
    }

    // Smooth time-warp coast boost once locked and coasting so Stage 1 feels crisp
    const coastMultiplier = this.tliCorridorLocked && !thrusting ? 1.85 : 1.0;
    this.tliX += this.tliVx * dt * coastMultiplier;
    this.tliY += this.tliVy * dt * coastMultiplier;

    if (this.tliTrail.length === 0 || Math.hypot(this.tliX - this.tliTrail[this.tliTrail.length - 1].x, this.tliY - this.tliTrail[this.tliTrail.length - 1].y) > 8) {
      this.tliTrail.push({ x: this.tliX, y: this.tliY });
      if (this.tliTrail.length > 90) this.tliTrail.shift();
    }

    soundEngine.updateThrusters(this.tliThrottle, rcsDir !== 0 && this.tliFuel > 0);
    this.checkLowFuel(this.tliFuel);

    // Check Stage 1 Win: Entered Lunar Entry Corridor Gate with injection speed
    if (
      this.tliX >= TLI_GATE_X - 18 &&
      this.tliY >= TLI_GATE_Y_MIN - 14 &&
      this.tliY <= TLI_GATE_Y_MAX + 14 &&
      this.tliSpeedKmS >= 9.6
    ) {
      this.completeStage(
        'TLI',
        'LOI',
        'TLI BURN COMPLETE',
        'Entered Lunar Sphere of Influence — Preparing for Lunar Orbit Insertion (LOI).',
        this.tliFuel
      );
      return;
    }

    // Check Failure conditions
    if (distE < EARTH_POS.r + 6) {
      this.failStage('EARTH RE-ENTRY', 'Spacecraft fell back into Earth atmosphere.', this.tliFuel);
      return;
    }
    if (distM < TLI_MOON_POS.r + 4) {
      this.failStage('LUNAR IMPACT', 'Direct collision trajectory with the Moon — aim for the outer green corridor.', this.tliFuel);
      return;
    }
    if (this.tliX > WORLD_W - 15 || this.tliY < 10 || this.tliY > WORLD_H - 10) {
      const reason =
        this.tliSpeedKmS < 9.6
          ? `Insufficient TLI velocity (${this.tliSpeedKmS.toFixed(1)} km/s). Reach at least 10.0 km/s before crossing the Moon.`
          : 'Trajectory missed the Lunar Entry Corridor. Use [A/D] to align the dashed trajectory into the green gate.';
      this.failStage('MISSED LUNAR CORRIDOR', reason, this.tliFuel);
    }
  }

  // =========================================================================
  // STAGE 2: LUNAR ORBIT INSERTION (LOI)
  // =========================================================================
  private updateLoi(dt: number): void {
    const rcsDir: -1 | 0 | 1 = this.controls.left ? -1 : this.controls.right ? 1 : 0;

    // Gentle drift when thrusting to keep attitude control lightly interactive, yet super forgiving
    const drift = this.loiThrottle > 0.2 ? Math.sin(this.stageElapsed * 1.4) * 0.12 : 0;
    this.loiShipAttitude += (rcsDir * 1.55 + drift) * dt;
    // Soft AGC attitude damper keeps craft from spinning wildly
    if (rcsDir === 0) {
      this.loiShipAttitude *= Math.max(0, 1 - dt * 0.65);
    }
    this.loiShipAttitude = Math.max(-1.25, Math.min(1.25, this.loiShipAttitude));

    if (rcsDir !== 0 && this.loiFuel > 0) {
      this.loiFuel = Math.max(0, this.loiFuel - 0.8 * dt);
    }

    this.loiInWindow = this.loiAngle >= LOI_WIN_START && this.loiAngle <= LOI_WIN_END;

    if (this.loiInWindow && !this.loiWindowAnnounced) {
      this.loiWindowAnnounced = true;
      this.emitRadio(
        'HOUSTON',
        'Entering LOI Burn Window! Fire SPS main engine [W/SPACE] now to brake into lunar orbit.',
        'normal'
      );
    }

    const thrusting = this.controls.thrust && this.loiFuel > 0;
    this.loiThrottle += ((thrusting ? 1 : 0) - this.loiThrottle) * Math.min(1, dt * 10);

    // Braking efficiency depends on alignment with retrograde (cos of attitude error)
    const alignmentCos = Math.max(0, Math.cos(this.loiShipAttitude));
    if (thrusting) {
      const windowBonus = this.loiInWindow ? 1.0 : 0.45;
      const decel = 152 * alignmentCos * windowBonus; // m/s per sec
      this.loiVelocity = Math.max(1050, this.loiVelocity - decel * dt);
      this.loiFuel = Math.max(0, this.loiFuel - 8.2 * dt);

      const shipX = LOI_MOON_POS.x + Math.cos(this.loiAngle) * LOI_ORBIT_R;
      const shipY = LOI_MOON_POS.y + Math.sin(this.loiAngle) * LOI_ORBIT_R;
      // Tangent direction (clockwise travel = angle + PI/2); retrograde nose points opposite = angle - PI/2
      const noseAngle = this.loiAngle - Math.PI / 2 + this.loiShipAttitude;
      if (Math.random() < 0.75) {
        this.spawnParticle({
          x: shipX - Math.cos(noseAngle) * 24,
          y: shipY - Math.sin(noseAngle) * 24,
          vx: -Math.cos(noseAngle) * (70 + Math.random() * 45),
          vy: -Math.sin(noseAngle) * (70 + Math.random() * 45),
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          size: 2.0 + Math.random() * 1.6,
          color: Math.random() > 0.35 ? '#ffb020' : '#ffffff',
          alpha: 0.9,
        });
      }
    }

    // Advance clockwise along lunar perilune pass
    const angularSpeed = (this.loiVelocity / 2420) * 0.115; // ~13-15 seconds across burn window
    this.loiAngle += angularSpeed * dt;

    soundEngine.updateThrusters(this.loiThrottle, rcsDir !== 0 && this.loiFuel > 0);
    this.checkLowFuel(this.loiFuel);

    const inTargetBand =
      this.loiVelocity >= LOI_TARGET_MIN && this.loiVelocity <= LOI_TARGET_MAX;

    if (inTargetBand && this.loiInWindow) {
      this.loiCaptureHold += dt;
      // If player stops thrusting inside the green capture band, lock immediately after 0.65s
      if ((!thrusting && this.loiCaptureHold >= 0.65) || this.loiVelocity <= 1620) {
        this.completeStage(
          'LOI',
          'DESCENT',
          'LUNAR ORBIT CAPTURED',
          'Circular orbit achieved at 110 km altitude. LM Eagle undocked — ready for Sea of Tranquility descent!',
          this.loiFuel
        );
        return;
      }
    } else {
      this.loiCaptureHold = 0;
    }

    // Over-braking failure
    if (this.loiVelocity < 1260) {
      this.failStage(
        'SUB-ORBITAL DECAY',
        `Over-braked to ${Math.round(this.loiVelocity)} m/s — orbit decayed prematurely. Stop firing once speed enters the green 1,460–1,760 m/s band.`,
        this.loiFuel
      );
      return;
    }

    // Window exited check
    if (this.loiAngle > LOI_WIN_END + 0.08) {
      if (inTargetBand) {
        this.completeStage(
          'LOI',
          'DESCENT',
          'LUNAR ORBIT CAPTURED',
          'Circular orbit achieved at 110 km altitude. LM Eagle undocked — ready for Sea of Tranquility descent!',
          this.loiFuel
        );
      } else {
        this.failStage(
          'HYPERBOLIC ESCAPE',
          `Exited LOI burn window at ${Math.round(this.loiVelocity)} m/s (target < 1,760 m/s). Fire main engine earlier inside the green window.`,
          this.loiFuel
        );
      }
    }
  }

  // =========================================================================
  // STAGE 3: LUNAR DESCENT — LM "EAGLE" (SEA OF TRANQUILITY)
  // =========================================================================
  private updateDescent(dt: number): void {
    if (this.lmLanded) {
      this.lmFlagProgress = Math.min(1, this.lmFlagProgress + dt * 0.75);
      this.lmSuccessDelay -= dt;
      soundEngine.silenceThrusters();
      if (this.lmSuccessDelay <= 0 && this.lmPendingSummary) {
        this.phase = 'SUCCESS';
        this.callbacks.onSuccess(this.lmPendingSummary);
        this.emitTelemetry();
      }
      return;
    }

    const rcsLeft = this.controls.left && this.lmFuel > 0;
    const rcsRight = this.controls.right && this.lmFuel > 0;
    const rcsActive = rcsLeft || rcsRight;

    // Attitude control with gentle AGC P66 auto-leveling spring (forgiving LOW difficulty)
    const maxTiltRad = (34 * Math.PI) / 180;
    const rotRate = 1.65;
    if (rcsLeft) {
      this.lmAngle = Math.max(-maxTiltRad, this.lmAngle - rotRate * dt);
      // Direct subtle horizontal RCS translation assist so stopping drift feels silky-smooth
      this.lmVx -= 1.65 * dt;
      this.lmFuel = Math.max(0, this.lmFuel - 0.45 * dt);
    } else if (rcsRight) {
      this.lmAngle = Math.min(maxTiltRad, this.lmAngle + rotRate * dt);
      this.lmVx += 1.65 * dt;
      this.lmFuel = Math.max(0, this.lmFuel - 0.45 * dt);
    } else {
      // Gentle upright stabilization when player releases A/D
      this.lmAngle *= Math.max(0, 1 - dt * 2.2);
      if (Math.abs(this.lmAngle) < 0.004) this.lmAngle = 0;
    }

    // Main Descent Engine
    const thrusting = this.controls.thrust && this.lmFuel > 0;
    this.lmThrottle += ((thrusting ? 1 : 0) - this.lmThrottle) * Math.min(1, dt * 11);

    // Forgiving lunar gravity (1.62 m/s^2) vs strong main thrust (4.65 m/s^2)
    const LUNAR_G = 1.62;
    const MAX_THRUST_ACC = 4.65;

    let ax = 0;
    let ay = LUNAR_G;

    if (this.lmThrottle > 0.01 && this.lmFuel > 0) {
      const thrustAcc = MAX_THRUST_ACC * this.lmThrottle;
      ax += Math.sin(this.lmAngle) * thrustAcc;
      ay -= Math.cos(this.lmAngle) * thrustAcc;
      this.lmFuel = Math.max(0, this.lmFuel - 3.6 * this.lmThrottle * dt);

      // Exhaust spark particles
      if (Math.random() < 0.85) {
        const nozzleX = this.lmX - Math.sin(this.lmAngle) * 16;
        const nozzleY = this.lmY + Math.cos(this.lmAngle) * 16;
        const spread = (Math.random() - 0.5) * 0.25;
        const exAng = this.lmAngle + spread;
        const exSpd = 90 + Math.random() * 75;
        this.spawnParticle({
          x: nozzleX,
          y: nozzleY,
          vx: -Math.sin(exAng) * exSpd + this.lmVx * DESCENT_PX_PER_M * 0.4,
          vy: Math.cos(exAng) * exSpd + this.lmVy * DESCENT_PX_PER_M * 0.4,
          life: 0.25 + Math.random() * 0.2,
          maxLife: 0.45,
          size: 1.5 + Math.random() * 1.8,
          color: Math.random() > 0.4 ? '#ffb020' : '#fff7d6',
          alpha: 0.9,
        });
      }
    }

    // Subtle horizontal damping only at ultra-high speeds to prevent leaving screen uncontrollably
    this.lmVx += ax * dt;
    this.lmVy += ay * dt;
    this.lmVx = Math.max(-35, Math.min(35, this.lmVx));
    this.lmVy = Math.max(-22, Math.min(32, this.lmVy));

    this.lmX += this.lmVx * DESCENT_PX_PER_M * dt;
    this.lmY += this.lmVy * DESCENT_PX_PER_M * dt;

    // Soft horizontal boundary guard so the player never gets lost off-screen
    if (this.lmX < 38) {
      this.lmX = 38;
      this.lmVx = Math.max(0, this.lmVx);
    } else if (this.lmX > WORLD_W - 38) {
      this.lmX = WORLD_W - 38;
      this.lmVx = Math.min(0, this.lmVx);
    }
    if (this.lmY < 32) {
      this.lmY = 32;
      this.lmVy = Math.max(0, this.lmVy);
    }

    const ground = this.getTerrainHeightAndSlope(this.lmX);
    const footpadY = this.lmY + EAGLE_FOOTPADS_OFFSET;
    const altPx = Math.max(0, ground.y - footpadY);
    const altMeters = altPx / DESCENT_PX_PER_M;

    // Lunar dust kick-up when thrusting near surface (< 52 m)
    if (this.lmThrottle > 0.15 && altMeters < 52 && altMeters > 1) {
      const intensity = 1 - altMeters / 52;
      const count = Math.ceil(intensity * 3);
      for (let i = 0; i < count; i++) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        this.spawnParticle({
          x: this.lmX + (Math.random() - 0.5) * 28,
          y: ground.y - 2,
          vx: dir * (35 + Math.random() * 95 * intensity),
          vy: -(8 + Math.random() * 24 * intensity),
          life: 0.45 + Math.random() * 0.45,
          maxLife: 0.9,
          size: 1.5 + Math.random() * 2.5,
          color: '#b6bec4',
          alpha: 0.55 * intensity,
        });
      }
    }

    // Authentic Apollo 11 altitude callouts
    if (altMeters < 245 && !this.lmCalloutFlags.alt250) {
      this.lmCalloutFlags.alt250 = true;
      this.emitRadio('HOUSTON', 'Eagle, Houston. 250 meters, looking great. You are GO for landing.', 'normal');
    } else if (altMeters < 115 && !this.lmCalloutFlags.alt120) {
      this.lmCalloutFlags.alt120 = true;
      this.emitRadio('EAGLE', '120 meters — switching to P64 Approach. Tranquility Base in sight.', 'normal');
    } else if (altMeters < 42 && !this.lmCalloutFlags.alt45) {
      this.lmCalloutFlags.alt45 = true;
      this.emitRadio('EAGLE', '40 meters, picking up some dust! Final braking for touchdown.', 'normal');
    }

    // Warning alarm if approaching ground too fast or low fuel
    if ((altMeters < 65 && (this.lmVy > 7.5 || Math.abs(this.lmVx) > 5.0)) || this.lmFuel < 20) {
      soundEngine.triggerAlarmPulse();
    }
    this.checkLowFuel(this.lmFuel);

    soundEngine.updateThrusters(this.lmThrottle, rcsActive);

    // Touchdown Check
    if (footpadY >= ground.y) {
      this.lmY = ground.y - EAGLE_FOOTPADS_OFFSET;
      const absV = Math.abs(this.lmVy);
      const absH = Math.abs(this.lmVx);
      const absTiltDeg = Math.abs((this.lmAngle * 180) / Math.PI);

      const safeV = absV < 5.0;
      const safeH = absH < 3.0;
      const safeTilt = absTiltDeg < 16.0;
      const safeSlope = ground.slope < 0.22;

      if (safeV && safeH && safeTilt && safeSlope) {
        this.lmContactLight = true;
        this.lmLanded = true;
        this.lmThrottle = 0;
        this.lmAngle = 0;
        this.lmVx = 0;
        this.lmVy = 0;
        soundEngine.silenceThrusters();
        soundEngine.playSuccessFanfare();

        const onPad =
          this.lmX >= DESCENT_PAD_X_MIN - 8 && this.lmX <= DESCENT_PAD_X_MAX + 8;
        const offsetMeters = Math.round(
          Math.abs(this.lmX - DESCENT_PAD_CENTER) / DESCENT_PX_PER_M
        );

        let grade: MissionSummary['grade'] = 'B';
        let rankTitle = 'LUNAR PILOT';
        if (onPad && absV < 2.6 && absH < 1.5 && this.lmFuel >= 30) {
          grade = 'A+';
          rankTitle = 'MISSION COMMANDER';
        } else if (onPad) {
          grade = 'A';
          rankTitle = 'TRANQUILITY BASE ACE';
        }

        this.lmPendingSummary = {
          totalTime: this.metSeconds,
          fuelRemaining: this.lmFuel,
          touchdownVSpeed: absV,
          touchdownHSpeed: absH,
          touchdownTilt: absTiltDeg,
          targetOffset: offsetMeters,
          onTranquilityBase: onPad,
          grade,
          rankTitle,
        };
        this.lmSuccessDelay = 1.6;

        this.emitRadio(
          'EAGLE',
          'Contact light! Engine stop. Houston, Tranquility Base here. The Eagle has landed.',
          'success'
        );
      } else {
        this.spawnCrashBurst(this.lmX, ground.y - 6);
        let reason = 'Landing parameters exceeded structural limits.';
        if (!safeV) {
          reason = `Hard impact — Vertical speed was ${absV.toFixed(1)} m/s (safe limit: < 5.0 m/s).`;
        } else if (!safeH) {
          reason = `Excessive lateral drift — Horizontal speed was ${absH.toFixed(1)} m/s (safe limit: < 3.0 m/s).`;
        } else if (!safeTilt) {
          reason = `Lander tipped on touchdown — Tilt was ${absTiltDeg.toFixed(1)}° (safe limit: < 16°).`;
        } else if (!safeSlope) {
          reason = 'Touched down on steep crater ridge! Aim for the flat Tranquility Base zone.';
        }
        this.failStage('HARD LANDING', reason, this.lmFuel);
      }
    }
  }

  private checkLowFuel(fuel: number): void {
    if (fuel < 20 && !this.fuelLowWarned) {
      this.fuelLowWarned = true;
      this.emitRadio('AGC', 'MASTER ALARM: PROPELLANT QUANTITY LOW (< 20%).', 'warning', false);
      soundEngine.triggerAlarmPulse();
    }
  }

  private completeStage(
    completedStage: StageId,
    nextStage: StageId,
    title: string,
    subtitle: string,
    fuelRemaining: number
  ): void {
    this.phase = 'STAGE_CLEAR';
    this.controls = { thrust: false, left: false, right: false };
    soundEngine.silenceThrusters();
    soundEngine.playSuccessFanfare();

    this.emitRadio('HOUSTON', `${title}! ${subtitle}`, 'success', false);
    this.callbacks.onStageClear({
      completedStage,
      nextStage,
      title,
      subtitle,
      fuelRemaining,
      stageTime: this.stageElapsed,
    });
    this.emitTelemetry();
  }

  private failStage(title: string, reason: string, fuel: number): void {
    this.phase = 'FAILED';
    this.controls = { thrust: false, left: false, right: false };
    soundEngine.silenceThrusters();
    soundEngine.playFailureImpact();

    this.emitRadio('HOUSTON', `ABORT: ${title}. ${reason}`, 'warning', false);
    this.callbacks.onFailure({
      stage: this.stage,
      title,
      reason,
      vSpeed: this.stage === 'DESCENT' ? Math.abs(this.lmVy) : 0,
      hSpeed: this.stage === 'DESCENT' ? Math.abs(this.lmVx) : 0,
      fuel,
      tiltDeg:
        this.stage === 'DESCENT'
          ? (this.lmAngle * 180) / Math.PI
          : this.stage === 'LOI'
            ? (this.loiShipAttitude * 180) / Math.PI
            : (this.tliAngle * 180) / Math.PI,
    });
    this.emitTelemetry();
  }

  private emitTelemetry(): void {
    let altitude = 0;
    let altitudeUnit: 'km' | 'm' = 'km';
    let vSpeed = 0;
    let hSpeed = 0;
    let totalSpeed = 0;
    let fuel = 100;
    let tiltDeg = 0;
    let throttle = 0;
    let statusText = 'STANDBY';
    let statusLevel: TelemetrySnapshot['statusLevel'] = 'nominal';
    let dsky = { prog: '00', verb: '16', noun: '20', alarm: false, contactLight: false };

    let tliProgress = 0;
    let loiProgress = 0;
    let descentTargetOffset = 0;
    let descentOnTarget = false;
    let descentSafeV = true;
    let descentSafeH = true;
    let descentSafeTilt = true;

    if (this.stage === 'TLI') {
      const distMoonPx = Math.max(0, Math.hypot(TLI_MOON_POS.x - this.tliX, TLI_MOON_POS.y - this.tliY) - TLI_MOON_POS.r);
      altitude = Math.round(distMoonPx * 485); // scaled km to Moon (~384,000 km vibe)
      altitudeUnit = 'km';
      vSpeed = Number((-this.tliVy * 14).toFixed(1));
      hSpeed = Number((this.tliVx * 14).toFixed(1));
      totalSpeed = this.tliSpeedKmS;
      fuel = this.tliFuel;
      tiltDeg = (this.tliAngle * 180) / Math.PI;
      throttle = this.tliThrottle;
      tliProgress = Math.max(0, Math.min(100, ((this.tliX - 258) / (TLI_GATE_X - 258)) * 100));

      if (this.tliCorridorLocked) {
        statusText = 'TLI CORRIDOR LOCKED — GO';
        statusLevel = 'go';
      } else if (this.tliSpeedKmS < 10.0) {
        statusText = 'BURN TO 10.8 KM/S & ALIGN';
        statusLevel = 'caution';
      } else {
        statusText = 'ADJUST COURSE [A/D] TO GATE';
        statusLevel = 'caution';
      }
      dsky = {
        prog: '15',
        verb: '06',
        noun: '95',
        alarm: this.tliFuel < 20,
        contactLight: false,
      };
    } else if (this.stage === 'LOI') {
      altitude = Math.round(110 + Math.max(0, (this.loiVelocity - 1600) * 0.14));
      altitudeUnit = 'km';
      vSpeed = Number(((this.loiVelocity - 1620) * 0.15).toFixed(1));
      hSpeed = Number(this.loiVelocity.toFixed(0));
      totalSpeed = this.loiVelocity;
      fuel = this.loiFuel;
      tiltDeg = (this.loiShipAttitude * 180) / Math.PI;
      throttle = this.loiThrottle;
      loiProgress = Math.max(
        0,
        Math.min(100, ((this.loiAngle - (-150 * Math.PI) / 180) / (LOI_WIN_END - (-150 * Math.PI) / 180)) * 100)
      );

      const inBand = this.loiVelocity >= LOI_TARGET_MIN && this.loiVelocity <= LOI_TARGET_MAX;
      if (inBand) {
        statusText = 'CAPTURE VELOCITY ACHIEVED';
        statusLevel = 'go';
      } else if (this.loiInWindow) {
        statusText = 'LOI WINDOW ACTIVE — BRAKE NOW';
        statusLevel = 'caution';
      } else {
        statusText = 'APPROACHING LOI BURN WINDOW';
        statusLevel = 'nominal';
      }
      dsky = {
        prog: '40',
        verb: '06',
        noun: '40',
        alarm: this.loiFuel < 20 || this.loiVelocity < 1380,
        contactLight: false,
      };
    } else {
      const ground = this.getTerrainHeightAndSlope(this.lmX);
      const altPx = Math.max(0, ground.y - (this.lmY + EAGLE_FOOTPADS_OFFSET));
      altitude = Math.max(0, altPx / DESCENT_PX_PER_M);
      altitudeUnit = 'm';
      vSpeed = -this.lmVy; // negative = descending (classic NASA telemetry convention)
      hSpeed = this.lmVx;
      totalSpeed = Math.hypot(this.lmVx, this.lmVy);
      fuel = this.lmFuel;
      tiltDeg = (this.lmAngle * 180) / Math.PI;
      throttle = this.lmThrottle;
      descentTargetOffset = (this.lmX - DESCENT_PAD_CENTER) / DESCENT_PX_PER_M;
      descentOnTarget =
        this.lmX >= DESCENT_PAD_X_MIN && this.lmX <= DESCENT_PAD_X_MAX;
      descentSafeV = Math.abs(this.lmVy) < 5.0;
      descentSafeH = Math.abs(this.lmVx) < 3.0;
      descentSafeTilt = Math.abs(tiltDeg) < 16.0;

      if (this.lmLanded) {
        statusText = 'CONTACT LIGHT — EAGLE LANDED';
        statusLevel = 'go';
      } else if (altitude < 60 && (!descentSafeV || !descentSafeH)) {
        statusText = 'REDUCE DESCENT / DRIFT SPEED';
        statusLevel = 'danger';
      } else if (descentSafeV && descentSafeH && descentOnTarget) {
        statusText = 'ON GLIDESLOPE — SAFE TO LAND';
        statusLevel = 'go';
      } else {
        statusText = descentOnTarget ? 'OVER TRANQUILITY BASE' : 'ALIGN WITH LANDING ZONE';
        statusLevel = 'nominal';
      }

      const prog = altitude > 150 ? '63' : altitude > 45 ? '64' : '66';
      dsky = {
        prog,
        verb: '06',
        noun: '68',
        alarm: this.lmFuel < 20 || (altitude < 55 && !descentSafeV),
        contactLight: this.lmContactLight,
      };
    }

    this.callbacks.onTelemetry({
      stage: this.stage,
      phase: this.phase,
      altitude,
      altitudeUnit,
      vSpeed,
      hSpeed,
      totalSpeed,
      fuel,
      tiltDeg,
      throttle,
      metSeconds: this.metSeconds,
      stageElapsed: this.stageElapsed,
      statusText,
      statusLevel,
      dsky,
      tliCorridorAligned: this.tliCorridorLocked,
      tliProgress,
      tliTargetSpeed: 10.8,
      tliCurrentSpeed: this.tliSpeedKmS,
      loiInWindow: this.loiInWindow,
      loiVelocity: this.loiVelocity,
      loiTargetMin: LOI_TARGET_MIN,
      loiTargetMax: LOI_TARGET_MAX,
      loiProgress,
      descentTargetOffset,
      descentOnTarget,
      descentSafeV,
      descentSafeH,
      descentSafeTilt,
    });
  }

  // =========================================================================
  // RENDERING PIPELINE (60+ FPS Canvas2D)
  // =========================================================================
  public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Uniform letterbox-free cover/contain transform mapping WORLD_W x WORLD_H
    const scaleX = width / WORLD_W;
    const scaleY = height / WORLD_H;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (width - WORLD_W * scale) / 2;
    const offsetY = (height - WORLD_H * scale) / 2;

    // Fill outer matte space
    ctx.fillStyle = '#03060a';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (this.shakeTime > 0) {
      const mag = this.shakeIntensity * (this.shakeTime / 0.55);
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Clip to logical world frame
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    if (this.phase === 'TITLE') {
      this.renderTitleBackdrop(ctx);
    } else if (this.stage === 'TLI') {
      this.renderTliScene(ctx);
    } else if (this.stage === 'LOI') {
      this.renderLoiScene(ctx);
    } else {
      this.renderDescentScene(ctx);
    }

    // Draw particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, (p.life / p.maxLife) * p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private renderTitleBackdrop(ctx: CanvasRenderingContext2D): void {
    drawStarfield(ctx, this.stars, this.simTime, this.simTime * 4, this.simTime * 1.2);
    drawEarth(ctx, 185, 220, 74, this.simTime);
    drawMoonOrb(ctx, 985, 470, 210, true);

    // Subtle translunar trajectory arc connecting Earth & Moon
    ctx.save();
    ctx.strokeStyle = 'rgba(61, 255, 139, 0.22)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(240, 240);
    ctx.bezierCurveTo(510, 140, 720, 200, 860, 315);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Floating Eagle silhouette in center-right space
    const hoverY = 275 + Math.sin(this.simTime * 1.3) * 8;
    const hoverTilt = Math.sin(this.simTime * 0.7) * 0.06;
    drawLunarModuleEagle(ctx, 830, hoverY, hoverTilt, 0.12, false, false, this.simTime, false);
  }

  private renderTliScene(ctx: CanvasRenderingContext2D): void {
    drawStarfield(ctx, this.stars, this.simTime, this.tliX * 0.08, this.tliY * 0.05);

    // Subtle retro plotting grid
    ctx.save();
    ctx.strokeStyle = 'rgba(61, 255, 139, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 200; x < WORLD_W; x += 150) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    for (let y = 120; y < WORLD_H; y += 135) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }
    ctx.restore();

    // Earth & Low Earth Orbit ring
    ctx.save();
    ctx.strokeStyle = 'rgba(105, 195, 255, 0.28)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(EARTH_POS.x, EARTH_POS.y, EARTH_POS.r + 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawEarth(ctx, EARTH_POS.x, EARTH_POS.y, EARTH_POS.r, this.simTime);

    // Moon & Lunar Sphere of Influence ring
    ctx.save();
    ctx.strokeStyle = 'rgba(61, 255, 139, 0.18)';
    ctx.setLineDash([4, 7]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(TLI_MOON_POS.x, TLI_MOON_POS.y, 135, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawMoonOrb(ctx, TLI_MOON_POS.x, TLI_MOON_POS.y, TLI_MOON_POS.r, true);

    // Lunar Entry Corridor Gate
    const pulse = 0.65 + 0.35 * Math.sin(this.simTime * 4.5);
    const gateColor = this.tliCorridorLocked
      ? `rgba(61, 255, 139, ${0.7 + pulse * 0.3})`
      : `rgba(255, 176, 32, ${0.55 + pulse * 0.3})`;

    ctx.save();
    ctx.fillStyle = this.tliCorridorLocked
      ? 'rgba(61, 255, 139, 0.14)'
      : 'rgba(255, 176, 32, 0.09)';
    ctx.fillRect(TLI_GATE_X - 10, TLI_GATE_Y_MIN, 20, TLI_GATE_Y_MAX - TLI_GATE_Y_MIN);

    ctx.strokeStyle = gateColor;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(TLI_GATE_X, TLI_GATE_Y_MIN);
    ctx.lineTo(TLI_GATE_X, TLI_GATE_Y_MAX);
    // Gate bracket endcaps
    ctx.moveTo(TLI_GATE_X - 12, TLI_GATE_Y_MIN);
    ctx.lineTo(TLI_GATE_X + 12, TLI_GATE_Y_MIN);
    ctx.moveTo(TLI_GATE_X - 12, TLI_GATE_Y_MAX);
    ctx.lineTo(TLI_GATE_X + 12, TLI_GATE_Y_MAX);
    ctx.stroke();

    // Labels
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(130, 210, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('EARTH (LEO)', EARTH_POS.x, EARTH_POS.y + EARTH_POS.r + 22);

    ctx.fillStyle = 'rgba(220, 232, 228, 0.82)';
    ctx.fillText('MOON', TLI_MOON_POS.x, TLI_MOON_POS.y + TLI_MOON_POS.r + 20);

    ctx.fillStyle = this.tliCorridorLocked ? '#3dff8b' : '#ffb020';
    ctx.fillText(
      this.tliCorridorLocked ? 'ENTRY CORRIDOR [LOCKED]' : 'LUNAR ENTRY CORRIDOR',
      TLI_GATE_X - 4,
      TLI_GATE_Y_MIN - 12
    );
    ctx.restore();

    // Past flight trail
    if (this.tliTrail.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(61, 255, 139, 0.42)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(this.tliTrail[0].x, this.tliTrail[0].y);
      for (let i = 1; i < this.tliTrail.length; i++) {
        ctx.lineTo(this.tliTrail[i].x, this.tliTrail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Predicted forward trajectory arc
    const pred = this.predictTliTrajectory();
    if (pred.points.length > 1) {
      ctx.save();
      ctx.strokeStyle = this.tliCorridorLocked
        ? 'rgba(61, 255, 139, 0.85)'
        : pred.hitsCorridor
          ? 'rgba(255, 215, 90, 0.8)'
          : 'rgba(255, 145, 50, 0.62)';
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pred.points[0].x, pred.points[0].y);
      for (let i = 1; i < pred.points.length; i++) {
        ctx.lineTo(pred.points[i].x, pred.points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (pred.crossY !== null) {
        ctx.fillStyle = this.tliCorridorLocked ? '#3dff8b' : '#ffb020';
        ctx.beginPath();
        ctx.arc(TLI_GATE_X, pred.crossY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw Apollo S-IVB + CSM/LM Stack
    const rcsDir: -1 | 0 | 1 = this.controls.left ? -1 : this.controls.right ? 1 : 0;
    drawApolloStack(
      ctx,
      this.tliX,
      this.tliY,
      this.tliAngle,
      this.tliThrottle,
      rcsDir,
      true,
      0.92,
      this.simTime
    );
  }

  private renderLoiScene(ctx: CanvasRenderingContext2D): void {
    drawStarfield(ctx, this.stars, this.simTime, this.loiAngle * 40, 12);

    // Distant Earth in upper-left corner
    drawEarth(ctx, 135, 120, 26, this.simTime);

    // Target circular lunar orbit reference ring
    ctx.save();
    ctx.strokeStyle = 'rgba(61, 255, 139, 0.25)';
    ctx.setLineDash([5, 7]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(LOI_MOON_POS.x, LOI_MOON_POS.y, LOI_ORBIT_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dynamic projected trajectory (morphs from amber hyperbola -> green circular capture orbit!)
    const captureFactor = Math.max(
      0,
      Math.min(1, (2420 - this.loiVelocity) / (2420 - 1620))
    );
    const inBand =
      this.loiVelocity >= LOI_TARGET_MIN && this.loiVelocity <= LOI_TARGET_MAX;

    ctx.strokeStyle = inBand
      ? 'rgba(61, 255, 139, 0.92)'
      : 'rgba(255, 176, 32, 0.72)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = this.loiAngle + t * 1.45;
      // Hyperbolic escape flare shrinks smoothly to 0 as captureFactor -> 1
      const flare = (1 - captureFactor) * Math.pow(t, 1.9) * 240;
      const r = LOI_ORBIT_R + flare;
      const px = LOI_MOON_POS.x + Math.cos(a) * r;
      const py = LOI_MOON_POS.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Glowing LOI Burn Window Sector Arc
    const pulse = 0.6 + 0.4 * Math.sin(this.simTime * 5);
    ctx.strokeStyle = this.loiInWindow
      ? `rgba(61, 255, 139, ${0.75 + pulse * 0.25})`
      : 'rgba(61, 255, 139, 0.45)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(LOI_MOON_POS.x, LOI_MOON_POS.y, LOI_ORBIT_R, LOI_WIN_START, LOI_WIN_END);
    ctx.stroke();

    // Burn Window crisp inner/outer borders
    ctx.strokeStyle = '#3dff8b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(LOI_MOON_POS.x, LOI_MOON_POS.y, LOI_ORBIT_R + 7, LOI_WIN_START, LOI_WIN_END);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(LOI_MOON_POS.x, LOI_MOON_POS.y, LOI_ORBIT_R - 7, LOI_WIN_START, LOI_WIN_END);
    ctx.stroke();

    // Label for LOI Burn Window
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = this.loiInWindow ? '#3dff8b' : '#b2f7cf';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.loiInWindow ? '▼ LOI BURN WINDOW ACTIVE — FIRE RETROGRADE ▼' : 'LOI BURN WINDOW (PERILUNE)',
      LOI_MOON_POS.x,
      LOI_MOON_POS.y - LOI_ORBIT_R - 22
    );
    ctx.restore();

    // Massive Moon Orb
    drawMoonOrb(ctx, LOI_MOON_POS.x, LOI_MOON_POS.y, LOI_MOON_POS.r, true);

    // Spacecraft on orbital arc
    const shipX = LOI_MOON_POS.x + Math.cos(this.loiAngle) * LOI_ORBIT_R;
    const shipY = LOI_MOON_POS.y + Math.sin(this.loiAngle) * LOI_ORBIT_R;
    const idealRetroAngle = this.loiAngle - Math.PI / 2;
    const shipAngle = idealRetroAngle + this.loiShipAttitude;

    // Retrograde alignment guide ring around spacecraft
    ctx.save();
    ctx.translate(shipX, shipY);
    const aligned = Math.abs(this.loiShipAttitude) < 0.55;
    ctx.strokeStyle = aligned ? 'rgba(61, 255, 139, 0.5)' : 'rgba(255, 176, 32, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 38, idealRetroAngle - 0.55, idealRetroAngle + 0.55);
    ctx.stroke();

    // Small chevron showing ideal retrograde vector
    ctx.fillStyle = '#3dff8b';
    const cx = Math.cos(idealRetroAngle) * 44;
    const cy = Math.sin(idealRetroAngle) * 44;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const rcsDir: -1 | 0 | 1 = this.controls.left ? -1 : this.controls.right ? 1 : 0;
    drawApolloStack(
      ctx,
      shipX,
      shipY,
      shipAngle,
      this.loiThrottle,
      rcsDir,
      false,
      1.12,
      this.simTime
    );
  }

  private renderDescentScene(ctx: CanvasRenderingContext2D): void {
    drawStarfield(ctx, this.stars, this.simTime, this.lmX * 0.06, this.lmY * 0.04);

    // Earthrise in black lunar sky
    drawEarth(ctx, 195, 128, 30, this.simTime);

    // Parallax Lunar Mountain Ridge (Far)
    ctx.save();
    const farShift = (this.lmX - WORLD_W / 2) * -0.05;
    ctx.fillStyle = '#14191e';
    ctx.beginPath();
    ctx.moveTo(-60, WORLD_H);
    for (const pt of this.ridgeFar) {
      ctx.lineTo(pt.x + farShift, pt.y);
    }
    ctx.lineTo(WORLD_W + 60, WORLD_H);
    ctx.closePath();
    ctx.fill();

    // Parallax Lunar Ridge (Mid)
    const midShift = (this.lmX - WORLD_W / 2) * -0.11;
    ctx.fillStyle = '#1f262c';
    ctx.beginPath();
    ctx.moveTo(-60, WORLD_H);
    for (const pt of this.ridgeMid) {
      ctx.lineTo(pt.x + midShift, pt.y);
    }
    ctx.lineTo(WORLD_W + 60, WORLD_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Interactive Foreground Lunar Surface (Sea of Tranquility)
    ctx.save();
    const surfGrad = ctx.createLinearGradient(0, 470, 0, WORLD_H);
    surfGrad.addColorStop(0, '#5a6168');
    surfGrad.addColorStop(0.45, '#343a40');
    surfGrad.addColorStop(1, '#181c20');
    ctx.fillStyle = surfGrad;

    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (const pt of this.terrain) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.closePath();
    ctx.fill();

    // Crisp sunlit lunar horizon rim
    ctx.strokeStyle = '#a8b2ba';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.terrain.length; i++) {
      const pt = this.terrain[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Subtle foreground crater ellipses
    ctx.fillStyle = 'rgba(14, 18, 22, 0.42)';
    const groundCraters = [
      { x: 145, y: 622, rx: 38, ry: 9 },
      { x: 350, y: 635, rx: 28, ry: 7 },
      { x: 960, y: 618, rx: 44, ry: 10 },
      { x: 1110, y: 640, rx: 26, ry: 6 },
    ];
    for (const c of groundCraters) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlighted Tranquility Base Landing Zone
    const padPulse = 0.65 + 0.35 * Math.sin(this.simTime * 4.5);
    const overPad = this.lmX >= DESCENT_PAD_X_MIN && this.lmX <= DESCENT_PAD_X_MAX;
    const padColor = overPad ? '#3dff8b' : '#ffb020';

    // Pad glow strip
    ctx.strokeStyle = padColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(DESCENT_PAD_X_MIN, DESCENT_PAD_Y);
    ctx.lineTo(DESCENT_PAD_X_MAX, DESCENT_PAD_Y);
    ctx.stroke();

    // Pad vertical beacons
    ctx.fillStyle = padColor;
    ctx.globalAlpha = padPulse;
    ctx.beginPath();
    ctx.arc(DESCENT_PAD_X_MIN, DESCENT_PAD_Y - 5, 4, 0, Math.PI * 2);
    ctx.arc(DESCENT_PAD_X_MAX, DESCENT_PAD_Y - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Landing radar approach cone beams
    ctx.strokeStyle = overPad ? 'rgba(61, 255, 139, 0.16)' : 'rgba(255, 176, 32, 0.12)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(DESCENT_PAD_X_MIN, DESCENT_PAD_Y);
    ctx.lineTo(DESCENT_PAD_X_MIN - 24, DESCENT_PAD_Y - 75);
    ctx.moveTo(DESCENT_PAD_X_MAX, DESCENT_PAD_Y);
    ctx.lineTo(DESCENT_PAD_X_MAX + 24, DESCENT_PAD_Y - 75);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Pad label
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = padColor;
    ctx.textAlign = 'center';
    ctx.fillText('▲ TRANQUILITY BASE — LANDING ZONE ▲', DESCENT_PAD_CENTER, DESCENT_PAD_Y + 22);
    ctx.restore();

    // Radar shadow & vertical drop line directly under Eagle
    const ground = this.getTerrainHeightAndSlope(this.lmX);
    const altPx = Math.max(0, ground.y - (this.lmY + EAGLE_FOOTPADS_OFFSET));
    if (!this.lmLanded && this.phase === 'PLAYING') {
      ctx.save();
      ctx.strokeStyle = 'rgba(61, 255, 139, 0.28)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(this.lmX, this.lmY + EAGLE_FOOTPADS_OFFSET);
      ctx.lineTo(this.lmX, ground.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ground radar shadow ellipse (grows sharper as Eagle nears ground)
      const closeness = Math.max(0.15, 1 - altPx / 450);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.48 * closeness})`;
      ctx.beginPath();
      ctx.ellipse(this.lmX, ground.y + 1, 24 * closeness + 8, 4 * closeness + 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Subtle floating velocity safety tag next to Eagle when low (< 120m)
      if (altPx / DESCENT_PX_PER_M < 120) {
        const vOk = Math.abs(this.lmVy) < 5.0;
        ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = vOk ? '#3dff8b' : '#ff5a52';
        ctx.textAlign = 'left';
        ctx.fillText(`V ${(-this.lmVy).toFixed(1)} m/s`, this.lmX + 34, this.lmY - 4);
      }
      ctx.restore();
    }

    // Planted Apollo 11 Flag after successful touchdown
    if (this.lmFlagProgress > 0) {
      drawPlantedFlag(ctx, this.lmX + 44, ground.y, this.lmFlagProgress);
    }

    // Draw Lunar Module "Eagle"
    drawLunarModuleEagle(
      ctx,
      this.lmX,
      this.lmY,
      this.lmAngle,
      this.lmThrottle,
      this.controls.left && this.lmFuel > 0 && !this.lmLanded,
      this.controls.right && this.lmFuel > 0 && !this.lmLanded,
      this.simTime,
      this.lmContactLight
    );
  }
}
