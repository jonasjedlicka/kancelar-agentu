#!/usr/bin/env node
/* Nakreslí pixel-art ikonu aplikace (32×32 px zvětšeno na 1024×1024) do build/icon.png.
 * electron-builder z ní při sestavení vytvoří .icns pro macOS. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 32;
const img = Array.from({ length: N }, () => Array(N).fill(null));
const C = {
  bgA: [38, 44, 64], bgB: [30, 34, 50], edge: [18, 20, 30], wall: [84, 96, 128],
  win: [120, 190, 232], winHi: [190, 232, 250], floor: [150, 104, 70], floorD: [128, 86, 58],
  desk: [196, 140, 92], deskD: [140, 96, 60], mon: [32, 36, 46], scr: [60, 200, 140], scrHi: [150, 255, 200],
  skin: [240, 196, 150], hair: [70, 44, 30], shirt: [70, 130, 220], shirtD: [50, 96, 170],
  chair: [60, 60, 72], bub: [255, 214, 64], bubD: [200, 140, 20], ink: [40, 24, 10], white: [255, 255, 255],
  leaf: [80, 170, 90], leafD: [50, 120, 60], pot: [190, 100, 60]
};
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < N && j < N) img[j][i] = c; };

// zaoblený čtverec s okrajem
for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) {
  const cx = Math.min(x - 2, 29 - x), cy = Math.min(y - 2, 29 - y);
  if (cx + cy < 3 && cx < 3 && cy < 3 && (cx === 0 || cy === 0 || cx + cy < 2)) continue;
  img[y][x] = C.edge;
}
for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
  const cx = Math.min(x - 3, 28 - x), cy = Math.min(y - 3, 28 - y);
  if (cx + cy < 2) continue;
  img[y][x] = y < 13 ? C.wall : ((x + y) % 2 ? C.floor : C.floorD);
}
// okno
rect(6, 5, 8, 6, C.edge); rect(7, 6, 6, 4, C.win); rect(7, 6, 2, 1, C.winHi); rect(9, 6, 1, 4, C.edge);
// rostlina
rect(23, 9, 4, 4, C.pot); rect(22, 5, 6, 4, C.leaf); rect(23, 4, 3, 2, C.leafD); rect(24, 7, 2, 2, C.leafD);
// stůl s monitorem
rect(6, 17, 20, 5, C.desk); rect(6, 21, 20, 2, C.deskD);
rect(10, 11, 12, 8, C.mon); rect(11, 12, 10, 5, C.scr);
rect(12, 13, 5, 1, C.scrHi); rect(12, 15, 7, 1, C.scrHi); rect(15, 19, 2, 1, C.mon);
// postava zezadu
rect(12, 22, 8, 6, C.shirt); rect(12, 26, 8, 2, C.shirtD); rect(13, 18, 6, 5, C.hair); rect(14, 22, 4, 1, C.skin);
rect(10, 24, 2, 4, C.chair); rect(20, 24, 2, 4, C.chair);
// bublina s vykřičníkem
rect(21, 11, 8, 7, C.bubD); rect(22, 11, 6, 6, C.bub); rect(24, 12, 2, 3, C.ink); rect(24, 16, 2, 1, C.ink);
rect(23, 18, 2, 1, C.bubD);

const S = 32, W = N * S;
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const c = img[Math.floor(y / S)][Math.floor(x / S)];
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (c) { raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255; }
  }
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(out, png);
console.log('Ikona:', out, png.length, 'B');
