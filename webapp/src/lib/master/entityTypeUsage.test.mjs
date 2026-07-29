// ── entityType ที่หน้าจอส่งเข้ามา ต้องมีอยู่ในทะเบียนกลางจริง ─────────────
//
// ⭐ ที่มา: mig 0173 เปลี่ยนชื่อ entityType จาก `material_ask`/`material_ask_item`
// เป็น `dept_request`/`dept_request_item` และย้ายข้อมูลให้เรียบร้อยแล้ว — แต่หน้า
// รายละเอียดคำร้องยังส่งชื่อเก่าอยู่ · เธรดกับไฟล์แนบเป็น polymorphic (ไม่มี FK
// ไม่มี CHECK) จึงไม่มีอะไร error เลย: **อ่านไม่เจอก็แค่ขึ้นว่า "ยังไม่มี" และ
// ข้อความใหม่ที่โพสต์ก็ตกไปอยู่คีย์ที่ไม่มีใครอ่าน** เสียหายเงียบสนิท
//
// เทสต์นี้ผูก JSX เข้ากับทะเบียนกลาง — พิมพ์ชื่อผิดหรือลืมเปลี่ยนตอน rename = จับได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { UPDATE_KINDS } from './updateTypes.js';
import { ATTACHMENT_ENTITY_TYPES } from './attachmentTypes.js';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function jsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { jsxFiles(full, out); continue; }
    if (/\.js$/.test(entry)) out.push(full);
  }
  return out;
}

// เก็บเฉพาะค่าคงที่ (entityType="x") — ค่าที่มาจากตัวแปรตรวจแบบนี้ไม่ได้ ปล่อยผ่าน
function literalEntityTypes(src) {
  return [...src.matchAll(/entityType=["']([a-z_]+)["']/g)].map((m) => m[1]);
}

// ไฟล์ที่ประกาศทะเบียนเอง + เทสต์ ไม่นับ (มีชื่อครบทุกตัวอยู่แล้วโดยธรรมชาติ)
const SKIP = /master[\\/](updateTypes|attachmentTypes)\.js$|\.test\.mjs$/;

test('entityType ของเธรด (UpdateThread) ทุกจุดมีอยู่ในทะเบียน updateTypes', () => {
  const known = new Set(Object.keys(UPDATE_KINDS));
  const bad = [];
  for (const file of jsxFiles(SRC)) {
    if (SKIP.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.includes('UpdateThread')) continue;
    for (const type of literalEntityTypes(src)) {
      if (!known.has(type) && !ATTACHMENT_ENTITY_TYPES.includes(type)) {
        bad.push(`${path.relative(SRC, file)} → "${type}"`);
      }
    }
  }
  assert.deepEqual(bad, [], `entityType ที่ไม่มีในทะเบียนกลาง:\n  ${bad.join('\n  ')}`);
});

test('entityType ของไฟล์แนบ (AttachmentsPanel) ทุกจุดมีอยู่ในทะเบียน attachmentTypes', () => {
  const bad = [];
  for (const file of jsxFiles(SRC)) {
    if (SKIP.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.includes('AttachmentsPanel')) continue;
    for (const type of literalEntityTypes(src)) {
      if (!ATTACHMENT_ENTITY_TYPES.includes(type) && !(type in UPDATE_KINDS)) {
        bad.push(`${path.relative(SRC, file)} → "${type}"`);
      }
    }
  }
  assert.deepEqual(bad, [], `entityType ที่ไม่มีในทะเบียนกลาง:\n  ${bad.join('\n  ')}`);
});

test('ชื่อ entityType ก่อน mig 0173 ต้องไม่กลับมาอีก', () => {
  const retired = ['material_ask', 'material_ask_item'];
  const bad = [];
  for (const file of jsxFiles(SRC)) {
    if (SKIP.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const type of retired) {
      if (new RegExp(`entityType=["']${type}["']`).test(src)
        || new RegExp(`entityType:\\s*['"\`]${type}['"\`]`).test(src)) {
        bad.push(`${path.relative(SRC, file)} → "${type}" (ใช้ dept_request / dept_request_item)`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
