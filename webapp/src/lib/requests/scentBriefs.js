// ── บรีฟรายกลิ่น — ด่านล้วน ไม่แตะ DB (mig 0213) ─────────────────────────
//
// ⭐ **ชั้นกลางของคำร้องพัฒนากลิ่น** (มติผู้ใช้ 2026-08-06):
//     ใบสั่งขาย 1 → PDR 1 → **กลิ่น N** → direction M
//   · กลิ่น    = *สิ่งที่ขอ*   — AE กรอกบรีฟตอนเปิด
//   · direction = *สิ่งที่ได้จริง* — RD สร้างตอนส่ง แล้วชี้กลับมาที่บรีฟก้อนนี้
//
// ⚠️ **บรีฟไม่ใช่แถวงาน** จึงอยู่คนละตารางกับ `dept_request_items` — แถวที่ไม่มีวันที่
// ก้าวไหนเลยจะตกที่ `awaiting_ack` ตลอดกาลและไม่มีวันเข้า `SETTLED` ⇒ `requestProgress()`
// ไม่มีวันครบ ⇒ **ปิดใบไม่ได้เลยสักใบ** · ไล่ `rowStage.js` แล้วยืนยันก่อนแยกตาราง
//
// ⚠️ ความยาวทุกช่องต้องไม่หลวมกว่า CHECK ของ 0213 — หลวมกว่าเมื่อไรก็ได้ error ดิบ
// จาก Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน
import {
  SCENTOTYPE_VALUES, SCENT_PERFORMANCE_VALUES,
} from '@/lib/requests/kinds/rd/scentBriefTypes';

// เพดานเดียวกับบรรทัดคำร้อง — ใบที่ขอเป็นร้อยกลิ่นคือข้อมูลผิด ไม่ใช่งานจริง
export const MAX_SCENT_BRIEFS = 40;

// ความยาวตาม CHECK ของ 0213 เป๊ะ
const LIMITS = {
  label: 200, brief: 4000, researchTopic: 500,
  inspiration: 2000, likedNotes: 2000, dislikedNotes: 2000, scentotypeNote: 500,
};

const TEXT_FIELDS = ['brief', 'researchTopic', 'inspiration', 'likedNotes', 'dislikedNotes'];

/**
 * ก้อนนี้มีอะไรที่คนพิมพ์ไว้แล้วไหม — ใช้ตอนสลับโหมดบรีฟ (รวม ↔ รายกลิ่น)
 *
 * ⭐ **`label` นับด้วย** — "แนวสดชื่น" ที่ AE ตั้งชื่อไว้คือของที่พิมพ์เอง เท่ากับบรีฟ
 * ⚠️ ต้องครอบทุกช่องที่กรอกได้จริง รวม array (Scentotype/Performance) และข้อความ
 * ต่อท้าย Scentotype — ตกช่องไหนไป ช่องนั้นจะถูกทิ้งเงียบตอนรวบบรีฟ
 */
export function briefHasContent(brief = {}) {
  if (!brief) return false;
  if (String(brief.label ?? '').trim()) return true;
  for (const key of TEXT_FIELDS) {
    if (String(brief[key] ?? '').trim()) return true;
  }
  if ((brief.scentotypes || []).length) return true;
  if ((brief.performance || []).length) return true;
  return Object.values(brief.scentotypeNotes || {}).some((v) => String(v ?? '').trim());
}

