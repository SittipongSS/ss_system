// ── Client: บังคับลบสำหรับผู้ดูแลระบบ (break-glass) ───────────────────
// ลบตามปกติก่อน; ถ้าถูกบล็อกด้วยกฎธุรกิจ (409/400) และผู้ใช้เป็น admin จะดึง
// พรีวิว (?dryRun=1) มาแสดงว่าจะลบอะไรพ่วงบ้าง แล้วถาม window.confirm ก่อนยิงซ้ำ
// ด้วย ?force=1. (ยึด window.confirm ตามแนวทาง UI เดิม — ไม่ใช้ ConfirmDialog).
//
// คืน { ok, forced, cancelled }:
//   ok=true  → ลบสำเร็จ (forced=true ถ้าผ่านทาง force)
//   cancelled=true → ผู้ใช้กดยกเลิกตอนถามยืนยัน force
// โยน Error เมื่อ (ก) ผู้ใช้ทั่วไปโดนบล็อก หรือ (ข) force แล้วยังพลาด.
export async function deleteWithForce(baseUrl, { isAdmin = false } = {}) {
  let res = await fetch(baseUrl, { method: 'DELETE' });
  if (res.ok) return { ok: true, forced: false };

  const payload = await res.json().catch(() => ({}));
  const blockedMsg = payload.error || 'ลบไม่สำเร็จ';
  // บล็อกด้วยกฎธุรกิจ = 409 (conflict) / 400 (bad request). สิทธิ์/หาไม่เจอ = ไม่ force.
  const businessBlock = res.status === 409 || res.status === 400;
  if (!isAdmin || !businessBlock) throw new Error(blockedMsg);

  // พรีวิว cascade (best-effort — ถ้าดึงไม่ได้ก็ยังถาม confirm แบบไม่มีรายการ)
  const preview = await fetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}dryRun=1`, { method: 'DELETE' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  // บาง entity ถูกบล็อกเด็ดขาดแม้บังคับลบ (เช่น ใบที่มีหลักฐานลายเซ็น immutable) —
  // ไม่เสนอ confirm บังคับลบที่ยังไงก็ล้มเหลว แสดงเหตุผลแล้วหยุด (ให้ผู้ใช้ไปยกเลิกแทน)
  if (preview?.blocked) throw new Error(blockedMsg);

  const notes = (preview?.notes || []).map((n) => `⚠ ${n}`).join('\n');
  const cascade = (preview?.cascade || []).map((c) => `   • ${c.label}: ${c.count}`).join('\n');
  const detail = [
    `ลบตามปกติไม่ได้: ${blockedMsg}`,
    notes && `\n${notes}`,
    cascade && `\nในฐานะผู้ดูแลระบบ การบังคับลบจะลบสิ่งเหล่านี้พ่วงไปด้วย:\n${cascade}`,
  ].filter(Boolean).join('\n');

  if (!window.confirm(`${detail}\n\nยืนยันบังคับลบทั้งหมด? การลบนี้ย้อนกลับไม่ได้`)) {
    return { ok: false, cancelled: true };
  }

  res = await fetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}force=1`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'บังคับลบไม่สำเร็จ');
  return { ok: true, forced: true };
}
