// ── alias ของ /api/master/* ต้อง re-export ครบทุก method ที่ปลายทางมี ────────
//
// 🐞 บั๊กจริงที่ผู้ใช้แจ้ง (IS-26080008 · 2026-08-11): "ใส่วันที่ของเอกสารหนังสือรับรอง
// ไม่ได้" — `master/attachments/[id]` re-export แค่ `DELETE` ส่วนหน้าจอยิง `PATCH`
// มาที่ชื่อนี้ ⇒ Next ตอบ **405** ⇒ ช่องวันที่เด้งกลับค่าเดิมทุกครั้งที่กรอก
//
// ⚠️ 405 ไม่มี log ฝั่ง handler ให้เห็นเลย เพราะ handler ไม่เคยถูกเรียก — เทสต์นี้
// คือสิ่งเดียวที่จับได้ตอน alias ปลายทางเพิ่ม method ใหม่แล้วลืมมาต่อที่ alias
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = 'src/app/api/master';
const METHOD = /export (?:async function|const) (GET|POST|PATCH|PUT|DELETE)\b/g;

function routeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.js' ? [path] : [];
  });
}

test('alias ทุกตัวใน /api/master ส่งต่อ method ครบตามปลายทาง', () => {
  const gaps = [];
  for (const file of routeFiles(ROOT)) {
    const source = readFileSync(file, 'utf8');
    const reexport = source.match(/export \{([^}]*)\} from ['"]([^'"]+)['"]/);
    if (!reexport) continue; // ไฟล์ที่เขียน handler เอง ไม่ใช่ alias

    const exported = reexport[1].split(',').map((s) => s.trim()).filter(Boolean);
    const target = `${resolve(dirname(file), reexport[2])}.js`;
    const targetSource = readFileSync(target, 'utf8');
    const methods = [...targetSource.matchAll(METHOD)].map((m) => m[1]);
    const missing = methods.filter((m) => !exported.includes(m));
    if (missing.length) gaps.push(`${file} ขาด ${missing.join(', ')}`);
  }
  assert.deepEqual(gaps, [], `alias ที่ยังส่งต่อไม่ครบ:\n${gaps.join('\n')}`);
});
