# SKYTHREAD Milestones

Each milestone ends with its verification gate passing, then a git commit. Status is updated as work lands.

| # | Scope | Verification gate |
| --- | --- | --- |
| M1 Foundation | Vite + TS strict project, fixed 120 Hz loop with interpolation, input with pointer lock, spring-arm camera, lil-gui debug panel bound to `tuning.ts`, greybox world, `window.__game` skeleton, Playwright config | `tsc` clean, `vite build` succeeds, smoke test loads the page with zero console errors and steps ticks, screenshot viewed |
| M2 Movement core | Collision world (grid, boxes, cylinders, ellipsoids, terrain, water), run/sprint/jump/vault/mantle, air control, swing with rope constraint and arcade layer, targeting with assist, zip, wall cling/climb, dive, boost, stuck recovery, world edge; first real city layout as greybox | Tests a (rope), b (collision fuzz), c (anchor availability ≥ 95 %), d (traversal bots < 10 % ground time) pass |
| M3 World | Full city generator (districts, buildings with base/body/crown, setbacks, cornices, pilasters, window atlas, rooftop props, fictional signage), park with ≥ 400 trees of 3+ species, pond and paths, water, piers, bridge, street dressing, sky, day-night, shadows, outlines, chunking and instancing | Screenshots at dawn, noon, sunset, night viewed and fixed; draw calls ≤ 600 and triangles ≤ 2 M reported; tests a-d still pass |
| M4 Character and polish | Procedural 21-joint humanoid, procedural animation set, web line (taper, sag, fire, splat), speed lines, FX, camera polish | Mid-swing, wall cling, zip screenshots viewed; no foot sliding check; tests pass |
| M5 Audio, UI | Music loop with crossfade and M mute, synthesized SFX and ambience, loading/menu/controls/settings/pause screens, HUD, rotating minimap, settings persistence, photo mode | Menu, HUD, minimap, photo mode screenshots viewed; audio graph and music decode verified headless; settings round-trip test |
| M6 Life and extras | Instanced traffic with intersection logic, pedestrians, 3 ring routes with timer and best times | Screenshots; ring race test (bot completes a route, best time saved) |
| M7 Hardening | Full protocol (a-e), performance pass, bug-fix loop, README with controls and tuning guide, final checklist | All tests pass with numbers reported; clean-clone `npm install && npm run dev` and `npm run build && npm run preview` verified; grep shows no TODO/stub/greybox |

## Status

- [x] M1 — Vite/TS strict/three 0.186.1 project, 120 Hz fixed loop with interpolation, pointer-lock input, spring-arm camera, lil-gui panel over tuning.ts, greybox city, `window.__game`; gate: tsc clean, build OK, smoke test passes with a clean console, greybox screenshot viewed.
- [x] M2 — collision world, run/sprint/jump/vault/mantle, swing (lossless rope + arcade layer), assist targeting, zip, wall cling/climb, dive, boost, recovery, water respawn, soft boundary; gate: tests a (energy drift 0.0009 %/12 s, catch ratio 1.04, re-attach 25-58 ms), b (12 simulated min, all violation counters 0), c (99.5 %), d (city 0.3 %, park 0.45 % ground time) pass.
- [ ] M3
- [ ] M4
- [ ] M5
- [ ] M6
- [ ] M7
