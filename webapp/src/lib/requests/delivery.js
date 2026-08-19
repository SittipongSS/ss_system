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
import { briefLinkError } from '@/lib/requests/scentBriefs';
import { reworkSlotFrom, reworkTargetError } from '@/lib/requests/rework';

export const MAX_DELIVERY_ROWS = 20;

/* ── ป้ายของ direction (ใช้บนแท็บและในข้อความด่าน) ────────────────────────
 *
 * ⭐ **แท็บแบบเดียวกับโมดัลสร้างดีล** (มติผู้ใช้ 2026-08-19) — เดิมทุก direction
 * กางเรียงกันในโมดัลเดียว ปุ่ม "เพิ่มอีก direction" อยู่ล่างสุด ⇒ กดแล้วไม่เห็นว่า
 * เพิ่มอะไร และยิ่งหลายตัวยิ่งไถยาว · ย้ายมาเป็นแท็บ + ปุ่มอยู่แถวเดียวกับแท็บ
 * ⚠️ ประกอบที่ lib ไม่ใช่ใน JSX — ป้ายบนแท็บกับป้ายในข้อความด่านต้องเป็นตัวเดียวกัน
 * ไม่งั้นด่านบอกว่าใบไหนพังแล้วคนหาแท็บนั้นไม่เจอ
 */
