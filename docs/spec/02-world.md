# 02. World

The city is generated procedurally from a seed: deterministic, fast, behind a loading bar.

## Layout

Avenues and streets grid, 18-24 m wide streets, varied block sizes, about 1.5 x 1.5 km total. Downtown core 120-250 m, midrise 40-100 m, low-rise edges 15-40 m. Large central park (at least about 300 x 450 m) with at least 400 trees of 12-28 m, spaced 8-18 m so tree-to-tree swinging is possible but needs skill. Waterfront on at least two sides with piers and one bridge. Street trees along sidewalks.

## World edge

Water plus a soft boundary that gently turns the player back. No hard invisible-wall jolt, no falling out of the world. If the player lands in water: splash and respawn on the nearest roof or sidewalk with no fanfare.

## Buildings

Must look properly modeled: base, body and crown with setbacks, cornices, pilasters, window grids with emissive night windows (shared textures or an atlas), rooftop props (HVAC, water tanks, antennas, helipads), fictional signage only (no real brands or logos), and district-specific facade palettes. Each building has a collision proxy matching its visuals within about 0.3 m, so web lines and walls feel exact.

## Trees

At least 3 species with trunk and layered foliage, wind sway, instanced. Collision is trunk cylinder plus canopy ellipsoid, and both serve as web anchors.

## Street dressing

Sidewalks, crosswalks, lane markings, lamp posts, benches, hydrants, parked cars. Park paths and a pond.

## Sky and time

Gradient sky, sun and moon, stars, stylized clouds, fog for depth. Continuous day-night cycle (default about 12 minutes real time, with keys to pause, speed up or set the time). Street lights and windows fade on at dusk. Cheap shadows (one directional shadow map following the player).

## Rendering style

Cel-shading and outlines must work with instancing (inverted hull or post-process edge detection) and must not shimmer.
