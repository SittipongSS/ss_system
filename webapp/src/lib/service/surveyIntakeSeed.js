// ── ประเมินจากแบบ งวด 4 — วิธีของแถวพื้นที่ตอนฝ่ายขายเปิดใบ / ตอนร่างเปลี่ยนวิธี (S4 §2.6) ─────────
//
// ⭐ **ไฟล์ใหม่ไฟล์เดียวที่เขียนค่า `method` ได้** (ด่าน S2a `surveyMethodGuards.test.mjs` มีชื่อไฟล์นี้ในลิสต์)
//    · import ได้เฉพาะ route ใต้ `src/app/api/` — จอไม่เคยเขียนวิธีของแถวพื้นที่เอง
// ⭐ แถวที่เกิดตอนเปิดใบ / แถวที่ยังไม่มีผล ต้องอ่านเป็น "เกิดมาแบบนั้น": เขียนแค่ `method` (+ `updatedAt`) **ไม่เคย** เขียน
//    `methodReason` / `methodChangedAt` / `methodChangedByName` — `surveyDrawingAssessor` กับ
//    `surveyZoneNeedsResave` ถือ `methodChangedAt IS NULL` เป็น "ไม่เคยมีใครสลับ"
// ⭐ **ข้อยกเว้นเดียว (มติเจ้าของ 19/10 · S4 O8 = ข):** แถวจากแบบที่ **มีผลของหัวหน้าแล้ว** แล้วร่างถูกสลับเป็นลงหน้างาน
//    = ประทับการสลับในนามฝ่ายขาย (`methodReason` = `SURVEY_INTAKE_SWITCH_REASON`) + ปลดเลือกจุด — ทรงเดียวกับที่หัวหน้า
//    สลับกลับเป็นลงหน้างาน (`surveyMethodWrites.js` ขั้น 3b) ⇒ ด่านขนาดของช่างบังคับบันทึกใหม่หลังสลับ (`surveyZoneNeedsResave`)
// ⚠️ supabase ไม่ throw — ทุกคำสั่งอ่าน `{ error }` · อ่านพัง = `{ error }` ไม่ใช่ "ไม่มีแถว"
import { SURVEY_METHOD_DRAWING, SURVEY_METHOD_ONSITE, zoneMethod } from '@/lib/service/surveyMethod';
import { SURVEY_INTAKE_SWITCH_REASON, SURVEY_VARIANT_DRAWING } from '@/lib/service/surveyIntake';

const text = (v) => String(v ?? '').trim();
const errorText = (error) => error?.message || String(error);

/* คีย์ที่ต่อท้ายทุกแถวตอน insert (`insertSurveyZones({ seed })`) — ใบลงหน้างาน **ไม่มีคีย์ method เลย**
   (payload เท่าก่อนงวดนี้ทุกตัวอักษร · คอลัมน์มี DEFAULT ของมันเอง) */
export function surveyZoneSeedPatch(variant) {
  return variant === SURVEY_VARIANT_DRAWING ? { method: SURVEY_METHOD_DRAWING } : {};
}


/* แถวที่ฝ่ายขายประทับเอง (O8 = ข) **ไม่ใช่** "หัวหน้าสลับแล้ว" — ไม่งั้นบันทึกร่างรอบถัดไปเงียบไปทั้งใบ (`'switched'`)
   แล้วสลับกลับเป็นจากแบบได้ variant ใหม่ แต่แถวค้างเป็นลงหน้างาน (ใบยื่นเป็นจากแบบที่ทุกพื้นที่ต้องมีนัด) */
const intakeStamped = (row) => text(row.methodReason) === SURVEY_INTAKE_SWITCH_REASON;
const switchedByHead = (row) => text(row.methodChangedAt) !== '' && !intakeStamped(row);
// ทรงเดียวกับ `unselectSpotRows` ของแผนสลับวิธี (S2a) — จุดคร่าว ๆ จากโต๊ะต้องไม่ผ่านด่าน "เลือกจุด" ของช่างเอง
const unselectedSpots = (row) => (Array.isArray(row.spots) ? row.spots : []).map((spot) => ({ ...spot, selected: false }));
const RESEED_RACE_ERROR = 'พื้นที่ของใบนี้ถูกแก้ระหว่างตั้งวิธีประเมิน';

