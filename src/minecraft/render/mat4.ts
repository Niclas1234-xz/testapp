/** Minimal column-major 4×4 matrix helpers (WebGL convention). */
export type Mat4 = Float32Array;

export function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out: Mat4) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] =
        a[row] * b[c * 4] + a[4 + row] * b[c * 4 + 1] + a[8 + row] * b[c * 4 + 2] + a[12 + row] * b[c * 4 + 3];
    }
  out.set(r);
  return out;
}

/**
 * View rotation for a camera with yaw (0 = looking towards +Z/south, positive turns towards -X/west,
 * like Minecraft) and pitch (positive = looking down). No translation: rendering is camera-relative.
 */
export function viewRotation(out: Mat4, yaw: number, pitch: number) {
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = -Math.sin(pitch);
  const fz = Math.cos(yaw) * Math.cos(pitch);
  // right = forward × up
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up = right × forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  out[0] = rx;
  out[4] = 0;
  out[8] = rz;
  out[12] = 0;
  out[1] = ux;
  out[5] = uy;
  out[9] = uz;
  out[13] = 0;
  out[2] = -fx;
  out[6] = -fy;
  out[10] = -fz;
  out[14] = 0;
  out[3] = 0;
  out[7] = 0;
  out[11] = 0;
  out[15] = 1;
  return out;
}

export function translate(out: Mat4, x: number, y: number, z: number) {
  out[12] += out[0] * x + out[4] * y + out[8] * z;
  out[13] += out[1] * x + out[5] * y + out[9] * z;
  out[14] += out[2] * x + out[6] * y + out[10] * z;
  out[15] += out[3] * x + out[7] * y + out[11] * z;
  return out;
}

export function scale(out: Mat4, x: number, y: number, z: number) {
  for (let i = 0; i < 4; i++) {
    out[i] *= x;
    out[4 + i] *= y;
    out[8 + i] *= z;
  }
  return out;
}

/** Post-multiplies a rotation about the X axis. */
export function rotateX(out: Mat4, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const m4 = out[4 + i];
    const m8 = out[8 + i];
    out[4 + i] = m4 * c + m8 * s;
    out[8 + i] = m8 * c - m4 * s;
  }
  return out;
}

export function rotateY(out: Mat4, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const m0 = out[i];
    const m8 = out[8 + i];
    out[i] = m0 * c - m8 * s;
    out[8 + i] = m0 * s + m8 * c;
  }
  return out;
}

export function rotateZ(out: Mat4, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const m0 = out[i];
    const m4 = out[4 + i];
    out[i] = m0 * c + m4 * s;
    out[4 + i] = m4 * c - m0 * s;
  }
  return out;
}

/** Frustum planes (a, b, c, d) extracted from a view-projection matrix. */
export function frustumPlanes(m: Mat4, out: Float32Array) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
  ];
  rows.forEach((r, i) => out.set(r, i * 4));
  return out;
}

/** True if the axis-aligned box intersects the frustum (conservative). */
export function boxInFrustum(p: Float32Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  for (let i = 0; i < 6; i++) {
    const a = p[i * 4];
    const b = p[i * 4 + 1];
    const c = p[i * 4 + 2];
    const d = p[i * 4 + 3];
    const x = a >= 0 ? x1 : x0;
    const y = b >= 0 ? y1 : y0;
    const z = c >= 0 ? z1 : z0;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
