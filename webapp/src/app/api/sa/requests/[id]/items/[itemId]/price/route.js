// ── ขั้นใส่ราคาของแถวสายพัฒนา — ขั้นสุดท้ายในใบเดิม (P3c) ─────────────────
//
// POST { price, validUntil?, note? }
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
import { canPriceRow } from '@/lib/requests/rowStage';
import { normalizeQuotedPrice } from '@/lib/materialPrices';
import { findRequest, priceRegistryEntry } from '@/lib/materialPricesAdmin';
import { findFormula, findScent } from '@/lib/master/scentFormulaAdmin';
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
  //   พัฒนากลิ่น → กลิ่นที่เพิ่งส่ง = หัวน้ำหอม `RM_F` ต่อกิโล
  //   พัฒนาสูตร  → สูตรที่เพิ่งส่ง  = เนื้อสาร  `RM_FB` ต่อกิโล
  //
  // ⚠️ **ไม่ใช่ราคาต่อชิ้นของผลิตภัณฑ์** — ราคาสินค้าสำเร็จรูปต้องรวมบรรจุภัณฑ์
  // และค่าผลิต ซึ่งเป็นงานของใบขอราคาผลิต ไม่ใช่ของ RD
  const priced = row.producedFormulaId
    ? { kind: 'RM_FB', stampColumn: 'formulaId', id: row.producedFormulaId }
    : row.producedScentId
      ? { kind: 'RM_F', stampColumn: 'scentId', id: row.producedScentId }
      : null;
  if (!priced) {
    return Response.json({
      error: 'รายการนี้ยังไม่ผูกกลิ่นหรือสูตรในทะเบียน — ใส่ราคาไม่ได้',
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  // ⚠️ F/FB **ไม่มีชั้นจำนวน** (มติผู้ใช้ 2026-08-03) — หัวน้ำหอมคิดราคาต่อกิโลเดียว
  // ไม่ลดตามจำนวน · รับ `price` ตัวเดียว ไม่ใช่ tiers
  const { value: price, error: priceError } = normalizeQuotedPrice(priced.kind, body.price);
  if (priceError) return Response.json({ error: priceError }, { status: 400 });

  const nowIso = new Date().toISOString();
  try {
    // ⚠️ ทะเบียนต้นทาง **คนละตาราง** แต่หน้าตาที่ต้องใช้เหมือนกัน (ชื่อ + ลูกค้า)
    const source = priced.stampColumn === 'formulaId'
      ? await findFormula(supabase, priced.id)
      : await findScent(supabase, priced.id);
    if (!source) {
      return Response.json({ error: 'ไม่พบกลิ่นหรือสูตรในทะเบียน' }, { status: 400 });
    }

    // ตัวตนวัสดุ + ประทับ pointer + ต่อ rev — ก้อนเดียวกับปุ่มใส่ราคาบนหน้าทะเบียน
    // (`priceRegistryEntry`) ห้ามเขียนซ้ำที่นี่ ไม่งั้นสองทางเข้าเพี้ยนหากัน
    const { revision } = await priceRegistryEntry(supabase, {
      kind: priced.kind,
      stampColumn: priced.stampColumn,
      source,
      price,
      validUntil: body.validUntil || null,
      note: body.note || null,
      askItemId: row.id,
      user,
    });

    const { error } = await supabase.from('dept_request_items').update({
      answerStatus: 'done',
      answeredRevisionId: revision.id,
      declineReason: null,
      answeredById: user?.id ?? null,
      answeredByName: user?.name ?? null,
      answeredAt: nowIso,
      updatedAt: nowIso,
    }).eq('id', itemId);
    if (error) throw error;

    // ตอบครบทุกแถว → ใบได้ตราปิดฝั่งฝ่าย (`answeredAt`) เอง — ดู `closure.js`
    const after = await findRequest(supabase, id);
    const closurePatch = requestRowsClosurePatch(after, after.items || [], nowIso);
    if (Object.keys(closurePatch).length) {
      const { error: headError } = await supabase.from('dept_requests')
        .update({ ...closurePatch, updatedAt: nowIso }).eq('id', id);
      if (headError) throw headError;
    }

    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: 'quoted',
      body: `ใส่ราคา ${source.code || source.name} — ${fmtNumber(price)} ฿/กก.`,
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, answerStatus: 'done', answeredRevisionId: revision.id },
      summary: `ใส่ราคา ${source.code || source.name} (${before.docNo || id})`,
      request,
    });

    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
