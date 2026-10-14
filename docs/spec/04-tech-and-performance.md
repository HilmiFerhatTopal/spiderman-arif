# 04. Tech Direction and Performance

## Stack

- TypeScript (strict), Vite, Three.js (latest stable, version pinned). No heavy physics engine: write a custom kinematic character controller and analytic collision for the static world. Small helpers are fine (lil-gui for the debug panel, three-mesh-bvh only if it clearly helps). Playwright for tests.
- `npm install && npm run dev` must just work, and so must `npm run build && npm run preview`. Everything is local or procedural. No runtime network requests (system font stack or bundled fonts).

## Simulation

- Fixed-timestep simulation (about 120 Hz, accumulator) with interpolated rendering, so feel is frame-rate independent.
- Use swept or sub-stepped collision so nothing tunnels at 80+ m/s.
- All gameplay constants live in one typed file (src/config/tuning.ts) and are live-editable through a debug panel (toggle with the backtick key).

## Performance budget

Target 60 FPS on a mid-range integrated-GPU laptop at 1080p on Medium, and 120+ on a dedicated GPU on High. Budgets: at most about 600 draw calls, about 2M visible triangles, cold load under 10 s, no frame hitches above about 40 ms during play. Use InstancedMesh, merged geometry, frustum culling, LOD and chunked culling where they help. Add dynamic resolution scaling.