/**
 * สลับโหมดบรีฟ — คืนชุดก้อนใหม่ **โดยไม่ทิ้งสิ่งที่พิมพ์ไปแล้วโดยไม่ตั้งใจ**
 *
 * 🐞 ของเดิม: ปุ่มสลับเรียก `Array.from({length:n}, () => ({label:''}))` ⇒ **ล้างทุกก้อน
 * ทุกครั้ง** แม้แต่ตอนแยก 1 → 3 ซึ่งไม่มีเหตุผลให้ทิ้งอะไรเลย · ป้ายบนปุ่มเขียนเตือนว่า
 * "สลับแล้วบรีฟที่กรอกไว้จะถูกล้าง" ซึ่งบอกความจริง แต่ความจริงนั้นคือพฤติกรรมที่ผิด
 *
 * `merge: true`  → เหลือก้อนเดียว (ก้อนแรก) · ก้อน 2..N ที่มีเนื้อจะหาย ⇒ ผู้เรียก
 *                  ต้องถามก่อน (ดู `briefsDroppedByMerge`)
 * `merge: false` → คงก้อนแรกไว้ แล้วเติมก้อนว่างให้ครบ `scentCount`
 */
export function switchBriefMode(briefs = [], { merge, scentCount = 1 } = {}) {
  const list = Array.isArray(briefs) ? briefs : [];
  const first = list[0] || { label: '' };
  if (merge) return [first];
  const target = Math.max(1, Number(scentCount) || 1);
  const next = list.slice(0, target);
  while (next.length < target) next.push({ label: '' });
  return next;
}

/** กี่ก้อนที่จะหายจริง ๆ ถ้ารวบตอนนี้ — 0 = รวบได้เลย ไม่ต้องถาม */
export function briefsDroppedByMerge(briefs = []) {
  return (Array.isArray(briefs) ? briefs : []).slice(1).filter(briefHasContent).length;
}

function normalizeChoices(raw, allowed, at, what) {
  if (raw == null) return { value: [], error: null };
  if (!Array.isArray(raw)) return { value: null, error: `${at}: ${what} ต้องเป็นรายการ` };
  const out = [];
  for (const item of raw) {
    const value = String(item ?? '').trim();
    if (!value) continue;
    if (!allowed.includes(value)) return { value: null, error: `${at}: ${what} "${value}" ไม่รู้จัก` };
    // เลือกซ้ำตัวเดิม = กดสองครั้ง ไม่ใช่ข้อมูลผิด — เก็บครั้งเดียวเงียบ ๆ
    if (!out.includes(value)) out.push(value);
  }
  return { value: out, error: null };
}

/**
 * ตรวจและแปลงบรีฟรายกลิ่นที่ client ส่งมา — คืน { briefs, error }
 *
 * `scentCount` = จำนวนกลิ่นที่ใบสั่งขายบอก (qty ของบรรทัดออกแบบกลิ่น)
 *
 * ⭐ **เป็นเพดาน ไม่ใช่จำนวนที่ต้องเท่ากัน** — จำนวนกลิ่นที่ขายกับจำนวน*ทิศทาง*ที่ลูกค้า
 * สั่งเป็นคนละเรื่อง · ลูกค้าซื้อ 3 กลิ่นแต่บอกมาแนวเดียว ("ทำแนวสดชื่นมา 3 ทาง") เป็น
 * เรื่องปกติ ⇒ บรีฟก้อนเดียวแล้ว RD ส่ง 3 direction จากก้อนนั้น ซึ่งระบบรองรับอยู่แล้ว
 * (1 บรีฟ : หลาย direction · มติผู้ใช้)
 *
 * ⚠️ แต่**เกินไม่ได้** — เขียนบรีฟ 5 ทางบนใบที่ขาย 3 กลิ่นแปลว่าอย่างน้อยสองทางจะไม่มี
 * ใครทำ และไม่มีอะไรบอกว่าทางไหนถูกตัด
 */
