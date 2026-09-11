// ── ผลรายเครื่องของนัด (mig 0301 · F-4) — logic ล้วน ──────────────────────
//
// ⭐ ที่มาจากใบส่งงานจริง 2 ใบที่สคีมาเดิมรับไม่ได้:
//   · "เครื่องบริเวณทางเข้าชั้น 3 ชำรุด ทางทีมได้นำเครื่องมาเปลี่ยน" ⇒ ต้องเป็น
//     ตัวเก่า removedAt + ตัวใหม่ installedAt ไม่ใช่ข้อความในช่องหมายเหตุ
//   · "เครื่อง 4 ตัวทำแล้ว Reed 6 ขวดยังไม่ได้ทำ" ⇒ ปิด done ก็โกหก ปิด unable ก็โกหก
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์มปิดงาน) และ server (validate ก่อนเขียน)
import { isClosedVisit } from './visitStatus';

export const ASSET_OUTCOMES = ['done', 'unable', 'swapped'];

export const ASSET_OUTCOME_LABELS = {
  done: 'ทำแล้ว',
  unable: 'ทำไม่ได้',
  swapped: 'เปลี่ยนเครื่อง',
};

/* ── นัดถอนเครื่อง (`remove`) ใช้ผลชุดเดียวกัน แต่ **พูดคนละคำ** ──────────────
   ⭐ ค่าในฐานยังเป็น done/unable เหมือนเดิม (CHECK ของ mig 0301 ลิสต์ไว้แค่สามค่า)
     — ต่างแค่ป้าย: ช่างที่ถือเครื่องออกจากร้านต้องเห็น "ถอนแล้ว" ไม่ใช่ "ทำแล้ว"
   ⚠️ **"เปลี่ยนเครื่อง" ไม่มีความหมายในนัดถอน** — เอาเครื่องสำรองมาใส่แทนในวันที่ลูกค้า
     เลิกสัญญา = ติดตั้งใหม่ ไม่ใช่ถอน ⇒ ตัดออกจากตัวเลือก และ route ตีกลับซ้ำอีกชั้น */
export const REMOVE_VISIT_KIND = 'remove';

export const REMOVE_OUTCOME_LABELS = {
  done: 'ถอนแล้ว',
  unable: 'ถอนไม่ได้',
};

/** ผลที่เลือกได้ของนัดชนิดนี้ */
export function assetOutcomesFor(kind) {
  return kind === REMOVE_VISIT_KIND ? ['done', 'unable'] : ASSET_OUTCOMES;
}

/** ป้ายของผลรายเครื่อง ตามชนิดของนัดที่ผลนั้นเกิด */
export function assetOutcomeLabel(outcome, kind) {
  if (kind === REMOVE_VISIT_KIND && REMOVE_OUTCOME_LABELS[outcome]) return REMOVE_OUTCOME_LABELS[outcome];
  return ASSET_OUTCOME_LABELS[outcome] || outcome;
}

/* ── ผลที่ "แช่แข็ง" แล้ว — ผลของเครื่องที่ **ไม่ได้ติดตั้งอยู่ที่ไซต์นี้แล้ว** ──────
   🐞 **บันทึกผลซ้ำเคยลบผลของเครื่องพวกนี้ทิ้งเงียบ ๆ** — PUT เขียนทับทั้งชุด (ลบทุกแถว
     ของนัดแล้วใส่ใหม่) แต่แผ่นปิดงานกางเฉพาะเครื่อง "ใช้งาน" ของไซต์ ⇒ เครื่องที่ถูก
     "เปลี่ยน" ไปแล้ว (ปลดระวาง) หรือส่งซ่อม หรือถูกถอนออก (ไม่มีไซต์) ไม่อยู่ในรายการที่
     ส่งกลับมา ⇒ แถวผลของมันหายตอนกด "แก้ผลการเข้า" · ใบส่งงานเหลือแต่เครื่องที่ยังอยู่
   ⇒ แถวของเครื่องที่ไม่ใช่ "ใช้งานที่ไซต์นี้" คือ **ประวัติที่เกิดไปแล้ว** แก้จากแผ่นนี้ไม่ได้
   @param beforeRows แถวผลเดิมของนัด · siteAssets = `loadAssets(visit.siteId)` (ทุกสถานะ) */
