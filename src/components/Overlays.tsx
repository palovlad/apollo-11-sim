import React from 'react';
import {
  FailureReport,
  MissionSummary,
  StageClearInfo,
  StageId,
} from '../types';

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return mins > 0
    ? `${mins}m ${rem.toFixed(1)}s`
    : `${rem.toFixed(1)}s`;
}

const MissionPatchSvg: React.FC = () => (
  <svg
    className="mission-patch"
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="50" cy="50" r="46" fill="#071310" stroke="#3dff8b" strokeWidth="2.5" />
    <circle cx="50" cy="50" r="39" fill="#04090d" stroke="#ffb020" strokeWidth="1.2" strokeDasharray="3 3" />
    {/* Earth */}
    <circle cx="28" cy="30" r="10" fill="#1d6fd4" stroke="#8ad2ff" strokeWidth="1.2" />
    {/* Lunar horizon */}
    <path d="M13 68 Q50 53 87 68 A39 39 0 0 1 13 68 Z" fill="#4f5a61" stroke="#b5c2c9" strokeWidth="1.2" />
    {/* Stylized Eagle descent silhouette */}
    <polygon points="50,31 58,41 55,49 45,49 42,41" fill="#e8c052" stroke="#fff3c4" strokeWidth="1" />
    <line x1="43" y1="49" x2="36" y2="59" stroke="#3dff8b" strokeWidth="1.8" />
    <line x1="57" y1="49" x2="64" y2="59" stroke="#3dff8b" strokeWidth="1.8" />
    <line x1="50" y1="49" x2="50" y2="59" stroke="#3dff8b" strokeWidth="1.5" />
    {/* Stars */}
    <circle cx="71" cy="28" r="1.5" fill="#ffffff" />
    <circle cx="62" cy="22" r="1" fill="#3dff8b" />
    <circle cx="77" cy="40" r="1.2" fill="#ffb020" />
  </svg>
);

interface TitleOverlayProps {
  onStart: (stage: StageId) => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  onStart,
  muted,
  onToggleMute,
}) => (
  <div className="modal-backdrop">
    <main className="modal-card" aria-label="Apollo 11 Mission Briefing">
      <div className="title-header">
        <MissionPatchSvg />
        <div>
          <div className="eyebrow">NASA // AGC SIMULATION · DIFFICULTY: LOW</div>
          <h1 className="modal-title">APOLLO 11 LUNAR SIMULATOR</h1>
          <p className="modal-subtitle">
            Guide Apollo 11 from Low Earth Orbit across the cislunar void and
            land Lunar Module <strong>Eagle</strong> safely in the Sea of
            Tranquility.
          </p>
        </div>
      </div>

      <div className="stage-preview-grid">
        <button
          id="btn-jump-tli"
          type="button"
          className="stage-mini-card"
          onClick={() => onStart('TLI')}
        >
          <div className="stage-mini-num">STAGE 01 · P15</div>
          <div className="stage-mini-name">TLI &amp; Lunar Transit</div>
          <div className="stage-mini-desc">
            Burn to 10.8 km/s and steer your dashed arc into the green Lunar
            Entry Corridor.
          </div>
        </button>

        <button
          id="btn-jump-loi"
          type="button"
          className="stage-mini-card"
          onClick={() => onStart('LOI')}
        >
          <div className="stage-mini-num">STAGE 02 · P40</div>
          <div className="stage-mini-name">Lunar Orbit (LOI)</div>
          <div className="stage-mini-desc">
            Brake retrograde inside the Perilune window to capture into circular
            lunar orbit.
          </div>
        </button>

        <button
          id="btn-jump-descent"
          type="button"
          className="stage-mini-card"
          onClick={() => onStart('DESCENT')}
        >
          <div className="stage-mini-num">STAGE 03 · P66</div>
          <div className="stage-mini-name">Eagle Touchdown</div>
          <div className="stage-mini-desc">
            Land gently on Tranquility Base with V-Speed &lt; 5 m/s and H-Speed
            &lt; 3 m/s.
          </div>
        </button>
      </div>

      <div className="controls-box">
        <div className="ctrl-row">
          <span className="kbd">W</span>
          <span className="kbd">↑</span>
          <span className="kbd">SPACE</span>
          <span>Main Engine Thrust</span>
        </div>
        <div className="ctrl-row">
          <span className="kbd">A / D</span>
          <span className="kbd">← / →</span>
          <span>RCS Attitude &amp; Drift</span>
        </div>
        <div className="ctrl-row">
          <span className="kbd">R</span>
          <span>Instant Stage Retry</span>
        </div>
        <div className="ctrl-row">
          <span className="kbd">M</span>
          <span>Mute / Unmute Web Audio</span>
        </div>
      </div>

      <div className="modal-actions">
        <button
          id="btn-launch-mission"
          type="button"
          className="btn-primary"
          onClick={() => onStart('TLI')}
        >
          LAUNCH FULL MISSION ▶
        </button>
        <button
          id="btn-title-mute"
          type="button"
          className="btn-secondary"
          onClick={onToggleMute}
        >
          {muted ? '🔇 AUDIO OFF' : '🔊 AUDIO ON'}
        </button>
      </div>
    </main>
  </div>
);

