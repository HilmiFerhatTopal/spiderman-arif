# SKYTHREAD

A single-player 3D open-world web-swinging game for desktop browsers. Swing on lines shot from wrist launchers through a procedurally generated Manhattan-style city of about 1.5 x 1.5 km with a large tree-filled central park, a waterfront with piers and a bridge, live traffic and pedestrians, a dynamic day-night cycle, optional ring races and a photo mode. Everything is built in code: the city, the hero, the animation, the textures and every sound effect. The only asset file is the music track.

The in-game interface is in Turkish (all strings in `src/i18n/tr.ts`).

## Run

Requirements: Node.js 20 or newer (developed on 22), npm, a desktop browser with WebGL2 (current Chrome, Edge or Firefox).

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Production build:

```bash
npm run build        # type-check + bundle into dist/
npm run preview      # http://127.0.0.1:4173
```

Click **Oyna** (Play) to start; the game captures the mouse (pointer lock). Audio starts after the first click or key press. Press `Esc` to pause. URL parameter `?seed=1234` generates a different city.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move; steer while swinging |
| Mouse | Look |
| Left mouse (hold) | Fire a web line and swing; release to fly on with all momentum |
| Right mouse | Web zip toward the aimed point (auto hop or mantle at the end) |
| Space | Jump, wall jump, air boost right after a release |
| Shift (hold) | Sprint on the ground; cling to and climb walls |
| C or Q | Dive in the air (trades height for speed) |
| Mouse wheel | Reel the line in or out while swinging |
| M | Music on/off |
| P | Photo mode (free camera: WASD, mouse, Space/C up/down, Shift fast) |
| T | Pause or resume the day-night cycle |
| Y (hold) | Fast-forward time |
| 1 / 2 / 3 / 4 | Dawn / noon / sunset / night |
| Esc | Pause menu |
| ` (backtick) | Debug and tuning panel |

Dive is on C/Q instead of Ctrl because Ctrl+W closes the browser tab while W is held (see `docs/DECISIONS.md`).

Tips: release on the rising part of a swing while the crosshair pulses for a launch bonus ("MÜKEMMEL BIRAKIŞ!"); fire a line right after a dive to carry the speed into the swing. Fly through the first ring of a route (park, towers, waterfront) to start a timed run; best times are saved.

## Tuning guide

Every gameplay constant lives in `src/config/tuning.ts`, grouped by system. The debug panel (backtick) edits the same object live; the simulation reads it every tick, so changes apply immediately. "Reset to defaults" restores the file values. To keep a change, copy the value into `tuning.ts`.

| Group | What it shapes | Start with |
| --- | --- | --- |
| `swing` | Pendulum and arcade layer | `gravityScale` (lighter or heavier arcs), `pumpAccel` / `pumpMaxSpeed` (how much W adds), `steerRate`, `catchEfficiency` (speed kept when the rope snaps taut), `minRope` / `maxRope` / `attachLengthFactor`, the good-release window (`goodReleaseMinDeg` / `goodReleaseMaxDeg`) and its launch bonus (`goodReleaseBonus`, `goodReleaseUp`) |
| `assist` | Anchor choice when the crosshair misses | `range`, `idealDistance`, `idealElevationDeg`, `maxAimAngleDeg`, score weights |
| `air` | Flight | `gravity`, `drag`, `softCap` / `capDrag` (soft speed cap around 60 m/s), air control |
| `boost`, `dive` | Release boost window and strength, dive gravity and steering | `window`, `up`, `forward`, `gravityMul` |
| `zip` | Web zip | `speed` (40 m/s), `cooldown`, `maxRange`, end hop and mantle reach |
| `wall` | Cling, crawl, wall run, wall jump | `crawlSpeed`, `wallRunMax` |
| `ground` | Running and parkour | `runSpeed`, `sprintSpeed`, `jumpSpeed`, vault and mantle limits, `hardLandingSpeed`, roll |
| `camera` | Spring-arm camera | `armGround` / `armAir` / `armFast`, `shoulder`, FOV range by speed, follow stiffness, look-ahead, shake |
| `recovery` | Stuck detection and safe recovery | `stuckTime`, `deepPenetration`, `blendTime` |
| `world`, `time` | Water level, soft boundary, day length and start hour | `softBoundaryAccel`, `dayLengthMinutes` |

Render quality presets (shadow map, view distance, traffic and crowd density, FXAA, pixel-ratio cap) are in `src/config/quality.ts`; the in-game settings screen picks one and persists the choice.

## Tests

The suite drives the dev build headless (Playwright + Chromium with SwiftShader) through `window.__game`, a deterministic test API that exists only in dev builds.

```bash
npm test                         # whole suite (starts the dev server if needed)
npx playwright test tests/soak.spec.ts   # 30 simulated minutes (long)
npm run test:quick               # smoke test only
```

| Test | Checks |
| --- | --- |
| a `swing.spec.ts` | Pendulum from 45 degrees: energy drift, period, no NaN, catch conversion, re-attach latency |
| b `fuzz.spec.ts` | 12 simulated minutes of random input over 6 seeds: never inside geometry, below ground, out of bounds, NaN or stuck, camera never inside geometry; head-on 95 m/s impacts never tunnel |
| c `anchors.spec.ts` | Anchor availability from 500 street, rooftop and park positions (>= 95 %) |
| d `traversal.spec.ts` | Corner-to-corner city bot and tree-to-tree park bot spend < 10 % of the time on the ground |
| e `soak.spec.ts` | 30 simulated minutes of mixed play: clean console, no heap growth trend, no GPU resource growth |
| f `character.spec.ts` | Planted feet never slide, limbs stay out of geometry, bones stay finite |
| g `ui.spec.ts` | Settings round trip and corrupt storage, audio unlock and music decode, mute, pause on lock loss, resume, photo PNG export |
| h `rings.spec.ts` | Ring routes clear and reachable, race logic and best times; traffic on roads with stops and turns; pedestrians off the carriageway |
| `smoke.spec.ts` | Page loads with a clean console and no request leaves the origin |

Numbers from each run are written to `test-results/*.json`. Software GL in a sandbox does not represent real GPU frame rates, so the suite measures simulation time per tick, draw calls, triangles and memory instead of FPS.

## Project layout

```
src/
  app.ts            screen flow, settings, HUD/minimap/audio updates
  game.ts           composition root: loop, simulation, camera views, rendering
  config/           tuning.ts (all gameplay constants), quality.ts (render presets)
  core/             fixed-step loop, seeded RNG, math helpers
  physics/          analytic collision world (boxes, cylinders, ellipsoids, terrain, water), grid, raycasts
  player/           player state machine, rope constraint, targeting with assist
  camera/           spring-arm camera with collision
  world/            city generator, collision proxies, chunked city visuals, sky, day-night
  render/           cel materials, outline post-process, FXAA, dynamic resolution
  character/        procedural humanoid, animator (gait IK, poses, limb collision), web line
  fx/               particles
  life/             traffic and pedestrians
  extras/           ring races
  audio/            music loop and synthesized SFX and ambience
  ui/               menus, HUD, minimap, settings persistence, photo panel
  i18n/tr.ts        all in-game text (Turkish)
  debug/            tuning panel, test API and in-page test drivers
docs/               spec, architecture, milestones, decisions
tests/              Playwright specs a-h, smoke, soak
public/audio/       theme.mp3 (the user's music track)
```

See `docs/ARCHITECTURE.md` for the design (loop, collision, swing model, rendering, budgets) and `docs/DECISIONS.md` for every judgement call.
