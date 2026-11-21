# Solara — Open City

A third-person open-world action game that runs in the browser (Three.js / WebGL 2).
Original setting, characters and assets — everything (city, characters, cars, textures,
audio, music) is generated procedurally at load time, so there are no asset downloads.

## Run it

ES modules need to be served over HTTP (opening `index.html` from disk will not work):

```bash
cd game
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

A desktop browser with WebGL 2 (Chrome, Edge, Firefox, Safari 15+) and a mouse + keyboard is recommended.
If the frame rate is low, open **Esc → Settings** and pick the *Medium* or *Low* preset.

## Controls

| On foot | | Driving | |
|---|---|---|---|
| WASD / mouse | move / look | W / S | accelerate / brake & reverse |
| Shift | sprint (stamina) | A / D | steer |
| Caps Lock or Z | toggle walk | Space | handbrake (drift) |
| C | crouch | H / L / N | horn / headlights / radio |
| Space | jump | F | exit (bail out at speed) |
| E | interact, doors, shops, start missions | | |
| F | enter / carjack vehicle | **Menus** | |
| LMB | punch (3rd hit kicks) / fire stun gun | Esc or P | pause (map, missions, inventory, character, settings, saves) |
| RMB | guard (unarmed) / aim (stun gun) | M / Tab / J | map / inventory / mission log |
| Q | fists ↔ stun gun | Enter | skip a dialogue line |
| 1–4 | quick-use items | V / wheel | camera distance |

## What's in it

- **Open world**: downtown towers, *Lantern Row* (neon Asian-style market street, permanently wet),
  Bayview Avenue shops, Greenway Park, a parking lot, Palm Grove houses, Old Harbor apartments,
  palm-lined Ocean Drive with beach, ocean and pier, and a hill road up to *Mirador Heights*.
- **Enterable interiors**: the two-storey Vega villa (staircase, living room, kitchen, bedroom,
  office, bathroom, terrace with pool), your safehouse, QuikMart, Thread & Co. clothing store,
  Mara's noodle house, Meridian Tower lobby, Fix & Go garage. Doors open with E; shops have
  automatic sliding doors.
- **Player**: walk / run / sprint / crouch / jump, procedural skinned animation, character
  creator and wardrobe, health & stamina, non-graphic melee (punch combo, kick, guard) and a stun gun.
- **Vehicles**: 7 procedural models (hatch, sedan, coupe, SUV, van, taxi, police) with tire-grip
  physics, drifting, suspension, jumps, collisions, dents, smoke and repairs.
- **City life**: AI traffic that follows lanes, turns at intersections and obeys traffic lights;
  pedestrians who walk, wait at crosswalks, jog, sit, chat and use phones, and react to the player
  (flee, cower, fight back, comment); police with a 5-star heat system, pursuits and arrests.
- **Atmosphere**: day/night cycle, dynamic weather (clear, cloudy, rain, storm with lightning, fog),
  wet streets with puddles and planar reflections, night windows, street-light pools, neon, bloom,
  colour grading, procedural ambience, engine sounds and a generative car radio.
- **Gameplay**: 4 story missions, Noodle Rush deliveries, an Ocean Drive time trial, purse-snatcher
  street events, 15 hidden postcards, money and inventory, shops, minimap with GPS route,
  full map with waypoints, mission tracker, save/load (3 slots + autosave), settings.

## Code layout

```
js/main.js            entry, loading screen
js/game.js            orchestrator: renderer, post-processing, main loop, services
js/core/              input, camera rig, procedural audio, save/settings, utils
js/world/             layout, collision, procedural textures/materials, city, interiors,
                      terrain/ocean, environment (sky, weather, lights, reflections)
js/entities/          humanoid (skinned rig + animation), player, NPCs, traffic, vehicles, police, particles
js/gameplay/          missions & events, inventory/shops, world-space effects
js/ui/                HUD (minimap, tracker, prompts), menus (title, pause, shop, wardrobe)
vendor/               three.js r170 (MIT) and the addons it uses
```