/**
 * ร่างที่ฝ่ายขายเปลี่ยนวิธี → ตั้งวิธีของแถวพื้นที่ทุกแถวให้ตรง
 * คืน `{ changed, skipped: null | 'switched' | 'assessed', error: null | string }`
 *
 * @param actorName ชื่อฝ่ายขายที่กดบันทึก/ส่ง — ลง `methodChangedByName` ของแถวที่ถูกประทับ (เฉพาะทิศเป็นลงหน้างาน)
 *
 * ⭐ **ทิศเป็นลงหน้างาน — แถวที่มีผลแล้วถูกประทับ ไม่ตีกลับ** (มติเจ้าของ 19/10 · S4 O8 = ข)
 *    ทางที่เกิดได้: ใบยื่นเป็นจากแบบ รอรับเรื่อง → หัวหน้าบันทึกผลรายพื้นที่ → ตีกลับ (กลับเป็นร่าง) → ฝ่ายขายสลับเป็นลงหน้างาน
 *    เขียนทับเฉย ๆ = แถวลงหน้างานที่ถือตัวเลขจากแบบ + ชื่อหัวหน้าเป็นผู้วัด โดยไม่มีด่านไหนจับได้ ⇒ แถวแบบนั้นได้
 *    `method: onsite` + ตราการสลับสามช่อง (`methodChangedAt` = ตอนนี้ ⇒ `surveyedAt` เดิมเก่ากว่า ⇒ `surveyZoneNeedsResave`
 *    ตอบ true ⇒ ด่านขนาดบังคับบันทึกใหม่) + ปลดเลือกจุด · แถวที่ยังไม่มีผลได้ `{ method, updatedAt }` เท่าเดิมทุกตัวอักษร
 * 🔴 **ทิศเป็นจากแบบ — แถวลงหน้างานที่มีผลแล้วยังตีกลับ (`'assessed'`)**: หัวหน้าสลับทิศนี้ได้ (S2a ประทับในนามหัวหน้า
 *    ⇒ `surveyDrawingAssessor` = หัวหน้า) แต่ตราในนามฝ่ายขายจะขึ้นชื่อฝ่ายขายเป็น "ผู้ประเมินจากแบบ" ของตัวเลขที่ช่างวัด
 *    — ไม่มีมติให้ทำแบบนั้น ⇒ คงการตีกลับไว้ (ทางออก: ส่งคำร้องแล้วให้หัวหน้า TS สลับ) · ครอบแถวที่ฝ่ายขายเพิ่งประทับด้วย
 *
 * ขั้นตอน: อ่าน → มีแถวที่หัวหน้าสลับแล้ว = `'switched'` (กันไว้เฉย ๆ: ร่างไม่ควรมีแถวแบบนั้น) → หางานที่วิธีต่าง
 *   → ทิศจากแบบ + งานที่มีผล = `'assessed'` → `dryRun` นับอย่างเดียว → คำสั่งเดียวสำหรับงานที่ยังไม่มีผล
 *   → ทีละแถวสำหรับงานที่มีผล (ทิศลงหน้างาน — ผูกกับ `updatedAt` ที่อ่าน เพราะเขียนทับ `spots` ซึ่งเส้นบันทึกพื้นที่ก็เขียน)
 *   → เขียนได้ไม่ครบ: ทิศจากแบบ = `'assessed'` · ทิศลงหน้างาน = อ่านใหม่แล้วทำอีกหนึ่งรอบ (แถวที่ได้ผลแทรกเข้ามาถูกประทับ)
 *     รอบสองยังไม่ครบ = `{ error }` (route เตือน/ส่งไม่ได้ · กดซ้ำได้)
 * ⚠️ idempotent: เรียกซ้ำหลังสำเร็จไม่มีงาน · เรียกซ้ำหลังเขียนพังทำเฉพาะงานที่เหลือ
 */
export async function reseedSurveyZoneMethods(supabase, { requestId, variant, dryRun = false, actorName = null } = {}) {
  const first = await reseedPass(supabase, { requestId, variant, dryRun, actorName });
  if (!first.retry) return first.result;
  const again = await reseedPass(supabase, { requestId, variant, dryRun, actorName });
  const changed = first.result.changed + again.result.changed;
  if (again.retry) return { changed, skipped: null, error: RESEED_RACE_ERROR };
  return { ...again.result, changed };
}

