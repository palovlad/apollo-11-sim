import React from 'react';
import { ControlState, RadioMessage, StageId, TelemetrySnapshot } from '../types';

interface HudProps {
  telemetry: TelemetrySnapshot;
  radio: RadioMessage | null;
  muted: boolean;
  controls: ControlState;
  onToggleMute: () => void;
  onRetryStage: () => void;
  onReturnTitle: () => void;
  onControlChange: (partial: Partial<ControlState>) => void;
}

const STAGES: Array<{ id: StageId; num: string; label: string }> = [
  { id: 'TLI', num: '01', label: 'TLI' },
  { id: 'LOI', num: '02', label: 'LOI' },
  { id: 'DESCENT', num: '03', label: 'EAGLE DESCENT' },
];

function formatMet(seconds: number): string {
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const Hud: React.FC<HudProps> = ({
  telemetry,
  radio,
  muted,
  controls,
  onToggleMute,
  onRetryStage,
  onReturnTitle,
  onControlChange,
}) => {
  const activeIdx = STAGES.findIndex((s) => s.id === telemetry.stage);

  const absV = Math.abs(telemetry.vSpeed);
  const absH = Math.abs(telemetry.hSpeed);

  const vClass =
    telemetry.stage === 'DESCENT'
      ? absV < 5.0
        ? ''
        : absV < 7.5
          ? 'amber'
          : 'danger'
      : '';

  const hClass =
    telemetry.stage === 'DESCENT'
      ? absH < 3.0
        ? ''
        : absH < 5.0
          ? 'amber'
          : 'danger'
      : '';

  const fuelClass =
    telemetry.fuel < 15 ? 'danger' : telemetry.fuel < 30 ? 'amber' : '';

  // LOI gauge needle position (range 1200..2500 m/s)
  const loiMinScale = 1200;
  const loiMaxScale = 2500;
  const loiNeedlePct = Math.max(
    0,
    Math.min(100, ((telemetry.loiVelocity - loiMinScale) / (loiMaxScale - loiMinScale)) * 100)
  );
  const loiSafeLeftPct =
    ((telemetry.loiTargetMin - loiMinScale) / (loiMaxScale - loiMinScale)) * 100;
  const loiSafeWidthPct =
    ((telemetry.loiTargetMax - telemetry.loiTargetMin) / (loiMaxScale - loiMinScale)) * 100;

  return (
    <>
      {/* TOP BAR */}
      <header className="hud-top-bar">
        <div className="console-panel mission-stepper" aria-label="Mission Stages">
          {STAGES.map((st, idx) => (
            <React.Fragment key={st.id}>
              <div
                className={`step-pill ${
                  idx === activeIdx ? 'active' : idx < activeIdx ? 'done' : ''
                }`}
              >
                <span className="step-num">{st.num}</span>
                <span>{st.label}</span>
              </div>
              {idx < STAGES.length - 1 && <span className="step-arrow">›</span>}
            </React.Fragment>
          ))}
        </div>

        {/* AGC DSKY Indicator */}
        <div className="console-panel dsky-strip" aria-label="Apollo Guidance Computer DSKY">
          <div className="dsky-cell">
            <span className="dsky-label">PROG</span>
            <span className="dsky-digits">{telemetry.dsky.prog}</span>
          </div>
          <div className="dsky-cell">
            <span className="dsky-label">VERB</span>
            <span className="dsky-digits">{telemetry.dsky.verb}</span>
          </div>
          <div className="dsky-cell">
            <span className="dsky-label">NOUN</span>
            <span className="dsky-digits">{telemetry.dsky.noun}</span>
          </div>
          <div className="dsky-lamps">
            <span className={`lamp ${telemetry.dsky.alarm ? 'alarm-on' : ''}`}>
              ALARM
            </span>
            <span className={`lamp ${telemetry.dsky.contactLight ? 'contact-on' : ''}`}>
              CONTACT
            </span>
          </div>
        </div>

        {/* MET & Controls */}
        <div className="top-actions">
          <div className="console-panel met-box">
            <span>MET</span>
            <span className="met-val">{formatMet(telemetry.metSeconds)}</span>
          </div>
          <button
            id="btn-retry-stage"
            type="button"
            className="hud-btn"
            onClick={onRetryStage}
            title="Restart Current Stage (R)"
          >
            ↻ RETRY
          </button>
          <button
            id="btn-mute-audio"
            type="button"
            className={`hud-btn ${muted ? 'muted' : ''}`}
            onClick={onToggleMute}
            title="Toggle Audio (M)"
          >
            {muted ? '🔇 MUTED' : '🔊 AUDIO'}
          </button>
          <button
            id="btn-menu"
            type="button"
            className="hud-btn"
            onClick={onReturnTitle}
            title="Mission Menu"
          >
            MENU
          </button>
        </div>
      </header>

      {/* LEFT TELEMETRY PANEL */}
      <aside className="console-panel hud-left" aria-label="Primary Flight Telemetry">
        <div className="panel-header">
          <span>TELEMETRY</span>
          <span>LIVE</span>
        </div>

        <div className="telem-row">
          <span className="telem-label">ALTITUDE</span>
          <span className="telem-value">
            {telemetry.altitudeUnit === 'km'
              ? telemetry.altitude.toLocaleString()
              : telemetry.altitude.toFixed(1)}
            <span className="telem-sub">{telemetry.altitudeUnit}</span>
          </span>
        </div>

        <div className="telem-row">
          <span className="telem-label">V-SPEED</span>
          <span className={`telem-value ${vClass}`}>
            {telemetry.vSpeed >= 0 ? '+' : ''}
            {telemetry.vSpeed.toFixed(1)}
            <span className="telem-sub">m/s</span>
          </span>
        </div>

        <div className="telem-row">
          <span className="telem-label">H-SPEED</span>
          <span className={`telem-value ${hClass}`}>
            {telemetry.hSpeed >= 0 ? '+' : ''}
            {telemetry.hSpeed.toFixed(1)}
            <span className="telem-sub">m/s</span>
          </span>
        </div>

        <div>
          <div className="telem-row" style={{ marginBottom: 4 }}>
            <span className="telem-label">FUEL</span>
            <span className={`telem-value ${fuelClass}`} style={{ fontSize: 14 }}>
              {Math.ceil(telemetry.fuel)}
              <span className="telem-sub">%</span>
            </span>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${fuelClass}`}
              style={{ width: `${Math.max(0, Math.min(100, telemetry.fuel))}%` }}
            />
          </div>
        </div>

        <div className={`status-banner ${telemetry.statusLevel}`}>
          {telemetry.statusText}
        </div>
      </aside>

      {/* RIGHT STAGE-SPECIFIC GUIDANCE PANEL */}
      <aside className="console-panel hud-right" aria-label="Stage Guidance">
        {telemetry.stage === 'TLI' && (
          <>
            <div className="panel-header">
              <span>STAGE 1 // TLI</span>
              <span>S-IVB</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">VELOCITY</span>
              <span
                className={`telem-value ${
                  telemetry.tliCurrentSpeed >= 10.0 ? '' : 'amber'
                }`}
              >
                {telemetry.tliCurrentSpeed.toFixed(2)}
                <span className="telem-sub">km/s</span>
              </span>
            </div>
            <div>
              <div className="check-item" style={{ marginBottom: 4 }}>
                <span>TARGET: 10.0–11.4 km/s</span>
                <span
                  className={`check-badge ${
                    telemetry.tliCurrentSpeed >= 10.0 ? 'ok' : 'warn'
                  }`}
                >
                  {telemetry.tliCurrentSpeed >= 10.0 ? 'GO' : 'BURN'}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className={`bar-fill ${
                    telemetry.tliCurrentSpeed >= 10.0 ? '' : 'amber'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((telemetry.tliCurrentSpeed - 7.5) / (11.2 - 7.5)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="checklist">
              <div className="check-item">
                <span>LUNAR CORRIDOR</span>
                <span
                  className={`check-badge ${
                    telemetry.tliCorridorAligned ? 'ok' : 'warn'
                  }`}
                >
                  {telemetry.tliCorridorAligned ? 'LOCKED' : 'ALIGN [A/D]'}
                </span>
              </div>
              <div className="check-item">
                <span>TRANSIT PROGRESS</span>
                <span>{Math.round(telemetry.tliProgress)}%</span>
              </div>
            </div>
          </>
        )}

        {telemetry.stage === 'LOI' && (
          <>
            <div className="panel-header">
              <span>STAGE 2 // LOI</span>
              <span>SPS</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">ORBIT SPD</span>
              <span
                className={`telem-value ${
                  telemetry.loiVelocity <= telemetry.loiTargetMax &&
                  telemetry.loiVelocity >= telemetry.loiTargetMin
                    ? ''
                    : 'amber'
                }`}
              >
                {Math.round(telemetry.loiVelocity)}
                <span className="telem-sub">m/s</span>
              </span>
            </div>
            <div>
              <div className="check-item" style={{ marginBottom: 4 }}>
                <span>CAPTURE BAND</span>
                <span>1460–1760 m/s</span>
              </div>
              <div className="loi-gauge">
                <div
                  className="loi-safe-zone"
                  style={{
                    left: `${loiSafeLeftPct}%`,
                    width: `${loiSafeWidthPct}%`,
                  }}
                />
                <div className="loi-needle" style={{ left: `${loiNeedlePct}%` }} />
              </div>
            </div>
            <div className="checklist">
              <div className="check-item">
                <span>BURN WINDOW</span>
                <span
                  className={`check-badge ${
                    telemetry.loiInWindow ? 'ok' : 'warn'
                  }`}
                >
                  {telemetry.loiInWindow ? 'ACTIVE' : 'STAND BY'}
                </span>
              </div>
              <div className="check-item">
                <span>RETRO TRIM</span>
                <span
                  className={`check-badge ${
                    Math.abs(telemetry.tiltDeg) < 28 ? 'ok' : 'warn'
                  }`}
                >
                  {telemetry.tiltDeg >= 0 ? '+' : ''}
                  {Math.round(telemetry.tiltDeg)}°
                </span>
              </div>
            </div>
          </>
        )}

        {telemetry.stage === 'DESCENT' && (
          <>
            <div className="panel-header">
              <span>STAGE 3 // EAGLE</span>
              <span>LANDING</span>
            </div>
            <div className="checklist">
              <div className="check-item">
                <span>V-SPD &lt; 5.0 m/s</span>
                <span
                  className={`check-badge ${
                    telemetry.descentSafeV ? 'ok' : 'bad'
                  }`}
                >
                  {telemetry.descentSafeV ? 'SAFE' : 'FAST'}
                </span>
              </div>
              <div className="check-item">
                <span>H-SPD &lt; 3.0 m/s</span>
                <span
                  className={`check-badge ${
                    telemetry.descentSafeH ? 'ok' : 'bad'
                  }`}
                >
                  {telemetry.descentSafeH ? 'SAFE' : 'DRIFT'}
                </span>
              </div>
              <div className="check-item">
                <span>TILT &lt; 16°</span>
                <span
                  className={`check-badge ${
                    telemetry.descentSafeTilt ? 'ok' : 'warn'
                  }`}
                >
                  {Math.round(Math.abs(telemetry.tiltDeg))}°
                </span>
              </div>
              <div className="check-item">
                <span>TRANQUILITY PAD</span>
                <span
                  className={`check-badge ${
                    telemetry.descentOnTarget ? 'ok' : 'warn'
                  }`}
                >
                  {telemetry.descentOnTarget
                    ? 'ON ZONE'
                    : `${telemetry.descentTargetOffset > 0 ? '←' : '→'} ${Math.abs(
                        Math.round(telemetry.descentTargetOffset)
                      )}m`}
                </span>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* BOTTOM CAPCOM RADIO + TACTILE CONTROLS */}
      <footer className="hud-bottom">
        <div className="console-panel radio-box" aria-live="polite">
          <span
            className={`radio-tag ${
              radio?.tone === 'warning' ? 'warning' : ''
            }`}
          >
            <span className="radio-dot" />
            {radio ? radio.sender : 'HOUSTON'}
          </span>
          <span className="radio-text">
            {radio
              ? radio.text
              : 'Flight telemetry link nominal. Standing by for guidance commands.'}
          </span>
          {radio && <span className="radio-time">{radio.timestamp}</span>}
        </div>

        <div className="console-panel flight-pad" aria-label="Touch Flight Controls">
          <button
            id="btn-rcs-left"
            type="button"
            className={`ctrl-btn ${controls.left ? 'active' : ''}`}
            onPointerDown={() => onControlChange({ left: true })}
            onPointerUp={() => onControlChange({ left: false })}
            onPointerLeave={() => onControlChange({ left: false })}
            onPointerCancel={() => onControlChange({ left: false })}
          >
            <span>◀ RCS</span>
            <small>A / ←</small>
          </button>

          <button
            id="btn-main-thrust"
            type="button"
            className={`ctrl-btn primary ${controls.thrust ? 'active' : ''}`}
            onPointerDown={() => onControlChange({ thrust: true })}
            onPointerUp={() => onControlChange({ thrust: false })}
            onPointerLeave={() => onControlChange({ thrust: false })}
            onPointerCancel={() => onControlChange({ thrust: false })}
          >
            <span>▲ THRUST</span>
            <small>W / ↑ / SPACE</small>
          </button>

          <button
            id="btn-rcs-right"
            type="button"
            className={`ctrl-btn ${controls.right ? 'active' : ''}`}
            onPointerDown={() => onControlChange({ right: true })}
            onPointerUp={() => onControlChange({ right: false })}
            onPointerLeave={() => onControlChange({ right: false })}
            onPointerCancel={() => onControlChange({ right: false })}
          >
            <span>RCS ▶</span>
            <small>D / →</small>
          </button>
        </div>
      </footer>
    </>
  );
};
