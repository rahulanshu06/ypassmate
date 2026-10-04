import { LOCOMOTIVES } from '../data/locomotives.js';
import { COACH_TYPES, COACH } from '../data/rollingStock.js';

/**
 * Build the vehicle list for a train. Each vehicle gets mass, length, brake and resistance data
 * plus its offset from the front of the train.
 */
export function buildConsist(locoId, coachIds, { aiLoco = null } = {}) {
  const loco = LOCOMOTIVES[locoId] || LOCOMOTIVES.EP60;
  const L = loco.length || 20.56;
  const vehicles = [];
  vehicles.push({
    kind: 'loco', type: aiLoco || loco.id, spec: loco.available ? loco : LOCOMOTIVES.EP60,
    length: L, mass: loco.mass || 123e3, bogieCentres: loco.bogieCentres || 10.9,
    brakeRatio: loco.locoBrakeRatio || 0.16, davisA: 18, davisB: 0.2, davisC: 0.5 * 1.2 * (loco.dragCoeff || 0.85) * (loco.frontalArea || 11),
    rotFactor: 1.15,
  });
  for (const id of coachIds) {
    const t = COACH_TYPES[id];
    if (!t) continue;
    const length = t.length || COACH.length;
    vehicles.push({
      kind: t.wagon ? 'wagon' : 'coach', type: id, def: t, length, mass: t.tare + t.load,
      bogieCentres: t.bogieCentres || COACH.bogieCentres,
      brakeRatio: t.wagon ? 0.075 : COACH.brakeRatio,
      davisA: t.wagon ? 12 : COACH.davisA, davisB: COACH.davisB, davisC: t.wagon ? 0.9 : COACH.davisC,
      rotFactor: 1.06,
    });
  }
  let off = 0;
  for (const v of vehicles) {
    v.frontOffset = off;
    v.centreOffset = off + v.length / 2;
    off += v.length + 0.3; // coupler gap
  }
  const length = off - 0.3;
  const mass = vehicles.reduce((a, v) => a + v.mass, 0);
  return { vehicles, length, mass, loco };
}
