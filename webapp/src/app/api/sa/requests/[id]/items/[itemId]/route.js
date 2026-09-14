// ── ก้าวของแถวคำร้อง (mig 0202) ──────────────────────────────────────────
//
// PATCH { hop: 'ack'|'ready'|'pickup'|'send'|'outcome'|'receive'|'refuse'|'unready',
//         at?, dueAt?, outcome?, confirmedQty?, note? }
//
// ⭐ ทำไมเป็นเส้นรายแถว ไม่ใช่ action บน PATCH ของใบ: **สถานะอยู่ที่แถว ไม่ใช่ที่ใบ**
// (คนละหมวดส่งไม่พร้อมกันได้) ⇒ การกดแต่ละก้าวเป็นเรื่องของแถวนั้นล้วน ๆ
//
// ⚠️ ด่านเรียงสามชั้น และ **ห้ามสลับลำดับ**:
//   1 อ่านใบนี้ได้ไหม (canReadRequestRow — ด่านเดียวกับ GET)
//   2 ก้าวนี้เป็นของฝั่งเรารึเปล่า (HOP_OWNER)
//   3 แถวอยู่ขั้นที่เดินก้าวนี้ได้ไหม + ค่าที่ส่งมาครบไหม (hops.js)
// สลับ 1 กับ 2 เมื่อไร คนนอกจะรู้ได้ว่า id นี้มีอยู่จริงจากข้อความ error ที่ต่างกัน
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import {
  REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS,
  canAnswerRequest, canManageRequest, canReadRequestRow,
} from '@/lib/deptRequests';
import { requestRowsClosurePatch } from '@/lib/requests/stages';
import {
  HOP_OWNER, followUpRowFrom, hopLabel, hopLabelFor, hopPatch, hopStageError, hopUpdateKind,
  hopValuesError,
} from '@/lib/requests/hops';
import { isDocLineKind } from '@/lib/requests/docTypes';
import { findRequest } from '@/lib/materialPricesAdmin';
import { businessDate } from '@/lib/businessDate';
import { normalizeFormulaDelivery } from '@/lib/requests/delivery';
import { reworkHopError } from '@/lib/requests/rework';
import { findFormulaByIdentity } from '@/lib/master/formulas';
import {
  countProductsUsingFormula, createFormula, findScent, loadFormulas, updateFormula,
} from '@/lib/master/scentFormulaAdmin';
import {
  formulaActionFor, formulaBindWarning, planFormulaDelivery, reworkParentFormulaId, reworkUndoDecision,
} from '@/lib/requests/formulaRework';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { canAnswerRequestsFor } from '@/lib/permissions';
import { deleteRequestRowError, registryOwnedByRow } from '@/lib/requests/rowDelete';
import { countRegistryRefs } from '@/lib/master/scentFormulaAdmin';
import { purgeAttachments } from '@/lib/master/attachments';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
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

  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });

  // ⚠️ ใบต้องเปิดอยู่ — hopStageError ดูแต่ขั้นของ *แถว* ซึ่งไม่รู้เรื่องใบเลย ⇒ แถวใน
  // ใบร่าง (ยังไม่ส่ง) หรือใบที่ถูกยกเลิก/ปิดไปแล้ว จะเดินก้าวได้ทั้งที่ไม่ควร
  if (!REQUEST_OPEN_STATUSES.includes(before.status)) {
    return Response.json({
      error: `คำร้องอยู่สถานะ "${REQUEST_STATUS_LABELS[before.status] || before.status}" — บันทึกขั้นตอนของรายการไม่ได้`,
    }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const hop = body.hop;
  const owner = HOP_OWNER[hop];
  if (!owner) return Response.json({ error: 'ก้าวไม่ถูกต้อง' }, { status: 400 });

  // ── 2) ก้าวนี้เป็นของฝั่งไหน ────────────────────────────────────────────
  // ⚠️ ผู้สังเกตการณ์ (executive) อ่านได้ทุกใบ แต่กดก้าวไม่ได้ — canAnswerRequest /
  // canManageRequest ไม่ให้ผ่านอยู่แล้ว ไม่ต้องกันซ้ำ
  const allowed = owner === 'dept'
    ? canAnswerRequest(user, before)
    : canManageRequest(user, before);
  if (!allowed) {
    return Response.json({
      error: owner === 'dept'
        ? `ก้าวนี้เป็นของฝ่าย ${before.dept}`
        : 'ก้าวนี้เป็นของผู้เปิดคำร้อง',
    }, { status: 403 });
  }

  // ⚠️ **สายพัฒนากลิ่นส่งของผ่านโมดัลเท่านั้น** — ปุ่มบนรางประทับแค่วัน ไม่สร้าง
  // กลิ่นเข้าทะเบียน ⇒ แถวจะออกจากคิวรอเติมทั้งที่ยังไม่มีกลิ่นผูก แล้วค้างถาวร
  const reworkError = reworkHopError(row, hop);
  if (reworkError) return Response.json({ error: reworkError }, { status: 409 });

  // ── 3) ขั้นตอน + ค่าที่ส่งมา ────────────────────────────────────────────
  const stageError = hopStageError(row, hop);
  if (stageError) return Response.json({ error: stageError }, { status: 409 });
  // ⚠️ `lineKind` มาจาก **แถวจริง** ไม่ใช่ body — กฎของก้าวบางข้อขึ้นกับรูปร่างบรรทัด
  // (ส่งเอกสารการเงินต้องมีเลขที่ · B-3) · รับจาก client เมื่อไรก็ข้ามด่านได้ทันที
  const valueError = hopValuesError(hop, body, { lineKind: row.lineKind });
  if (valueError) return Response.json({ error: valueError }, { status: 400 });

  /* ── ต้องรับเรื่องที่ "ใบ" ก่อน ถึงจะลงมือรายรายการได้ ────────────────────
     ⭐ **มติผู้ใช้ 2026-08-20**: *"ปุ่มรับเรื่องมันเป็นระดับใบนะ ไม่ใช่ระดับรายการ
     รับเรื่องก่อนมั้ย ค่อยโชว์ปุ่มระดับรายการ"*

     🐞 ของเดิม: ก้าว `ack` รายแถวดันสถานะของ **ทั้งใบ** ให้เอง (รับเรื่องแถวแรก =
     รับเรื่องทั้งใบ) ⇒ มีสองทางที่ทำสิ่งเดียวกัน และทางรายแถวข้ามด่านของใบมาแล้วครั้ง
     หนึ่ง (ผลตรวจรอบ 12 · ค-2) · ตอนนี้ตัดให้เหลือ **ทางเดียว**: ปุ่ม "รับเรื่อง" ที่ใบ

     ⚠️ ปิดที่ server ด้วย ไม่ใช่แค่ซ่อนปุ่ม — คนที่เปิดหน้าค้างไว้ตั้งแต่ก่อนรับเรื่อง
     ยังยิงก้าวรายแถวได้ถ้าไม่มีด่านนี้ */
  if (before.status === 'pending') {
    return Response.json({
      error: `ยังไม่ได้รับเรื่อง — กด "รับเรื่อง" ที่ใบก่อน แล้วค่อยลงมือรายรายการ`,
    }, { status: 409 });
  }

  // ── ส่งของของ "พัฒนาผลิตภัณฑ์" = สูตรเข้าทะเบียนในจังหวะเดียวกัน (P4b) ──
  //
  // ⭐ ต่างจากพัฒนากลิ่นตรงที่ **แถวมีอยู่แล้ว** ⇒ เป็นการขยายก้าว `ready`
  // ไม่ใช่สร้างแถวใหม่ · หมวดกับกลิ่นอยู่บนแถวแล้วและ **คือตัวตนของสูตรพอดี**
  // จึงไม่ถามซ้ำ (ถามซ้ำ = เปิดทางให้กรอกต่างจากที่ขอไว้)
  let formulaDelivery = null;
  if (hop === 'ready' && row.lineKind === 'product_dev') {
    const { value, error } = normalizeFormulaDelivery(body);
    if (error) return Response.json({ error }, { status: 400 });
    formulaDelivery = value;
  }

  // ── ส่งเอกสารต้องมีไฟล์แนบบนแถวก่อน (ม-89) ─────────────────────────────
  //
  // ⭐ มติผู้ใช้: "การส่งเอกสาร RD ต้องแนบไฟล์เอกสารด้วย หลายไฟล์ได้" — ก้าวส่ง
  // ของสายเอกสารที่ไม่มีไฟล์คือการบอกว่า "ส่งแล้ว" ทั้งที่ไม่มีอะไรให้รับ ⇒ SA กด
  // "ได้รับแล้ว" ไม่ได้จริง และแท็บเอกสารของดีลจะขึ้นแถวที่เปิดแล้วว่างเปล่า
  // · หลายไฟล์ได้อยู่แล้ว (AttachmentsPanel ไม่จำกัดจำนวน) — ด่านนี้ขอแค่ ≥ 1
  if (hop === 'ready' && isDocLineKind(row.lineKind)) {
    const { count, error: fileError } = await supabase
      .from('attachments').select('id', { count: 'exact', head: true })
      .eq('entityType', 'dept_request_item').eq('entityId', row.id);
    if (fileError) return Response.json({ error: fileError.message }, { status: 500 });
    if (!count) {
      return Response.json({
        // ชื่อหน้าต่างต้องตรงกับปุ่มจริง — ก้าวส่งชื่อ "ส่งงาน" ทุกสายแล้ว (ม-120)
        error: 'ต้องแนบไฟล์เอกสารบนรายการนี้ก่อนกดส่ง — แนบได้หลายไฟล์ในหน้าต่างส่งงาน',
      }, { status: 400 });
    }
  }

  const nowIso = new Date().toISOString();
  // ⚠️ วันของก้าวต้องเป็น **วันไทย** ไม่ใช่วัน UTC — ระหว่างเที่ยงคืนถึง 07:00 น.
  // ของไทย UTC ยังเป็นเมื่อวาน ⇒ ก้าวที่กดตอนเช้ามืดจะถูกบันทึกล่วงหน้าไปหนึ่งวัน
  // และเส้นวัด lead time จะติดลบทั้งแถว
  const today = businessDate();

  try {
    const patch = { ...hopPatch(hop, body, user, today, { lineKind: row.lineKind }), updatedAt: nowIso };

    let deliveryWarning = null;
    let archivedFormula = null;
    let createdFormula = null;
    let expectedFormulaAction = null;
    let guardFormulaAction = false;
    if (formulaDelivery) {
      /* ⭐ **รอบแก้ = สูตรใหม่ที่ชี้กลับสูตรเดิม · เก็บสูตรเดิมเป็นเลิกใช้** (ม-147 · เหตุผลที่ `formulaRework.js`)
         ⚠️ **หมวด × กลิ่นคู่นี้อาจมีสูตรอื่นอยู่แล้ว** (ไม่ใช่ต้นทาง) ⇒ ผูกกับตัวนั้น ไม่ใช่ตีกลับให้ผู้ใช้ไปแก้เอง
         (ล้มแล้วแถวจะค้างตลอดกาล — บทเรียนเดียวกับ "จัดระเบียบ" ของ 0171) · แต่ **ต้องบอก** ว่าฟอร์มไม่ได้ใช้
         🐞 เดิมผูกเงียบ ๆ ทุกกรณี รวมรอบแก้ ⇒ สูตรรอบแก้ไม่เคยเกิด และของที่ RD กรอกหายไม่มีใครรู้ */
      /* ⚠️ **อ่านบันทึกการกระทำของแถวสด ๆ ก่อนแตะทะเบียน** (รีวิว ม-147 รอบหก) — สองอย่างในคำสั่งเดียว:
         · mig 0358 ยังไม่รัน = ตีกลับตรงนี้ **ก่อน**สร้าง/เก็บสูตร (ไม่งั้นทาง create สร้างสูตรแล้วล้มตอนเขียนแถว = สูตรกำพร้าทุกครั้งที่กด)
         · ค่าที่แผนใช้ต้องเป็นของตอนนี้ ไม่ใช่ของตอนโหลดใบ (อีกแท็บประกาศเจตนาแทรกได้) */
      const { data: freshRow, error: probeError } = await supabase.from('dept_request_items')
        .select('"producedFormulaAction"').eq('id', itemId).maybeSingle();
      if (probeError) {
        console.error('[requests] อ่าน producedFormulaAction ไม่ได้:', probeError.message);
        // ไม่มีคอลัมน์ (42703) เท่านั้นที่แปลว่ายังไม่รัน mig 0358 — error อื่น (เน็ต · 5xx) ห้ามส่งคนไปหาผู้ดูแลเรื่อง migration
        return probeError.code === '42703'
          ? Response.json({ error: 'ระบบยังไม่พร้อมส่งสูตร (ฐานข้อมูลยังไม่อัปเดต mig 0358) — แจ้งผู้ดูแลระบบ' }, { status: 503 })
          : Response.json({ error: 'อ่านรายการไม่สำเร็จ — ลองกดส่งอีกครั้ง' }, { status: 500 });
      }
      if (!freshRow) return Response.json({ error: 'รายการนี้ถูกลบไปแล้ว — โหลดหน้าใหม่' }, { status: 409 });
      const rowNow = { ...row, producedFormulaAction: freshRow.producedFormulaAction ?? null };
      const existing = findFormulaByIdentity(
        await loadFormulas(supabase, { status: null }),
        { categoryCode: row.categoryCode, scentId: row.scentId },
      );
      const plan = planFormulaDelivery({
        row, items: before.items || [], existing, clientDerivedFrom: formulaDelivery.derivedFromFormulaId,
      });
      /* 🐞 **ต้องส่งลูกค้าไปด้วย** — มติ 2026-08-10 กลับทิศจาก mig 0207: server เลิก
         *derive* ลูกค้าจากกลิ่น แล้วเปลี่ยนเป็น *ตรวจ* ว่าลูกค้าที่ส่งมาตรงกับเจ้าของกลิ่น
         · ฟอร์มทะเบียนกับ "จัดระเบียบ" ปรับตามแล้ว แต่เส้นคำร้องถูกลืม ⇒ RD กดส่งงาน
         ทีไรก็โดน "สูตรฐาน (ไม่ผูกลูกค้า) เลือกกลิ่นของลูกค้าไม่ได้" ทุกครั้งที่แถวมีกลิ่น
         และยังไม่มีสูตรของคู่ (หมวด × กลิ่น) นั้น
         ⚠️ ลูกค้ามาจาก **ใบ** ก่อน แล้วค่อยถอยไปเจ้าของกลิ่น (ใบภายในไม่มีลูกค้า) —
         ด่าน `formulaScentCustomerError` ยังตรวจว่าทั้งสองเป็นคนเดียวกันเสมอ */
      const create = async () => {
        const scent = row.scentId ? await findScent(supabase, row.scentId) : null;
        return createFormula(supabase, {
          name: formulaDelivery.name,
          code: formulaDelivery.code,
          formulaDate: formulaDelivery.formulaDate,
          customerTradeName: formulaDelivery.customerTradeName,
          derivedFromFormulaId: plan.derivedFromFormulaId,
          note: formulaDelivery.note,
          categoryCode: row.categoryCode,
          scentId: row.scentId,
          customerId: before.customerId || scent?.customerId || null,
          dealId: before.dealId || null,
        }, user, { accepted: true });
      };
      // ต้นทางยังเป็นร่าง ฯลฯ — ตีกลับ **ก่อนเขียนอะไร** พร้อมทางออก (ไม่ใช่ 500 จาก CHECK ทุกครั้งที่กดซ้ำ)
      if (plan.kind === 'blocked') return Response.json({ error: plan.error }, { status: 409 });
      let formula;
      if (plan.kind === 'bind') {
        formula = existing;
        if (plan.warn) deliveryWarning = formulaBindWarning(existing);
      } else if (plan.kind === 'revise') {
        /* ⚠️ **เก็บก่อน สร้างทีหลัง** — ดัชนีตัวตนไม่ให้มีสูตรใช้งานสองตัวของคู่เดียว · ไม่มี transaction ⇒ สร้างล้ม
           (รหัสซ้ำ · ช่องไม่ผ่าน) ต้องคืนสถานะสูตรเดิม ไม่งั้นคู่นี้ไม่มีสูตรใช้งานเลยทั้งที่ยังไม่ได้ส่งอะไร */
        /* ⚠️ **ประกาศเจตนา `revise` ลงแถวก่อนแตะทะเบียน** (รีวิว ม-147 รอบสี่) — ทะเบียนถูกแก้ก่อนเขียนแถว ⇒ เขียนแถวล้มแล้ว
           ส่งซ้ำ แผนรอบนั้นไม่ใช่ revise แล้ว (ผูกสูตรกำพร้าของตัวเอง) · ไม่มีบันทึก = ลบรายการถอยไม่ได้ ต้นทางค้างเลิกใช้ถาวร
           · `producedFormulaId` ยังว่าง ⇒ ทางลบยังไม่ถอยอะไร · mig 0358 ยังไม่รัน = ล้มตรงนี้ ก่อนทะเบียนถูกแตะ */
        const { data: intentRows, error: intentError } = await supabase.from('dept_request_items')
          .update({ producedFormulaAction: 'revise', updatedAt: nowIso })
          .eq('id', itemId).is('readyAt', null).select('id');
        if (intentError) throw intentError;
        if (!intentRows?.length) {
          return Response.json({ error: 'รายการนี้เพิ่งถูกส่งไปแล้ว — โหลดหน้าใหม่' }, { status: 409 });
        }
        /* ล้างเจตนาเมื่อความพยายามนี้จบโดย **ทะเบียนเหมือนเดิม** (เก็บไม่ลง · สร้างล้มแล้วคืนสำเร็จ) — เจตนาค้าง = ส่งรอบหลัง
           ถูกบันทึกเป็น revise ทั้งที่ไม่ได้เก็บอะไร แล้วลบรายการไปคืนต้นทางที่คนเลิกใช้เองทีหลัง (รีวิว ม-147 รอบห้า)
           · เงื่อนไข "ยังไม่ถูกส่ง" กันลบเจตนาของอีกคำขอที่ส่งสำเร็จไปแล้ว · ล้างไม่ได้ไม่ throw (แค่ log) */
        const clearIntent = async () => {
          const { error: clearError } = await supabase.from('dept_request_items')
            .update({ producedFormulaAction: null, updatedAt: nowIso })
            .eq('id', itemId).is('readyAt', null).is('producedFormulaId', null).eq('producedFormulaAction', 'revise');
          if (clearError) console.error('[requests] ล้างเจตนา revise ไม่สำเร็จ:', itemId, clearError.message);
        };
        try {
          await updateFormula(supabase, existing.id, { status: 'archived' });
        } catch (archiveError) {
          // เน็ตสะดุดอาจซ่อนการเก็บที่ลงไปแล้ว — อ่านสถานะจริงก่อนตัดสินว่าทะเบียนเหมือนเดิม
          const { data: nowParent } = await supabase.from('formulas').select('id, status').eq('id', existing.id).maybeSingle();
          if (nowParent && nowParent.status !== 'archived') await clearIntent();
          throw archiveError;
        }
        // ⚠️ audit ทันทีที่เก็บสำเร็จ ไม่ใช่หลังสร้าง — สร้างล้ม+คืนล้ม (หรือกดส่งพร้อมกันสองคน) ต้องยังมีร่องรอยว่าใครเก็บ
        await recordAudit({
          user, action: 'update', entityType: 'formula', entityId: existing.id,
          before: existing, after: { ...existing, status: 'archived' },
          summary: `เลิกใช้สูตร ${existing.code || existing.name} — ส่งรอบแก้ของ ${row.label} (${before.docNo || id})`,
          request,
        });
        try {
          formula = await create();
        } catch (createError) {
          const restored = await updateFormula(supabase, existing.id, { status: existing.status }).then(() => true, (restoreError) => {
            console.error('[requests] คืนสถานะสูตรต้นทางไม่สำเร็จ:', existing.id, restoreError?.message);
            return false;
          });
          if (restored) {
            await recordAudit({
              user, action: 'update', entityType: 'formula', entityId: existing.id,
              before: { ...existing, status: 'archived' }, after: existing,
              summary: `คืนสถานะสูตร ${existing.code || existing.name} — ส่งรอบแก้ไม่สำเร็จ (${before.docNo || id})`,
              request,
            });
            await clearIntent();
          }
          // คืนไม่สำเร็จ = ต้นทางค้างเลิกใช้จากความพยายามนี้ ⇒ **เก็บเจตนาไว้** ส่งรอบหลังจะบันทึก revise ถอยได้ (`formulaActionFor`)
          throw createError;
        }
        archivedFormula = existing;
      } else {
        formula = await create();
      }
      patch.producedFormulaId = formula.id;
      if (plan.kind !== 'bind') createdFormula = formula;
      // จำว่าการส่งนี้ทำอะไรกับทะเบียน (mig 0358) — ลบรายการทีหลังถอยได้เฉพาะ `revise` · เดาจากทะเบียนทีหลังไม่ได้
      patch.producedFormulaAction = formulaActionFor({ plan, row: rowNow, items: before.items || [] });
      /* ⚠️ แผน bind/create คิดจากบันทึกที่อ่านก่อนหน้า — อีกคำขอประกาศเจตนา revise แทรกได้ (สองแท็บ) ⇒ เขียนเฉพาะเมื่อบันทึกยังเป็น
         ค่าที่แผนใช้ ไม่งั้นทับ revise ของอีกคนแล้วลบรายการถอยไม่ได้ (รีวิว ม-147 รอบห้า)
         ⚠️ **แผน revise ไม่ใส่เงื่อนไขนี้** (รอบหก) — มาถึงตรงนี้ได้แปลว่าคำขอนี้เก็บ+สร้างเองสำเร็จ ⇒ 'revise' ถูกเสมอ · อีกแท็บที่
         ล้มแล้ว `clearIntent` ล้างเจตนาทิ้งไประหว่างนั้นได้ ⇒ ใส่เงื่อนไข = 409 ทั้งที่ทะเบียนเปลี่ยนแล้ว + บันทึกหาย */
      guardFormulaAction = plan.kind !== 'revise';
      expectedFormulaAction = rowNow.producedFormulaAction;
      // ป้ายบนแถวเป็น snapshot ตอนขอ (หมวด · กลิ่น) — เติมรหัสสูตรที่ได้จริงต่อท้าย
      // ให้อ่านออกจากในคำร้องว่าได้สูตรตัวไหน โดยไม่ต้องเปิดทะเบียน
      patch.label = `${row.label} → ${formula.code || formula.name}`;
    }
    /* ส่งงาน = เขียนได้เฉพาะแถวที่ยังไม่ถูกส่ง — กดซ้ำ/สองแท็บ ต้องไม่ทับบันทึกของครั้งแรก (สูตร · การกระทำกับทะเบียน) แล้ว
       รายงานว่าสำเร็จพร้อมเธรด/audit ปลอม (รีวิว ม-147 รอบสี่) · ก้าวอื่นเขียนตามเดิม */
    let rowUpdate = supabase.from('dept_request_items').update(patch).eq('id', itemId);
    if (hop === 'ready') rowUpdate = rowUpdate.is('readyAt', null);
    // เฉพาะส่งสูตร — แถวเอกสาร/ใบวางบิลไม่แตะคอลัมน์ของ mig 0358
    if (formulaDelivery && guardFormulaAction) {
      rowUpdate = expectedFormulaAction
        ? rowUpdate.eq('producedFormulaAction', expectedFormulaAction)
        : rowUpdate.is('producedFormulaAction', null);
    }
    // ผลลูกค้าบันทึกได้ครั้งเดียว — สองแท็บกด "ขอให้แก้" พร้อมกันต้องไม่เกิดแถวรอบแก้สองแถว
    if (hop === 'outcome') rowUpdate = rowUpdate.is('outcome', null);
    const { data: updatedRows, error } = await rowUpdate.select('id');
    if (error) throw error;
    if (!updatedRows?.length) {
      // บอกเหตุที่ตรง: ถูกลบ · บันทึกไปแล้ว · อีกแท็บกำลังส่ง/เพิ่งล้ม — และบอกเสมอถ้าคำขอนี้แตะทะเบียนไปแล้ว
      const { data: still, error: stillError } = await supabase.from('dept_request_items')
        .select('id, "readyAt", "producedFormulaId"').eq('id', itemId).maybeSingle();
      /* อีกหน้าจอบันทึกรายการด้วยสูตรที่คำขอนี้เพิ่งสร้าง (ส่งซ้ำผูกสูตรกำพร้าของตัวเอง) = การส่งสำเร็จแล้วจริง ⇒ ไม่เรียกว่า
         "สูตรค้าง" (คนจะไปเลิกใช้สูตรที่รายการถืออยู่) · ร่องรอยการเก็บสูตรเดิมมีแค่คำขอนี้ที่รู้ ⇒ ลงเธรดให้ (รีวิว ม-147 รอบเจ็ด) */
      if (still?.readyAt && createdFormula && still.producedFormulaId === createdFormula.id) {
        if (archivedFormula) {
          await appendUpdate(supabase, {
            entityType: 'dept_request', entityId: id, kind: 'update',
            body: `ส่งงาน — ${row.label} · สูตรเดิม ${archivedFormula.code || archivedFormula.name} เปลี่ยนเป็นเลิกใช้`,
            user,
          }).catch(() => {});
        }
        return Response.json({ error: 'รายการนี้ถูกบันทึกจากอีกหน้าจอด้วยสูตรเดียวกันแล้ว — โหลดหน้าใหม่' }, { status: 409 });
      }
      const reason = stillError ? 'บันทึกรายการไม่สำเร็จ'
        : !still ? 'รายการนี้ถูกลบไปแล้ว'
          : still.readyAt ? 'รายการนี้เพิ่งถูกบันทึกไปแล้ว'
            : 'มีการส่งรายการนี้จากอีกหน้าจอพร้อมกัน';
      return Response.json({
        error: `${reason} — โหลดหน้าใหม่`
          + (archivedFormula || createdFormula
            ? ` (สูตร${createdFormula ? ` ${createdFormula.code || createdFormula.name} ที่เพิ่งสร้าง` : ''}`
              + `${archivedFormula ? ` · ${archivedFormula.code || archivedFormula.name} ที่เพิ่งเลิกใช้` : ''} ยังอยู่ในทะเบียน — ตรวจที่หน้ารายการทะเบียนสูตร)`
            : ''),
      }, { status: 409 });
    }

    // ── ลูกค้าขอให้แก้ = เกิดแถวใหม่เอง ─────────────────────────────────
    // ⭐ ไม่ใช่ปุ่มแยก — มันเป็น **ผลลัพธ์** ของการบันทึกคำตอบ ไม่ใช่การกระทำ
    // ถ้าให้คนกดเอง จะมีช่วงที่คำร้องค้างโดยไม่มีใครเห็นว่ายังมีงานเหลือ
    if (hop === 'outcome' && body.outcome === 'revise') {
      const nextOrder = Math.max(0, ...(before.items || []).map((i) => i.sortOrder || 0)) + 1;
      const { error: nextError } = await supabase.from('dept_request_items').insert({
        id: `DRI-${randomUUID()}`,
        ...followUpRowFrom(row, nextOrder),
        /* ⭐ **ใบรับเรื่องไปแล้ว แถวใหม่จึงไม่ต้องรับซ้ำ** (มติผู้ใช้ 2026-08-24) —
           รับเรื่องเป็นเรื่องของ *ใบ* · แถวรอบแก้ที่เกิดตอนใบเดินอยู่แล้วต้องเริ่มที่
           "กำลังทำ" ไม่ใช่ "รอรับเรื่อง" ซึ่งเป็นคลิกเปล่าที่ไม่มีข้อมูลใหม่
           ⚠️ วันมาจาก **วันที่รับเรื่องของใบ** ไม่ใช่วันนี้ — แถวนี้อยู่ใต้รอบรับเรื่อง
           เดิม ประทับวันนี้แล้วเส้นวัด lead time จะสั้นกว่าความจริง */
        // ⚠️ **แปลงเป็นวันไทยก่อนตัด** ไม่ใช่ `.slice(0,10)` ของ ISO ดิบ — ใบที่ถูกกดรับ
        // ระหว่างเที่ยงคืนถึง 07:00 น. ของไทย มี UTC เป็นเมื่อวาน (`businessDate` รับ
        // ค่าเวลาเข้ามาแปลงให้ได้อยู่แล้ว)
        ackAt: before.acknowledgedAt ? businessDate(before.acknowledgedAt) : null,
        ackById: before.acknowledgedById ?? null,
        ackByName: before.acknowledgedByName ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (nextError) throw nextError;
    }

    // ── ลูกค้าคอนเฟิร์ม = กลิ่นใช้งานได้จริง (มติผู้ใช้ 2026-08-12) ────────
    // เดิมทะเบียนค้าง "กำลังพัฒนา" จนกว่า RD จะไปกดเปลี่ยนเองอีกรอบ — ก้าวที่
    // แปลว่าลูกค้าอนุมัติเกิดตรงนี้แล้ว ทะเบียนต้องขยับตามเอง
    // ⚠️ flip เฉพาะ developing → active (เส้นเดียวที่ ALLOWED_TRANSITIONS ของ
    // ทะเบียนอนุญาตจากจุดนี้) — กลิ่นที่ถูกเก็บเข้ากรุระหว่างทางไม่ฟื้นเอง
    // ⚠️ ล้มแล้วไม่ throw — เหตุผลเดียวกับบล็อกวันส่งข้างล่าง
    if (hop === 'outcome' && body.outcome === 'confirmed' && row.producedScentId) {
      const { error: scentError } = await supabase.from('scents').update({
        status: 'active',
        updatedAt: nowIso,
      }).eq('id', row.producedScentId).eq('status', 'developing');
      if (scentError) console.error('[requests] เปลี่ยนสถานะกลิ่นเป็น active ไม่สำเร็จ:', scentError.message);
    }

    // ── วันส่งลูกค้าไหลกลับขึ้นทะเบียนกลิ่น (ม-66 · mig 0224) ─────────────
    //
    // ⭐ **ทะเบียนต้องตอบได้ว่ากลิ่นตัวนี้ถึงมือลูกค้าเมื่อไร** — ก่อนหน้านี้ `scents.sentAt`
    // ถูกเขียนตอน RD ส่งมอบให้ฝ่ายขาย ซึ่งเร็วกว่าความจริงเสมอ · ส่วนวันที่ลูกค้า
    // ได้รับจริง (แถวคำร้อง) ไม่เคยไหลกลับมาที่ทะเบียนเลย
    //
    // ⚠️ **เขียนทับได้เสมอ ไม่เช็คว่าว่างก่อน** — SA แก้วันที่ส่งย้อนหลังเป็นเรื่องปกติ
    // (กดผิดวันแล้วมาแก้) · เช็คว่าว่างก่อนแล้วการแก้ครั้งที่สองจะเงียบหายไป
    //
    // ⚠️ ล้มแล้ว **ไม่ throw** — ก้าวของแถวบันทึกสำเร็จไปแล้ว ย้อนไม่ได้ · ปล่อยให้
    // ทั้ง request ล้มจะได้ผู้ใช้กดซ้ำแล้วเจอ "ทำไปแล้ว" ทั้งที่ของจริงบันทึกไปรอบแรก
    if (hop === 'send' && row.producedScentId) {
      const { error: scentError } = await supabase.from('scents').update({
        sentAt: patch.sentAt,
        sentById: user?.id ?? null,
        sentByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('id', row.producedScentId);
      if (scentError) console.error('[requests] เขียนวันส่งลูกค้าลงทะเบียนกลิ่นไม่สำเร็จ:', scentError.message);
    }

    /* ── เลขใบกำกับไหลกลับลงงวดชำระ (mig 0348 · มติผู้ใช้ 2026-09-07) ─────
       ⭐ **ทางพิเศษ ไม่ใช่ทางหลัก** — ปกติ FN ออกใบกำกับแล้วบันทึกที่ทะเบียนการชำระ
       ตรง ๆ · เส้นนี้ใช้ตอนลูกค้าขอไฟล์ก่อนจ่าย จึงมีคำร้องเกิดก่อนงวด
       ⇒ ถ้างวดผูกคำร้องใบนี้ไว้ เลขที่ FN กรอกตอนกดส่งงานต้องไหลลงงวดเอง
       ไม่งั้น FN ต้องพิมพ์เลขเดิมซ้ำอีกที่ = เลขมีสองบ้านทันที

       ⚠️ **หนึ่งงวดเท่านั้น** — คำร้องใบหนึ่งแขวนได้งวดเดียวโดยกติกา (route ของงวด
       ตรวจตอน `link`) · เจอมากกว่าหนึ่งแถว = ข้อมูลเพี้ยน ไม่เดา ปล่อยให้ FN กรอกเอง
       ⚠️ **วันที่เติมให้เฉพาะตอนยังว่าง** — ของจริงคือวันบนใบกำกับซึ่งที่นี่ไม่รู้
       ใช้วันไทยของก้าวส่งเป็นค่าตั้งต้น แล้ว FN แก้ทีหลังได้ที่ทะเบียนการชำระ
       ⚠️ ล้มแล้ว **ไม่ throw** — ก้าวของแถวบันทึกสำเร็จไปแล้ว (เหตุผลเดียวกับสองบล็อกข้างบน) */
    if (hop === 'ready' && row.lineKind === 'billing_doc' && row.docType === 'tax_invoice'
      && patch.docNumber) {
      const { data: linked, error: linkedError } = await supabase
        .from('sales_order_installments')
        .select('id, "taxInvoiceDate"')
        .eq('billingRequestId', id)
        .limit(2);
      if (linkedError) {
        console.error('[requests] หางวดที่ผูกคำร้องใบกำกับไม่สำเร็จ:', linkedError.message);
      } else if (linked?.length === 1) {
        const { error: stampError } = await supabase.from('sales_order_installments').update({
          taxInvoiceNo: patch.docNumber,
          taxInvoiceRequestId: id,
          taxInvoiceItemId: itemId,
          taxInvoiceById: user?.id ?? null,
          taxInvoiceByName: user?.name ?? null,
          taxInvoiceAt: nowIso,
          ...(linked[0].taxInvoiceDate ? {} : { taxInvoiceDate: today }),
          updatedAt: nowIso,
        }).eq('id', linked[0].id);
        if (stampError) console.error('[requests] เขียนเลขใบกำกับลงงวดชำระไม่สำเร็จ:', stampError.message);
      }
    }

    /* ── ใบตามแถว ────────────────────────────────────────────────────────
       ⚠️ **ก้าวรายแถวไม่แตะการรับเรื่องของใบแล้ว** (มติผู้ใช้ 2026-08-20) — ใบต้องถูก
       รับเรื่องก่อนถึงจะมาถึงบรรทัดนี้ได้ (ด่านข้างบน) ⇒ เหลือแค่ผลของ "แถวครบ/ไม่ครบ" */
    const headPatch = {};
    /* ตอบครบทุกแถว → ใบได้ **ตราปิดฝั่งฝ่าย** (`answeredAt`) เอง · ไม่ครบเมื่อไรตรา
       ทั้งสองฝั่งหลุด (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง — ดู `closure.js`) */
    const after = await findRequest(supabase, id);
    Object.assign(headPatch, requestRowsClosurePatch(after, after.items || [], nowIso));
    if (Object.keys(headPatch).length) {
      const { error: headError } = await supabase
        .from('dept_requests').update({ ...headPatch, updatedAt: nowIso }).eq('id', id);
      if (headError) throw headError;
    }

    // ── ร่องรอย ─────────────────────────────────────────────────────────
    // ⚠️ ลงเธรดของ **ใบ** ไม่ใช่ของแถว — เธรดมีชุดเดียวต่อคำร้อง (ไม่มีเธรดซ้อนรายขั้น)
    const label = hopLabelFor(row, hop, body.outcome);
    /* ⚠️ **เหตุผลของการดึงกลับไม่มีคอลัมน์เก็บ** (ต่างจาก `refuse` ที่ลง
       `declineReason` บนแถว) — ก้าวนี้ล้างตราของก้าวส่งทิ้งอย่างเดียว ⇒ ถ้าไม่พ่วง
       เหตุผลไว้ในเธรด ผู้ขอจะเห็นแถวเด้งกลับเป็น "กำลังทำ" โดยไม่มีที่ไหนบอกว่าทำไม */
    const unreadyReason = hop === 'unready' ? String(body.note ?? '').trim() : '';
    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: hopUpdateKind(hop, body.outcome),
      body: `${label} — ${row.label}${unreadyReason ? ` · ${unreadyReason}` : ''}`
        // รอบแก้เก็บสูตรเดิม — ผลข้างเคียงที่ทะเบียนเห็น ต้องมีร่องรอยในใบด้วย
        + (archivedFormula ? ` · สูตรเดิม ${archivedFormula.code || archivedFormula.name} เปลี่ยนเป็นเลิกใช้` : ''),
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, ...patch },
      summary: `${label}: ${row.label} (${before.docNo || id})`, request,
    });

    const saved = await findRequest(supabase, id);
    return Response.json(deliveryWarning ? { ...saved, _warning: deliveryWarning } : saved);
  } catch (e) {
    // ดัชนีคู่ซ้ำ (mig 0356): รับเรื่องแถวที่คู่ หมวด × กลิ่น ซ้ำกับแถวที่รับไปแล้ว — ข้อความไทย ไม่ใช่ error ดิบของ DB
    if (e?.code === '23505' && /product_pair_uk/.test(e.message || '')) {
      return Response.json({
        error: 'รายการนี้ซ้ำหมวด × กลิ่นกับรายการอื่นที่รับเรื่องแล้ว — ลบรายการซ้ำ หรือคุยกับผู้ขอในเธรด',
      }, { status: 409 });
    }
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/* ── DELETE /api/sa/requests/[id]/items/[itemId] ──────────────────────────
   ลบรายการในคำร้อง **พร้อมของที่รายการนั้นสร้างไว้ในทะเบียน** (มติผู้ใช้ 2026-08-18)

   ⭐ ทำไมต้องลบสองอย่างในคำสั่งเดียว: 1 แถว = 1 direction = กลิ่น 1 ตัว ⇒ ลบอย่างเดียว
   จะเหลือของค้างเสมอ (แถวชี้ที่ว่าง หรือกลิ่นลอยไม่มีที่มา) · ด่านของ "ลบได้ไหม" อยู่ที่
   `lib/requests/rowDelete.js` ที่เดียว (มีเทสต์) จอกับ API จึงพูดตรงกัน

   ⚠️ **ลบแถวก่อน แล้วค่อยลบทะเบียน** — `producedScentId` เป็น RESTRICT (mig 0232)
   ลบทะเบียนก่อนจะชนที่ฐานข้อมูล
   ⚠️ **ทะเบียนลบเฉพาะตอนไม่มีใครอ้างต่อและยังไม่ `active`** — ใช้ด่านเดียวกับปุ่มลบ
   ในหน้าทะเบียน · ลบไม่ได้ก็ไม่ล้มทั้งคำสั่ง แค่บอกกลับว่าของยังอยู่ในทะเบียน */
export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id, itemId } = await params;

  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json({ error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 });
  }
  // ⚠️ ลบเป็นสิทธิ์ของ **ฝ่ายปลายทาง** — แถวเกิดจากการที่ฝ่ายกดส่งงาน คนที่พิมพ์ผิด
  // คือฝ่ายเดียวกันนั้น · ผู้ขอมีทางของตัวเอง (ตีกลับ / ยกเลิกใบ)
  if (!canAnswerRequestsFor(user, before.dept)) {
    return Response.json({ error: `ลบรายการได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }

  const row = (before.items || []).find((i) => i.id === itemId);
  const gate = deleteRequestRowError(before, row);
  if (gate) return Response.json({ error: gate }, { status: 409 });

  try {
    /* ⭐ **ลบรายการรอบแก้ที่ส่งสูตรแล้ว = ถอยการส่งให้ครบ** (ม-147 · รีวิวรอบสอง) — การส่งเก็บสูตรต้นทางเป็นเลิกใช้และ
       สร้างสูตรใหม่ ⇒ ลบแค่แถว = สูตรใหม่ค้างใช้งาน (ลบจากทะเบียนไม่ได้) + สูตรต้นทางค้างเลิกใช้ · แถวพัฒนาสูตร
       "ดึงกลับ" ไม่ได้ ⇒ ลบคือทางถอยทางเดียวของการส่งผิด ห้ามปิด
       ⇒ ถอยได้เมื่อ **แถวบันทึกไว้ว่าการส่งคือ `revise`** (mig 0358 — เดาจากทะเบียนไม่ได้: อีกใบของคู่เดียวกันทำรอบแก้ไว้
       แล้วแถวนี้แค่ผูก ก็เห็นสภาพเดียวกัน) · การส่งยังมีผล (ต้นทางยังเลิกใช้) · สูตรใหม่ **ยังไม่มีใครใช้ต่อ** — ใช้ต่อแล้ว
       = ตีกลับก่อนลบอะไร พร้อมบอกทางที่ทะเบียน (`reworkUndoDecision`)
       ⚠️ แถวที่ผูก/สร้าง/ไม่มีบันทึก ไม่ได้เก็บอะไร ⇒ ลบตามกติกาเดิม */
    let reviseUndo = null;
    const parentFormulaId = row?.lineKind === 'product_dev' ? reworkParentFormulaId(row, before.items || []) : null;
    if (row?.producedFormulaAction === 'revise' && parentFormulaId && row.producedFormulaId
        && row.producedFormulaId !== parentFormulaId) {
      const { data: pair, error: pairError } = await supabase.from('formulas')
        .select('id, code, name, status, "derivedFromFormulaId", "categoryCode", "scentId"')
        .in('id', [row.producedFormulaId, parentFormulaId]);
      if (pairError) throw pairError;
      const produced = (pair || []).find((f) => f.id === row.producedFormulaId) || null;
      const parent = (pair || []).find((f) => f.id === parentFormulaId) || null;
      let otherRefs = 0;
      let productCount = 0;
      let childCount = 0;
      if (produced) {
        // `countRegistryRefs` นับ `dept_request_items.producedFormulaId` ด้วย ⇒ แถวนี้เองนับอยู่หนึ่ง
        otherRefs = (await countRegistryRefs(supabase, 'formula', produced.id)) - 1;
        productCount = await countProductsUsingFormula(supabase, produced.id);
        // สูตรที่แก้ต่อจากสูตรรอบแก้ — `derivedFromFormulaId` เป็น SET NULL ⇒ ลบแล้วสายพันธุ์หายเงียบ
        const { count, error: childError } = await supabase.from('formulas')
          .select('id', { count: 'exact', head: true }).eq('derivedFromFormulaId', produced.id);
        if (childError) throw childError;
        childCount = count || 0;
      }
      const decision = reworkUndoDecision({ row, produced, parent, otherRefs, productCount, childCount });
      if (decision.kind === 'blocked') return Response.json({ error: decision.error }, { status: 409 });
      if (decision.kind === 'undo') reviseUndo = { produced, parent };
    }

    /* ⚠️ ไฟล์แนบของบรรทัดต้องถูกกวาดด้วย — polymorphic ไม่มี FK cascade ⇒ ลบแถวเฉย ๆ
       แล้วทั้งแถวไฟล์แนบและไฟล์บน Drive ค้างเป็นของกำพร้า · วัดบน prod 2026-08-25:
       แถวกำพร้าชนิด `dept_request_item` 3 แถว มาจากเส้นนี้
       ⚠️ เส้นลบอีกสองทางของบรรทัดเดียวกัน (ลบทั้งใบ · ลบวัสดุที่ถูกอ้าง) เรียก
       `purgeAttachments` อยู่แล้ว — เส้นนี้เป็นทางที่หลุด */
    /* ⚠️ **ลบแถวก่อน แล้วค่อยกวาดไฟล์** (รีวิว mig 0356) — ลบแถวล้มได้จริง: แถวลูกรอบแก้ถูก SET NULL เป็นแถว
       ต้นทางแล้วชนดัชนีคู่ซ้ำ (เพิ่งมีคนบันทึก "ลูกค้าขอแก้" ระหว่างกดลบ) · กวาดก่อน = แถวรอดแต่ไฟล์หายถาวร */
    /* ⚠️ ลบแบบมีเงื่อนไข `outcome IS NULL` — ด่านข้างบนอ่านแถวก่อนหลายรอบ ผู้ขอบันทึกผลลูกค้าแทรกได้ ⇒ แถวที่ลูกค้า
       เพิ่งตอบต้องไม่หาย (และสูตรรอบแก้ต้องไม่ถูกถอยตาม) · ไม่โดนแถวไหน = ตีกลับ ไม่ใช่เดินต่อ (รีวิว ม-147 รอบสาม) */
    const { data: deletedRows, error: rowError } = await supabase.from('dept_request_items')
      .delete().eq('id', itemId).is('outcome', null).select('id');
    if (rowError?.code === '23505') {
      return Response.json({ error: 'รายการนี้เพิ่งมีรอบแก้ต่อจากมัน — ลบไม่ได้แล้ว โหลดหน้าใหม่' }, { status: 409 });
    }
    if (rowError) throw rowError;
    if (!deletedRows?.length) {
      // บอกเหตุที่ตรง — ลบซ้ำ (สองแท็บ/กดสองที) ≠ ผู้ขอเพิ่งบันทึกผล
      const { data: still } = await supabase.from('dept_request_items').select('id').eq('id', itemId).maybeSingle();
      return Response.json({
        error: still ? 'รายการนี้เพิ่งมีการบันทึกผลลูกค้า — ลบไม่ได้แล้ว โหลดหน้าใหม่' : 'รายการนี้ถูกลบไปแล้ว — โหลดหน้าใหม่',
      }, { status: 409 });
    }
    await purgeAttachments('dept_request_item', itemId);

    /* ⭐ **คิดตราปิดของใบใหม่หลังลบแถว** (รีวิว ม-144 · บั๊กเดิมทุกหัวข้อที่มีแถว) — ลบแถวที่ค้างตัวสุดท้าย
       (เช่นแถวรอบแก้) แล้วแถวที่เหลือจบครบหมด แต่ใบยังค้าง "รับเรื่องแล้ว" ไม่มีตราฝั่งฝ่าย ⇒ ปุ่ม "ตอบแล้ว"
       ไม่มี (ใบตอบรายแถว) ปิดก็ไม่จบ = ทางออกเดียวคือยกเลิก · ตัวคิดตัวเดียวกับก้าวรายแถว */
    const remaining = (before.items || []).filter((i) => i.id !== itemId);
    const nowIso = new Date().toISOString();
    const headPatch = requestRowsClosurePatch(before, remaining, nowIso);
    let closureWarning = null;
    if (Object.keys(headPatch).length) {
      const { error: headError } = await supabase.from('dept_requests')
        .update({ ...headPatch, updatedAt: nowIso }).eq('id', id);
      /* ⚠️ ไม่ throw — แถวถูกลบไปแล้วจริง · ล้มตรงนี้ต้องไม่ข้ามการเก็บกวาดทะเบียน/เธรด/audit ข้างล่าง
         แต่ต้องบอกจอ (`_warning` · กติกา #1701) — เงียบ = ใบค้าง "กำลังดำเนินการ" ทั้งที่แถวครบ ไม่มีใครรู้ว่าทำไม */
      if (headError) {
        console.error('[requests] คิดตราปิดหลังลบแถวไม่สำเร็จ:', headError.message);
        closureWarning = 'ลบรายการแล้ว แต่ปรับสถานะใบไม่สำเร็จ — ถ้าใบยังไม่ขึ้น "ตอบแล้ว" ทั้งที่รายการครบ ให้กด "ตอบแล้ว" เอง';
      }
    }

    // ของในทะเบียนที่แถวนี้เป็นคนสร้าง — ลบตามเมื่อไม่มีใครอ้างต่อแล้ว
    let registryRemoved = null;
    let registryKept = null;
    const owned = reviseUndo ? null : registryOwnedByRow(row);
    let restoredParent = null;
    let undoWarning = null;
    if (reviseUndo) {
      /* ลบสูตรรอบแก้ (แถวนี้สร้างเอง ยังไม่มีใครใช้ — ตรวจแล้วข้างบน) แล้วคืนสูตรต้นทาง · ลำดับนี้บังคับโดยดัชนีตัวตน
         ⚠️ แถวถูกลบไปแล้วจริง ⇒ ขั้นไหนล้ม **ไม่ throw** บอกผ่าน `_warning` พร้อมทางทำเองที่ทะเบียน */
      const { produced, parent } = reviseUndo;
      // ถามสินค้าซ้ำก่อนลบจริง — ช่วงกวาดไฟล์ (Drive) มีคนผูกสินค้าแทรกได้ และ FK ของสินค้าเป็น SET NULL (หลุดเงียบ)
      const lateProducts = await countProductsUsingFormula(supabase, produced.id).catch(() => 1);
      const { error: formulaError } = lateProducts > 0
        ? { error: { message: 'มีสินค้าผูกสูตรรอบแก้ระหว่างลบ' } }
        : await supabase.from('formulas').delete().eq('id', produced.id);
      if (formulaError) {
        undoWarning = `ลบรายการแล้ว แต่ลบสูตรรอบแก้ ${produced.code || produced.name} ไม่สำเร็จ — `
          + `เลิกใช้ตัวนั้นแล้วเปิดใช้ ${parent.code || parent.name} ที่หน้ารายการทะเบียนสูตร`;
      } else {
        await purgeUpdates(supabase, 'formula', produced.id);
        registryRemoved = produced.code || produced.name || produced.id;
        await recordAudit({
          user, action: 'delete', entityType: 'formula', entityId: produced.id, before: produced, request,
          summary: `ลบสูตรรอบแก้ ${registryRemoved} — ลบรายการ ${row.label} (${before.docNo || id})`,
        });
        const { data: holder, error: holderError } = await supabase.from('formulas')
          .select('id, code, name').eq('categoryCode', parent.categoryCode).eq('scentId', parent.scentId)
          .neq('status', 'archived').limit(1).maybeSingle();
        const restored = !holderError && !holder
          && await updateFormula(supabase, parent.id, { status: 'active' }).then(() => true, () => false);
        if (restored) {
          restoredParent = parent;
          await recordAudit({
            user, action: 'update', entityType: 'formula', entityId: parent.id,
            before: parent, after: { ...parent, status: 'active' }, request,
            summary: `คืนสูตร ${parent.code || parent.name} เป็นใช้งาน — ถอยการส่งรอบแก้ (${before.docNo || id})`,
          });
        } else {
          undoWarning = `ลบรายการและสูตรรอบแก้แล้ว แต่คืนสูตรเดิม ${parent.code || parent.name} เป็นใช้งานไม่สำเร็จ`
            + (holder ? ` (หมวด × กลิ่นนี้มีสูตร ${holder.code || holder.name} ใช้งานอยู่)` : '')
            + ' — เปิดใช้เองที่หน้ารายการทะเบียนสูตร';
        }
      }
    }
    if (owned) {
      const table = owned.kind === 'formula' ? 'formulas' : 'scents';
      const { data: entity } = await supabase
        .from(table).select('id, code, name, status').eq('id', owned.id).maybeSingle();
      const refs = await countRegistryRefs(supabase, owned.kind, owned.id);
      const deletable = entity && refs === 0 && ['draft', 'developing'].includes(entity.status);
      if (deletable) {
        const { error: regError } = await supabase.from(table).delete().eq('id', owned.id);
        if (regError) throw regError;
        await purgeUpdates(supabase, owned.kind, owned.id);
        registryRemoved = entity.code || entity.name || owned.id;
      } else if (entity) {
        // เหตุที่เก็บไว้ต้องตรงความจริง — ไม่มีใครอ้างแต่รับเข้าทะเบียนแล้ว ≠ "ถูกอ้างที่อื่น" (รีวิว ม-147)
        const reason = refs > 0 ? 'ถูกอ้างที่อื่นแล้ว'
          : entity.status === 'archived' ? 'เลิกใช้แล้ว' : 'ใช้งานอยู่ — เลิกใช้ที่หน้าทะเบียนถ้าไม่ต้องการ';
        registryKept = `${entity.code || entity.name || owned.id} ยังอยู่ในทะเบียน (${reason})`;
      }
    }

    /* ลงเธรดเสมอ — แถวที่หายไปจากตารางโดยไม่มีร่องรอยคือสิ่งที่ทำให้คนถามว่า
       "ของที่ส่งมาเมื่อวานหายไปไหน" · ชนิด `update` = เนื้อในของใบเปลี่ยน */
    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: 'update',
      body: `ลบรายการ ${row.label || itemId}`
        + (registryRemoved ? ` · ลบออกจากทะเบียนด้วย (${registryRemoved})` : '')
        + (registryKept ? ` · ${registryKept}` : '')
        + (restoredParent ? ` · คืนสูตรเดิม ${restoredParent.code || restoredParent.name} เป็นใช้งาน` : ''),
      user,
    });
    await recordAudit({
      user, action: 'delete', entityType: 'dept_request_item', entityId: itemId,
      before: row, request,
      summary: `ลบรายการในคำร้อง ${before.docNo || id}`,
    });
    return Response.json({
      ok: true, registryRemoved, registryKept,
      ...(closureWarning || undoWarning ? { _warning: [undoWarning, closureWarning].filter(Boolean).join(' · ') } : {}),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
