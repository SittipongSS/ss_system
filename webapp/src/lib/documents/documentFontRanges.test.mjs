// ── อักขระที่ฟอนต์ของเอกสารพิมพ์ได้จริง (สเปก PR-2 §8) ──────────────────────────────────────
//
// ⭐ `DOCUMENT_FONT_CODEPOINTS` เป็นค่าคงที่ที่พิมพ์ด้วยมือ ⇒ เทสต์นี้แกะ **cmap จริง** ของฟอนต์ทุกตัวที่ฝังในกระดาษ
//   (`DOCUMENT_FONT_FACE_CSS`) แล้วล้มเมื่อค่าคงที่ต่างไป — รัน `gen:document-fonts` ใหม่แล้วลืมแก้ช่วง = ล้มที่นี่
//   🔴 ต้องเป็น cmap ไม่ใช่ `unicode-range`: ช่วง U+2000–206F ประกาศ 112 ตัว แต่ฟอนต์มี glyph 15 ตัว
//
// วิธีแกะ (ไม่มี dependency): WOFF2 = หัว 48 ไบต์ → สารบัญตาราง (flags · tag · ความยาวแบบ UIntBase128)
//   → ก้อน brotli ก้อนเดียวที่ต่อทุกตารางตามลำดับสารบัญ · ตาราง cmap ไม่ถูกแปลงรูป (transform) ⇒ ตัดตาม offset ได้เลย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { DOCUMENT_FONT_FACE_CSS } from '../sales/quotationDocumentFonts.js';
import { DOCUMENT_FONT_CODEPOINTS, documentFontCovers, uncoveredChars } from './documentFontRanges.js';

/* ── ตัวแกะ WOFF2 → cmap ──────────────────────────────────────────────── */

const TAG_CMAP = 0; // ลำดับของ 'cmap' ในตาราง tag ที่รู้จักของ WOFF2
const TAG_GLYF = 10;
const TAG_LOCA = 11;
const TAG_CUSTOM = 63; // tag ที่ไม่อยู่ในตาราง = ตามด้วยชื่อ 4 ไบต์

function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[pos + i];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return { value, next: pos + i + 1 };
  }
  throw new Error('UIntBase128 ยาวเกิน 5 ไบต์');
}

/** ตาราง cmap ดิบของฟอนต์ WOFF2 หนึ่งตัว */
function woff2CmapTable(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2', 'ไม่ใช่ WOFF2');
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  let pos = 48;
  let offset = 0;
  let cmap = null;
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[pos]; pos += 1;
    const tag = flags & 0x3f;
    const version = flags >> 6;
    if (tag === TAG_CUSTOM) pos += 4;
    const orig = readBase128(buf, pos); pos = orig.next;
    let length = orig.value;
    // glyf/loca: รุ่น 0 = แปลงรูป · ตารางอื่น: รุ่นที่ไม่ใช่ 0 = แปลงรูป — ตารางที่แปลงรูปมีความยาวอีกตัวตามมา
    const transformed = tag === TAG_GLYF || tag === TAG_LOCA ? version === 0 : version !== 0;
    if (transformed) { const t = readBase128(buf, pos); pos = t.next; length = t.value; }
    if (tag === TAG_CMAP) cmap = { offset, length, transformed };
    offset += length;
  }
  assert.ok(cmap, 'ฟอนต์ไม่มีตาราง cmap');
  assert.equal(cmap.transformed, false, 'cmap ถูกแปลงรูป — ตัวแกะนี้อ่านไม่ได้');
  const data = brotliDecompressSync(buf.subarray(pos, pos + compressedSize));
  assert.equal(data.length, offset, 'ขนาดหลังคลาย brotli ไม่ตรงกับสารบัญตาราง');
  return data.subarray(cmap.offset, cmap.offset + cmap.length);
}

/** code point ทุกตัวที่ cmap ชี้ไป glyph จริง (ไม่ใช่ glyph 0 = .notdef) — รวมทุก subtable */
function cmapCodePoints(table) {
  const out = new Set();
  const count = table.readUInt16BE(2);
  for (let i = 0; i < count; i += 1) {
    const at = table.readUInt32BE(8 + i * 8);
    const format = table.readUInt16BE(at);
    if (format === 4) {
      const segX2 = table.readUInt16BE(at + 6);
      const endAt = at + 14;
      const startAt = endAt + segX2 + 2;
      const deltaAt = startAt + segX2;
      const rangeAt = deltaAt + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = table.readUInt16BE(endAt + s);
        const start = table.readUInt16BE(startAt + s);
        const delta = table.readUInt16BE(deltaAt + s);
        const rangeOffset = table.readUInt16BE(rangeAt + s);
        for (let code = start; code <= end && code < 0xffff; code += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
          else {
            glyph = table.readUInt16BE(rangeAt + s + rangeOffset + (code - start) * 2);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) out.add(code);
        }
      }
    } else if (format === 12) {
      const groups = table.readUInt32BE(at + 12);
      for (let g = 0; g < groups; g += 1) {
        const start = table.readUInt32BE(at + 16 + g * 12);
        const end = table.readUInt32BE(at + 20 + g * 12);
        const glyph = table.readUInt32BE(at + 24 + g * 12);
        for (let code = start; code <= end; code += 1) if (glyph + (code - start)) out.add(code);
      }
    } else {
      assert.fail(`cmap subtable format ${format} — ตัวแกะรู้จักแค่ 4 กับ 12`);
    }
  }
  return out;
}

