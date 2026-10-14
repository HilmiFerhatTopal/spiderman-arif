# SKYTHREAD: Overview and Rules of Engagement

Read this file first, then 01 through 05 in order, before writing any code.

## Goal

Build a complete, polished, single-player 3D open-world web-swinging game that runs in a desktop browser. Working title: SKYTHREAD. The player is an agile hero who swings through a medium-sized city on a line of web shot from wrist launchers, attaching to buildings and trees. Free-roam traversal is the whole game: moving through the city must feel fluid, weighty and flawless. No combat, enemies or fail states are in scope.

Quality bar: someone should be able to press Play and swing for an hour without hitting a bug, a stuck state, a camera glitch or a frame hitch. "Feels great to move" is the primary acceptance criterion, ahead of feature count.

## Operating mode

- Work autonomously end to end. Do not stop to ask questions. When something is ambiguous, pick the most sensible option and log it in docs/DECISIONS.md (one line: decision + why).
- Plan first: write docs/ARCHITECTURE.md (modules, fixed-timestep loop, collision approach, performance budget) and docs/MILESTONES.md before writing large amounts of code. Then build in the milestones from 05-verification-and-milestones.md. Each milestone must pass its verification gate before moving on. Run git init (if needed) and commit at every milestone.
- Spend effort where the risk is: swing physics, collision robustness, camera, procedural character animation, city generation. Subagents may be used for independent modules (city generator, audio, UI), but you own integration and final quality.
- No stubs, no TODO placeholders, no features that merely look present. Temporary greybox art is allowed inside early milestones only; none may remain at the end. If something cannot be completed or verified, say so plainly in the final report.
- Talk to the user in Turkish. Code, comments and docs in English. All in-game UI text in Turkish, kept in one file (src/i18n/tr.ts).

## Design decisions (final)

1. Swing feel: arcade-realistic hybrid. Pendulum-based and momentum-preserving, but forgiving: no stalls, no sticky ropes, no punishment.
2. Web targeting: hybrid. Crosshair aim plus light assist (see 01).
3. Visual style: stylized comic look. Cel-shading with clean outlines, saturated palette.
4. Map: Manhattan-style city, about 1.5 x 1.5 km, with a large tree-filled central park.
5. Atmosphere: dynamic day-night cycle.
6. Traversal moves: swing, wall cling and climb, web zip, air boost and dive, ground parkour (sprint, rooftop runs, vaults).
7. Character: built entirely in code (no external model files), an articulated procedural humanoid with procedural animation.
8. Input: keyboard and mouse only (pointer lock).
9. Music: use the user-provided track (see 03).
10. Extras: minimap plus speed/altitude HUD, pedestrians and traffic, optional ring-race collectibles, photo mode plus settings menu.

## Spec index

- 01-movement-and-character.md: controls, swing, targeting, other moves, camera, character
- 02-world.md: city, park, trees, sky, day-night
- 03-audio-ui-extras.md: music, sound effects, menus, HUD, traffic, rings, photo mode, settings
- 04-tech-and-performance.md: stack, loop, collision, tuning file, performance budget
- 05-verification-and-milestones.md: how to prove it works, milestone order

## Definition of done

Every item in 00 through 04 is implemented and verified, the verification suite in 05 passes, no greybox art remains, `npm install && npm run dev` works from a clean clone, and the console is clean. Before declaring done, re-read all spec files, tick each requirement against concrete evidence, and fix any gap.

## Final report (Turkish, short)

How to run, controls, what was verified (with numbers), what was not verified (for example real-GPU FPS), known limitations, and where to tune the feel (src/config/tuning.ts).
