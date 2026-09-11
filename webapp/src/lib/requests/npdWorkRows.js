// ── แถวงานของพัฒนาสูตร NPD — แตกจากแถวสินค้าในแบบฟอร์ม PDR (ม-144 · มติผู้ใช้ 2026-09-11) ──
//
// ⭐ **ทำไมต้องมี** — ใบ NPD ไม่มีตาราง หมวด × กลิ่น ตอนเปิด (ผู้ขอกรอกแบบฟอร์ม PDR แทน) ⇒ ก่อนหน้านี้
// RD รับเรื่องแล้ว **ไม่มีปุ่มส่งสูตรที่ไหนเลย** (ตัวเขียน `producedFormulaId` มีทางเดียวคือก้าวรายแถว)
// ทางจบทางเดียวคือกด "ตอบแล้ว" ทั้งใบ ⇒ สูตรที่ทำไม่ผูกกับคำร้อง ไม่มีผลลูกค้ารายสินค้า ไม่มีรอบแก้
//
// ⭐ **ตัวเลือก ก ที่ผู้ใช้เลือก: ระบบสร้างแถวงานให้ตอนรับเรื่อง** — แถวสินค้าใน PDR มีหมวด + กลิ่นครบ
// (mig 0352) = ตัวตนของสูตรในทะเบียน (`formulas_identity_uk`) พอดี ⇒ **หนึ่งแถวงานต่อหนึ่งคู่ หมวด × กลิ่น
// ที่ไม่ซ้ำ** (สเปรย์กลิ่นเดียวกัน 50 กับ 100 ml = สูตรเดียว) แล้วใช้ก้าวรายแถวของ Standard ต่อทั้งชุด
//
// ⭐ **แก้แบบฟอร์ม PDR หลังรับเรื่อง = แถวงานตามให้เอง** (ตัดสินแทนผู้ใช้ · บอกไว้ในสรุปงาน)
//   · คู่ใหม่  ⇒ งอกแถวงาน (เริ่มที่ "กำลังทำ" — ใบรับเรื่องไปแล้ว ไม่ต้องรับซ้ำรายแถว)
//   · คู่ที่หาย ⇒ ถอนแถวงานที่ยังไม่มีใครแตะ · ถ้าส่งสูตร/มีผลลูกค้าแล้ว **ปฏิเสธการบันทึก** พร้อมเหตุผล
//     (ของที่ส่งไปแล้วเอาออกจากใบเงียบ ๆ ไม่ได้ — ตรวจก่อนเขียนอะไรทั้งนั้น)
//   · คู่เดิม  ⇒ อัปเดตสเปกย่อ (ขนาด · จำนวน · หมายเหตุ) ของแถวที่ยังไม่ส่งสูตร
//
// ⚠️ **จับคู่ด้วย (หมวด, กลิ่น) ไม่ใช่ id แถวสินค้า** — id แถวสินค้าเปลี่ยนทุกครั้งที่บันทึก PDR
//    (เขียนชุดใหม่แล้วลบชุดเดิม) · และแถวรอบแก้ (`derivedFromItemId`) ใช้คู่เดียวกับแถวต้นทาง ⇒ คู่ที่มี
//    แถวไหนก็ได้ถืออยู่แล้ว (ทุกขั้น รวมรอบแก้/ไม่ถูกเลือก) ถือว่า "มีแล้ว" ไม่งอกซ้ำ
//
// ⚠️ ไฟล์นี้ **ล้วน ไม่แตะ DB** — จอใช้บอกล่วงหน้าในโมดัลรับเรื่อง · ตัวเขียนจริงอยู่ `npdWorkRowsApply.js`
import { pdrTargetSizeText } from '@/lib/requests/pdrTargets';
import { requestRowsClosurePatch } from '@/lib/requests/stages';

// เพดานเดียวกับช่องรายละเอียดของแถว product_dev (`normalizeProductDevItems`)
const SPEC_MAX = 2000;

const pairKey = (categoryCode, scentId) => `${String(categoryCode ?? '').trim()}::${String(scentId ?? '').trim()}`;

/** แถวสินค้าใน PDR → คู่ หมวด × กลิ่น ที่ไม่ซ้ำ ตามลำดับที่ปรากฏครั้งแรก (แถวที่ยังไม่เลือกกลิ่นข้าม) */
export function npdTargetPairs(targets = []) {
  const map = new Map();
  for (const t of targets || []) {
    const categoryCode = String(t?.categoryCode ?? '').trim();
    const scentId = String(t?.scentId ?? '').trim();
    if (!categoryCode || !scentId) continue;
    const key = pairKey(categoryCode, scentId);
    if (!map.has(key)) map.set(key, { key, categoryCode, scentId, targets: [] });
    map.get(key).targets.push(t);
  }
  return [...map.values()];
}

/**
 * รายละเอียดของแถวงาน — สินค้าทุกตัวในแบบฟอร์มที่ใช้คู่นี้ ("100 ml · 500 ชิ้น — ขวดแก้วสีชา")
 * ⚠️ ไม่รวมตัวเลขเข้าช่อง qty ของแถว — สองขนาดในคู่เดียวกันรวมเป็นจำนวนเดียวไม่ได้โดยไม่เดา
 */
