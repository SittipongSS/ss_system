// ── ช่างแจ้งเครื่องชำรุดจากหน้างาน (ข้อ H) — logic ล้วน (ไม่แตะ DB) ──────────────
//
// 🔴 **ของเดิม: ไม่มีทางไหนเขียน `service_assets.condition` จากงานหน้างานเลย** — แกนสภาพ
//   เครื่องที่ mig 0332 สร้างมา "สำหรับวันที่มีคนแจ้งว่าเครื่องหน้างานเสีย" (ม็อกทะเบียนเครื่อง)
//   เขียนได้ทางเดียวคือคำสั่ง "แจ้งเปลี่ยนสภาพ" ที่หน้าเครื่อง ซึ่ง role `ts` เปิดไม่ได้
//   ⇒ ช่างที่เห็นเครื่องเสียกับตา มีทางบอกแค่พิมพ์ในสรุปงาน แล้วทะเบียนยังบอกว่า "ปกติ"
//
// ⭐ **เขียนผ่านคำสั่ง `condition` ตัวเดียวกับหน้าเครื่อง** (ได้แถวประวัติ: วันที่ · อาการ ·
//   ชื่อช่าง) แต่ **ด่านสิทธิ์เป็นของนัด** ไม่ใช่ของทะเบียน: ช่างแจ้งได้เฉพาะเครื่องที่ติดตั้ง
//   อยู่ที่ไซต์ของนัดที่ตัวเองถูกมอบหมาย — ไม่เปิดเส้นคำสั่งย้ายให้ `ts` (เส้นนั้นแตะเครื่อง
//   ไหนก็ได้ทั้งบริษัท) และไม่เติม cap ให้ role ช่าง (กติกา service-crew-role-gates)
//
// ⚠️ **แจ้งได้ทางเดียว: ปกติ → ชำรุด** · แก้กลับเป็นปกติเป็นเรื่องของคนที่ซ่อม/เช็คแล้ว
//   (ผู้จัดคิวกด "แจ้งเปลี่ยนสภาพ" ที่หน้าเครื่อง) — ช่างกดยกเลิกสวิตช์ทีหลังจึงไม่ย้อนทะเบียน
import { assetMoveError } from './assetMoves';

/** ตราประจำนัดบนแถวประวัติ — รูปเดียวกับของนัดถอน (อ่านย้อนได้ว่าแจ้งจากนัดไหน) */
const visitMark = (visit = {}) => `(${visit.id})`;

/** ค่าที่ติดไปกับคำสั่ง `condition` */
export function brokenReportInput(visit = {}, reason = '', today = null) {
  return {
    // วันที่เข้าจริง (ประทับตอนกดเริ่มงาน) — ยังไม่มี = วันนี้ตามนาฬิกาไทยที่ผู้เรียกส่งมา
    movedAt: visit.actualDate || today,
    condition: 'broken',
    reason: String(reason ?? '').trim().slice(0, 500),
    note: `แจ้งจากนัด ${visit.code || visit.id || ''} ${visitMark(visit)}`.slice(0, 1000),
  };
}

/**
 * แผนแจ้งชำรุดของการบันทึกผลหนึ่งครั้ง — คืน `{ moves, errors, skipped }`
 *   moves   = `[{ asset, input }]` ต้องสั่ง `condition` → `broken`
 *   errors  = `[{ assetId, label, error }]` ⇒ route ต้องตีกลับ **ก่อนเขียนอะไรเลย**
 *   skipped = เครื่องที่ทะเบียนบอกว่าชำรุดอยู่แล้ว — บันทึกซ้ำ ("แก้ผลการเข้า") ต้องเงียบ
 *             ไม่ใช่ติดด่าน "สภาพเครื่องเป็นค่านี้อยู่แล้ว" แล้วบันทึกผลทั้งใบไม่ได้
 *
 * @param reports    `[{ assetId, reason }]` จากแถวที่ติ๊กสวิตช์ชำรุด
 * @param siteAssets `loadAssets(visit.siteId)`
 * @param today      วันนี้ตามนาฬิกาไทย (ผู้เรียกส่งมา — ไฟล์นี้ไม่อ่านนาฬิกาเอง)
 */
export function brokenReportPlan({ visit, reports = [], siteAssets = [], today = null } = {}) {
  const out = { moves: [], errors: [], skipped: [] };
  const byId = new Map((siteAssets || []).map((a) => [a.id, a]));
  for (const report of reports || []) {
    const asset = byId.get(report.assetId);
    const label = asset?.label || asset?.code || report.assetId;
    /* แจ้งได้เฉพาะเครื่องที่ **ติดตั้งอยู่ที่ไซต์ของนัดนี้** — เครื่องที่ถอน/ย้าย/ส่งซ่อม/
       ปลดระวางไปแล้วไม่ได้อยู่ต่อหน้าช่าง (และผลของมันแช่แข็งอยู่แล้ว) */
    if (!asset || asset.status !== 'active' || asset.siteId !== visit?.siteId) {
      out.errors.push({ assetId: report.assetId, label, error: `แจ้งชำรุด “${label}” ไม่ได้ — แจ้งได้เฉพาะเครื่องที่ติดตั้งอยู่ที่ไซต์ของนัดนี้` });
      continue;
    }
    if (asset.condition === 'broken') {
      out.skipped.push({ asset });
      continue;
    }
    const input = brokenReportInput(visit, report.reason, today);
    /* 🔑 ด่านตัวเดียวกับปุ่ม "แจ้งเปลี่ยนสภาพ" ที่หน้าเครื่อง
       ⚠️ `canEdit: true` ไม่ใช่การข้ามสิทธิ์ — route ของนัดผ่าน `requireVisit` มาแล้ว และ
          ข้างบนจำกัดเหลือเฉพาะเครื่องของไซต์นัดนี้ */
    const error = assetMoveError(asset, 'condition', input, { canEdit: true });
    if (error) out.errors.push({ assetId: asset.id, label, error: `แจ้งชำรุด “${label}” ไม่ได้ — ${error}` });
    else out.moves.push({ asset, input });
  }
  return out;
}
