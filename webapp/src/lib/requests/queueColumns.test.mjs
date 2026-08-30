// ── ตารางคำร้องมีชุดเดียว (แบบ ข) ────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUEST_COLUMNS, REQUEST_COLUMN_KEYS, REQUEST_COLUMN_PRESETS, requestColumns,
} from './queueColumns.js';

const SRC = path.join(process.cwd(), 'src');
const PANEL = path.join(SRC, 'components/requests/RequestQueuePanel.js');

test('ทุกคีย์ในทะเบียนมีป้ายหัวคอลัมน์', () => {
  for (const key of REQUEST_COLUMN_KEYS) {
    assert.ok(REQUEST_COLUMNS[key].label, `${key} ต้องมี label`);
  }
});

test('ชุดสำเร็จรูปอ้างเฉพาะคีย์ที่มีจริง — พิมพ์ผิดแล้วจะได้ช่องว่างเงียบ ๆ', () => {
  for (const [name, keys] of Object.entries(REQUEST_COLUMN_PRESETS)) {
    assert.ok(keys.length, `ชุด ${name} ต้องมีคอลัมน์`);
    for (const key of keys) {
      assert.ok(REQUEST_COLUMNS[key], `ชุด ${name} อ้างคีย์ที่ไม่มีในทะเบียน: ${key}`);
    }
    // requestColumns ต้องคืนครบ ไม่ตกหล่น
    assert.deepEqual(requestColumns(name), keys);
  }
});

test('requestColumns — คีย์ที่ไม่รู้จักถูกตัดทิ้ง · ชื่อชุดที่ไม่มีถอยไปชุดคิว', () => {
  assert.deepEqual(requestColumns(['next', 'ไม่มีจริง', 'due']), ['next', 'due']);
  assert.deepEqual(requestColumns('ไม่มีชุดนี้'), REQUEST_COLUMN_PRESETS.queue);
  assert.deepEqual(requestColumns(undefined), REQUEST_COLUMN_PRESETS.queue);
});

test('⭐ ทุกคีย์ในทะเบียนมีตัววาดจริงในพาเนล — ไม่งั้นคอลัมน์เป็นช่องว่างเงียบ ๆ', () => {
  const panel = fs.readFileSync(PANEL, 'utf8');
  for (const key of REQUEST_COLUMN_KEYS) {
    assert.ok(
      panel.includes(`case "${key}":`),
      `RequestQueuePanel ไม่มี case "${key}" — ทะเบียนกับตัววาดหลุดกัน`,
    );
  }
});

test('🔴 ตารางคำร้องต้องมีชุดเดียวทั้งระบบ — ห้ามมีสำเนาที่สองงอกมาอีก', () => {
  /* 🐞 ของเดิมมีสองสำเนา (`RequestQueuePanel` กับ `RequestListCard`) แล้วเพี้ยนหากัน:
     ใบที่ถูกตีกลับขึ้นว่า "ร่าง" บนหน้าดีลทั้งที่คิวบอกว่า "ตีกลับ — ต้องแก้"
     ⇒ เทสต์นี้กันไฟล์ที่สองงอกมาใหม่ · อยากได้คอลัมน์ต่างออกไป ให้เพิ่ม **ชุด**
     ใน `REQUEST_COLUMN_PRESETS` ไม่ใช่เขียนตารางใหม่ */
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  })(SRC);

  /* ไฟล์ที่ทั้งใช้ชื่อชนิดคำร้อง **และ** วาด `<table>` เอง = ตารางคำร้องอีกชุด
     ⚠️ รายการยกเว้นต้องมีเหตุผลกำกับ — ไม่ใช่ที่ทิ้งของที่ขี้เกียจแก้ */
  const ALLOWED = {
    'components/salesPlanning/DealTimelineTable.js':
      'ตารางขั้นตอนไทม์ไลน์ (ไม่ใช่ตารางคำร้อง) — ใช้ชื่อชนิดแค่ใน tooltip ของหมุดคำร้องบนขั้นตอน',
    'app/rd/sales-orders/page.js':
      'ตาราง **ใบสั่งขาย** ของโมดูล R&D — หนึ่งแถวคือหนึ่งใบสั่งขาย · ชื่อชนิดคำร้องโผล่'
      + ' แค่ในลิงก์ย้อนกลับไปใบที่อ้างถึงใบสั่งขายนั้น ไม่ใช่คอลัมน์ของคำร้อง',
  };
  const offenders = files.filter((file) => {
    if (file === PANEL) return false;
    const rel = path.relative(SRC, file);
    if (ALLOWED[rel]) return false;
    const text = fs.readFileSync(file, 'utf8');
    return text.includes('requestKindLabel') && /<table/.test(text);
  }).map((file) => path.relative(SRC, file));

  // รายการยกเว้นต้องยังมีไฟล์อยู่จริง — ไม่งั้นมันจะกลายเป็นรูโหว่ที่ไม่มีใครรู้
  for (const rel of Object.keys(ALLOWED)) {
    assert.ok(fs.existsSync(path.join(SRC, rel)), `รายการยกเว้นตกรุ่น: ${rel}`);
  }

  assert.deepEqual(offenders, [], `มีตารางคำร้องอีกชุดนอก RequestQueuePanel: ${offenders.join(' · ')}`);
});
