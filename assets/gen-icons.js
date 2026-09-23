// Generates icon-192.png and icon-512.png without external deps.
// Pure-JS rasterizer + zlib PNG encoder (Node built-ins only).
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function makeIcon(size) {
  const W = size, H = size;
  const buf = new Uint8Array(W * H * 4);
  const cx = W / 2, cy = H / 2;
  const set = (x, y, r, g, b, a = 255) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    const ea = a / 255, ia = 1 - ea;
    buf[i]   = r * ea + buf[i]   * ia;
    buf[i+1] = g * ea + buf[i+1] * ia;
    buf[i+2] = b * ea + buf[i+2] * ia;
    buf[i+3] = Math.max(buf[i+3], a);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  // background rounded rect gradient
  const rad = size * 0.19;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // rounded corner mask
    const inCorner = (qx, qy) => (x < qx ? (qx - x) : 0) ** 2 + (y < qy ? (qy - y) : 0) ** 2;
    let outside = false;
    if (x < rad && y < rad && (rad - x) ** 2 + (rad - y) ** 2 > rad * rad) outside = true;
    if (x > W - rad && y < rad && (x - (W - rad)) ** 2 + (rad - y) ** 2 > rad * rad) outside = true;
    if (x < rad && y > H - rad && (rad - x) ** 2 + (y - (H - rad)) ** 2 > rad * rad) outside = true;
    if (x > W - rad && y > H - rad && (x - (W - rad)) ** 2 + (y - (H - rad)) ** 2 > rad * rad) outside = true;
    if (outside) continue;
    const t = (x + y) / (W + H);
    const r = lerp(0x12, 0x0a, t), g = lerp(0x1a, 0x0e, t), b = lerp(0x2e, 0x1a, t);
    set(x, y, r, g, b, 255);
  }
  // radial halo
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy * 0.9) / (size * 0.6);
    if (d < 1) { const a = (1 - d) * 90; set(x, y, 0x6a, 0x5c, 0xff, a); }
  }
  // helper: stroke circle
  const strokeCircle = (r, thick, col, alpha) => {
    for (let a = 0; a < Math.PI * 2; a += 0.004) {
      for (let w = -thick / 2; w < thick / 2; w++) {
        const rr = r + w;
        set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, col[0], col[1], col[2], alpha);
      }
    }
  };
  const grad = (t) => [lerp(0x35, 0x6a, t), lerp(0xe0, 0x5c, t), lerp(0xd0, 0xff, t)];
  strokeCircle(size * 0.29, size * 0.02, [0x50, 0x9a, 0xf0], 110);
  // hex outline
  const hexPts = (R) => Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  });
  const drawPoly = (pts, thick, colFn) => {
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      const steps = Math.hypot(x2 - x1, y2 - y1);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, px = lerp(x1, x2, t), py = lerp(y1, y2, t);
        const c = colFn(t);
        for (let w = -thick / 2; w < thick / 2; w++)
          for (let u = -thick / 2; u < thick / 2; u++)
            set(px + w, py + u, c[0], c[1], c[2], 255);
      }
    }
  };
  const fillPoly = (pts, colFn) => {
    let minY = H, maxY = 0; pts.forEach(p => { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k < xs.length; k += 2) {
        for (let x = xs[k]; x <= xs[k + 1]; x++) { const c = colFn((x - cx) / size + 0.5); set(x, y, c[0], c[1], c[2], 255); }
      }
    }
  };
  drawPoly(hexPts(size * 0.235), size * 0.03, grad);
  fillPoly(hexPts(size * 0.125), grad);
  // lightning bolt
  const bolt = [[0.03,-0.09],[-0.043,0.016],[0.012,0.016],[-0.031,0.098],[0.066,-0.012],[0.008,-0.012]]
    .map(([x, y]) => [cx + x * size, cy + y * size]);
  fillPoly(bolt, () => [0x0a, 0x0e, 0x1a]);
  // orbiting nodes
  const node = (nx, ny, r) => { for (let a = 0; a < Math.PI * 2; a += 0.02) for (let rr = 0; rr < r; rr++) set(nx + Math.cos(a) * rr, ny + Math.sin(a) * rr, 0x35, 0xe0, 0xd0, 255); };
  node(cx, cy - size * 0.33, size * 0.028);
  node(cx + size * 0.30, cy + size * 0.14, size * 0.024);
  node(cx - size * 0.30, cy + size * 0.14, size * 0.024);

  return encodePNG(W, H, buf);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // filter type 0 per scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4)
      .forEach((v, i) => { raw[y * (width * 4 + 1) + 1 + i] = v; });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

for (const size of [192, 512]) {
  const png = makeIcon(size);
  fs.writeFileSync(path.join(__dirname, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
