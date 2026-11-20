export type StageId = 'TLI' | 'LOI' | 'DESCENT';

export type GamePhase =
  | 'TITLE'
  | 'PLAYING'
  | 'STAGE_CLEAR'
  | 'SUCCESS'
  | 'FAILED';

export interface ControlState {
  thrust: boolean;
  left: boolean;
  right: boolean;
}

export interface RadioMessage {
  id: number;
  sender: 'HOUSTON' | 'EAGLE' | 'AGC';
  text: string;
  timestamp: string;
  tone?: 'normal' | 'warning' | 'success';
}

export interface DskyState {
  prog: string;
  verb: string;
  noun: string;
  alarm: boolean;
  contactLight: boolean;
}

export interface TelemetrySnapshot {
  stage: StageId;
  phase: GamePhase;
  altitude: number;          // km in TLI/LOI, meters in DESCENT
  altitudeUnit: 'km' | 'm';
  vSpeed: number;            // m/s (negative = descending in DESCENT)
  hSpeed: number;            // m/s
  totalSpeed: number;        // m/s or km/s depending on stage
  fuel: number;              // 0 - 100 %
  tiltDeg: number;           // degrees (-180..180)
  throttle: number;          // 0 - 1
  metSeconds: number;        // mission elapsed time
  stageElapsed: number;      // current stage time
  statusText: string;
  statusLevel: 'nominal' | 'caution' | 'danger' | 'go';
  dsky: DskyState;

  // Stage-specific tactical telemetry
  tliCorridorAligned: boolean;
  tliProgress: number;       // 0 - 100 %
  tliTargetSpeed: number;    // km/s
  tliCurrentSpeed: number;   // km/s

  loiInWindow: boolean;
  loiVelocity: number;       // m/s
  loiTargetMin: number;      // m/s
  loiTargetMax: number;      // m/s
  loiProgress: number;       // 0 - 100 % orbital travel

  descentTargetOffset: number; // horizontal meters to Tranquility Base center
  descentOnTarget: boolean;
  descentSafeV: boolean;
  descentSafeH: boolean;
  descentSafeTilt: boolean;
}

export interface StageClearInfo {
  completedStage: StageId;
  nextStage: StageId;
  title: string;
  subtitle: string;
  fuelRemaining: number;
  stageTime: number;
}

export interface MissionSummary {
  totalTime: number;
  fuelRemaining: number;
  touchdownVSpeed: number;
  touchdownHSpeed: number;
  touchdownTilt: number;
  targetOffset: number;
  onTranquilityBase: boolean;
  grade: 'A+' | 'A' | 'B';
  rankTitle: string;
}

export interface FailureReport {
  stage: StageId;
  title: string;
  reason: string;
  vSpeed: number;
  hSpeed: number;
  fuel: number;
  tiltDeg: number;
}
