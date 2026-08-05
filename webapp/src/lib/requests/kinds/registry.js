// ── ทะเบียนหัวข้อคำร้อง — ประกอบจากบ้านของแต่ละฝ่าย ─────────────────────
//
// ⭐ **โจทย์ข้อแรกของผู้ใช้** (2026-08-04): *"จะมีโมดูลระบบแยกของแต่ละฝ่าย …
// เพื่อที่แต่ละฝ่ายจะได้ขยายระบบได้"* · ก่อนหน้านี้หัวข้อทุกฝ่ายอยู่ในตารางก้อนเดียว
// ใน `lib/master/requestTypes.js` ⇒ PC เพิ่มหัวข้อของตัวเองต้องไปแก้ไฟล์ที่ RD ก็แก้
// อยู่ ⇒ ชน merge กันเป็นประจำ และไม่มีขอบเขตว่าใครเป็นเจ้าของอะไร
//
// ตอนนี้: **1 ฝ่าย = 1 โฟลเดอร์ · 1 หัวข้อ = 1 ไฟล์** — เพิ่มหัวข้อใหม่ = เพิ่มไฟล์
// ในโฟลเดอร์ของฝ่ายตัวเอง แล้วต่อท้าย `kinds.js` ของฝ่ายนั้น ไฟล์นี้ไม่ต้องแก้เลย
//
// ⚠️ ไฟล์นี้ **ไม่ใช่ที่สำหรับใส่กฎของหัวข้อ** — มันแค่ประกอบและตรวจ · กฎอยู่ในไฟล์
// ของหัวข้อนั้น ๆ ไม่งั้นจะกลับไปเป็นตารางก้อนเดียวที่เพิ่งแยกออกมา
import RD_KINDS from './rd/kinds';
import PC_KINDS from './pc/kinds';
import FN_KINDS from './fn/kinds';
import SHARED_KINDS from './shared/kinds';

// ลำดับ: ของกลางก่อน แล้วเรียงตามฝ่าย — ⚠️ **ลำดับนี้ไม่ใช่ลำดับที่ผู้ใช้เห็น**
// ดรอปดาวน์จัดกลุ่มตามตระกูลเองที่ `kindsForDept` (ดู requestTypes.js)
const ALL = [...SHARED_KINDS, ...RD_KINDS, ...PC_KINDS, ...FN_KINDS];

// ── ด่านตอนโหลด ────────────────────────────────────────────────────────
//
// ⭐ **ตรวจตอน import ไม่ใช่ตอนใช้งาน** — ของเดิมเป็น object literal ที่ผิดยังไงก็
// ไม่มีใครบ่นจนกว่าจะมีคนเปิดคำร้องหัวข้อนั้นจริงบน prod · ตอนนี้หัวข้อที่ประกาศผิด
// ทำให้ **build พัง** ซึ่งเป็นที่ที่ถูกต้องกว่ามาก
//
// ⚠️ ห้ามเปลี่ยนเป็น "ข้ามหัวข้อที่ผิดแล้วเดินต่อ" — หัวข้อที่หายไปเงียบ ๆ คือใบที่
// เปิดไม่ได้โดยไม่มีข้อความบอกเหตุผล ซึ่งเป็นบั๊กที่หายากที่สุดในระบบนี้
const VALID_DEPTS = ['RD', 'PC', 'FN'];
const VALID_REFS = ['project', 'deal', 'salesOrder', 'scent', 'formula'];
const VALID_LINE_SHAPES = ['material', 'product_dev', 'document', 'billing_doc'];

// export เพื่อให้เทสต์พิสูจน์ได้ว่าด่านนี้ **ยิงจริง** — ด่านที่ไม่มีใครเคยเห็นมันทำงาน
// คือด่านที่อาจพังเงียบมานานแล้ว
export function assertKind(kind, seen = new Set()) {
  const at = `หัวข้อคำร้อง "${kind?.key || '(ไม่มี key)'}"`;
  if (!kind?.key) throw new Error(`${at}: ต้องมี key`);
  if (seen.has(kind.key)) throw new Error(`${at}: key ซ้ำกับหัวข้ออื่น`);
  if (!kind.label) throw new Error(`${at}: ต้องมี label — ไม่งั้นใบเก่าจะขึ้นเป็น key ดิบ`);
  if (!kind.scope) throw new Error(`${at}: ต้องมี scope — เลขที่เอกสารออกจากค่านี้`);
  if (kind.dept != null && !VALID_DEPTS.includes(kind.dept)) {
    throw new Error(`${at}: dept "${kind.dept}" ไม่อยู่ใน CHECK ของ dept_requests.dept`);
  }
  for (const ref of kind.needs || []) {
    if (!VALID_REFS.includes(ref)) throw new Error(`${at}: needs "${ref}" ไม่มีใน REQUEST_NEEDS`);
  }
  // หัวข้อที่มีบรรทัดต้องบอกด้วยว่าบรรทัดหน้าตาแบบไหน — ไม่บอก = ตกไปเป็น
  // 'material' เงียบ ๆ แล้วผู้ใช้เจอตารางวัสดุในหัวข้อที่ไม่เกี่ยวกับวัสดุ
  if (kind.lineShape && !VALID_LINE_SHAPES.includes(kind.lineShape)) {
    throw new Error(`${at}: lineShape "${kind.lineShape}" ไม่รู้จัก`);
  }
  if (kind.hasTiers && !kind.hasItems) throw new Error(`${at}: hasTiers ต้องมากับ hasItems`);
  if (kind.lineShape && !kind.hasItems) throw new Error(`${at}: lineShape ต้องมากับ hasItems`);
}

const byKey = {};
const seen = new Set();
for (const kind of ALL) {
  assertKind(kind, seen);
  seen.add(kind.key);
  // ตัดคีย์ `key` ออกจากค่าที่เก็บ — ตัวตนอยู่ที่คีย์ของ object อยู่แล้ว เก็บซ้ำ
  // = แหล่งความจริงที่สองที่ drift ได้ (เปลี่ยนคีย์แต่ลืมเปลี่ยน key ข้างใน)
  const { key, ...meta } = kind;
  byKey[key] = meta;
}

// ⚠️ อ่านอย่างเดียว — ของเดิมเป็น object เปล่าที่ใครก็เขียนทับได้ตอนรันไทม์
export const REQUEST_KINDS = Object.freeze(byKey);

// ฝ่ายไหนเป็นเจ้าของหัวข้อไหน — ใช้ตรวจว่าโฟลเดอร์กับธง `dept` ตรงกันจริง
export const KINDS_BY_OWNER = Object.freeze({
  RD: RD_KINDS.map((k) => k.key),
  PC: PC_KINDS.map((k) => k.key),
  FN: FN_KINDS.map((k) => k.key),
  shared: SHARED_KINDS.map((k) => k.key),
});