export function normalizeScentBriefs(input, { scentCount = null } = {}) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { briefs: [], error: 'ต้องมีบรีฟกลิ่นอย่างน้อย 1 ก้อน' };
  if (rows.length > MAX_SCENT_BRIEFS) {
    return { briefs: [], error: `บรีฟกลิ่นมากเกินไป (สูงสุด ${MAX_SCENT_BRIEFS} ก้อน)` };
  }
  if (scentCount != null && rows.length > scentCount) {
    return {
      briefs: [],
      error: `ใบสั่งขายระบุ ${scentCount} กลิ่น เขียนบรีฟได้ไม่เกิน ${scentCount} ก้อน `
        + `(ส่งมา ${rows.length})`,
    };
  }

  const briefs = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `กลิ่นที่ ${i + 1}`;

    const label = String(raw.label ?? '').trim();
    if (!label) return { briefs: [], error: `${at}: ต้องตั้งชื่อเรียกบรีฟก้อนนี้` };
    if (label.length > LIMITS.label) {
      return { briefs: [], error: `${at}: ชื่อเรียกยาวเกิน ${LIMITS.label} ตัวอักษร` };
    }
    // ⚠️ ชื่อซ้ำ = คนอ่านแยกไม่ออกว่า direction ตัวไหนตอบก้อนไหน ซึ่งเป็นทั้งหมด
    // ที่ชั้นนี้มีไว้เพื่อ
    const key = label.toLowerCase();
    if (seen.has(key)) return { briefs: [], error: `${at}: ชื่อเรียกซ้ำกับก้อนก่อนหน้า` };
    seen.add(key);

    const brief = { id: raw.id || null, sortOrder: i + 1, label };
    for (const field of TEXT_FIELDS) {
      const value = String(raw[field] ?? '').trim();
      if (value.length > LIMITS[field]) {
        return { briefs: [], error: `${at}: ช่องข้อความยาวเกิน ${LIMITS[field]} ตัวอักษร` };
      }
      brief[field] = value || null;
    }

    const types = normalizeChoices(raw.scentotypes, SCENTOTYPE_VALUES, at, 'Scentotype');
    if (types.error) return { briefs: [], error: types.error };
    const perf = normalizeChoices(raw.performance, SCENT_PERFORMANCE_VALUES, at, 'Performance');
    if (perf.error) return { briefs: [], error: perf.error };
    brief.scentotypes = types.value;
    brief.performance = perf.value;

    // ⭐ **ข้อความต่อท้าย Scentotype รายตัว** (mig 0222) — กระดาษ FM-RD-01 ข้อ 2.1.4
    // มีเส้นให้เขียนต่อหลังทุกตัว (`CHEERER ____`) · เก็บเฉพาะตัวที่ **ติ๊กไว้จริง**
    // ⇒ ติ๊กออกแล้วข้อความหายตาม ไม่ค้างเป็นข้อมูลผีที่ไม่มีใครเห็นบนจอ
    const notes = raw.scentotypeNotes && typeof raw.scentotypeNotes === 'object'
      ? raw.scentotypeNotes : {};
    const kept = {};
    for (const type of brief.scentotypes) {
      const text = String(notes[type] ?? '').trim();
      if (!text) continue;
      if (text.length > LIMITS.scentotypeNote) {
        return { briefs: [], error: `${at}: ข้อความของ Scentotype ยาวเกิน ${LIMITS.scentotypeNote} ตัวอักษร` };
      }
      kept[type] = text;
    }
    brief.scentotypeNotes = kept;

    briefs.push(brief);
  }
  return { briefs, error: null };
}

/**
 * direction ชี้กลับบรีฟที่มีอยู่จริงในใบเดียวกันไหม — คืนข้อความไทย หรือ null
 *
 * ⚠️ ต้องตรวจว่าอยู่ **ใบเดียวกัน** ไม่ใช่แค่ "มี id นี้ในระบบ" — ไม่งั้นยิงตรงแล้ว
 * ผูก direction ของใบเราไปกับบรีฟของลูกค้ารายอื่นได้
 */
export function briefLinkError(briefId, briefsOfRequest = []) {
  if (!briefId) return 'ต้องเลือกว่ากลิ่นตัวนี้ตอบบรีฟก้อนไหน';
  if (!briefsOfRequest.some((b) => b.id === briefId)) {
    return 'บรีฟที่เลือกไม่ได้อยู่ในคำร้องใบนี้';
  }
  return null;
}
