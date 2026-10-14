# 05. Verification Protocol and Milestones

You cannot judge this game by reading code. Prove it by running it.

## Verification protocol

1. Build a headless harness (Playwright + Chromium). Software-GL FPS in a sandbox is not representative, so there measure simulation time per tick, draw calls, triangles and memory instead, and clearly state that real-GPU FPS was not measured.
2. In dev builds expose a deterministic test API (window.__game): set inputs, step N ticks, read player state, teleport, take screenshots.
3. Automated tests, all must pass:
   a. Rope and swing: swinging from rest at 45 degrees behaves as designed (documented energy drift), no NaN, no explosions.
   b. Collision fuzz: at least 10 simulated minutes of random inputs over multiple seeds. The player is never inside solid geometry, never below ground, never out of bounds, never NaN, never stuck for more than 3 s without recovery, and the camera is never inside geometry.
   c. Anchor availability: from 500 random street, rooftop and park positions, a valid anchor is found at least 95% of the time when buildings or trees are within range.
   d. Traversal bot: a scripted autopilot crosses the city corner to corner along avenues, and another crosses the park tree to tree, spending under 10% of the time on the ground.
   e. Soak: 30 simulated minutes with zero console errors and no heap growth trend.
4. Visual checks: take screenshots at fixed spots and times of day (dawn, noon, sunset, night), mid-swing, wall cling, zip, minimap, menus, photo mode. Actually look at them and fix what is ugly (z-fighting, floating objects, flat lighting, popping, broken outlines).
5. Fix-and-rerun loop: any failure gets fixed and the full suite re-run. Report real numbers.

## Milestones

Each milestone ends with its verification gate passing, then a git commit.

- M1 Foundation: project, fixed loop, input, camera, debug panel, greybox world.
- M2 Movement core (highest risk, do it early): collision world, run and jump, swing, anchor assist, zip, wall, dive, boost, plus tests a-d.
- M3 World: full city generator, park, trees, water, props, day-night, lighting, outlines, instancing, performance pass.
- M4 Character and polish: procedural model and animation, web line visuals, FX, camera polish.
- M5 Audio, UI, HUD, minimap, settings, photo mode.
- M6 Life and extras: traffic, pedestrians, rings.
- M7 Hardening: full verification protocol, performance pass, bug-fix loop, README with controls and tuning guide.
