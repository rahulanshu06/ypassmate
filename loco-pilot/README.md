# Loco Pilot — Indian Railway Simulator (browser)

A driver's-eye railway simulator that runs entirely in a modern browser (WebGL 2, three.js).
You drive a fictional Indian electric locomotive on a fictional 33.5 km double line:
signals, speed limits, air brakes, timetables, AI traffic, level crossings, weather and
day/night all affect how you drive.

> **Phase 1 — playable vertical slice.** One complete route, one fully simulated
> locomotive, four passenger trains, career, scenarios, training and quick drive.
> Everything shown in the menus either works or is clearly marked 🔒 with its unlock
> condition or "coming in a later phase".

All names, routes, stations, train numbers, liveries and logos are **fictional**.

---

## Run it

No build step and no install. The page uses ES modules, so it must be served over HTTP
(opening `index.html` straight from disk shows a warning instead).

```bash
cd loco-pilot
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080
```

GitHub Pages also works: enable Pages for the repository and open `/loco-pilot/`.

**Browser:** Chrome / Edge 110+, Firefox 115+, Safari 16.4+ (WebGL 2 required).
The game benchmarks the device on first launch and picks LOW / MEDIUM / HIGH / ULTRA;
change it any time in *Settings → Graphics*.

---

## Controls

All keys can be rebound in *Settings → Controls* (stored in the browser).

