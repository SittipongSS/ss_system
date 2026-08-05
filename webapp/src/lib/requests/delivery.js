// ── RD ส่งของ = สร้างแถวเอง (mig 0204/0205) — ด่านล้วน ไม่แตะ DB ──────────
//
// ⭐ **หัวข้อ "พัฒนากลิ่น" ไม่มีตารางบรรทัดตอนเปิดใบ** — SA ไม่มีทางรู้ล่วงหน้าว่า
// RD จะส่งกี่ direction ⇒ แถวเกิดตอน **ส่งของ** ไม่ใช่ตอนเปิด · 1 แถว = 1 direction
// = กลิ่น 1 ตัวในทะเบียน (มติ: กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต)
//
// ⚠️ ก้าวสองก้าวแรกเกิดพร้อมกันตรงนี้ — RD สร้างแถวตอนส่ง แปลว่า "รับเรื่อง" กับ
// "ส่งของ" จบไปพร้อมกัน ⇒ แถวที่เกิดต้องอยู่ขั้น `ready` (รอ SA ไปรับ) ไม่ใช่
// `awaiting_ack` ที่จะทำให้ RD เห็นปุ่ม "รับเรื่อง" บนของที่เพิ่งส่งไปเอง
import { businessDate } from '@/lib/businessDate';

export const MAX_DELIVERY_ROWS = 20;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── ตรวจของที่ RD กรอกตอนส่ง — คืน { rows, error } ───────────────────────
//
// `existingCodes` = รหัสกลิ่นที่มีอยู่แล้วในทะเบียน (ผู้เรียกโหลดมาให้)
// ⚠️ **เตือนรหัสซ้ำที่นี่ ไม่ปล่อยไปตายที่ DB** — unique violation จาก Postgres
// เป็นภาษาอังกฤษอ่านไม่รู้เรื่อง และมาตอนกดส่งไปแล้วซึ่งสายเกินจะแก้ทีละช่อง
export function normalizeDeliveryRows(input, { existingCodes = [], today = null } = {}) {
  const raw = Array.isArray(input) ? input : [];
  if (!raw.length) return { rows: [], error: 'ต้องมีอย่างน้อย 1 รายการที่ส่ง' };
  if (raw.length > MAX_DELIVERY_ROWS) {
    return { rows: [], error: `ส่งครั้งเดียวได้สูงสุด ${MAX_DELIVERY_ROWS} รายการ` };
  }

  const taken = new Set(existingCodes.map((c) => String(c ?? '').trim().toLowerCase()).filter(Boolean));
  const seenCode = new Set();
  const seenName = new Set();
  const rows = [];

  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i] || {};
    const at = `รายการที่ ${i + 1}`;

    const name = String(row.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return { rows: [], error: `${at}: ต้องระบุชื่อกลิ่น` };
    if (name.length > 200) return { rows: [], error: `${at}: ชื่อกลิ่นยาวเกิน 200 ตัวอักษร` };
    // ตัวตนของกลิ่นคือ ชื่อ + ลูกค้า (scents_identity_uk) — ส่งชื่อซ้ำในครั้งเดียว
    // แปลว่าคนกรอกตั้งใจจะได้สองตัว แต่ระบบจะสร้างได้ตัวเดียวแล้วอีกตัวหายเงียบ
    const nameKey = name.toLowerCase();
    if (seenName.has(nameKey)) return { rows: [], error: `${at}: ชื่อกลิ่นซ้ำกับรายการก่อนหน้า` };
    seenName.add(nameKey);

    // ⭐ รหัสบังคับ — RD เป็นเจ้าของทะเบียน และนี่คือจังหวะที่กลิ่นเข้าทะเบียนจริง
    // ปล่อยว่างได้เมื่อไร จะได้กลิ่นร่างที่ไม่มีใครกลับมาใส่รหัสให้ (โรคเดียวกับ
    // กอง "รอจัดระเบียบ" ของทะเบียนสูตร)
    const code = String(row.code ?? '').trim();
    if (!code) return { rows: [], error: `${at}: ต้องระบุรหัสกลิ่น` };
    if (code.length > 100) return { rows: [], error: `${at}: รหัสกลิ่นยาวเกิน 100 ตัวอักษร` };
    const codeKey = code.toLowerCase();
    if (seenCode.has(codeKey)) return { rows: [], error: `${at}: รหัส "${code}" ซ้ำกับรายการก่อนหน้า` };
    if (taken.has(codeKey)) return { rows: [], error: `${at}: รหัส "${code}" ถูกใช้ไปแล้วในทะเบียน` };
    seenCode.add(codeKey);
    seenName.add(nameKey);

    const sentAt = String(row.sentAt ?? '').trim() || today || businessDate();
    if (!ISO_DATE.test(sentAt)) return { rows: [], error: `${at}: วันที่ส่งไม่ถูกต้อง` };

    const spec = String(row.spec ?? '').trim();
    if (spec.length > 2000) return { rows: [], error: `${at}: รายละเอียดยาวเกิน 2000 ตัวอักษร` };

    rows.push({
      name,
      code,
      sentAt,
      spec: spec || null,
      // "เลขที่อ้างอิง" — กลิ่นตัวนี้แก้มาจากตัวไหน · ด่านข้ามลูกค้าอยู่ฝั่ง server
      // (assertDerivedFromScent) เพราะต้องอ่านแถวต้นทางมาเทียบ
      derivedFromScentId: String(row.derivedFromScentId ?? '').trim() || null,
    });
  }
  return { rows, error: null };
}

// ── แถวคำร้องที่เกิดจากการส่ง ─────────────────────────────────────────────
//
// ⚠️ `ackAt` ต้องมีค่าเสมอ ไม่งั้น constraint `dept_request_items_hop_chain` ผ่าน
// (มันไม่ได้บังคับ ack) แต่ `rowStage` จะคืน `awaiting_ack` ⇒ RD เห็นปุ่ม "รับเรื่อง"
// บนแถวที่ตัวเองเพิ่งส่งไป · ค่าตั้งต้นยกมาจาก **วันที่รับเรื่องของใบ** ซึ่งเป็น
// ความจริงที่ใกล้ที่สุด (แผน: การรับเรื่องระดับใบ fan-out ลงแถวที่ยังไม่มี ackAt)
export function deliveryItemRow(row, {
  requestId, sortOrder, scentId, ackAt, user = null,
}) {
  const by = { id: user?.id ?? null, name: user?.name ?? null };
  return {
    requestId,
    lineKind: 'scent_dev',
    sortOrder,
    // label เป็น NOT NULL และเป็น snapshot ป้ายชื่อ ณ ตอนส่ง — ทะเบียนเปลี่ยนชื่อ
    // ทีหลังแล้วคำร้องยังอ่านออกว่าตอนนั้นส่งอะไรไป
    label: row.name,
    spec: row.spec,
    // ⚠️ **`producedScentId` เท่านั้น ไม่ใช่ `scentId`** — 0204 นิยาม `scentId` ว่า
    // "กลิ่นที่แถวนี้ *อ้างถึง*" (ของ product_dev ซึ่งเลือกกลิ่นที่มีอยู่แล้ว)
    // ส่วนสายพัฒนากลิ่น กลิ่นคือ **ผลลัพธ์** ไม่ใช่ของที่อ้าง · ใส่ทั้งสองช่อง =
    // แหล่งความจริงสองที่ที่ drift ได้
    producedScentId: scentId,
    answerStatus: 'pending',
    ackAt: ackAt || row.sentAt,
    ackById: by.id,
    ackByName: by.name,
    readyAt: row.sentAt,
    readyById: by.id,
    readyByName: by.name,
  };
}
