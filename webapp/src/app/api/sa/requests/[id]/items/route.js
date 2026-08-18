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
import { canAnswerRequest, canReadRequestRow, deriveRequestStatusAfterAnswer } from '@/lib/deptRequests';
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
  /* ⭐ **ส่งเพิ่มได้แม้ใบขึ้น "ตอบแล้ว"** (ผลตรวจ 2026-08-18)
     🐞 `answered` เป็นสถานะที่ระบบ *derive* ให้เองเมื่อทุกแถวเดินจบ ไม่ใช่คำประกาศ
     ของฝ่ายว่างานจบ ⇒ พัฒนากลิ่นที่ RD ส่ง 2 กลิ่น · ลูกค้าคอนเฟิร์ม 1 ปฏิเสธ 1
     จะกลายเป็น `answered` ทันที แล้ว **RD ส่งกลิ่นเพิ่มไม่ได้อีกเลย** ทั้งที่งานยัง
     ไม่จบ · ทางออกเดิมคือปิดใบแล้วเปิดใหม่ ซึ่งตัดสายงานขาดจากบรีฟเดิม
     ⚠️ สาย "ลูกค้าขอแก้" ไม่เคยติดกับดักนี้เพราะ `revise` สร้างแถวต่อให้ในทรานแซกชัน
     เดียวกับตอน outcome — ที่ติดคือการส่งกลิ่น **ตัวใหม่** หลังลูกค้าตอบครบ
     ⚠️ `closed` / `cancelled` ยังปิดตามเดิม — สองอันนั้นคนกดเอง ไม่ใช่ derive
     ⚠️ เพิ่มแถวแล้วใบไม่ครบอีกต่อไป ⇒ ต้องดึงสถานะกลับเป็น `acknowledged`
     (ดูท้าย handler) ไม่งั้นใบค้างเป็น "ตอบแล้ว" ทั้งที่มีแถวใหม่รอเดิน */
  const DELIVERABLE_STATUSES = [...REQUEST_OPEN_STATUSES, 'answered'];
  if (!DELIVERABLE_STATUSES.includes(before.status)) {
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
  // ⭐ บรีฟของใบนี้ — direction ต้องชี้กลับว่าตอบก้อนไหน (ชั้นกลาง · mig 0213)
  // ⚠️ อ่านจากใบนี้ใบเดียว เพราะด่านตรวจว่า `briefId` อยู่ **ในคำร้องเดียวกัน**
  // ไม่ใช่แค่ "มี id นี้ในระบบ" — ไม่งั้นยิงตรงแล้วผูกข้ามลูกค้าได้
  const { data: briefRows, error: briefLoadError } = await supabase
    .from('dept_request_scents').select('id, label').eq('requestId', id)
    .order('sortOrder', { ascending: true });
  if (briefLoadError) return Response.json({ error: briefLoadError.message }, { status: 500 });

  const { rows, error } = normalizeDeliveryRows(body.rows, {
    existingCodes: registry.map((s) => s.code).filter(Boolean),
    today: businessDate(),
    briefs: briefRows || [],
    // ⭐ แถวรอบแก้ที่รออยู่ — ด่านตรวจว่า `targetItemId` ที่ส่งมาเติมได้จริง และ
    // เป็นที่มาของบรีฟ/กลิ่นต้นทาง (ห้ามเชื่อค่าที่ client ส่งมาสองช่องนั้น)
    items: before.items || [],
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
      // ⭐ **วันผลิตอยู่บนตัวกลิ่น · วันส่งลูกค้ายังไม่เกิด** (มติผู้ใช้ 2026-08-08 ·
      // ม-66 · mig 0224) — ตอนนี้ของเพิ่งออกจากมือ RD มาถึงฝ่ายขาย ยังไม่ถึงลูกค้า
      // 🐞 เดิมเขียน `sentAt` ตรงนี้ด้วยวันเดียวกับ `readyAt` ⇒ ทะเบียนบอกว่าส่ง
      // ลูกค้าแล้วตั้งแต่วันที่ RD ส่งมอบ ซึ่งเร็วกว่าความจริงเสมอ
      // ⇒ `scents.sentAt` เขียนตอน SA กดก้าว "ส่งให้ลูกค้า" แทน (items/[itemId])
      await supabase.from('scents').update({
        // ⭐ ทะเบียนย้อนกลับได้ว่ากลิ่นตัวนี้มาจากบรีฟไหน (ข้อที่ผู้ใช้ขอ · mig 0213)
        // เก็บตรงบน scents ไม่ให้ต้อง join ผ่านแถว direction
        briefId: row.briefId,
        producedAt: row.producedAt,
        producedById: user?.id ?? null,
        producedByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('id', scent.id);
      created.push({ row, scent });
    }

    // 2) แถวคำร้อง — **รอบแก้เติมลงแถวเดิม · ที่เหลือสร้างใหม่** (#1049)
    //
    // ⚠️ แถวรอบแก้ถูกสร้างรอไว้ตั้งแต่ตอนลูกค้ากด "ขอให้แก้" ⇒ สร้างใหม่ทับจะได้
    // สองแถวต่อหนึ่งรอบแก้ แถวที่รออยู่จะค้างถาวรเพราะไม่มีกลิ่นผูก ⇒ ใส่ราคาไม่ได้
    // ⇒ ใบปิดไม่ลง · `sortOrder` ของแถวเดิมไม่แตะ — ลำดับบนจอต้องไม่กระโดด
    const base = Math.max(0, ...(before.items || []).map((i) => i.sortOrder || 0));
    const ackAt = before.acknowledgedAt ? String(before.acknowledgedAt).slice(0, 10) : null;
    let fresh = 0;
    const inserts = [];
    for (const { row, scent } of created) {
      const values = deliveryItemRow(row, {
        requestId: id,
        sortOrder: row.targetItemId ? 0 : base + (fresh += 1),
        scentId: scent.id,
        ackAt,
        user,
      });
      if (!row.targetItemId) {
        inserts.push({ id: `DRI-${randomUUID()}`, ...values, createdAt: nowIso, updatedAt: nowIso });
        continue;
      }
      // เติมลงแถวที่รออยู่ — ตัวตนของแถว (id · ลำดับ · สายพันธุ์) ต้องไม่ถูกเขียนทับ
      const { requestId: _r, sortOrder: _s, lineKind: _k, ...fill } = values;
      const { error: fillError } = await supabase.from('dept_request_items')
        .update({ ...fill, updatedAt: nowIso }).eq('id', row.targetItemId);
      if (fillError) throw fillError;
    }
    if (inserts.length) {
      const { error: itemError } = await supabase.from('dept_request_items').insert(inserts);
      if (itemError) throw itemError;
    }
  } catch (e) {
    // ย้อนลบกลิ่นที่เพิ่งสร้าง — ของค้างในทะเบียนคือของที่คนอื่นจะเลือกไปใช้ต่อ
    for (const { scent } of created) {
      await supabase.from('scents').delete().eq('id', scent.id).catch(() => {});
    }
    return Response.json({ error: e.message }, { status: 400 });
  }

  /* ⭐ ใบที่เคยขึ้น "ตอบแล้ว" ต้องถอยกลับเป็น "รับเรื่องแล้ว" เมื่อมีแถวใหม่
     ใช้ตัวเดิมที่ route ก้าวรายแถวใช้ (`deriveRequestStatusAfterAnswer`) ⇒ กติกา
     "ครบทุกแถว = answered" อยู่ที่เดียว ไม่มีใครคิดเองสองที่
     ⚠️ ตัวนั้นกัน `closed`/`cancelled` ไว้ให้แล้ว จึงไม่ต้องเช็คซ้ำ */
  const afterAdd = await findRequest(supabase, id);
  const derivedStatus = deriveRequestStatusAfterAnswer(afterAdd.items || [], afterAdd.status);
  if (derivedStatus !== afterAdd.status) {
    await supabase.from('dept_requests')
      .update({ status: derivedStatus, updatedAt: new Date().toISOString() })
      .eq('id', id);
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