| Action | Key | Action | Key |
|---|---|---|---|
| Throttle up / notch + | **W** | Throttle down / regen brake (B1–B8) | **S** |
| Train brake (A9) apply | **D** or **B** | Train brake (A9) release | **A** |
| Loco brake (SA9) apply | **]** | Loco brake (SA9) release | **[** |
| Emergency brake | **Space** | Vigilance (VCD) acknowledge | **Q** |
| Horn high / low | **H** / **J** | Sander | **X** |
| Reverser forward / back | **R** / **F** | Pantograph | **O** |
| Main breaker (VCB) | **M** | Headlight off/dim/bright | **L** |
| Wipers off/slow/fast | **V** | Cab light | **I** |
| Next camera | **C** | Cameras 1–9 | **1 … 9** |
| Pause | **P** / **Esc** | Hide HUD | **U** |
| Track monitor | **T** | Controls help | **F1** or **/** |
| Photo mode | **K** | | |

*W is the throttle, so the wipers moved to V; A/D are the secondary brake keys.*

- **Mouse:** drag to look around the cab; click or drag the master controller, A9, SA9,
  switches and buttons on the desk (hover shows a tooltip).
- **Gamepad:** sticks for throttle/brake, face buttons for horn/emergency/wiper/camera.
- **Touch:** throttle and brake sliders plus a 16-button pad (enabled automatically on
  touch screens; *Settings → Controls → Touch controls*).

Cameras: driver cab, head-out, third person orbit, chase, side, front loco, rear of train,
free camera and trackside cinematic — with smooth blended transitions.

---

## What is in Phase 1

| Area | Implemented |
|---|---|
| Route | Indrapuri Terminus (IPT) – Sonapur (SNP) – Chandanpur Jn (CDJ) – Basantgarh (BSG) – Vindhyanagar Jn (VNJ), 33.5 km, double line, left-hand running, curves with cant and transitions, gradients, ghat section |
| World | Terminus with 4 platform lines, junction with loops and sidings, FOBs, signal cabins, goods shed, 2 river/nala bridges, tunnel, 2 road over-bridges, 4 level crossings with working barriers and road traffic, OHE masts and wires, km posts, gradient/whistle/speed boards in Hindi + English, city, towns, villages, fields, forests, ponds |
| Locomotive | EP60 (fictional 3-phase electric, 4.6 MW, 322 kN): 10 power notches, 8 regenerative notches, panto/VCB/reverser interlocks, adhesion with wheel slip and sanding, energy and regen metering |
| Brakes | Twin-pipe air brake: compressor and MR governor, A9 automatic and SA9 independent valves, brake pipe propagation per vehicle, distributor valves, emergency venting, WSP |
| Physics | Davis rolling + aero resistance, gradient and curve resistance per vehicle, starting resistance, rotating mass, curve-overspeed derailment check |
| Trains | 54217 Passenger (12 coaches), 12417 Express (18), 22471 Superfast (22), 12903 Mail (24); coach types SLR, GS, SL, 3A, 2A, 1A, CC; freight/container/high-speed shown locked |
| Signalling | 4-aspect colour-light signals (R / Y / YY / G), track circuits, interlocking with route indicators at home signals, starters cleared on departure, SPAD detection and penalty, automatic-signal rule (stop, wait 1 min / 2 min at night, pass at 10 km/h) |
| Operations | Working timetable built from the train's own running times, guard's right away, dwell, platform stop accuracy, punctuality, temporary speed restriction with caution board and workers, platform changes |
| AI | Up and down passenger and freight traffic with braking curves, platform dwell, loop holding and crossings; stabled rakes |
| Safety | Vigilance control (VCD), ATP on Easy, overspeed, rollback, headlight and whistle-board checks |
| Events | Signal failure, unexpected red, new speed restriction, AI delay, weather change, platform change, cattle on the line, vehicle stuck at a level crossing |
| Weather | Clear, cloudy, rain, heavy rain, thunderstorm with lightning, fog, mist, dust, heat haze — visibility, rail adhesion and braking all change; windscreen rain and wipers |
| Time | 24-hour sky with sun, moon, stars; lit stations, signals and headlight at night |
| Audio | Procedural Web Audio: traction motors, inverter whine, compressor, wheel/rail, rail joints, flange squeal, brake hiss, two-tone horn, rain, thunder, crowds, LC bells, VCD buzzer, passing trains with Doppler; Hindi + English station announcements (browser voices) with subtitles |
| Scoring | Safety, punctuality, comfort (jerk and lateral), efficiency, stopping accuracy → stars, XP and reputation |
| Career | 6 levels: Assistant Loco Pilot → Loco Pilot (Passenger) → Loco Pilot (Mail/Express) → Senior Loco Pilot → Loco Pilot (Goods Heavy) → Chief Loco Inspector; duties, unlockable trains, liveries and cab theme |
| Modes | Career, Quick Drive (train, stations, time, weather, difficulty, traffic), 10 playable scenarios (+1 freight scenario locked for Phase 2), 13-step training course, photo mode |
| Difficulty | Easy (ATP, assists), Normal, Hard (SPAD ends the run), Simulation (cold start: raise pantograph, close VCB, build air) |
| UI | Main menu, briefing with timetable, HUD (full / minimal / off), track monitor, pause, results, settings (graphics, audio, gameplay, controls, accessibility), profile; English and Hindi |
| Accessibility | UI scale, subtitles, colour-assist signal labels, reduced motion, camera shake toggle, rebindable keys |
| Saving | Profile, settings, key bindings and progress in `localStorage` |

### Not yet (later phases)

More routes and diesel/freight locomotives (shown locked), drivable freight and container
trains, multiplayer, user mods. Station announcements use whatever Hindi/English voices
the browser provides, so they sound different on each OS.

---

## Project layout

```
loco-pilot/
  index.html            import map, boot splash
  css/                  fonts.css (self-hosted), style.css
  assets/fonts/         Rajdhani, Hind, Noto Sans Devanagari (OFL)
  vendor/three/         three.js r186 + addons (MIT)
  src/
    main.js             boot
    Game.js             state machine, main loop, ties sim ↔ render ↔ UI
    core/               settings, profile, input, i18n, storage, event bus, math, noise
    data/               route, locomotives, rolling stock, trains, scenarios, weather, difficulty
    world/              route geometry, track network, terrain (LOD + worker), scenery, stations, OHE
    sim/                physics, brakes, traction, signals, AI drivers, timetable, station ops,
                        safety, scoring, events, journey, player controls
    render/             renderer + post FX, sky/fog, materials, procedural textures, buildings,
                        trees, trains, cab, cameras, weather FX, people, road vehicles
    audio/              procedural train audio, announcer
    ui/                 menus, HUD, settings, tutorial, touch controls, photo mode
```

The simulation (`src/sim`, `src/world` geometry/network, `src/data`) has no DOM or WebGL
dependencies and can run headless in Node for testing; rendering only reads its state.

Performance: 200 m streamed chunks with merged geometry, instanced trees with billboard
LODs, quadtree terrain built in a Web Worker, pooled lights, dynamic resolution, and
quality presets that scale shadows, draw distance, effects, crowds and traffic.

---

## Credits and licences

- [three.js](https://threejs.org) — MIT (`vendor/three/LICENSE`)
- Rajdhani, Hind (Indian Type Foundry), Noto Sans Devanagari (Google) — SIL Open Font
  License 1.1 (`assets/fonts/OFL-*.txt`)
- Everything else — code, models, textures and sounds — is generated procedurally by this
  project; no third-party railway assets, brands or real route data are used.
