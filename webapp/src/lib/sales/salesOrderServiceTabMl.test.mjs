// ── แท็บ "งานบริการ" ของใบสั่งขาย: คอลัมน์มาตรฐาน มล./เดือน (PR-C · C8 · IMPL_PLAN_C §3.8) — ยามรูปซอร์ส ──
//
// ⭐ ช่องเดียวกับรายละเอียดโซนของคิว TS (`TermStandardMlCell`) รับรายการรอบขายทรง §4.3 ไปตรง ๆ ไม่แปลงทรง
// ⭐ แก้ได้เฉพาะคนที่วางรอบได้ (`canEditService` ตัวเดียวกับปุ่มวางรอบ) · คนอื่นเห็นค่าอย่างเดียว
// ⚠️ แท็บไม่ยิง API เองเพื่อบันทึก — ช่องเป็นคนเรียก `PATCH /api/service/terms/[id]` ผ่าน apiJson
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tab = readFileSync(
  new URL('../../components/salesPlanning/SalesOrderServiceTab.js', import.meta.url),
  'utf8',
);
/* ตารางที่สอง (ไซต์ที่งานนี้ลงไป) — ตัดตั้งแต่หัวการ์ดถึงการ์ดถัดไป */
const sitesCard = tab.slice(tab.indexOf('title="ไซต์ที่งานนี้ลงไป"'), tab.indexOf('eyebrow="VISITS"'));

test('หัวคอลัมน์ "มาตรฐาน (มล./เดือน)" อยู่ถัดจาก "จำนวนที่ลง"', () => {
  assert.ok(sitesCard.length > 0, 'หาการ์ดไซต์ไม่เจอ');
  const heads = [...sitesCard.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(heads, ['ไซต์ / ลูกค้า', 'โซนที่ผูก', 'จำนวนที่ลง', 'มาตรฐาน (มล./เดือน)', 'รอบบริการ']);
  assert.match(sitesCard, /<th aria-label="การกระทำ" \/>/, 'คอลัมน์ปุ่มยังอยู่ท้ายแถว');
  assert.match(sitesCard, /minWidth=\{760\}/, 'คอลัมน์เพิ่ม ⇒ ตารางกว้างขึ้น (ไม่บีบช่องกรอก)');
  assert.match(sitesCard, /colSpan=\{6\}/, 'แถวว่างต้องคลุมทุกคอลัมน์');
  assert.doesNotMatch(sitesCard, /colSpan=\{5\}/);
});

test('ใช้ช่องกลาง TermStandardMlCell · ส่งรายการรอบขายตรง ๆ · สิทธิ์แก้ = canPlan · ใบประทับ = จากตัวสรุป', () => {
  assert.match(tab, /import TermStandardMlCell from "@\/components\/service\/TermStandardMlCell"/);
  assert.match(sitesCard, /row\.terms \|\| \[\]\)\.map\(\(term\) =>/);
  const cell = sitesCard.match(/<TermStandardMlCell[\s\S]*?\/>/)?.[0] || '';
  assert.ok(cell, 'ต้องวางช่องในตารางไซต์');
  assert.match(cell, /term=\{term\}/, 'ส่งรายการทรง §4.3 ไปตรง ๆ — ผู้เรียกห้ามแปลงทรง');
  assert.doesNotMatch(cell, /term=\{\{/, 'ห้ามประกอบออบเจ็กต์ใหม่ให้ช่อง');
  assert.match(cell, /canEdit=\{canPlan\}/, 'แก้ได้เฉพาะคนที่ด่าน canEditService ให้ผ่าน (ตัวเดียวกับปุ่มวางรอบ)');
  assert.match(cell, /stamped=\{stamped\}/);
  assert.match(tab, /const \{ allocation, plans, visits, rounds, stamped \} = data;/);
  assert.match(cell, /onSaved=\{patchTerm\}/);
  assert.match(cell, /ariaLabel=\{/, 'หลายช่องในตารางเดียว ⇒ ชื่อช่องต้องบอกว่าเป็นของโซน/รายการไหน');
});

test('ป้ายของรอบขายมาจากตัวสรุป (termLabels) — จอไม่คิดเอง', () => {
  assert.match(sitesCard, /row\.termLabels\?\.\[term\.id\]/);
});

test('บันทึกแล้วปรับค่าในที่ ไม่โหลดทั้งแท็บใหม่ (ร่างของช่องอื่นไม่หาย · ไม่กระพริบเป็นโครงโหลด)', () => {
  const patch = tab.match(/const patchTerm = useCallback\(([\s\S]*?)\n {2}\}, \[\]\);/)?.[1] || '';
  assert.ok(patch, 'ต้องมี patchTerm');
  assert.match(patch, /setData\(/);
  assert.doesNotMatch(patch, /load\(|setLoading/);
  assert.match(patch, /standardMlPerMonth/);
});

test('แท็บไม่ยิง API ของมาตรฐานเอง — ทางเดียวคือผ่านช่อง (apiJson PATCH ในช่อง)', () => {
  assert.doesNotMatch(tab, /\/api\/service\/terms/);
  assert.doesNotMatch(tab, /\bapiJson\b/);
  assert.equal((tab.match(/apiFetch\(/g) || []).length, 3, 'สรุปงานบริการ · รายชื่อเจ้าหน้าที่ · สร้างรอบ — เท่าเดิม');
  const cellSrc = readFileSync(new URL('../../components/service/TermStandardMlCell.js', import.meta.url), 'utf8');
  assert.match(cellSrc, /apiJson\(`\/api\/service\/terms\/\$\{encodeURIComponent\(term\.id\)\}`/);
});

test('ไม่มีสไตล์ฝังในแท็บ (audit:ui) · หมุดของปุ่มวางรอบยังอยู่', () => {
  assert.doesNotMatch(tab, /style=\{\{/);
  assert.match(tab, /canEditService\(\{ role, team, teams, department \}\)/);
  assert.match(tab, /\{canPlan && !row\.hasPlan &&/);
  assert.match(tab, /salesOrderId=\{orderId\}/);
});