export function frozenResultRows(beforeRows = [], siteAssets = []) {
  const live = new Set(siteAssets.filter((a) => a.status === 'active').map((a) => a.id));
  return (beforeRows || []).filter((r) => r?.assetId && !live.has(r.assetId));
}

/** แถวที่ส่งมาซ้ำกับของที่แช่แข็งไว้ "เหมือนเดิมทุกช่อง" หรือไม่ (ค่าว่างนับเท่ากัน) */
export function sameAssetResult(a = {}, b = {}) {
  const same = (x, y) => String(x ?? '') === String(y ?? '');
  return same(a.outcome, b.outcome) && same(a.reason, b.reason)
    && same(a.replacedByAssetId, b.replacedByAssetId);
}

/* ⭐ **สถานะของใบสรุปจากลูก** (มติ 2026-08-02 ข้อ 6) — เจ้าหน้าที่ไม่ได้เลือกเองว่าใบนี้
   จบแบบไหน · ถ้าให้เลือก คนจะกด "เสร็จ" เพราะเป็นปุ่มที่จบงานได้เร็วที่สุดเสมอ
   แล้ว "ทำไม่ครบ" จะไม่มีวันปรากฏในระบบทั้งที่ของจริงเกิดทุกเดือน

   กติกา:
   · ไม่มีเครื่องให้ทำเลย (งานตรวจพื้นที่ · ไซต์ที่ยังไม่ลงทะเบียนเครื่อง) = `done`
     — ไม่ใช่ "ทำไม่ได้" เพราะไม่มีอะไรให้ทำตั้งแต่แรก
   · ทุกตัวจบ (done หรือ swapped) = `done` — เปลี่ยนเครื่องคืองานที่ทำแล้ว ไม่ใช่งานที่พลาด
   · ไม่มีตัวไหนจบเลย = `unable` — ไปถึงแล้วแต่ทำอะไรไม่ได้สักอย่าง
   · ที่เหลือ = `partial` */
export function deriveVisitStatus(results = []) {
  const rows = (results || []).filter((r) => ASSET_OUTCOMES.includes(r?.outcome));
  if (!rows.length) return 'done';
  const finished = rows.filter((r) => r.outcome === 'done' || r.outcome === 'swapped').length;
  if (finished === rows.length) return 'done';
  if (finished === 0) return 'unable';
  return 'partial';
}

/* ตรวจผลรายเครื่องหนึ่งแถว — คืน { value, broken, error }
   ⚠️ ตรวจซ้ำที่นี่ทั้งที่ DB มี CHECK อยู่แล้ว เพราะข้อความจาก Postgres เป็นภาษาอังกฤษดิบ
   ที่ไม่บอกว่าต้องทำอะไรต่อ (ผู้ใช้คือเจ้าหน้าที่ที่ยืนอยู่หน้างาน)
   ⭐ `broken` = ช่างแจ้งว่าเครื่องชำรุด (ข้อ H) — **อยู่นอก `value` โดยตั้งใจ**: `value`
     ถูกกางลงแถว `service_visit_assets` ตรง ๆ ซึ่งไม่มีคอลัมน์นี้ · สภาพเครื่องเป็นของ
     ทะเบียน (`service_assets.condition` + แถวประวัติ) ไม่ใช่ของผลรายนัด */
