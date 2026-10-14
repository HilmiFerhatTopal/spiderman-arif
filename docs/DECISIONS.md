# Decisions

One line each: decision + why.

- Playwright pinned to 1.56.1: matches the Chromium build preinstalled in the sandbox (chromium-1194), so tests run offline; on a fresh machine `npx playwright install chromium` fetches the matching browser.
- TypeScript 7.0.2 (latest stable, native compiler) for `tsc --noEmit` type checking; Vite 8 transpiles, so the TS version never affects the bundle.
- The music file is fetched from the same origin (`audio/theme.mp3`); "no runtime network requests" is read as "no external hosts", a local static asset is allowed.
- World axes: +Y up, north is -Z, avenues run north-south (along Z), streets east-west (along X); 1 unit = 1 metre.
- The player collision shape is always an upright capsule (r 0.38 m, h 1.8 m) even when the body visually tilts; upright capsules give exact, cheap contacts against axis-aligned boxes and vertical cylinders.
- All building volumes are axis-aligned boxes (stepped crowns instead of pyramids) so the collision proxy matches visuals within 0.3 m by construction.
- Rope reel in/out is on the mouse wheel; the spec lists no key for it and the wheel is free during pointer lock.
- Day-night keys: T pauses/resumes, hold Y to fast-forward, 1/2/3/4 jump to dawn/noon/sunset/night; the spec asks for keys but does not name them.
- Shift must be held to stay on a wall (Shift = sprint on ground, cling on walls); releasing Shift lets go, Space jumps off.
- Anchor availability test (c) counts a position as "in range" when some anchorable surface at least 6 m above the player lies within 80 m and inside the assist cone of the sampled aim; the test then checks targeting finds a valid anchor there.
- Outlines are a post-process (depth Laplacian + normal edges) rather than inverted hulls: no extra draw calls, works with every InstancedMesh, and catches creases on boxy buildings.
- Pond water counts as water (splash and respawn on the nearest bank) to keep the water rule consistent everywhere.
- Dive is bound to C (and Q), not Ctrl: Ctrl+W closes the browser tab and W is held while diving; the controls screen shows the final scheme.
- Swing anchors must sit at least 22 degrees above the hand (tuning `swing.minElevationDeg`); shallow far anchors are treated as the spec's "very low points" because they drag the player along the ground.
- Rope constraint uses a RATTLE-like split (remove tension before the move, rotate velocity after the projection) so an undriven pendulum conserves energy; air drag is the only designed loss.
- Gravity uses kick-drift-kick (half before and after the move) so jump heights match v^2/2g exactly at 120 Hz.
- Vaults and mantles rise vertically along the obstacle face, then cross above its top, so the capsule never enters the obstacle (no collision bypass needed).
- Pumping (W while swinging) fades out above `swing.pumpMaxSpeed`; going faster takes good releases and dives.
- Canopy ellipsoids are solid for the player and the camera but are skipped by the rope line-of-sight test (foliage is porous), as are thin props without the camera-blocking flag.
- Ground snapping ignores canopy ellipsoids (approximate contact); the player can still land on a canopy through the resolver's contact normals.
