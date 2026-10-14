# 01. Movement, Camera and Character

Numbers here are starting points to tune by testing, not truth. All of them live in src/config/tuning.ts (see 04).

## Controls (defaults)

WASD move, mouse look, hold LMB swing, RMB web zip, Space jump (also wall jump and release boost), Shift sprint and wall cling, Ctrl dive, M music mute, P photo mode, Esc pause. Adjust for ergonomics if needed and show the final scheme in the controls screen.

## Swing

- Hold LMB to fire a line at the chosen anchor and stay attached. Release to detach and keep all momentum.
- The rope is an inequality constraint: slack when the player is closer than the rope length, taut when stretched (remove outward radial velocity, correct position). Rope length is set at attach (about 18-60 m) and can be reeled slightly in or out.
- Arcade layer on top of the pendulum: reduced gravity while taut, forward/steer input adds tangential force, soft speed cap with drag above about 60 m/s, hands alternate left/right on consecutive swings, and a "good release" window on the rising part of the arc that gives a launch bonus with a visible cue.
- Chaining swings must be seamless: detach and re-attach in under about 150 ms. Swinging must always feel faster and better than running.

## Targeting (hybrid)

- Primary: ray from the camera through the crosshair; a hit point within about 80 m becomes the anchor.
- Assist: if the ray misses or the hit is invalid, search a forward- and upward-biased cone for the best candidate (distance 20-70 m, height gain, closeness to aim, line of sight). Light snap only, never through geometry.
- Show a reticle state before firing: valid anchor highlighted, invalid dimmed.
- Valid anchors: building facades, roof edges, antennas, water towers, bridges, tree trunks and canopies. Invalid: ground, water, very low points. A swing needs an anchor at least about 6 m above the player; the zip works at lower heights too.
- While attached, re-check line of sight every tick and release gracefully if blocked.

## Other moves

- Web zip (RMB): pull toward the aimed anchor at about 35-45 m/s with ease-in and ease-out, finish with an automatic hop or mantle onto ledges and roofs, short cooldown (about 0.8 s).
- Wall cling and climb: on contact with a facade while holding Shift, stick, crawl with WASD, jump off with an away-impulse, and auto-mantle onto the roof edge.
- Air boost and dive: Space right after releasing a swing gives a boost. Ctrl in air dives downward and converts height into speed that can flow straight into the next swing.
- Ground parkour: walk, sprint (about 16 m/s), rooftop jumps, automatic vaults over low obstacles. Air control while falling.
- Never allow stuck states. If the player is ever inside geometry, or stationary and blocked for more than 3 s, recover safely to the nearest valid position without a visible jolt.

## Camera

Third-person over-the-shoulder spring arm with collision: never inside geometry, no popping. FOV widens with speed (about 70 to 95), mild look-ahead during swings, shake only on hard landings, sensitivity and invert-Y settings. The camera must never fight the player's input.

## Character (original design; all names and branding fictional)

- About 1.8 m tall humanoid with a hierarchical skeleton of about 20 joints, built from rounded primitives and smooth shading. Deep teal and charcoal bodysuit with amber accents, full-face mask with angular amber visor lenses, wrist launchers. No animal, arachnid or web motifs on the suit.
- All animation is procedural: idle breathing, run and sprint with speed-scaled stride, jump and fall, swing (arm reaching up the line, body arcing, legs trailing), release pose, dive, zip, wall cling and crawl, mantle, hard landing with a roll. Critically damped blending, no foot sliding, no limb clipping, feet planted on ground.
- Web line visuals: tapered line from the active hand to the anchor, slack sag that tightens with tension, a quick fire animation, an impact splat at the anchor, speed lines at high speed.
