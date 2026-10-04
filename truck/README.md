# Autobahn Hauler

Browser mein chalne wala 3D truck simulator (Euro Truck Simulator jaisa). Koi install ya build step nahi hai:
`truck/index.html` ko browser mein kholo ya GitHub Pages pe host karo.

## Chalana

- **Seedha kholo:** `truck/index.html` ko Chrome, Edge, Firefox ya Safari mein double-click karke kholo. Three.js
  `truck/lib/` mein rakha hai, isliye internet ke bina bhi chalta hai (sirf fonts ke liye net chahiye; net na ho to
  system font use hota hai).
- **GitHub Pages:** Settings → Pages → branch chuno → root. Game ka link `https://<user>.github.io/<repo>/truck/` hoga.
- **Local server (optional):** `npx http-server truck` aur phir `http://localhost:8080` kholo.

Hardware acceleration (GPU) on hona chahiye. Phone pe screen ko landscape (tircha) rakho; tablet aada aur seedha
(portrait) dono tarah chalta hai.

## Phone / tablet (touch)

| Cheez | Kaise |
|---|---|
| Steering | Neeche-baayein wheel ko ungli se ghumao, chhodne pe seedha ho jata hai |
| Pedal | Analog: pedal ke upar dabao to pura gas/brake, neeche dabao to kam. BRAKE dabaye rakho to ruk kar reverse |
| Buttons | Upar 16 button (ENG, PARK, LIGHT, HORN, indicator, TRAIL, OK, gear, CRUISE, RET, JOBS, MAP, CAM, MENU). Jo cheez on ho, uska button amber ho jata hai |
| Layout | Phone: landscape. Tablet landscape: bade controls + poora HUD. Tablet portrait: buttons GPS ke neeche, speedometer wheel ke upar |
| Settings | Touch controls size (Small → Extra large), touch wheel (Quick / Normal / Smooth), pedal (Analog / On-off) |
| Extra | Full screen button (title aur pause menu), drive karte waqt screen band nahi hoti (wake lock), takkar pe vibration (Android) |
| Quality | Phone pe apne-aap Low, tablet pe Medium |

## Features

| Hissa | Kya hai |
|---|---|
| Map | 11 shehar: Hamburg, Berlin, Köln, Frankfurt, Leipzig, Dresden, Praha, Nürnberg, Stuttgart, München, Wien. Asli lat/long ko ~10 km ke map pe chhota kiya gaya hai (lagbhag 1:75) |
| Sadak | 16 highway (A1, A3, A5, A8, A9, A13, A14, A24, D8 motorway + E50, E59, B14 road), roundabout pe junction, har shehar mein 2 company depot + 1 fuel/service station |
| Zameen | Uttar mein samundar aur samtal zameen, dakshin mein Alps, Dresden–Praha ke beech Erzgebirge pahad, jheel, khet, jungle, wind turbine |
| Truck physics | Torque curve wala diesel engine (420–770 hp), 12/14-speed AMT gearbox (auto ya manual), clutch slip, air brake + air pressure, spring parking brake, retarder / engine brake, 90 km/h speed limiter, cruise control, fuel consumption |
| Trailer | Asli articulation (kingpin pe ghoomta hai), reverse karna mushkil (realistic), jackknife limit, 7 trailer type: box, reefer, tanker, flatbed, logs, steel coils, container |
| Traffic | Cars, van, bus aur trailer wale AI truck. Lane follow, doori banaye rakhna (IDM), motorway pe overtake, roundabout pe give-way, player ke truck ke peeche rukna |
| Din-raat & mausam | 24 ghante ka cycle, suraj/chaand, taare, baadal, baarish (geeli sadak, kam grip, wiper), kohra |
| Camera | Cabin (dashboard, steering, live mirrors), chase, top-down (parking ke liye), roadside cinematic |
| Career | Freight market, 19 cargo type, ADR/fragile/heavy level se unlock, deadline, cargo damage, precise parking bonus, XP/level, fuel, repair, engine/gearbox/tank/tyre/paint upgrade, auto-save |
| Niyam | Speed camera fine, gaadi se takkar ka fine, ulti disha mein chalane ka fine, raat mein bina light ke fine |
| Controls | Keyboard, mouse steering, gamepad (standard mode wale steering wheel bhi), touch steering wheel + pedals, tilt steering |
| Awaaz | WebAudio se bani: diesel engine, turbo, air brake, indicator tick-tock, air horn, reverse beeper, hawa, baarish, takkar |

## Controls (keyboard)

| Kaam | Key |
|---|---|
| Accelerate / brake | `W` `S` (ya arrow keys) |
| Steering | `A` `D` |
| Engine on/off | `E` |
| Parking brake | `Space` |
| Gear up/down (manual) | `R` `F` |
| Retarder | `B` |
| Cruise control, ±5 km/h | `C`, `+`, `−` |
| Trailer jodna/chhodna | `T` |
| Delivery, fuel, service | `Enter` |
| Headlight / high beam | `L` `K` |
| Indicator left/right, hazard | `,` `.` `/` |
| Horn, wiper | `H`, `P` |
| Camera | `V` ya `1`–`4` |
| Jobs, map | `J`, `M` |
| Roadside assistance | `Backspace` |
| Pause | `Esc` |

## Pehli delivery

1. `E` dabao, air pressure 5.2 bar se upar jaane do, phir `Space` se parking brake chhodo.
2. `J` dabake job lo. GPS hara (green) beam wale trailer tak le jayega.
3. Dheere se reverse karke trailer ke neeche jao, "Couple trailer" dikhe to `T` dabao.
4. Destination yard mein ruko. Orange bay mein reverse park karoge to bonus milega. `Enter` dabake deliver karo.

## Files

| File | Kaam |
|---|---|
| `index.html` | UI, HUD, menu, CSS |
| `js/world.js` | Terrain, sadak, roundabout, depot, shehar, ped, sign, physics ke liye height/collision query, GPS routing |
| `js/vehicle.js` | Truck/trailer model, cabin interior, engine + gearbox + brake physics |
| `js/traffic.js` | AI traffic |
| `js/env.js` | Aasmaan, suraj, mausam, baarish |
| `js/game.js` | Career, jobs, camera, collision, fine, save, main loop |
| `js/hud.js` | Speedometer/tachometer, GPS, map |
| `js/audio.js`, `js/input.js` | Awaaz aur controls |
| `lib/three.min.js` | Three.js r158 (MIT license) |

Note: Ye ek fan-made game hai. "Euro Truck Simulator" SCS Software ka trademark hai; is game ka unse koi lena-dena nahi.
Saari companies kalpanik (fictional) hain.