async function reseedPass(supabase, { requestId, variant, dryRun, actorName }) {
  const done = (result) => ({ result, retry: false });
  const { data, error: readError } = await supabase
    .from('service_survey_zones')
    .select('id, method, spots, "methodChangedAt", "methodReason", "surveyedAt", "updatedAt"')
    .eq('requestId', requestId);
  if (readError) return done({ changed: 0, skipped: null, error: errorText(readError) });
  const rows = (Array.isArray(data) ? data : []).filter(Boolean);

  if (rows.some(switchedByHead)) return done({ changed: 0, skipped: 'switched', error: null });

  const toDrawing = variant === SURVEY_VARIANT_DRAWING;
  const want = toDrawing ? SURVEY_METHOD_DRAWING : SURVEY_METHOD_ONSITE;
  const work = rows.filter((row) => zoneMethod(row) !== want);
  if (!work.length) return done({ changed: 0, skipped: null, error: null });
  const assessed = work.filter((row) => text(row.surveyedAt));
  if (toDrawing && assessed.length) return done({ changed: 0, skipped: 'assessed', error: null });
  if (dryRun) return done({ changed: work.length, skipped: null, error: null });

  const updatedAt = new Date().toISOString();
  let changed = 0;
  let missed = 0;

  const plain = work.filter((row) => !text(row.surveyedAt));
  if (plain.length) {
    /* ⚠️ เขียนเป็นสองแขนที่มีชื่อค่าคงที่ตรง ๆ โดยตั้งใจ — ด่านเขียน method ของ S2a เห็น `method:` เฉพาะเมื่อตามด้วย
       `SURVEY_METHOD_*` หรือสตริง · `method: want` จะหลบด่านนั้นได้
       🔴 **คำสั่งเขียนกรองเองว่า "เฉพาะงาน + ยังไม่มีผล"** (ผลรีวิวรอบแก้ S4) — ไม่ใช่ทั้งใบ:
          · แถวที่ตรงวิธีอยู่แล้วไม่ถูกแตะ ⇒ `updatedAt` ไม่ขยับ ⇒ หัวหน้าที่เปิดแถวนั้นค้างไว้ไม่โดน 409 "ถูกแก้จากที่อื่น" ปลอม
          · ร่างไม่ล็อกการบันทึกผลรายพื้นที่ (`surveyEditLockError`) ⇒ หัวหน้าบันทึกผลแทรกระหว่างอ่านกับเขียนได้ —
            `.is('surveyedAt', null)` ทำให้ "แถวที่มีผลไม่ได้แค่ method" จริงที่ตัวคำสั่ง ไม่ใช่แค่ที่ขั้นอ่าน
          · ลิสต์ id = พื้นที่ของใบเดียว (หลักหน่วย–หลักสิบ) ห่างเพดาน 16 KB ของ PostgREST มาก */
    const { data: written, error } = await supabase
      .from('service_survey_zones')
      .update(toDrawing
        ? { method: SURVEY_METHOD_DRAWING, updatedAt }
        : { method: SURVEY_METHOD_ONSITE, updatedAt })
      .eq('requestId', requestId)
      .in('id', plain.map((row) => row.id))
      .is('surveyedAt', null)
      .select('id');
    if (error) return done({ changed: 0, skipped: null, error: errorText(error) });
    const count = Array.isArray(written) ? written.length : 0;
    changed += count;
    // เขียนได้น้อยกว่างาน = มีแถวได้ผลแทรกเข้ามาหลังขั้นอ่าน ⇒ ทิศจากแบบ: ตอบเหมือนเจอผลตั้งแต่ขั้นอ่าน (route เตือน/ส่งไม่ได้)
    if (count < plain.length) {
      if (toDrawing) return done({ changed, skipped: 'assessed', error: null });
      missed += plain.length - count;
    }
  }

  // ⭐ O8 = ข: ทิศลงหน้างานเท่านั้น (ทิศจากแบบออกไปแล้วข้างบน) — ทีละแถว ผูกกับรุ่นที่อ่าน
  for (const row of assessed) {
    const query = supabase
      .from('service_survey_zones')
      .update({
        method: SURVEY_METHOD_ONSITE,
        methodReason: SURVEY_INTAKE_SWITCH_REASON,
        methodChangedAt: updatedAt,
        methodChangedByName: text(actorName) || null,
        spots: unselectedSpots(row),
        updatedAt,
      })
      .eq('requestId', requestId)
      .eq('id', row.id);
    const { data: written, error } = await (row.updatedAt == null
      ? query.is('updatedAt', null)
      : query.eq('updatedAt', row.updatedAt)).select('id');
    if (error) return done({ changed, skipped: null, error: errorText(error) });
    const count = Array.isArray(written) ? written.length : 0;
    changed += count;
    if (!count) missed += 1;
  }

  // ไม่ครบ = มีคนบันทึกแถวนั้นแทรก ⇒ อ่านใหม่แล้วทำอีกรอบ (ผู้เรียกทำให้ครั้งเดียว)
  return { result: { changed, skipped: null, error: null }, retry: missed > 0 };
}
