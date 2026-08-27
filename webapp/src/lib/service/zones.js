// ── โซนบริการ (mig 0297) — logic ล้วน ─────────────────────────────────────
//
// ⭐ "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception / ห้องน้ำชั้น 2) — entity ถาวร
// ไม่ตายตามใบสั่งขาย · ต่อสัญญา = SO ใหม่มาผูกโซนเดิม ประวัติ/consumption ต่อเนื่อง
// (มติผู้ใช้ 2026-08-27 · แผนระบบธุรกิจบริการ เฟส 2)
//
// ⚠️ คนละเรื่องกับ "เขตวิ่งงาน" (service_sites.routeZone — mig 0296) ที่ใช้จัดรอบวิ่ง
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม) และ server (validate ก่อน insert)

export function normalizeZoneInput(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อโซน' };
  if (name.length > 150) return { value: null, error: 'ชื่อโซนยาวเกิน 150 ตัวอักษร' };

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  return {
    value: {
      name,
      note: note || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
    },
    error: null,
  };
}
