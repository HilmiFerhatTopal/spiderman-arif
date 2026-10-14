# 03. Audio, UI and Extras

## Music

- The user-provided music track should already be in the project at public/audio/theme.mp3. If it is not there, look for any .mp3 in the repository (repo root, docs, assets) and copy it to public/audio/theme.mp3. If none exists, the game must still run and log a clear warning.
- Play it on the main menu and as a seamless loop in game (WebAudio buffer, crossfade at the loop point), with master, music and SFX sliders and an M key mute. Audio starts only after the first user gesture.

## Sound effects

All synthesized with WebAudio, no sample files: wind and whoosh scaled by speed, web shot, attach thud, release, zip, surface-aware footsteps, landing, wall cling, city ambience (traffic hum, wind), birds in the park, night crickets, UI clicks.

## Screens

Loading screen with progress, main menu (Play, Controls, Settings), pause menu.

## HUD

Crosshair with anchor state, speed, altitude, rotating minimap (building footprints, park, water, player arrow, ring markers).

## Traffic and pedestrians

Instanced cars driving the grid with simple intersection logic, pedestrians on sidewalks. Cheap, non-colliding with the player (the player passes through them harmlessly), density scales with quality.

## Rings

About 20 optional glowing rings forming 3 short routes (park, downtown towers, waterfront). Flying through the first ring starts a timed run, best times saved. Never forced, no fail screen.

## Photo mode (P)

Freezes time, free camera, hides HUD, FOV and time-of-day sliders, saves PNG.

## Settings

Quality preset (Low, Medium, High, Ultra), render scale, dynamic resolution on or off, FOV, mouse sensitivity, invert Y, volumes, day-night speed, FPS counter. Persist in localStorage with try/catch.