/** `@font-face` ทุกตัวของกระดาษ: น้ำหนัก · ช่วงที่ประกาศ · cmap จริง */
function embeddedFaces() {
  return [...DOCUMENT_FONT_FACE_CSS.matchAll(/@font-face\{([^}]*)\}/g)].map(([, css]) => {
    const declared = /unicode-range:([^;}]+)/.exec(css)[1].split(',').map((part) => {
      const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(from, 16), parseInt(to || from, 16)];
    });
    const font = Buffer.from(/base64,([A-Za-z0-9+/=]+)/.exec(css)[1], 'base64');
    return {
      weight: /font-weight:(\d+)/.exec(css)[1],
      family: /font-family:'([^']+)'/.exec(css)[1],
      inDeclared: (code) => declared.some(([from, to]) => code >= from && code <= to),
      cmap: cmapCodePoints(woff2CmapTable(font)),
    };
  });
}

const sorted = (set) => [...set].sort((a, b) => a - b);
function toRanges(codes) {
  const out = [];
  for (const code of codes) {
    const last = out[out.length - 1];
    if (last && last[1] === code - 1) last[1] = code;
    else out.push([code, code]);
  }
  return out;
}
const hex = (n) => `0x${n.toString(16).padStart(4, '0')}`;
const rangesText = (ranges) => ranges.map(([a, b]) => (a === b ? `range(${hex(a)})` : `range(${hex(a)}, ${hex(b)})`)).join(', ');

/* ── ค่าคงที่ = cmap จริง ─────────────────────────────────────────────── */

test('🔴 ฟอนต์ที่ฝังในกระดาษ: Sarabun 8 ตัว (latin + thai × 400/500/600/700) — latin มี 229 ตัว · thai มี 94 ตัว', () => {
  const faces = embeddedFaces();
  assert.equal(faces.length, 8);
  assert.deepEqual([...new Set(faces.map((f) => f.family))], ['Sarabun']);
  assert.deepEqual([...new Set(faces.map((f) => f.weight))], ['400', '500', '600', '700']);
  for (const weight of ['400', '500', '600', '700']) {
    const sizes = faces.filter((f) => f.weight === weight).map((f) => f.cmap.size).sort((a, b) => a - b);
    assert.deepEqual(sizes, [94, 229], `น้ำหนัก ${weight}`);
  }
});

test('🔴 DOCUMENT_FONT_CODEPOINTS = cmap จริงของฟอนต์ทุกตัว (ตัดด้วย unicode-range ของตัวเอง) — เท่ากันทุกน้ำหนัก', () => {
  const faces = embeddedFaces();
  for (const weight of ['400', '500', '600', '700']) {
    const printable = new Set();
    for (const face of faces.filter((f) => f.weight === weight)) {
      // เบราว์เซอร์ใช้ฟอนต์ตัวหนึ่งพิมพ์อักขระก็ต่อเมื่อ cmap มี **และ** อยู่ใน unicode-range ของตัวนั้น
      for (const code of face.cmap) if (face.inDeclared(code)) printable.add(code);
    }
    const actual = toRanges(sorted(printable));
    assert.deepEqual(
      DOCUMENT_FONT_CODEPOINTS.map(([a, b]) => [a, b]), actual,
      `น้ำหนัก ${weight}: ค่าคงที่ไม่ตรงกับฟอนต์ — ลอกชุดนี้ไปแทน:\n${rangesText(actual)}`,
    );
  }
});

test('ช่วงของค่าคงที่: เรียงจากน้อยไปมาก ไม่ซ้อน ไม่ติดกัน · แช่แข็ง · รวม 313 ตัว', () => {
  let total = 0;
  let prevEnd = -2;
  for (const [from, to] of DOCUMENT_FONT_CODEPOINTS) {
    assert.ok(from <= to, `ช่วงกลับหัว ${hex(from)}–${hex(to)}`);
    assert.ok(from > prevEnd + 1, `ช่วง ${hex(from)} ซ้อนหรือติดกับช่วงก่อนหน้า`);
    prevEnd = to;
    total += to - from + 1;
  }
  assert.equal(total, 313);
  assert.ok(Object.isFrozen(DOCUMENT_FONT_CODEPOINTS) && DOCUMENT_FONT_CODEPOINTS.every(Object.isFrozen));
});

