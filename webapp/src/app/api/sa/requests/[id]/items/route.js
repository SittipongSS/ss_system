// ── RD ส่งของ = สร้างแถว + เข้าทะเบียนกลิ่นในจังหวะเดียว (P3b) ────────────
//
// POST { rows: [{ name, code, sentAt?, spec?, derivedFromScentId? }] }
//
// ⭐ **หัวข้อ "พัฒนากลิ่น" ไม่มีตารางบรรทัดตอนเปิดใบ** — SA ไม่มีทางรู้ล่วงหน้าว่า
// RD จะส่งกี่ direction ⇒ แถวเกิดตรงนี้ · 1 แถว = 1 direction = กลิ่น 1 ตัวในทะเบียน
//
// ⭐ **กรอกที่เดียว เข้าทะเบียนเลย** — RD ไม่ต้องเปิดหน้าทะเบียนอีกจอแล้วพิมพ์ซ้ำ
// (ซึ่งเป็นวิธีที่ข้อมูลสองที่เริ่ม drift กัน)
//
// ⚠️ **ไม่มี transaction ข้ามตาราง** — PostgREST ไม่มีให้ · ลำดับจึงเป็น
// "สร้างกลิ่นทีละตัว → สร้างแถวทั้งชุดทีเดียว" และถ้าแถวล้ม จะย้อนลบกลิ่นที่เพิ่ง
// สร้างไป · กลิ่นค้างโดยไม่มีคำร้องอ้าง แย่กว่าคำร้องที่ไม่มีกลิ่น เพราะทะเบียนคือ
// ของที่คนอื่นเลือกจากมันต่อ
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canAnswerRequest, canReadRequestRow } from '@/lib/deptRequests';
import { REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { deliveryItemRow, normalizeDeliveryRows } from '@/lib/requests/delivery';
import { findRequest } from '@/lib/materialPricesAdmin';
import { createScent, loadScents } from '@/lib/master/scentFormulaAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json(
      { error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 },
    );
  }
  // ส่งของเป็นงานของฝ่ายปลายทางล้วน — ผู้ขอสร้างแถวเองไม่ได้
  if (!canAnswerRequest(user, before)) {
    return Response.json({ error: `ส่งของได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }
  if (before.kind !== 'scent_dev') {
    return Response.json({ error: 'หัวข้อนี้ไม่ได้ส่งของเป็นรายการ' }, { status: 400 });
  }
  if (!REQUEST_OPEN_STATUSES.includes(before.status)) {
    return Response.json({
      error: `คำร้องอยู่สถานะ "${REQUEST_STATUS_LABELS[before.status] || before.status}" — ส่งของไม่ได้`,
    }, { status: 409 });
  }
  // ⚠️ กลิ่นบังคับผูกลูกค้าเสมอ (มติ 9) — ใบที่ derive ลูกค้าไม่ได้ ส่งของไม่ได้
  // ต้องบอกตรงนี้ ไม่ใช่ปล่อยไปตายตอน createScent ด้วยข้อความที่ไม่บอกว่าทำไม
  if (!before.customerId) {
    return Response.json({
      error: 'คำร้องนี้ยังไม่รู้ว่าเป็นของลูกค้ารายไหน — กลิ่นต้องมีลูกค้าเจ้าของเสมอ',
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  // รหัสที่มีอยู่แล้วทั้งทะเบียน — รหัสกลิ่นห้ามซ้ำทั้งบริษัท ไม่ใช่แค่ในลูกค้าเดียว
  // (scents_code_uk เป็น unique ทั้งตาราง)
  const registry = await loadScents(supabase, {});
  const { rows, error } = normalizeDeliveryRows(body.rows, {
    existingCodes: registry.map((s) => s.code).filter(Boolean),
    today: businessDate(),
  });
  if (error) return Response.json({ error }, { status: 400 });

  const nowIso = new Date().toISOString();
  const created = [];
  try {
    // 1) กลิ่นเข้าทะเบียนทีละตัว — `accepted: true` เพราะ RD กรอกรหัสมาแล้ว
    for (const row of rows) {
      const scent = await createScent(supabase, {
        name: row.name,
        code: row.code,
        customerId: before.customerId,
        customerName: before.customerName,
        dealId: before.dealId || null,
        derivedFromScentId: row.derivedFromScentId,
      }, user, { accepted: true });
      // วันที่ส่งอยู่บนตัวกลิ่น (0205) — เขียนตอนสร้างเลย ไม่ต้องรอใครมากดซ้ำ
      await supabase.from('scents').update({
        sentAt: row.sentAt,
        sentById: user?.id ?? null,
        sentByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('id', scent.id);
      created.push({ row, scent });
    }

    // 2) แถวคำร้องทั้งชุดทีเดียว
    const base = Math.max(0, ...(before.items || []).map((i) => i.sortOrder || 0));
    const ackAt = before.acknowledgedAt ? String(before.acknowledgedAt).slice(0, 10) : null;
    const itemRows = created.map(({ row, scent }, i) => ({
      id: `DRI-${randomUUID()}`,
      ...deliveryItemRow(row, {
        requestId: id, sortOrder: base + i + 1, scentId: scent.id, ackAt, user,
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
    const { error: itemError } = await supabase.from('dept_request_items').insert(itemRows);
    if (itemError) throw itemError;
  } catch (e) {
    // ย้อนลบกลิ่นที่เพิ่งสร้าง — ของค้างในทะเบียนคือของที่คนอื่นจะเลือกไปใช้ต่อ
    for (const { scent } of created) {
      await supabase.from('scents').delete().eq('id', scent.id).catch(() => {});
    }
    return Response.json({ error: e.message }, { status: 400 });
  }

  // 3) ร่องรอย — หนึ่งเหตุการณ์ต่อการส่งหนึ่งครั้ง ไม่ใช่ต่อแถว (คนอ่านเธรดสนใจ
  // ว่า "ส่งไปกี่ตัวเมื่อไร" ไม่ใช่ไล่อ่านทีละบรรทัดที่เกิดพร้อมกัน)
  const names = created.map(({ row }) => `${row.code} ${row.name}`).join(' · ');
  await appendUpdate(supabase, {
    entityType: 'dept_request',
    entityId: id,
    kind: 'ready',
    body: `ส่งกลิ่น ${created.length} รายการ — ${names}`,
    user,
  }).catch(() => {});

  await recordAudit({
    user, action: 'update', entityType: 'dept_request', entityId: id,
    before, after: await findRequest(supabase, id),
    summary: `ส่งกลิ่น ${created.length} รายการ (${before.docNo || id})`,
    request,
  });

  return Response.json(await findRequest(supabase, id), { status: 201 });
}