export function npdWorkRowSpec(pair) {
  const parts = (pair?.targets || []).map((t) => {
    const size = pdrTargetSizeText(t);
    const note = String(t?.note ?? '').trim();
    return [size || 'ไม่ระบุขนาด', note].filter(Boolean).join(' — ');
  });
  const text = `ตามแบบฟอร์ม PDR: ${parts.join(' · ')}`;
  return text.length > SPEC_MAX ? `${text.slice(0, SPEC_MAX - 1)}…` : text;
}

// แถวนี้ (หรือรอบแก้ของมัน) เดินไปแล้วหรือยัง — เดินแล้ว = ถอนออกจากใบเงียบ ๆ ไม่ได้
function lineageMoved(row, items) {
  if (row.readyAt || row.producedFormulaId || row.outcome) return true;
  if (row.answerStatus === 'done' || row.answerStatus === 'declined') return true;
  return (items || []).some((i) => i?.derivedFromItemId === row.id);
}

/**
 * แผนการตามแถวงานให้ตรงกับแถวสินค้าใน PDR — `{ insert, update, remove, blocked }`
 * · insert = คู่ที่ยังไม่มีแถวไหนถือ `{ categoryCode, scentId, spec }`
 * · update = แถวต้นทางของคู่เดิมที่ยังไม่ส่งสูตร และสเปกย่อเปลี่ยน `{ id, spec }`
 * · remove = แถวต้นทางของคู่ที่หายไปจากแบบฟอร์ม ที่ยังไม่มีใครแตะ (แถวดิบ)
 * · blocked = แถวต้นทางของคู่ที่หายไป แต่เดินไปแล้ว — ผู้เรียกต้องปฏิเสธการบันทึก
 * @param targets แถวสินค้าชุดที่จะเป็นของใบหลังบันทึก · @param items แถวงานที่ใบมีตอนนี้
 */
export function planNpdWorkRows({ targets = [], items = [], rowsWithFiles = null } = {}) {
  const pairs = npdTargetPairs(targets);
  const wanted = new Map(pairs.map((p) => [p.key, p]));
  const rows = (items || []).filter((r) => r?.lineKind === 'product_dev');
  const covered = new Set(rows.map((r) => pairKey(r.categoryCode, r.scentId)));

  const insert = pairs.filter((p) => !covered.has(p.key))
    .map((p) => ({ categoryCode: p.categoryCode, scentId: p.scentId, spec: npdWorkRowSpec(p) }));
  const update = [];
  const remove = [];
  const blocked = [];
  for (const row of rows) {
    const pair = wanted.get(pairKey(row.categoryCode, row.scentId));
    if (pair) {
      /* สเปกย่อตามแบบฟอร์ม — **รวมแถวรอบแก้ที่ยังเดินอยู่** (ตัวที่ RD กำลังทำจริง) · เฉพาะแถวที่ยังไม่มี
         ใครแตะ — แถวที่ส่งสูตร/มีผลลูกค้า/มีรอบแก้แล้วคือบันทึกของงานที่เกิดไปแล้ว */
      const spec = npdWorkRowSpec(pair);
      if (!lineageMoved(row, items) && String(row.spec ?? '') !== spec) update.push({ id: row.id, spec });
      continue;
    }
    // ถอน/ปฏิเสธ ตัดสินที่แถวต้นทาง — แถวรอบแก้ตามแถวต้นทางของมัน (ต้นทางมีลูก = เดินแล้ว ⇒ ปฏิเสธ)
    if (row.derivedFromItemId) continue;
    if (lineageMoved(row, items)) blocked.push({ row, reason: 'moved' });
    /* ⚠️ **แถวที่มีไฟล์แนบแล้วถอนเงียบ ๆ ไม่ได้** (รีวิว ม-144) — ถอน = กวาดไฟล์ทิ้งด้วย (ไม่มีถังขยะ)
       ทั้งที่ไฟล์เข้ามาได้ตั้งแต่ก่อนส่งสูตร (โมดัลส่งงานอัปไฟล์ลงแถวทันที · การ์ดรูป/สเปกของแถว) */
    else if (rowsWithFiles?.has(row.id)) blocked.push({ row, reason: 'files' });
    else remove.push(row);
  }
  return { insert, update, remove, blocked };
}

/** ข้อความปฏิเสธเมื่อแบบฟอร์มจะทิ้งสินค้าที่ถอนไม่ได้ — หรือ null */
export function npdWorkRowsError(plan) {
  const hit = plan?.blocked?.[0];
  if (!hit) return null;
  const name = hit.row.label || hit.row.categoryCode;
  if (hit.reason === 'files') {
    return `สินค้า "${name}" มีไฟล์แนบในรายการงานแล้ว — ลบ/ย้ายไฟล์ออกจากรายการนั้นก่อน `
      + 'หรือใส่คู่หมวด × กลิ่นนี้กลับเข้าไปในแบบฟอร์ม';
  }
  return `สินค้า "${name}" ส่งสูตรหรือมีผลลูกค้าแล้ว — เอาออกจากแบบฟอร์ม PDR ไม่ได้ `
    + '(ใส่คู่หมวด × กลิ่นนี้กลับเข้าไป หรือคุยต่อในเธรด)';
}

