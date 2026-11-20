# Apollo 11 — Lunar Flight Simulator

Interactive retro-NASA 2.5D lunar flight simulator inspired by the Apollo 11 mission, built with Vite, React, TypeScript, HTML5 Canvas, and procedural Web Audio API sound effects (zero external assets).

**Live Demo:** https://palovlad.github.io/apollo-11-sim/

## Mission Stages

1. **Stage 01 — Trans-Lunar Injection (TLI · AGC `P15`)**: Fire the S-IVB main engine to build injection velocity (10.8 km/s) and align your predicted trajectory arc with the green Lunar Entry Corridor.
2. **Stage 02 — Lunar Orbit Insertion (LOI · AGC `P40`)**: Approach lunar perilune, hold retrograde alignment, and fire the SPS main engine inside the green burn window to capture into circular lunar orbit (1,460–1,760 m/s).
3. **Stage 03 — Lunar Descent: LM "Eagle" (Sea of Tranquility · AGC `P63 → P66`)**: Guide Lunar Module *Eagle* to a gentle touchdown on Tranquility Base (`|V-SPD| < 5 m/s`, `|H-SPD| < 3 m/s`, `|TILT| < 16°`).

## Controls

- **`W` / `↑` / `Space`** — Main Engine Thrust
- **`A` / `D` or `←` / `→`** — RCS Attitude & Lateral Control
- **`R`** — Instant Stage Retry
- **`M`** — Mute / Unmute Procedural Web Audio

## Development

```bash
npm install
npm run dev
npm run build
```
