// ── ขั้นใส่ราคาของแถวสายพัฒนา — ขั้นสุดท้ายในใบเดิม (P3c) ─────────────────
//
// POST { prices: { F?, B?, FB? }, validUntil?, note? }   (ทางเข้าเก่า `{ price }` = ช่องหลัก)
// POST { useCurrent: { revisionId } }   ใช้ราคาที่มีอยู่แล้วในทะเบียน ไม่ออก rev ใหม่ (ม-153 · ดู `linkCurrentPrice` ท้ายไฟล์)
//
// ⭐ **สูตรใส่ได้สามช่อง F · B · FB · กลิ่นใส่ได้ F ช่องเดียว** (ม-148 · มติผู้ใช้ 2026-09-22) —
// ช่องที่เปิดมาจาก `rowPriceSlots` ตัวเดียวกับโมดัลบนจอ · ใส่อย่างน้อยหนึ่งช่อง
//
// ⭐ **ราคาเป็นขั้นสุดท้ายของสายงาน ไม่ใช่คำร้องใบใหม่** (มติผู้ใช้) — เดิมต้องเปิด
// "ขอราคา F" อีกใบแล้วผูกกันเองในหัว ⇒ "กลิ่นนี้คอนเฟิร์มแล้วยังไม่ได้ขอราคา"
// กลายเป็นของที่ไม่มีใครเห็น · ตอนนี้เป็นขั้นบนแถวเดิมที่หน้าจอเตือนให้เอง
//
// ⚠️ **ไม่เขียนกลไกราคาใหม่** — ใช้ `ensureMaterial` + `appendMaterialRevision`
// ชุดเดียวกับที่คำร้องขอราคาวัสดุใช้ ⇒ ราคาที่ได้เข้าทะเบียนวัสดุเป็น rev ปกติ
// อ่านได้จากทุกที่ที่อ่านราคาอยู่แล้ว (ใบขอราคาผลิต · หน้าทะเบียน)
//
// ⚠️ กลิ่นไม่มี "สูตร" — ตัวตนของวัสดุจึงเป็น `RM_F + ชื่อ + ลูกค้า` และผูกกลับหา
// กลิ่นด้วยคอลัมน์ `material_prices.scentId` (0171) ซึ่งประทับตรงนี้จังหวะเดียว
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { canAnswerRequest, canReadRequestRow } from '@/lib/deptRequests';
import { requestRowsClosurePatch } from '@/lib/requests/stages';
import { requestActorSide } from '@/lib/requests/replyTurn';
import { canPriceRow } from '@/lib/requests/rowStage';
import { currentPriceToUse, mainPriceEntry, normalizeSlotPrices } from '@/lib/master/priceSlots';
import { findRequest, priceRegistrySlots } from '@/lib/materialPricesAdmin';
import { loadPriceSlotSource, rowPriceSlotsLive, rowsSlotPricesLive } from '@/lib/master/scentFormulaAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { fmtNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id, itemId } = await params;

  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json(
      { error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 },
    );
  }
  if (!canAnswerRequest(user, before)) {
    return Response.json({ error: `ใส่ราคาได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }

  // ⚠️ **ใบต้องเปิดอยู่** — ด่านชุดเดียวกับ route ก้าวรายแถวที่อยู่ข้าง ๆ
  // (`items/[itemId]/route.js`) · เส้นนี้เคยขาดไปเส้นเดียวในสองพี่น้อง (ผลตรวจรอบ 12 · ค-5)
  //
  // 🐞 `canPriceRow` ข้างล่างอ่านจาก **แถวล้วน** (`rowStage(row)`) ไม่รู้จักสถานะใบเลย ⇒
  // ใบที่ปิดหรือถูกยกเลิกไปแล้ว ถ้ามีแถวค้างที่ `outcome === 'confirmed'` ยังยิงราคาเข้าได้
  // · สถานะใบไม่ขยับ (`deriveRequestStatusAfterAnswer` กัน closed/cancelled ไว้) แต่
  // **ราคาถูกเขียนจริง และ route นี้สร้างวัสดุ `RM_F` เข้าทะเบียนกลาง** ⇒ ของกลางได้แถว
  // ที่มีต้นทางเป็นใบที่ยกเลิกไปแล้ว ซึ่งตามกลับไม่ได้ว่าทำไมถึงมีราคานี้
  if (!REQUEST_OPEN_STATUSES.includes(before.status)) {
    return Response.json({
      error: `คำร้องอยู่สถานะ "${REQUEST_STATUS_LABELS[before.status] || before.status}" — ใส่ราคาไม่ได้`,
    }, { status: 409 });
  }

  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });

  // ⭐ ด่านเดียวกับที่หน้าจอใช้ตัดสินว่าจะโชว์ปุ่มไหม — `canPriceRow` ที่ P1b-1
  // เขียนไว้ ⇒ ปุ่มกับ API ขัดกันไม่ได้เชิงโครงสร้าง
  if (!canPriceRow(row)) {
    return Response.json({
      error: 'ใส่ราคาได้เมื่อลูกค้าคอนเฟิร์มรายการนี้แล้วเท่านั้น',
    }, { status: 409 });
  }
  // ── สายไหนได้ราคาชนิดอะไร (Q38 ก · มติผู้ใช้ 2026-08-07) ────────────────
  //
  // 🐞 **บั๊กที่ปิดตรงนี้** — เดิมบังคับ `producedScentId` อย่างเดียว แล้วสร้างวัสดุ
  // `RM_F` จากชื่อกลิ่น · แถวของ **พัฒนาสูตร** ผูก `producedFormulaId` (ไม่มีกลิ่น
  // ที่ผลิตขึ้นใหม่ — กลิ่นมีอยู่ก่อนแล้วบนแถว) ⇒ กดใส่ราคาแล้วได้ 400 ตลอดกาล
  // ⇒ ลูกค้าคอนเฟิร์มแล้วแถวค้างที่ `awaiting_price` **ถาวร ปิดใบไม่ได้**
  //
  //   แถวผูกกลิ่นอย่างเดียว → หัวน้ำหอม `RM_F` ต่อกิโล
  //   แถวผูกสูตร (พัฒนาสูตร · พัฒนากลิ่นที่ส่งเป็นสินค้า ม-148) → เบสที่ใส่กลิ่น `RM_FB` ต่อกิโล
  //
  // ⭐ ช่องที่ใส่ได้มาจาก `rowPriceSlots` — โมดัลใส่ราคาถามตัวเดียวกัน (ป้าย F · B · FB ตรงกับที่ API รับ)
  // ⚠️ **ไม่ใช่ราคาต่อชิ้นของผลิตภัณฑ์** — ราคาสินค้าสำเร็จรูปต้องรวมบรรจุภัณฑ์
  // และค่าผลิต ซึ่งเป็นงานของใบขอราคาผลิต ไม่ใช่ของ RD
  /* ⚠️ แถวที่ผูกสูตร: ช่อง F ลงกลิ่นของ **สูตร** (`formulas.scentId`) ไม่ใช่กลิ่นที่แถวอ้างตอนเปิดใบ — RD แก้กลิ่นของสูตร
     ในทะเบียนได้ ⇒ ใช้ของแถวแล้วราคา F ไปลงกลิ่นเก่า ขณะที่หน้าสูตรอ่าน F จากกลิ่นใหม่ (รีวิว ม-148 รอบสอง)
     · สถานะกลิ่นตรวจที่ `loadPriceSlotSource` ตัวเดียวกับปุ่มราคาหน้าทะเบียนสูตร */
  //   · ตัวคิดเดียวกับที่ GET ติดให้โมดัล (`rowPriceSlotsLive`) — จอกับ API เปิดช่องชุดเดียวกันเสมอ
  let slots;
  try {
    slots = await rowPriceSlotsLive(supabase, row);
  } catch (e) {
    return Response.json({ error: `อ่านทะเบียนกลิ่น/สูตรไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  const body = await request.json().catch(() => ({}));
  /* ⭐ **"ใช้ราคานี้" — ผูกราคาที่มีอยู่แล้วในทะเบียน ไม่ออก rev ใหม่** (ม-153 · มติผู้ใช้ 2026-10-01) — RD ใส่ราคาที่หน้า
     สูตร/กลิ่นไปก่อนลูกค้าคอนเฟิร์มเป็นเรื่องปกติ (วัด prod 01/10: 5 จาก 7 แถวที่รอราคา) · เดิมต้องพิมพ์เลขเดิมซ้ำ
     ได้ rev ซ้ำในประวัติราคา · ผ่านด่านชุดเดียวกับทางใส่ราคาทั้งหมดข้างบนก่อนถึงตรงนี้ */
  if (body?.useCurrent) {
    return linkCurrentPrice({ supabase, request, user, id, itemId, before, row, body });
  }
  // ⚠️ F/B/FB **ไม่มีชั้นจำนวน** (มติผู้ใช้ 2026-08-03) — ราคาต่อกิโลเดียวต่อช่อง ไม่ลดตามจำนวน
  const { entries, error: priceError } = normalizeSlotPrices(slots, body);
  if (priceError) return Response.json({ error: priceError }, { status: 400 });

  const nowIso = new Date().toISOString();
  let written;
  try {
    // ตัวตนวัสดุ + ประทับ pointer + ต่อ rev — ก้อนเดียวกับปุ่มใส่ราคาบนหน้าทะเบียน
    // (`priceRegistryEntry` ผ่าน `priceRegistrySlots`) ห้ามเขียนซ้ำที่นี่ ไม่งั้นสองทางเข้าเพี้ยนหากัน
    // ⚠️ ทะเบียนต้นทาง **คนละตาราง** (F = กลิ่น · B/FB = สูตร) แต่หน้าตาที่ต้องใช้เหมือนกัน (ชื่อ + ลูกค้า)
    written = await priceRegistrySlots(supabase, {
      entries,
      loadSource: (slot) => loadPriceSlotSource(supabase, slot),
      validUntil: body.validUntil || null,
      note: body.note || null,
      askItemId: row.id,
      user,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 400 });
  }

  try {
    /* ⭐ แถวชี้ rev **ช่องหลัก** (FB > B > F) — ช่องอื่นหาเจอจาก `material_price_revisions.sourceAskItemId`
       (ทุก rev ที่เขียนจากขั้นนี้ประทับ id ของแถวไว้) ⇒ จอโชว์ครบทุกช่องได้โดยไม่ต้องมีคอลัมน์ใหม่ */
    const main = mainPriceEntry(written);
    const revision = main.revision;

    await settleRow(supabase, { id, itemId, revisionId: revision.id, user, nowIso });

    // หนึ่งเหตุการณ์ต่อการใส่ราคาหนึ่งครั้ง — ทุกช่องในบรรทัดเดียว (ช่องไหนลงทะเบียนตัวไหนบอกด้วยรหัส)
    const lines = written.map((w) => `${w.slot.short} ${fmtNumber(w.price)}`
      + (w.slot.stampColumn === main.slot.stampColumn ? '' : ` (${w.source.code || w.source.name})`));
    const target = main.source.code || main.source.name;
    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: 'quoted',
      body: `ใส่ราคา ${target} — ${lines.join(' · ')} ฿/กก.`,
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, answerStatus: 'done', answeredRevisionId: revision.id },
      summary: `ใส่ราคา ${written.map((w) => w.slot.short).join('/')} ${target} (${before.docNo || id})`,
      request,
    });

    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

/* ── ปิดแถวด้วย rev ราคา + ตราปิดฝั่งฝ่ายของใบ — ทางใส่ราคาใหม่กับทาง "ใช้ราคานี้" ต้องจบแถวแบบเดียวกันทุกช่อง ── */
async function settleRow(supabase, { id, itemId, revisionId, user, nowIso }) {
  const { error } = await supabase.from('dept_request_items').update({
    answerStatus: 'done',
    answeredRevisionId: revisionId,
    declineReason: null,
    answeredById: user?.id ?? null,
    answeredByName: user?.name ?? null,
    answeredAt: nowIso,
    updatedAt: nowIso,
  }).eq('id', itemId);
  if (error) throw error;

  // ตอบครบทุกแถว → ใบได้ตราปิดฝั่งฝ่าย (`answeredAt`) เอง — ดู `closure.js`
  const after = await findRequest(supabase, id);
  const closurePatch = requestRowsClosurePatch(after, after.items || [], nowIso, {
    actorSide: requestActorSide(user, after),
  });
  if (Object.keys(closurePatch).length) {
    const { error: headError } = await supabase.from('dept_requests')
      .update({ ...closurePatch, updatedAt: nowIso }).eq('id', id);
    if (headError) throw headError;
  }
}

/* ── "ใช้ราคานี้" (ม-153) — body `{ useCurrent: { revisionId } }` ─────────────────────────────────────────────
   ⭐ server คิดเองว่าราคาไหนคือ "ราคานี้" (`currentPriceToUse` ตัวเดียวกับหน้า "รอใส่ราคา") แล้วเทียบกับ rev ที่จอเห็น
   ⇒ มีคนออกราคาใหม่ระหว่างที่จอเปิดค้าง = 409 ให้โหลดใหม่ ไม่ใช่ผูกเลขที่ RD ไม่เคยเห็น
   ⚠️ **ไม่แตะทะเบียนวัสดุเลย** — rev เป็น immutable · แถวชี้ rev เดิมผ่าน `answeredRevisionId` เท่านั้น (ราคาบนใบอ่าน
   ตาม pointer นี้อยู่แล้ว — `attachRowPrice`) · ช่องอื่นของแถวไม่ถูกผูก (อยู่ในทะเบียนตามเดิม) */
async function linkCurrentPrice({ supabase, request, user, id, itemId, before, row, body }) {
  let live;
  try {
    [live] = await rowsSlotPricesLive(supabase, [row]);
  } catch (e) {
    return Response.json({ error: `อ่านราคาในทะเบียนไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  const { entry, blocker } = currentPriceToUse(live?.current || []);
  if (!entry) {
    return Response.json({ error: 'ยังไม่มีราคาในทะเบียนให้ใช้ — กด "ใส่ราคา" แทน' }, { status: 409 });
  }
  if (blocker) return Response.json({ error: blocker }, { status: 409 });
  const expected = body.useCurrent?.revisionId || null;
  if (!expected || expected !== entry.price.revisionId) {
    return Response.json({
      error: 'ราคาในทะเบียนเปลี่ยนไปแล้วระหว่างที่หน้าเปิดอยู่ — โหลดใหม่แล้วตรวจราคาอีกครั้ง',
    }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  try {
    await settleRow(supabase, { id, itemId, revisionId: entry.price.revisionId, user, nowIso });

    const target = entry.source?.code || entry.source?.name || 'ทะเบียน';
    const rev = entry.price.revisionNo != null ? ` (rev ${entry.price.revisionNo})` : '';
    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: 'quoted',
      body: `ใช้ราคาในทะเบียน ${target} — ${entry.short} ${fmtNumber(entry.price.unitPrice)} ฿/กก.${rev}`,
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, answerStatus: 'done', answeredRevisionId: entry.price.revisionId },
      summary: `ใช้ราคา ${entry.short} ในทะเบียน ${target} (${before.docNo || id})`,
      request,
    });

    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