/**
 * กลิ่นของคู่ที่จะงอกแถวงานต้องมีจริงและเป็นของลูกค้าเจ้าของใบ — คืนข้อความ หรือ null
 * ⭐ ด่านเดียวกับที่ตัวเขียนแถว (`resolveLineLabels`) จะตีกลับ — ถามก่อนเขียนอะไรทั้งนั้น (รีวิว ม-144):
 *    🐞 ไม่ถาม ⇒ กลิ่นตัวเดียวถูกย้ายเจ้าของหลังส่ง = รับเรื่องแล้วได้ **0 แถว** (เขียนทีเดียวทั้งก้อน)
 *       และ "บันทึกแบบฟอร์มอีกครั้ง" ซ่อมไม่ได้เพราะกลิ่นเดิมได้ข้อยกเว้นไม่ตรวจซ้ำ
 * ⚠️ ไม่ตรวจ "ใช้ทำสูตรได้" — กลิ่นที่ใบถืออยู่แล้วถูกเลิกใช้ทีหลังยังต้องแตกแถวได้ (ยกเว้นเดียวกับการบันทึก)
 * @param scents แถวกลิ่นของ `plan.insert` จาก DB · @returns ข้อความที่อ้างเลขสินค้าในแบบฟอร์ม (ไม่ใช่ลำดับคู่)
 */
export function npdWorkRowsScentError(plan, targets = [], scents = [], { customerId = null } = {}) {
  const byId = new Map((scents || []).map((x) => [x.id, x]));
  for (const p of plan?.insert || []) {
    const index = (targets || []).findIndex((t) => String(t?.scentId ?? '').trim() === p.scentId
      && String(t?.categoryCode ?? '').trim() === p.categoryCode);
    const at = `สินค้ารายการที่ ${index + 1}`;
    const scent = byId.get(p.scentId);
    if (!scent) return `${at}: ไม่พบกลิ่นนี้ในทะเบียนแล้ว`;
    if (customerId && scent.customerId !== customerId) {
      return `${at}: กลิ่น ${scent.code || scent.name} เป็นของลูกค้ารายอื่นแล้ว`;
    }
  }
  return null;
}

/** มีอะไรต้องเขียนไหม */
export const npdWorkRowsEmpty = (plan) => !plan
  || (!plan.insert.length && !plan.update.length && !plan.remove.length);

/** บรรทัดเล่าในเธรด/สรุปงาน — `inserted`/`removed` เป็นแถวที่มี `label` แล้ว */
export function npdWorkRowsSummary({ inserted = [], removed = [] } = {}) {
  const name = (r) => r.label || r.categoryCode;
  const parts = [
    inserted.length && `เพิ่ม ${inserted.length} (${inserted.map(name).join(' · ')})`,
    removed.length && `ถอน ${removed.length} (${removed.map(name).join(' · ')})`,
  ].filter(Boolean);
  return parts.length ? `รายการงานตามแบบฟอร์ม PDR: ${parts.join(' · ')}` : null;
}

/**
 * ตราปิดของใบหลังบันทึกแบบฟอร์ม PDR (ม-144) — คิดจากแถวชุดใหม่ แต่ **ถ้าไม่มีแถวถูกเขียน ถอนตราได้อย่างเดียว**
 * ⚠️ ห้ามประทับตราฝ่ายเพิ่มจากการบันทึกที่ไม่ได้แตะแถว (รีวิวรอบสอง) — ฝ่ายกด "ยังไม่จบ" แล้วแก้แค่ชื่อเรื่อง
 *    ใบต้องไม่เด้งกลับเป็น "ตอบแล้ว" เงียบ ๆ · การถอน (แถวยังไม่จบแต่ใบถือตรา) ยังทำ — เป็นทางซ่อมของหัวใบที่
 *    เขียนไม่สำเร็จหลังงอกแถวรอบก่อน
 * ⚠️ `unsynced` = งอกแถวของคู่ใหม่ไม่สำเร็จ (รีวิวรอบ 3) — สินค้าในแบบฟอร์มยังไม่มีรายการงาน = งานยังไม่จบ
 *    ⇒ นับเป็นแถวค้างหนึ่งแถวแล้วถอนตรา · ไม่งั้นใบ "ตอบแล้ว" ค้างตรา ผู้ขอกดปิดถาวรได้ทั้งที่สินค้านั้นไม่มีแถว
 */
export function npdSyncClosurePatch({ request, rows = [], nowIso, wroteRows = false, unsynced = false }) {
  const patch = requestRowsClosurePatch(request, unsynced ? [...rows, { lineKind: 'product_dev' }] : rows, nowIso);
  if (wroteRows) return patch;
  return patch.answeredAt === null ? patch : {};
}