interface StageClearOverlayProps {
  info: StageClearInfo;
  onNext: () => void;
}

export const StageClearOverlay: React.FC<StageClearOverlayProps> = ({
  info,
  onNext,
}) => (
  <div className="modal-backdrop">
    <section className="modal-card" aria-label="Stage Complete">
      <div className="eyebrow">MISSION MILESTONE ACHIEVED</div>
      <h2 className="modal-title">{info.title}</h2>
      <p className="modal-subtitle">{info.subtitle}</p>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">STAGE DURATION</div>
          <div className="stat-tile-value">{formatDuration(info.stageTime)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">STAGE FUEL REMAINING</div>
          <div className="stat-tile-value">{Math.round(info.fuelRemaining)}%</div>
        </div>
      </div>

      <div className="modal-actions">
        <button
          id="btn-next-stage"
          type="button"
          className="btn-primary"
          onClick={onNext}
        >
          PROCEED TO{' '}
          {info.nextStage === 'LOI'
            ? 'STAGE 02: LUNAR ORBIT (LOI)'
            : 'STAGE 03: EAGLE DESCENT'}{' '}
          ▶
        </button>
      </div>
    </section>
  </div>
);

interface SuccessOverlayProps {
  summary: MissionSummary;
  onReplayMission: () => void;
  onReplayDescent: () => void;
}

export const SuccessOverlay: React.FC<SuccessOverlayProps> = ({
  summary,
  onReplayMission,
  onReplayDescent,
}) => (
  <div className="modal-backdrop">
    <section className="modal-card" aria-label="Mission Accomplished">
      <div className="eyebrow">TRANQUILITY BASE // CONTACT LIGHT</div>
      <h2 className="modal-title">“THE EAGLE HAS LANDED”</h2>
      <p className="modal-subtitle">
        {summary.onTranquilityBase
          ? 'Textbook touchdown right inside the Sea of Tranquility landing zone. Houston Mission Control is cheering!'
          : 'Safe lunar touchdown achieved on nearby level regolith! Eagle is intact and ready for surface EVA.'}
      </p>

      <div className="grade-badge">
        <span>GRADE {summary.grade}</span>
        <span>·</span>
        <span>{summary.rankTitle}</span>
      </div>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">MISSION TIME (MET)</div>
          <div className="stat-tile-value">{formatDuration(summary.totalTime)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">FUEL REMAINING</div>
          <div className="stat-tile-value">
            {Math.round(summary.fuelRemaining)}%
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">TOUCHDOWN V-SPEED</div>
          <div className="stat-tile-value">
            {summary.touchdownVSpeed.toFixed(2)} m/s
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">TOUCHDOWN H-SPEED</div>
          <div className="stat-tile-value">
            {summary.touchdownHSpeed.toFixed(2)} m/s
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button
          id="btn-replay-full"
          type="button"
          className="btn-primary"
          onClick={onReplayMission}
        >
          FLY FULL MISSION AGAIN ↻
        </button>
        <button
          id="btn-replay-descent"
          type="button"
          className="btn-secondary"
          onClick={onReplayDescent}
        >
          REPLAY LANDING
        </button>
      </div>
    </section>
  </div>
);

interface FailureOverlayProps {
  report: FailureReport;
  onRetryStage: () => void;
  onRestartMission: () => void;
}

export const FailureOverlay: React.FC<FailureOverlayProps> = ({
  report,
  onRetryStage,
  onRestartMission,
}) => (
  <div className="modal-backdrop">
    <section className="modal-card danger-accent" aria-label="Mission Abort">
      <div className="eyebrow" style={{ color: '#ff7066' }}>
        STAGE {report.stage} // ABORT TRIGGERED
      </div>
      <h2 className="modal-title">{report.title}</h2>
      <p className="modal-subtitle">{report.reason}</p>

      <div className="stats-grid">
        {report.stage === 'DESCENT' ? (
          <>
            <div className="stat-tile">
              <div className="stat-tile-label">IMPACT V-SPEED (LIMIT &lt; 5)</div>
              <div
                className={`stat-tile-value ${
                  report.vSpeed >= 5 ? 'danger' : ''
                }`}
              >
                {report.vSpeed.toFixed(1)} m/s
              </div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">IMPACT H-SPEED (LIMIT &lt; 3)</div>
              <div
                className={`stat-tile-value ${
                  report.hSpeed >= 3 ? 'danger' : ''
                }`}
              >
                {report.hSpeed.toFixed(1)} m/s
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-tile">
              <div className="stat-tile-label">FUEL AT ABORT</div>
              <div className="stat-tile-value amber">
                {Math.round(report.fuel)}%
              </div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-label">ATTITUDE ANGLE</div>
              <div className="stat-tile-value amber">
                {Math.round(report.tiltDeg)}°
              </div>
            </div>
          </>
        )}
      </div>

      <div className="modal-actions">
        <button
          id="btn-retry-now"
          type="button"
          className="btn-primary amber"
          onClick={onRetryStage}
        >
          INSTANT RETRY STAGE [R] ↻
        </button>
        <button
          id="btn-restart-all"
          type="button"
          className="btn-secondary"
          onClick={onRestartMission}
        >
          RESTART FROM TLI
        </button>
      </div>
    </section>
  </div>
);
