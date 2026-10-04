import * as THREE from 'three';
import { extrudeProfile, sampleChainages, TrackFrame } from './TrackFrame.js';
import { Prim } from '../render/GeoBatch.js';

export const RAIL_X = 0.874; // rail centre from track centre (1676 mm gauge + head)
const RAIL_SIDE = [
  [0.036, -0.006], [0.036, -0.045], [0.011, -0.056], [0.009, -0.14], [0.075, -0.158], [0.075, -0.172],
  [-0.075, -0.172], [-0.075, -0.158], [-0.009, -0.14], [-0.011, -0.056], [-0.036, -0.045], [-0.036, -0.006],
];
const RAIL_HEAD = [[-0.036, -0.006], [-0.028, 0.0], [0.028, 0.0], [0.036, -0.006]];
const BALLAST = [[-2.65, -0.76], [-1.78, -0.19], [-1.38, -0.225], [1.38, -0.225], [1.78, -0.19], [2.65, -0.76]];
const SLEEPER_SPACING = 0.6;

function shiftProfile(profile, dx) {
  return profile.map(([x, y]) => [x + dx, y]);
}

/**
 * Build rails, ballast and sleepers for every track overlapping [s0, s1].
 */
export function buildTrackChunk(ctx, s0, s1, batch, origin, opts = {}) {
  const { geo, network, def } = ctx;
  const frame = new TrackFrame(geo);
  const bridges = def.bridges || [];
  const onBridge = (s) => bridges.find((b) => s > b.s0 + 2 && s < b.s1 - 2);
  const m = new THREE.Matrix4();
  for (const tr of network.tracks.values()) {
    const a = Math.max(s0, tr.sA), b = Math.min(s1, tr.sB);
    if (b - a < 0.2) continue;
    const off = (s) => tr.offsetAt(s);
    const baseOff = tr.kind === 'main' ? null : network.lineOffset[tr.line];
    // split into bridge / non-bridge pieces for ballast
    const sList = sampleChainages(geo, tr, a, b, 4);
    // rails (lower slightly in turnout zones to avoid z-fighting with the parent line)
    const yShiftFor = (s) => (baseOff !== null && Math.abs(off(s) - baseOff) < 3.2 ? -0.003 : 0);
    const ys = yShiftFor((a + b) / 2);
    for (const side of [-1, 1]) {
      extrudeProfile(batch, 'rail', frame, off, sList, shiftProfile(RAIL_SIDE, side * RAIL_X), origin, { uScale: 4, vScale: 0.1, yShift: ys });
      extrudeProfile(batch, 'railHead', frame, off, sList, shiftProfile(RAIL_HEAD, side * RAIL_X), origin, { uScale: 4, vScale: 0.1, yShift: ys });
    }
    // ballast: skip on open-deck bridge spans
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const inTransition = baseOff !== null && tr.isTransition(run[Math.floor(run.length / 2)]);
        extrudeProfile(batch, 'ballast', frame, off, run, BALLAST, origin, { uScale: 0.45, vScale: 0.45, yShift: inTransition ? -0.025 : tr.kind === 'main' ? 0 : -0.012 });
      }
      run = [];
    };
    for (const s of sList) {
      if (onBridge(s)) flush();
      else run.push(s);
    }
    flush();
    // sleepers
    if (opts.sleepers !== false) {
      const first = Math.ceil(a / SLEEPER_SPACING) * SLEEPER_SPACING;
      const sleeper = Prim.box();
      for (let s = first; s < b; s += SLEEPER_SPACING) {
        const bridge = onBridge(s);
        if (baseOff !== null) {
          const dd = Math.abs(off(s) - baseOff);
          if (dd < 0.45) continue; // parent line sleepers carry both
        }
        frame.at(off, s, origin);
        const lower = baseOff !== null && Math.abs(off(s) - baseOff) < 3.2 ? -0.01 : 0;
        if (bridge) {
          // timber sleepers on girders
          frame.matrix(m, 2.5, 0.2, 0.25);
          m.elements[12] += frame.up.x * (-0.27);
          m.elements[13] += frame.up.y * (-0.27);
          m.elements[14] += frame.up.z * (-0.27);
          batch.add('sleeperWood', sleeper, m);
        } else {
          frame.matrix(m, 2.75, 0.21, 0.25);
          const y = -0.289 + lower;
          m.elements[12] += frame.up.x * y;
          m.elements[13] += frame.up.y * y;
          m.elements[14] += frame.up.z * y;
          batch.add('sleeper', sleeper, m);
        }
      }
    }
    // guard rails on bridges
    for (const br of bridges) {
      const ga = Math.max(a, br.s0 - 10), gb = Math.min(b, br.s1 + 10);
      if (gb - ga > 1) {
        const gl = sampleChainages(geo, tr, ga, gb, 5);
        for (const side of [-1, 1]) extrudeProfile(batch, 'rail', frame, off, gl, shiftProfile(RAIL_SIDE, side * 0.55).map(([x, y]) => [x, y + 0.0]), origin, { uScale: 4, vScale: 0.1 });
      }
    }
    // buffer stops
    if (tr.bufferA && a <= tr.sA + 0.5) addBufferStop(batch, frame, off, tr.sA, origin, -1);
    if (tr.bufferB && b >= tr.sB - 0.5) addBufferStop(batch, frame, off, tr.sB, origin, 1);
  }
}

function addBufferStop(batch, frame, off, s, origin, facing) {
  const m = new THREE.Matrix4();
  frame.at(off, s, origin);
  const box = Prim.box();
  const place = (x, y, z, sx, sy, sz, key, color) => {
    const p = frame.pos.clone().addScaledVector(frame.right, x).addScaledVector(frame.up, y).addScaledVector(frame.tan, z);
    m.set(
      frame.right.x * sx, frame.up.x * sy, frame.tan.x * sz, p.x,
      frame.right.y * sx, frame.up.y * sy, frame.tan.y * sz, p.y,
      frame.right.z * sx, frame.up.z * sy, frame.tan.z * sz, p.z,
      0, 0, 0, 1,
    );
    batch.add(key, box, m, color);
  };
  const red = new THREE.Color('#b8261d'), yel = new THREE.Color('#e5b81b'), dark = new THREE.Color('#333');
  place(0, 0.55, facing * 1.2, 3.0, 1.1, 2.0, 'paint', dark);
  place(0, 1.02, facing * 0.1, 2.8, 0.36, 0.25, 'paint', red);
  place(-0.9, 1.02, facing * -0.05, 0.4, 0.4, 0.06, 'paint', yel);
  place(0.9, 1.02, facing * -0.05, 0.4, 0.4, 0.06, 'paint', yel);
}