export function deliveryRowLabel(row = {}, index = 0) {
  if (row.targetItemId) return `รอบแก้ของ ${row._sourceLabel || 'รายการก่อนหน้า'}`;
  const name = String(row.scent?.name ?? '').trim();
  return name || `Direction ${index + 1}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── ตรวจของที่ RD กรอกตอนส่ง — คืน { rows, error } ───────────────────────
//
// `existingCodes` = รหัสกลิ่นที่มีอยู่แล้วในทะเบียน (ผู้เรียกโหลดมาให้)
// ⚠️ **เตือนรหัสซ้ำที่นี่ ไม่ปล่อยไปตายที่ DB** — unique violation จาก Postgres
// เป็นภาษาอังกฤษอ่านไม่รู้เรื่อง และมาตอนกดส่งไปแล้วซึ่งสายเกินจะแก้ทีละช่อง
export function normalizeDeliveryRows(input, {
  existingCodes = [], today = null, briefs = [], items = [],
} = {}) {
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
    /* ⭐ **ฟอร์มเดียวกับทะเบียนกลิ่น** (มติผู้ใช้ 2026-08-19) — ของที่เข้าทะเบียนอยู่ใน
       ก้อน `scent` ชื่อช่องชุดเดียวกับ `ScentForm` · ที่เหลือ (บรีฟ · รายละเอียด ·
       แถวรอบแก้) เป็นของแถวคำร้อง จึงยังอยู่ระดับบนเหมือนเดิม */
    const scent = row.scent || {};

    const name = String(scent.name ?? '').trim().replace(/\s+/g, ' ');
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
    // ⭐ **direction ตัวนี้ตอบบรีฟก้อนไหน** — ชั้นกลางของโครงสามชั้น (mig 0213)
    // 1 บรีฟ : หลาย direction ⇒ ตอบก้อนเดิมซ้ำได้ ไม่ใช่ข้อมูลผิด
    //
    // ⚠️ **มีบรีฟก้อนเดียว = เลือกให้เลย ไม่ต้องถาม** (มติผู้ใช้ตอนทำปุ่มรวบบรีฟ) —
    // ช่องที่มีตัวเลือกเดียวแต่ยังบังคับให้กด คือขั้นตอนที่ไม่ได้ตัดสินใจอะไร
    // ⭐ **รอบแก้เติมลงแถวเดิม ไม่สร้างแถวใหม่** (#1049 บันทึกไว้ว่าเป็นทางตัน) —
    // แถวที่ลูกค้าขอให้แก้รออยู่แล้ว ⇒ ส่งของลงไปในแถวนั้น ไม่งั้นได้สองแถวต่อ
    // หนึ่งรอบแก้ แถวหนึ่งใช้ได้ อีกแถวค้างถาวรเพราะไม่มีกลิ่นผูก
    const targetItemId = String(row.targetItemId ?? '').trim() || null;
    const targetError = reworkTargetError(targetItemId, items);
    if (targetError) return { rows: [], error: `${at}: ${targetError}` };
    const slot = targetItemId
      ? reworkSlotFrom((items || []).find((i) => i.id === targetItemId), items)
      : null;

    let briefId = String(row.briefId ?? '').trim() || null;
    // ⚠️ รอบแก้: บรีฟมาจากแถวที่รออยู่ **ไม่ใช่จากสิ่งที่ client ส่ง** — มันคือ
    // direction อีกตัวของบรีฟก้อนเดิม ให้เลือกใหม่เมื่อไรก็ผูกข้ามก้อนได้
    if (slot?.briefId) briefId = slot.briefId;
    if (briefs.length) {
      if (!briefId && briefs.length === 1) briefId = briefs[0].id;
      const linkError = briefLinkError(briefId, briefs);
      if (linkError) return { rows: [], error: `${at}: ${linkError}` };
    }

    const code = String(scent.code ?? '').trim();
    if (!code) return { rows: [], error: `${at}: ต้องระบุรหัสกลิ่น` };
    if (code.length > 100) return { rows: [], error: `${at}: รหัสกลิ่นยาวเกิน 100 ตัวอักษร` };
    const codeKey = code.toLowerCase();
    if (seenCode.has(codeKey)) return { rows: [], error: `${at}: รหัส "${code}" ซ้ำกับรายการก่อนหน้า` };
    if (taken.has(codeKey)) return { rows: [], error: `${at}: รหัส "${code}" ถูกใช้ไปแล้วในทะเบียน` };
    seenCode.add(codeKey);
    seenName.add(nameKey);

    // ⭐ **วันพร้อมส่ง ≠ วันผลิต** (มติผู้ใช้ 2026-08-08 · ม-66) — กลิ่นตัวหนึ่งอาจ
    // ผลิตเสร็จวันที่ 1 แต่รอตัวอื่นในชุดเดียวกันจนพร้อมส่งพร้อมกันวันที่ 8
    // · วันพร้อมส่งอยู่บน **แถวคำร้อง** (`readyAt`) · วันผลิตอยู่บน **ตัวกลิ่น**
    //   (`scents.producedAt`) เพราะเป็นข้อเท็จจริงของกลิ่น ไม่ใช่ของงานส่ง
    // 🐞 เดิมมีช่องเดียวชื่อ `sentAt` ที่ถูกเขียนลงทั้งสองที่ ⇒ ป้ายบนทะเบียนเขียนว่า
    //    "วันที่ส่งกลิ่นให้ลูกค้า" แต่ค่าที่ได้คือวันที่ RD ส่งมอบให้ฝ่ายขาย
    const readyAt = String(row.readyAt ?? '').trim() || today || businessDate();
    if (!ISO_DATE.test(readyAt)) return { rows: [], error: `${at}: วันที่พร้อมส่งไม่ถูกต้อง` };

    // ⚠️ ไม่กรอก = ถือว่าผลิตเสร็จวันเดียวกับที่ส่งมอบ — บังคับกรอกทั้งสองช่องทุกแถว
    // แล้วคนที่ผลิตกับส่งวันเดียวกันจริง ๆ (ซึ่งเป็นเคสส่วนใหญ่) ต้องพิมพ์ซ้ำเปล่า ๆ
    const producedAt = String(scent.producedAt ?? '').trim() || readyAt;
    if (!ISO_DATE.test(producedAt)) return { rows: [], error: `${at}: วันที่ผลิตกลิ่นไม่ถูกต้อง` };

    const spec = String(row.spec ?? '').trim();
    if (spec.length > 2000) return { rows: [], error: `${at}: รายละเอียดยาวเกิน 2000 ตัวอักษร` };

    // ── ช่องเสริมของทะเบียน (มาพร้อมฟอร์มร่วม) — เพดานเดียวกับ normalizeScentInput
    const customerTradeName = String(scent.customerTradeName ?? '').trim().replace(/\s+/g, ' ');
    if (customerTradeName.length > 200) {
      return { rows: [], error: `${at}: ชื่อที่ลูกค้าเรียกยาวเกิน 200 ตัวอักษร` };
    }
    const note = String(scent.note ?? '').trim();
    if (note.length > 2000) return { rows: [], error: `${at}: หมายเหตุยาวเกิน 2000 ตัวอักษร` };

    rows.push({
      // แถวที่จะเติมของลงไป — null = สร้างแถวใหม่ตามปกติ
      targetItemId,
      briefId,
      name,
      code,
      readyAt,
      producedAt,
      spec: spec || null,
      // ⚠️ สองช่องนี้ติดไปกับ **ตัวกลิ่นในทะเบียน** ไม่ใช่แถวคำร้อง (ดู route ของ /items)
      customerTradeName: customerTradeName || null,
      note: note || null,
      // "เลขที่อ้างอิง" — กลิ่นตัวนี้แก้มาจากตัวไหน · ด่านข้ามลูกค้าอยู่ฝั่ง server
      // (assertDerivedFromScent) เพราะต้องอ่านแถวต้นทางมาเทียบ
      // ⚠️ รอบแก้บังคับให้ชี้กลับกลิ่นตัวเดิมเสมอ — เป็นค่าที่ระบบรู้อยู่แล้ว
      // ไม่ใช่คำถาม · ปล่อยให้เลือกเองเมื่อไรก็ชี้ผิดตัวได้ทั้งที่คำตอบมีตัวเดียว
      derivedFromScentId: slot?.derivedFromScentId
        || String(scent.derivedFromScentId ?? '').trim() || null,
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
    // ชั้นกลาง — direction นี้ตอบบรีฟก้อนไหน (mig 0213)
    briefId: row.briefId ?? null,
    answerStatus: 'pending',
    ackAt: ackAt || row.readyAt,
    ackById: by.id,
    ackByName: by.name,
    // ⚠️ **วันพร้อมส่ง ไม่ใช่วันผลิต** — วันผลิตไปอยู่บนตัวกลิ่น (`scents.producedAt`)
    // ⇒ แถวคำร้องวัด lead time ของ *งานส่ง* ส่วนทะเบียนตอบว่ากลิ่นเกิดเมื่อไร
    readyAt: row.readyAt,
    readyById: by.id,
    readyByName: by.name,
  };
}

// ── RD ส่งของของ "พัฒนาผลิตภัณฑ์" (P4b) ───────────────────────────────────
//
// ⭐ ต่างจากพัฒนากลิ่นตรงที่ **แถวมีอยู่แล้ว** — SA สร้างไว้ตอนเปิดใบ ⇒ นี่คือการ
// *ขยายก้าว `ready`* ไม่ใช่การสร้างแถวใหม่
//
// ⚠️ **ไม่ถามหมวดกับกลิ่นซ้ำ** — สองอย่างนั้นอยู่บนแถวแล้ว และมันคือตัวตนของสูตร
// พอดี (`formulas_identity_uk`) · ถามซ้ำเมื่อไร ผู้ใช้จะกรอกให้ต่างจากที่ขอไว้ได้
// แล้วสูตรที่เกิดจะไม่ตรงกับแถวที่สั่ง
export function normalizeFormulaDelivery(input = {}) {
  /* ⭐ **ฟอร์มเดียวกับทะเบียน** (มติผู้ใช้ 2026-08-19) — ค่าที่ RD กรอกมาเป็นก้อน
     `formula` ที่ใช้ชื่อช่องชุดเดียวกับ `FormulaForm` ⇒ เพิ่มช่องในทะเบียนแล้ว
     สายคำร้องได้ตามโดยไม่ต้องคิดชื่อใหม่ (เดิมเป็น formulaName/formulaCode สามช่อง
     ที่ค่อย ๆ เลื่อนออกจากทะเบียน) */
  const src = input.formula || {};

  const name = String(src.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อสูตร' };
  if (name.length > 200) return { value: null, error: 'ชื่อสูตรยาวเกิน 200 ตัวอักษร' };

  // รหัสบังคับ — RD เป็นเจ้าของทะเบียน และนี่คือจังหวะที่สูตรเข้าทะเบียนจริง
  // ปล่อยว่างได้เมื่อไร จะได้สูตรร่างที่ไม่มีใครกลับมาใส่รหัสให้ (โรคเดียวกับกอง
  // "รอจัดระเบียบ" ที่ 0171 ทิ้งไว้)
  const code = String(src.code ?? '').trim();
  if (!code) return { value: null, error: 'ต้องระบุรหัสสูตร' };
  if (code.length > 100) return { value: null, error: 'รหัสสูตรยาวเกิน 100 ตัวอักษร' };

  const formulaDate = String(src.formulaDate ?? '').trim() || null;
  if (formulaDate && !ISO_DATE.test(formulaDate)) {
    return { value: null, error: 'วันที่ของสูตรไม่ถูกต้อง' };
  }

  const customerTradeName = String(src.customerTradeName ?? '').trim().replace(/\s+/g, ' ');
  if (customerTradeName.length > 200) {
    return { value: null, error: 'ชื่อที่ลูกค้าเรียกยาวเกิน 200 ตัวอักษร' };
  }

  const note = String(src.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  return {
    value: {
      name,
      code,
      formulaDate,
      customerTradeName: customerTradeName || null,
      // สายพันธุ์สูตร — ด่านข้ามลูกค้าอยู่ฝั่ง server (assertDerivedFromFormula)
      // เพราะต้องอ่านแถวต้นทางมาเทียบ
      derivedFromFormulaId: String(src.derivedFromFormulaId ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}
