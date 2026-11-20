import React, { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { Hud } from './components/Hud';
import {
  FailureOverlay,
  StageClearOverlay,
  SuccessOverlay,
  TitleOverlay,
} from './components/Overlays';
import { ApolloSimulation } from './engine/simulation';
import {
  ControlState,
  FailureReport,
  MissionSummary,
  RadioMessage,
  StageClearInfo,
  StageId,
  TelemetrySnapshot,
} from './types';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  stage: 'TLI',
  phase: 'TITLE',
  altitude: 384400,
  altitudeUnit: 'km',
  vSpeed: 0,
  hSpeed: 0,
  totalSpeed: 7.8,
  fuel: 100,
  tiltDeg: 0,
  throttle: 0,
  metSeconds: 0,
  stageElapsed: 0,
  statusText: 'STANDBY FOR LAUNCH',
  statusLevel: 'nominal',
  dsky: {
    prog: '15',
    verb: '06',
    noun: '95',
    alarm: false,
    contactLight: false,
  },
  tliCorridorAligned: false,
  tliProgress: 0,
  tliTargetSpeed: 10.8,
  tliCurrentSpeed: 7.8,
  loiInWindow: false,
  loiVelocity: 2420,
  loiTargetMin: 1460,
  loiTargetMax: 1760,
  loiProgress: 0,
  descentTargetOffset: 0,
  descentOnTarget: false,
  descentSafeV: true,
  descentSafeH: true,
  descentSafeTilt: true,
};

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<ApolloSimulation | null>(null);
  const stageClearTimestampRef = useRef<number>(0);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);
  const [radio, setRadio] = useState<RadioMessage | null>(null);
  const [stageClear, setStageClear] = useState<StageClearInfo | null>(null);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [failure, setFailure] = useState<FailureReport | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [controls, setControls] = useState<ControlState>({
    thrust: false,
    left: false,
    right: false,
  });

  const controlsRef = useRef<ControlState>(controls);
  controlsRef.current = controls;

  const updateControls = useCallback((partial: Partial<ControlState>) => {
    soundEngine.unlock();
    setControls((prev) => {
      const next = { ...prev, ...partial };
      simRef.current?.setControls(next);
      return next;
    });
  }, []);

  const resetControls = useCallback(() => {
    const empty: ControlState = { thrust: false, left: false, right: false };
    setControls(empty);
    simRef.current?.setControls(empty);
  }, []);

  const handleToggleMute = useCallback(() => {
    soundEngine.unlock();
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleStart = useCallback(
    (stage: StageId) => {
      setStageClear(null);
      setSummary(null);
      setFailure(null);
      resetControls();
      simRef.current?.startMission(stage);
    },
    [resetControls]
  );

  const handleRetryStage = useCallback(() => {
    setStageClear(null);
    setSummary(null);
    setFailure(null);
    resetControls();
    simRef.current?.retryCurrentStage();
  }, [resetControls]);

  const handleNextStage = useCallback(() => {
    setStageClear(null);
    resetControls();
    simRef.current?.proceedToNextStage();
  }, [resetControls]);

  const handleReturnTitle = useCallback(() => {
    setStageClear(null);
    setSummary(null);
    setFailure(null);
    resetControls();
    simRef.current?.returnToTitle();
  }, [resetControls]);

  // Initialize simulation engine & requestAnimationFrame loop
  useEffect(() => {
    const sim = new ApolloSimulation({
      onTelemetry: (snap) => setTelemetry(snap),
      onRadio: (msg) => setRadio(msg),
      onStageClear: (info) => {
        stageClearTimestampRef.current = performance.now();
        setStageClear(info);
      },
      onSuccess: (s) => setSummary(s),
      onFailure: (f) => setFailure(f),
    });
    simRef.current = sim;

    let rafId = 0;
    let lastTime = performance.now();

    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      sim.update(dt);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          sim.render(ctx, canvas.width, canvas.height);
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      soundEngine.silenceThrusters();
    };
  }, []);

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        e.preventDefault();
      }

      if (code === 'KeyM' && !e.repeat) {
        handleToggleMute();
        return;
      }

      const phase = simRef.current?.getPhase();

      if (code === 'KeyR' && !e.repeat) {
        if (phase === 'PLAYING' || phase === 'FAILED') {
          handleRetryStage();
        }
        return;
      }

      if (phase === 'STAGE_CLEAR' && (code === 'Enter' || code === 'Space') && !e.repeat) {
        if (performance.now() - stageClearTimestampRef.current > 400) {
          handleNextStage();
        }
        return;
      }

      if (phase !== 'PLAYING') return;

      if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
        if (!controlsRef.current.thrust) updateControls({ thrust: true });
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        if (!controlsRef.current.left) updateControls({ left: true });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        if (!controlsRef.current.right) updateControls({ right: true });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
        if (controlsRef.current.thrust) updateControls({ thrust: false });
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        if (controlsRef.current.left) updateControls({ left: false });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        if (controlsRef.current.right) updateControls({ right: false });
      }
    };

    const onBlur = () => {
      resetControls();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleNextStage, handleRetryStage, handleToggleMute, resetControls, updateControls]);

  return (
    <div className="sim-shell">
      <canvas ref={canvasRef} className="sim-canvas" />
      <div className="crt-overlay" aria-hidden="true" />

      {telemetry.phase !== 'TITLE' && (
        <Hud
          telemetry={telemetry}
          radio={radio}
          muted={muted}
          controls={controls}
          onToggleMute={handleToggleMute}
          onRetryStage={handleRetryStage}
          onReturnTitle={handleReturnTitle}
          onControlChange={updateControls}
        />
      )}

      {telemetry.phase === 'TITLE' && (
        <TitleOverlay
          onStart={handleStart}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {telemetry.phase === 'STAGE_CLEAR' && stageClear && (
        <StageClearOverlay info={stageClear} onNext={handleNextStage} />
      )}

      {telemetry.phase === 'SUCCESS' && summary && (
        <SuccessOverlay
          summary={summary}
          onReplayMission={() => handleStart('TLI')}
          onReplayDescent={() => handleStart('DESCENT')}
        />
      )}

      {telemetry.phase === 'FAILED' && failure && (
        <FailureOverlay
          report={failure}
          onRetryStage={handleRetryStage}
          onRestartMission={() => handleStart('TLI')}
        />
      )}
    </div>
  );
};

export default App;