test('🔴 unicode-range ไม่ใช่รายการ glyph: U+2000–206F ประกาศ 112 ตัว ฟอนต์มีจริง 15 ตัว', () => {
  let covered = 0;
  for (let code = 0x2000; code <= 0x206f; code += 1) if (documentFontCovers(code)) covered += 1;
  assert.equal(covered, 15);
  // ที่ประกาศไว้ในช่วงแต่ไม่มี glyph — ขีดสามแบบ · เปอร์มิลล์ · เครื่องหมายอ้างอิง
  for (const ch of ['‐', '‑', '‒', '‰', '※']) assert.equal(documentFontCovers(ch.codePointAt(0)), false, ch);
  // cmap มี แต่อยู่นอก unicode-range ของฟอนต์ตัวนั้น ⇒ เบราว์เซอร์ไม่ใช้ Sarabun พิมพ์
  for (const code of [0x0300, 0x0301, 0x0309, 0x0323]) assert.equal(documentFontCovers(code), false, hex(code));
});

test('อักขระที่กระดาษใช้เอง (ขีดยาว · คูณ · จุดกลาง · NBSP) กับตัวไทยทุกตัว อยู่ในฟอนต์', () => {
  for (const ch of ['—', '–', '×', '·', ' ', '•', '…', '“', '”', '฿', '๐', '๙', 'ๆ', 'ฯ', '²', '°']) {
    assert.equal(documentFontCovers(ch.codePointAt(0)), true, ch);
  }
  for (let code = 0x0e01; code <= 0x0e5b; code += 1) {
    if (code >= 0x0e3b && code <= 0x0e3e) continue; // Unicode ไม่ได้กำหนด
    assert.equal(documentFontCovers(code), true, hex(code));
  }
});

/* ── uncoveredChars ───────────────────────────────────────────────────── */

test('uncoveredChars: ข้อความไทย/อังกฤษ/ตัวเลข/เครื่องหมายทั่วไป = พิมพ์ได้ทั้งหมด', () => {
  assert.deepEqual(uncoveredChars('ห้องประชุม 2 (ชั้น GF) — กว้าง 4.50 × 6 ม. · เพดาน 2.8 ม. “ติดกระจก” 100% @ #1'), []);
  assert.deepEqual(uncoveredChars('น้ำ ก็ ผู้ ที่ ป้าย เปี๊ยะ ๑๒๓ ฿1,000'), []);
});

test('🔴 uncoveredChars: อีโมจิ · ขีด U+2010 · "≤" "→" "⇒" · ตัวเต็มความกว้าง = พิมพ์ไม่ได้ (ไม่ซ้ำ เรียงตามที่พบ)', () => {
  assert.deepEqual(uncoveredChars('ล็อบบี้ 😀'), ['😀']);
  assert.deepEqual(uncoveredChars('ชั้น 1‐2 ≤ 30 → ⇒ ≤'), ['‐', '≤', '→', '⇒']);
  assert.deepEqual(uncoveredChars('ＡＢ㎡✓'), ['Ａ', 'Ｂ', '㎡', '✓']);
  // อีโมจิที่ประกอบจากหลาย code point ออกมาทีละตัว · ตัวเชื่อม (ZWJ) กับ variation selector ไม่นับ
  assert.deepEqual(uncoveredChars('👨‍👩 ❤️'), ['👨', '👩', '❤']);
});

test('🔴 uncoveredChars: ช่องว่าง · ขึ้นบรรทัด · ZWSP · ZWJ · ZWNJ · BOM ไม่ถูกนับ — ไม่พิมพ์อะไรอยู่แล้ว', () => {
  assert.deepEqual(uncoveredChars('ห้อง​ประชุม‌‍﻿'), []);
  assert.deepEqual(uncoveredChars('บรรทัดแรก\r\nบรรทัดสอง\tแท็บ   　'), []);
  assert.deepEqual(uncoveredChars('⁠‎‏­'), []);
});

test('uncoveredChars: ค่าว่างและค่าที่ไม่ใช่สตริงไม่ throw', () => {
  assert.deepEqual(uncoveredChars(null), []);
  assert.deepEqual(uncoveredChars(undefined), []);
  assert.deepEqual(uncoveredChars(''), []);
  assert.deepEqual(uncoveredChars(1234.5), []);
  assert.deepEqual(uncoveredChars('\ud83d'), ['\ud83d']); // surrogate ครึ่งตัว = พิมพ์ไม่ได้
});

test('ไฟล์ช่วงอักขระไม่ import ฟอนต์ (84 KB) — ตัวกรองของเอกสารเรียกไฟล์นี้ ต้องเบา', () => {
  const source = readFileSync(new URL('./documentFontRanges.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(source), false);
});
