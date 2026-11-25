// ยามของทะเบียนป้ายสิทธิ์ (รื้อระบบสิทธิ์งวด 3) — cap ใหม่ที่ลืมเติมป้าย = แท็บ "สิทธิ์ตามตำแหน่ง" โกหกเงียบ ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSED_MODULES, GRANTABLE_CAPS, ROLES, capsFor } from '@/lib/permissions';
import { CAPABILITY_MODULES, CAP_TIER_LABELS, capInfo, catalogCaps, moduleClosed, moduleLevel } from '@/lib/capabilityCatalog';

// cap ที่ทุกคนได้เสมอ (UNIVERSAL_CAPS ใน permissions.js) — ไม่ใช่ความต่างระหว่างตำแหน่ง จึงไม่อยู่ในตาราง
const EVERYONE = ['issues:report'];

test('⭐ ทุก cap ที่ตำแหน่งไหนถืออยู่ หรือแจกรายคนได้ มีป้ายในทะเบียน', () => {
  const used = new Set([...ROLES.flatMap((role) => capsFor(role)), ...GRANTABLE_CAPS]);
  const missing = [...used].filter((cap) => !EVERYONE.includes(cap) && !capInfo(cap));
  assert.deepEqual(missing, [], `cap ที่ยังไม่มีป้ายไทย: ${missing.join(', ')} — เติมใน lib/capabilityCatalog.js`);
});

test('ทะเบียนไม่มี cap ผี (ไม่มีตำแหน่งไหนถือ และแจกไม่ได้) และไม่ซ้ำ', () => {
  const used = new Set([...ROLES.flatMap((role) => capsFor(role)), ...GRANTABLE_CAPS]);
  const caps = catalogCaps();
  assert.equal(new Set(caps).size, caps.length, 'cap ซ้ำในทะเบียน');
  const ghosts = caps.filter((cap) => !used.has(cap));
  assert.deepEqual(ghosts, [], `cap ในทะเบียนที่ไม่มีใครใช้แล้ว: ${ghosts.join(', ')}`);
});

test('ทุกแถวมีระดับ 1–3 และป้ายไทย · ทุกระบบมีชื่อ/ไอคอน', () => {
  assert.equal(CAP_TIER_LABELS.length, 4);
  for (const m of CAPABILITY_MODULES) {
    assert.ok(m.name && m.icon && m.key, m.key);
    for (const c of m.caps) {
      assert.ok([1, 2, 3].includes(c.tier), c.cap);
      assert.match(c.label, /[฀-๿]/, `${c.cap} ต้องมีป้ายไทย`);
    }
  }
});

test('ระบบที่ปิด (CLOSED_MODULES) ทุกตัวมีอยู่ในทะเบียนด้วยคีย์เดียวกัน — ตารางจะได้ขึ้นลายปิด', () => {
  for (const key of CLOSED_MODULES) {
    const m = CAPABILITY_MODULES.find((x) => x.key === key);
    assert.ok(m, `${key} ไม่มีในทะเบียน`);
    assert.equal(moduleClosed(m), true);
  }
});

test('moduleLevel = ระดับสูงสุดที่ถือในระบบนั้น', () => {
  const tax = CAPABILITY_MODULES.find((m) => m.key === 'tax');
  assert.equal(moduleLevel([], tax), 0);
  assert.equal(moduleLevel(['ra:view'], tax), 1);
  assert.equal(moduleLevel(new Set(['ra:view', 'ra:approve']), tax), 3);
  assert.equal(moduleLevel(capsFor('admin'), tax), 3);
  assert.equal(moduleLevel(capsFor('marketing'), tax), 0);
});