export function normalizeAssetResult(raw = {}) {
  const assetId = String(raw.assetId ?? '').trim();
  if (!assetId) return { value: null, error: 'ต้องระบุอุปกรณ์' };

  const outcome = raw.outcome;
  if (!ASSET_OUTCOMES.includes(outcome)) return { value: null, error: 'ผลการทำงานของอุปกรณ์ไม่ถูกต้อง' };

  const reason = String(raw.reason ?? '').trim();
  if (outcome !== 'done' && reason.length < 5) {
    return { value: null, error: `“${ASSET_OUTCOME_LABELS[outcome]}” ต้องบอกเหตุผลอย่างน้อย 5 ตัวอักษร` };
  }
  if (reason.length > 500) return { value: null, error: 'เหตุผลยาวเกิน 500 ตัวอักษร' };

  /* แจ้งชำรุดต้องบอก **อาการ** — หัวหน้าที่เปิดหน้าเครื่องทีหลังต้องรู้ว่าเสียยังไง ส่งซ่อม
     หรือแค่ต้องไปเช็คซ้ำ · ใช้ช่องเหตุผลเดียวกับผลรายเครื่อง (ทำแล้วแต่เครื่องมีปัญหาก็มีจริง)
     ⚠️ ต้องเป็น `true` จริง ๆ — สตริง "false" จากฟอร์มเก่าต้องไม่กลายเป็นแจ้งชำรุด */
  const broken = raw.broken === true;
  if (broken && reason.length < 5) {
    return { value: null, error: 'แจ้งเครื่องชำรุดต้องบอกอาการอย่างน้อย 5 ตัวอักษร' };
  }

  const replacedByAssetId = String(raw.replacedByAssetId ?? '').trim();
  if (outcome === 'swapped' && !replacedByAssetId) {
    return { value: null, error: 'เปลี่ยนเครื่องต้องระบุว่าเอาเครื่องไหนมาแทน' };
  }
  if (replacedByAssetId && replacedByAssetId === assetId) {
    return { value: null, error: 'เครื่องที่เอามาแทนต้องไม่ใช่ตัวเดิม' };
  }

  return {
    value: {
      assetId,
      outcome,
      reason: reason || null,
      replacedByAssetId: outcome === 'swapped' ? replacedByAssetId : null,
    },
    broken,
    error: null,
  };
}

/* สรุปข้อความสำหรับเธรด/ใบส่งงาน — หัวหน้าอ่านบรรทัดเดียวแล้วรู้ว่าต้องดูใบนี้ไหม
   ⚠️ พูดถึงเฉพาะสิ่งที่ผิดปกติ · ใบที่ทุกอย่างเรียบร้อยไม่ต้องมีข้อความ (ถ้าดันทุกใบ
   หัวหน้าจะปิดแจ้งเตือนภายในสัปดาห์เดียว — มติข้อ 10) */
export function assetResultFlags(results = [], assetsById = new Map()) {
  const name = (id) => assetsById.get(id)?.label || id;
  const out = [];
  const unable = results.filter((r) => r.outcome === 'unable');
  const swapped = results.filter((r) => r.outcome === 'swapped');
  if (swapped.length) {
    out.push(`เปลี่ยนเครื่อง ${swapped.length} ตัว — ${swapped.map((r) => name(r.assetId)).join(' · ')}`);
  }
  if (unable.length) {
    out.push(`ทำไม่ได้ ${unable.length} รายการ — ${unable.map((r) => name(r.assetId)).join(' · ')}`);
  }
  return out;
}

/* ปิดงานได้หรือยัง — ทุกเครื่องที่ยัง "ใช้งาน" อยู่ต้องมีผล
   ⚠️ เครื่องที่ถอดออกแล้ว/ส่งซ่อมไม่นับ — ไม่ได้อยู่หน้างานให้ทำ */
export function pendingAssets(assets = [], results = []) {
  const answered = new Set(results.map((r) => r.assetId));
  return assets.filter((a) => a.status === 'active' && !answered.has(a.id));
}

export const visitIsClosed = isClosedVisit;
