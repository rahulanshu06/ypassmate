import * as THREE from 'three';

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Accumulates many small geometries into one BufferGeometry per material key.
 * Keeps draw calls low for static scenery chunks.
 */
export class GeoBatch {
  constructor() {
    this.groups = new Map();
  }

  group(key) {
    let g = this.groups.get(key);
    if (!g) {
      g = { pos: [], nor: [], uv: [], col: [], idx: [], count: 0 };
      this.groups.set(key, g);
    }
    return g;
  }

  /** Append an indexed or non-indexed BufferGeometry transformed by `matrix`. */
  add(key, geometry, matrix, color) {
    const g = this.group(key);
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const col = geometry.attributes.color;
    const base = g.count;
    if (matrix) _m3.getNormalMatrix(matrix);
    const cr = color ? color.r : 1, cg = color ? color.g : 1, cb = color ? color.b : 1;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      if (matrix) _v.applyMatrix4(matrix);
      g.pos.push(_v.x, _v.y, _v.z);
      if (nor) {
        _n.fromBufferAttribute(nor, i);
        if (matrix) _n.applyMatrix3(_m3).normalize();
        g.nor.push(_n.x, _n.y, _n.z);
      } else g.nor.push(0, 1, 0);
      if (uv) g.uv.push(uv.getX(i), uv.getY(i));
      else g.uv.push(0, 0);
      if (col) g.col.push(col.getX(i) * cr, col.getY(i) * cg, col.getZ(i) * cb);
      else g.col.push(cr, cg, cb);
    }
    if (geometry.index) {
      const ix = geometry.index;
      for (let i = 0; i < ix.count; i++) g.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) g.idx.push(base + i);
    }
    g.count += pos.count;
  }

  /** Raw append: arrays already in final space. */
  addRaw(key, positions, normals, uvs, colors, indices) {
    const g = this.group(key);
    const base = g.count;
    const n = positions.length / 3;
    for (let i = 0; i < positions.length; i++) g.pos.push(positions[i]);
    for (let i = 0; i < normals.length; i++) g.nor.push(normals[i]);
    for (let i = 0; i < uvs.length; i++) g.uv.push(uvs[i]);
    if (colors) for (let i = 0; i < colors.length; i++) g.col.push(colors[i]);
    else for (let i = 0; i < n; i++) g.col.push(1, 1, 1);
    for (let i = 0; i < indices.length; i++) g.idx.push(base + indices[i]);
    g.count += n;
  }

  isEmpty() {
    for (const g of this.groups.values()) if (g.count) return false;
    return true;
  }

  buildGeometry(key) {
    const g = this.groups.get(key);
    if (!g || !g.count) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setIndex(g.count > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  /** Build meshes. materials: key -> Material. opts: { castShadow: Set|bool, receiveShadow } */
  build(materials, parent, opts = {}) {
    const meshes = [];
    for (const key of this.groups.keys()) {
      const geo = this.buildGeometry(key);
      if (!geo) continue;
      const mat = typeof materials === 'function' ? materials(key) : materials[key];
      if (!mat) {
        console.warn('[GeoBatch] missing material', key);
        continue;
      }
      const mesh = new THREE.Mesh(geo, mat);
      const cast = opts.castShadow instanceof Set ? opts.castShadow.has(key) : opts.castShadow !== false;
      mesh.castShadow = cast;
      mesh.receiveShadow = opts.receiveShadow !== false;
      mesh.matrixAutoUpdate = false;
      mesh.name = key;
      meshes.push(mesh);
      if (parent) parent.add(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

// ----------------------------------------------------------------------------
// Shared primitive geometries (unit sized; scale via matrix)
const prims = {};
export const Prim = {
  box() {
    return prims.box || (prims.box = new THREE.BoxGeometry(1, 1, 1));
  },
  // box with origin at bottom centre
  boxBase() {
    if (!prims.boxBase) {
      prims.boxBase = new THREE.BoxGeometry(1, 1, 1);
      prims.boxBase.translate(0, 0.5, 0);
    }
    return prims.boxBase;
  },
  cyl(seg = 8) {
    const k = 'cyl' + seg;
    if (!prims[k]) {
      prims[k] = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1);
      prims[k].translate(0, 0.5, 0);
    }
    return prims[k];
  },
  cone(seg = 8) {
    const k = 'cone' + seg;
    if (!prims[k]) {
      prims[k] = new THREE.ConeGeometry(0.5, 1, seg, 1);
      prims[k].translate(0, 0.5, 0);
    }
    return prims[k];
  },
  sphere(w = 10, h = 8) {
    const k = 'sph' + w + '_' + h;
    return prims[k] || (prims[k] = new THREE.SphereGeometry(0.5, w, h));
  },
  plane() {
    return prims.plane || (prims.plane = new THREE.PlaneGeometry(1, 1));
  },
  ico(detail = 1) {
    const k = 'ico' + detail;
    return prims[k] || (prims[k] = new THREE.IcosahedronGeometry(0.5, detail));
  },
};

const _mat = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Compose a matrix from position, yaw (rad about Y), scale (x,y,z), optional pitch/roll. */
export function trs(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0) {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _mat.clone().compose(_p, _q, _s);
}

/** Matrix from basis vectors (right, up, forward) and origin; scales applied per axis. */
export function basisMatrix(origin, right, up, fwd, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.set(
    right.x * sx, up.x * sy, fwd.x * sz, origin.x,
    right.y * sx, up.y * sy, fwd.y * sz, origin.y,
    right.z * sx, up.z * sy, fwd.z * sz, origin.z,
    0, 0, 0, 1,
  );
  return m;
}
