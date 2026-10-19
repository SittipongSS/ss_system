// ── RD ส่งของ = สร้างแถว + เข้าทะเบียนกลิ่นในจังหวะเดียว (P3b) ────────────
//
// POST { rows: [{ scent: {...}, categoryCode, formula?: {...}, briefId?, spec?, targetItemId? }] }   — พัฒนากลิ่น
// POST { anchorItemId, formulas: [{...FormulaForm}] }                                                  — พัฒนาสูตร (ม-157)
//
// ⭐ **หัวข้อ "พัฒนากลิ่น" ไม่มีตารางบรรทัดตอนเปิดใบ** — SA ไม่มีทางรู้ล่วงหน้าว่า
// RD จะส่งกี่ direction ⇒ แถวเกิดตรงนี้ · 1 แถว = 1 direction = กลิ่น 1 ตัวในทะเบียน
// ⭐ **ส่งเป็นสินค้า = กลิ่น + สูตร** (ม-148 · 2026-09-22) — direction ที่ RD เลือกส่งเป็นสินค้าหมวดอื่นที่ไม่ใช่
// หัวน้ำหอม ได้สูตร "หมวดนั้น × กลิ่นนี้" สถานะกำลังพัฒนาเกิดพร้อมกัน ⇒ ขั้นใส่ราคาเป็น FB บนสูตร
//
// ⭐ **กรอกที่เดียว เข้าทะเบียนเลย** — RD ไม่ต้องเปิดหน้าทะเบียนอีกจอแล้วพิมพ์ซ้ำ
// (ซึ่งเป็นวิธีที่ข้อมูลสองที่เริ่ม drift กัน)
//
// ⚠️ **ไม่มี transaction ข้ามตาราง** — PostgREST ไม่มีให้ · ลำดับจึงเป็น
// "สร้างกลิ่น(+สูตร)ทีละตัว → สร้างแถวทั้งชุดทีเดียว" และถ้าแถวล้ม จะย้อนลบของที่เพิ่ง
// สร้างไป (สูตรก่อนกลิ่น) · ของค้างโดยไม่มีคำร้องอ้าง แย่กว่าคำร้องที่ไม่มีของ เพราะทะเบียนคือ
// ของที่คนอื่นเลือกจากมันต่อ
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canAnswerRequest, canReadRequestRow } from '@/lib/deptRequests';
import { requestRowsClosurePatch } from '@/lib/requests/stages';
import { requestActorSide } from '@/lib/requests/replyTurn';
import { REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { deliveryItemRow, normalizeDeliveryRows } from '@/lib/requests/delivery';
import { findRequest } from '@/lib/materialPricesAdmin';
import { createFormula, createScent, findScent, loadFormulas, loadScents } from '@/lib/master/scentFormulaAdmin';
import { findFormulaByIdentity } from '@/lib/master/formulas';
import { normalizeFormulaDelivery } from '@/lib/requests/delivery';
import { formulaName, planFormulaDelivery } from '@/lib/requests/formulaRework';
import { addDirectionError, directionRowFrom } from '@/lib/requests/formulaDirections';
import { hopPatch } from '@/lib/requests/hops';
import { requestedLabel } from '@/lib/requests/rowLabel';
import { fetchAll } from '@/lib/supabaseFetchAll';
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
  if (before.kind === 'formula_dev') return postFormulaDirections({ supabase, user, before, request });
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
  /* ⭐ **ต้องรับเรื่องก่อนถึงจะส่งของได้** (มติผู้ใช้ 2026-08-20 — "ปุ่มรับเรื่องเป็น
     ระดับใบ … รับเรื่องก่อน ค่อยโชว์ปุ่มระดับรายการ") · ส่งงานคือการลงมือรายรายการ
     เหมือนกัน ⇒ ใบที่ยังไม่มีใครรับต้องกดรับเรื่องก่อน ไม่งั้นคิวจะมีใบที่ "ยังไม่มีใครรับ"
     แต่มีของส่งมาแล้ว ซึ่งอ่านไม่ออกว่าใครถืออยู่ */
  if (before.status === 'pending') {
    return Response.json({
      error: 'ยังไม่ได้รับเรื่อง — กด "รับเรื่อง" ที่ใบก่อน แล้วค่อยส่งงาน',
    }, { status: 409 });
  }
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
  /* ⭐ `perfumerId`/`perfumerName` มาด้วย (mig 0350) — ชื่อที่จะถูก **แช่แข็ง** ลง
     ทะเบียนกลิ่นตอนนี้มาจากบรีฟก้อนที่แถวนี้ตอบ ไม่ใช่จากหัวใบอีกต่อไป */
  const { data: briefRows, error: briefLoadError } = await supabase
    .from('dept_request_scents').select('id, label, "perfumerId", "perfumerName"').eq('requestId', id)
    .order('sortOrder', { ascending: true });
  if (briefLoadError) return Response.json({ error: briefLoadError.message }, { status: 500 });

  /* ⭐ ม-148 — direction ที่ส่งเป็นสินค้าสร้างสูตรด้วย ⇒ ต้องมีรหัสสูตรทั้งทะเบียน (ชนรหัสเตือนก่อนสร้างอะไร
     ไม่ใช่ไปชน `formulas_code_uk` หลังกลิ่นเกิดไปแล้ว) + ทะเบียนหมวด (ด่านหมวดที่ส่ง)
     ⚠️ อ่านพัง = 500 ไม่ใช่ปล่อยผ่าน — ด่านหมวดที่ไม่มีทะเบียนให้เทียบยอมหมวดที่ถูกปิดใช้ไปแล้ว */
  let formulaCodes = [];
  let productTypes = [];
  try {
    formulaCodes = await fetchAll(() => supabase.from('formulas').select('id, code').order('id'));
    const { data: types, error: typeError } = await supabase.from('product_types')
      .select('mainCategoryCode, typeCode, isActive');
    if (typeError) throw typeError;
    productTypes = types || [];
  } catch (e) {
    return Response.json({ error: `อ่านทะเบียนสูตร/หมวดสินค้าไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }

  const { rows, error } = normalizeDeliveryRows(body.rows, {
    existingCodes: registry.map((s) => s.code).filter(Boolean),
    existingFormulaCodes: formulaCodes.map((f) => f.code).filter(Boolean),
    productTypes,
    today: businessDate(),
    briefs: briefRows || [],
    // ⭐ แถวรอบแก้ที่รออยู่ — ด่านตรวจว่า `targetItemId` ที่ส่งมาเติมได้จริง และ
    // เป็นที่มาของบรีฟ/กลิ่นต้นทาง (ห้ามเชื่อค่าที่ client ส่งมาสองช่องนั้น)
    items: before.items || [],
  });
  if (error) return Response.json({ error }, { status: 400 });

  const nowIso = new Date().toISOString();
  /* ⭐ **บรีฟก้อนไหน ผู้ปรุงคนนั้น** (mig 0350) — `row.briefId` ถูกเซิร์ฟเวอร์ตัดสิน
     มาแล้วใน `normalizeDeliveryRows` (ใบที่มีบรีฟเดียวเลือกให้เอง · แถวรอบแก้บังคับ
     สืบทอดจากแถวต้นทาง) ⇒ ตรงนี้แค่หยิบเจ้าของกลิ่นของก้อนนั้นมาใช้ */
  const briefById = new Map((briefRows || []).map((b) => [b.id, b]));
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
        // ⭐ ช่องเสริมของทะเบียนที่ฟอร์มร่วมเปิดให้กรอกตั้งแต่ตอนส่ง (2026-08-19) —
        // เดิมต้องไปเปิดทะเบียนแก้ทีหลัง ซึ่งคือจังหวะที่ข้อมูลสองที่เริ่มต่างกัน
        customerTradeName: row.customerTradeName,
        note: row.note,
        /* ⭐ **ผู้ปรุงกลิ่นมาจากบรีฟก้อนนี้ก่อน แล้วค่อยถอยไปช่องผู้เซ็นบนหัวใบ**
           (mig 0350 · มติผู้ใช้ 2026-09-08: *"PDR - Perfumer คนไหน ดูแล คนนั้นคือ
           เจ้าของกลิ่น"*) — ของเดิมใช้ `before.pdrSignPerfumer` ตัวเดียวทุกแถวในลูปนี้
           🐞 อาการที่แก้: ใบที่มีหลายกลิ่นแจกให้คนละคนปรุง (บน production มีถึง 4 ก้อน
             ต่อใบ) ทะเบียนบันทึกว่า **คนเดียวปรุงทั้งใบ** เพราะช่องผู้เซ็นถูกเลือก
             ครั้งเดียวทั้งใบตอนกดรับเรื่อง
           ⚠️ **ยังถอยไปหาหัวใบเสมอ** — ใบเก่าและใบที่ยังไม่ถูกแจกต้องได้พฤติกรรมเดิม
             เป๊ะ ๆ ไม่ใช่กลายเป็นช่องว่าง
           ⚠️ ใบที่ไม่ได้เลือกผู้เซ็นและไม่ได้แจก = **เว้นว่าง ไม่เดาจากคนกดส่ง** —
             คนกดส่งมักเป็นผู้ประสานงาน ไม่ใช่คนปรุง (ทะเบียน 115 กลิ่นเป็นแบบนั้นหมด)
           ⭐ `perfumerId` ติดมาด้วยได้แล้วเมื่อมาจากการแจก (คนแจกเลือกจากรายชื่อบัญชี)
             — ทางหัวใบยังว่างเหมือนเดิมเพราะช่องผู้เซ็นเก็บ *ชื่อบนกระดาษ* อย่างเดียว
             ⇒ นี่คือผู้อ่านคนแรกของคอลัมน์ที่ mig 0333 เตรียมไว้ */
        perfumerId: briefById.get(row.briefId)?.perfumerId || null,
        perfumerName: briefById.get(row.briefId)?.perfumerName || before.pdrSignPerfumer || null,
      }, user, { accepted: true });
      // ⚠️ เข้า `created` ทันทีที่กลิ่นเกิด — ก่อนเขียนต่อ ไม่งั้นถ้าขั้นถัดไปพัง
      // catch ข้างล่างย้อนลบไม่ถึงตัวนี้ แล้วกลิ่นค้างในทะเบียน
      created.push({ row, scent });
      // ⭐ **วันผลิตอยู่บนตัวกลิ่น · วันส่งลูกค้ายังไม่เกิด** (มติผู้ใช้ 2026-08-08 ·
      // ม-66 · mig 0224) — ตอนนี้ของเพิ่งออกจากมือ RD มาถึงฝ่ายขาย ยังไม่ถึงลูกค้า
      // 🐞 เดิมเขียน `sentAt` ตรงนี้ด้วยวันเดียวกับ `readyAt` ⇒ ทะเบียนบอกว่าส่ง
      // ลูกค้าแล้วตั้งแต่วันที่ RD ส่งมอบ ซึ่งเร็วกว่าความจริงเสมอ
      // ⇒ `scents.sentAt` เขียนตอน SA กดก้าว "ส่งให้ลูกค้า" แทน (items/[itemId])
      const { error: stampError } = await supabase.from('scents').update({
        // ⭐ ทะเบียนย้อนกลับได้ว่ากลิ่นตัวนี้มาจากบรีฟไหน (ข้อที่ผู้ใช้ขอ · mig 0213)
        // เก็บตรงบน scents ไม่ให้ต้อง join ผ่านแถว direction
        briefId: row.briefId,
        producedAt: row.producedAt,
        producedById: user?.id ?? null,
        producedByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('id', scent.id);
      /* 🐞 เดิมไม่อ่าน `error` ⇒ พังแล้วเดินต่อเงียบ ๆ — กลิ่นเข้าทะเบียนโดย **ไม่มี
         วันผลิต** (ช่องนี้มีที่ scents ที่เดียว แถวคำร้องไม่ได้เก็บ) และไม่รู้ว่าตอบบรีฟ
         ก้อนไหน · ตอนนี้ยังไม่มีแถวคำร้องสักแถว ⇒ ล้มทั้งชุดแล้วย้อนลบกลิ่นได้สะอาด
         กดส่งใหม่ไม่เกิดของซ้ำ */
      if (stampError) {
        throw new Error(`บันทึกวันผลิต/บรีฟลงกลิ่น ${row.code} ไม่สำเร็จ: ${stampError.message}`);
      }

      /* ⭐ **ส่งเป็นสินค้า = สูตรเกิดพร้อมกลิ่น** (ม-148) — หมวดที่ RD เลือก × กลิ่นที่เพิ่งเกิด
         · `developing` เดินคู่กลิ่น: ลูกค้าคอนเฟิร์มแล้วพลิกเป็นใช้งานพร้อมกัน (ก้าว outcome)
         · ลูกค้าของสูตร = ลูกค้าของใบ (ตรงกับกลิ่นเสมอ — กลิ่นเพิ่งเกิดจากลูกค้ารายนี้)
         ⚠️ เข้า `created` ก่อนเขียนต่อเหมือนกลิ่น ไม่งั้นย้อนลบไม่ถึง */
      if (row.formula) {
        const formula = await createFormula(supabase, {
          name: row.formula.name,
          code: row.formula.code,
          formulaDate: row.formula.formulaDate,
          customerTradeName: row.formula.customerTradeName,
          note: row.formula.note,
          derivedFromFormulaId: row.formula.derivedFromFormulaId,
          categoryCode: row.categoryCode,
          scentId: scent.id,
          customerId: before.customerId,
          dealId: before.dealId || null,
        }, user, { accepted: true, developing: true });
        created[created.length - 1].formula = formula;
      }
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
    for (const { row, scent, formula } of created) {
      const values = deliveryItemRow(row, {
        requestId: id,
        sortOrder: row.targetItemId ? 0 : base + (fresh += 1),
        scentId: scent.id,
        formulaId: formula?.id || null,
        ackAt,
        user,
      });
      if (!row.targetItemId) {
        inserts.push({ id: `DRI-${randomUUID()}`, ...values, createdAt: nowIso, updatedAt: nowIso });
        continue;
      }
      // เติมลงแถวที่รออยู่ — ตัวตนของแถว (id · ลำดับ · สายพันธุ์) ต้องไม่ถูกเขียนทับ
      const { requestId: _r, sortOrder: _s, lineKind: _k, ...fill } = values;
      /* ⚠️ เติมเฉพาะแถวที่ยังว่างจริง + นับว่าโดนแถว (รีวิว ม-148) — สองแท็บกดส่งรอบแก้เดียวกันพร้อมกัน หรือ
         แถวถูกลบระหว่างทาง เดิมผ่านเงียบ ⇒ ตอบ 201 ทั้งที่กลิ่น(+สูตร)ชุดนี้ไม่มีแถวไหนผูก = ของกำพร้าในทะเบียน
         · ไม่โดน = โยน ⇒ catch ข้างล่างย้อนลบของที่เพิ่งสร้าง */
      const { data: filled, error: fillError } = await supabase.from('dept_request_items')
        .update({ ...fill, updatedAt: nowIso }).eq('id', row.targetItemId)
        .is('readyAt', null).is('producedScentId', null)
        .select('id');
      if (fillError) throw fillError;
      if (!filled?.length) throw new Error('รายการรอบแก้นี้เพิ่งถูกส่งหรือถูกลบไปแล้ว — โหลดหน้าใหม่');
    }
    if (inserts.length) {
      const { error: itemError } = await supabase.from('dept_request_items').insert(inserts);
      if (itemError) throw itemError;
    }
  } catch (e) {
    /* ย้อนลบกลิ่นที่เพิ่งสร้าง — ของค้างในทะเบียนคือของที่คนอื่นจะเลือกไปใช้ต่อ
       🐞 เดิมเขียน `.delete().eq(…).catch(() => {})` — builder ของ supabase **ไม่มี
       `.catch`** (มีแค่ `then`) ⇒ TypeError ตั้งแต่ก่อนคำขอจะถูกยิง ⇒ **ย้อนไม่เคย
       เกิดสักครั้ง** กลิ่นค้างในทะเบียนทุกรอบที่พัง และ TypeError หลุดจาก catch นี้
       ไปเป็น 500 กลบข้อความจริงของ `e`
       ทีละตัวโดยเจตนา — ตัวที่ถูกแถวรอบแก้ผูกไปแล้วลบไม่ลง ต้องไม่ลากตัวอื่นล้มตาม
       ⚠️ **สูตรก่อนกลิ่น** (ม-148) — `formulas.scentId` เป็น SET NULL ⇒ ลบกลิ่นก่อนฐานยอมเงียบ ๆ แล้วได้สูตร
       ไร้กลิ่นค้างทะเบียน · ลบสูตรไม่ลง = **เก็บกลิ่นไว้ด้วย** ด้วยเหตุผลเดียวกัน */
    for (const { row, scent, formula } of created) {
      /* ลบสูตร **ด้วยกลิ่น** ไม่ใช่ด้วย id ที่จำได้ — `createFormula` ที่ insert สำเร็จแต่คำตอบสะดุด (โยนหลังเขียน)
         ไม่เคยเข้า `created` ⇒ ลบด้วย id จะไม่ถึง · กลิ่นเพิ่งเกิดจากคำขอนี้ ⇒ สูตรที่ชี้มันมีแต่ของคำขอนี้ */
      if (formula || row.formula) {
        const { error: formulaUndoError } = await supabase.from('formulas').delete().eq('scentId', scent.id);
        if (formulaUndoError) {
          console.error('[request items] ย้อนลบสูตรไม่สำเร็จ', formula?.id || scent.id, formulaUndoError.message);
          continue;
        }
      }
      const { error: undoError } = await supabase.from('scents').delete().eq('id', scent.id);
      if (undoError) console.error('[request items] ย้อนลบกลิ่นไม่สำเร็จ', scent.id, undoError.message);
    }
    return Response.json({ error: e.message }, { status: 400 });
  }

  /* ⭐ ใบที่เคยขึ้น "ตอบแล้ว" ต้องถอยกลับเป็น "รับเรื่องแล้ว" เมื่อมีแถวใหม่
     ใช้ตัวเดิมที่ route ก้าวรายแถวใช้ (`deriveRequestStatusAfterAnswer`) ⇒ กติกา
     "ครบทุกแถว = answered" อยู่ที่เดียว ไม่มีใครคิดเองสองที่
     ⚠️ ตัวนั้นกัน `closed`/`cancelled` ไว้ให้แล้ว จึงไม่ต้องเช็คซ้ำ
     🐞 เดิมไม่อ่าน `error` ⇒ ถอยสถานะพังเงียบ ใบค้าง "ตอบแล้ว" ทั้งที่มีแถวใหม่รอเดิน
       และ **ไม่หายเอง** — ก้าวรายแถว/ใส่ราคา (items/[itemId]) ตีกลับใบที่ไม่อยู่สถานะเปิด
       ⇒ แถวใหม่เดินต่อไม่ได้เลย จนกว่าจะมีคนกด "ยังไม่จบ" ที่ใบ
     ⚠️ **เตือน ไม่ใช่ 500** — กลิ่นกับแถวลงฐานไปแล้ว · ตอบพังแล้วโมดัลค้าง คนกดส่งซ้ำ
       จะชนรหัสกลิ่นซ้ำ และไฟล์ประกอบที่จอรออัปหลังส่งสำเร็จจะไม่ถูกอัปเลย
       ⇒ ส่ง `_warning` (จอทักโทนเตือนแทนเขียว) พร้อมบอกทางออก */
  let statusWarning = null;
  try {
    const afterAdd = await findRequest(supabase, id);
    const closurePatch = requestRowsClosurePatch(afterAdd, afterAdd?.items || [], nowIso, {
      actorSide: requestActorSide(user, afterAdd),
    });
    if (Object.keys(closurePatch).length) {
      const { error: closureError } = await supabase.from('dept_requests')
        .update({ ...closurePatch, updatedAt: nowIso })
        .eq('id', id);
      if (closureError) throw closureError;
    }
  } catch (e) {
    console.error('[request items] ปรับสถานะใบตามแถวใหม่ไม่สำเร็จ', id, e.message);
    statusWarning = 'ส่งงานเข้าทะเบียนแล้ว แต่ปรับสถานะใบไม่สำเร็จ — ถ้าใบยังขึ้น "ตอบแล้ว" '
      + `ให้กด "ยังไม่จบ" เพื่อเปิดใบกลับ ไม่งั้นรายการใหม่เดินต่อไม่ได้ (${e.message})`;
  }

  // 3) ร่องรอย — หนึ่งเหตุการณ์ต่อการส่งหนึ่งครั้ง ไม่ใช่ต่อแถว (คนอ่านเธรดสนใจ
  // ว่า "ส่งไปกี่ตัวเมื่อไร" ไม่ใช่ไล่อ่านทีละบรรทัดที่เกิดพร้อมกัน)
  // ⭐ ม-148 — บอกว่าส่งเป็นอะไร: สินค้าต่อท้ายด้วยรหัสสูตรกับหมวด (ผู้ขอรู้ว่าราคาที่ตามมาเป็น FB)
  const names = created.map(({ row, formula }) => `${row.code} ${row.name}`
    + (formula ? ` (สูตร ${formula.code} · หมวด ${row.categoryCode})` : ' (หัวน้ำหอม)')).join(' · ');
  await appendUpdate(supabase, {
    entityType: 'dept_request',
    entityId: id,
    kind: 'ready',
    body: `ส่งงาน ${created.length} รายการ — ${names}`,
    user,
  }).catch(() => {});

  /* ⚠️ อ่านสภาพสุดท้าย **ครั้งเดียว · อ่านพังไม่ล้ม** แล้วใช้ทั้ง audit และ response
     🐞 เดิมเรียก `findRequest` สองรอบตรงนี้ (อาร์กิวเมนต์ `after:` ถูกประเมินก่อนเข้า try
       ของ recordAudit + อีกรอบใน body) · ตัวนั้น throw ⇒ อ่านสะดุดครั้งเดียวก็ 500 ทั้งที่
       กลิ่นกับแถวลงฐานครบแล้ว ⇒ โมดัลค้าง ไฟล์ประกอบ (ม-91) ไม่ถูกอัป กดส่งซ้ำชน
       "รหัสถูกใช้ไปแล้ว" — อาการเดียวกับที่ขั้นปรับสถานะข้างบนกันไว้
     ⇒ อ่านไม่ได้ก็ตอบ `{}` · จออ่าน body แค่ `_warning`/`error` แล้วโหลดใบใหม่เอง */
  const after = await findRequest(supabase, id).catch((e) => {
    console.error('[request items] อ่านใบหลังส่งกลิ่นไม่สำเร็จ', id, e?.message);
    return null;
  });

  await recordAudit({
    user, action: 'update', entityType: 'dept_request', entityId: id,
    before, after,
    summary: `ส่งงาน ${created.length} รายการ (${before.docNo || id})`,
    request,
  });

  return Response.json({
    ...(after || {}),
    ...(statusWarning ? { _warning: statusWarning } : {}),
  }, { status: 201 });
}

/* ── ส่ง direction เพิ่มของพัฒนาสูตร (ม-157 · IS-26100002) ──────────────────────────────────────────────
   ⭐ RD ส่งสูตรของกลิ่นเดียวกันได้หลาย direction — แต่ละตัว = แถวพี่น้องของแถวแรก (`directionRowFrom`) + สูตรใหม่สถานะ
   กำลังพัฒนา (ไม่จองตัวตน หมวด × กลิ่น · mig 0411) · แถวเกิดในขั้น "ส่งงานแล้ว" (ตราส่งของ RD คนกด) แล้วเดินก้าวรายแถว
   ชุดเดิม (รับของ · ส่งลูกค้า · ผลลูกค้า) · ลูกค้าคอนเฟิร์มตัวไหน ก้าวผลลูกค้าจัดการทะเบียน + ปิดตัวอื่นเอง
   ⚠️ แถวแรกต้องส่งแล้ว — แถวที่ยังไม่ส่ง โมดัลส่งงานส่งแถวแรก (PATCH) ก่อน แล้วค่อยยิงเส้นนี้ด้วย direction ที่เหลือ
   ⚠️ ไม่มี transaction — "ตรวจทุกตัวก่อน → สร้างสูตรทีละตัว → แถวทั้งชุดทีเดียว" · แถวล้ม = ย้อนลบสูตรที่เพิ่งสร้าง
     (กำลังพัฒนา ไม่มีใครอ้าง) แบบเดียวกับพัฒนากลิ่นข้างบน */
async function postFormulaDirections({ supabase, user, before, request }) {
  const body = await request.json().catch(() => ({}));
  const id = before.id;
  const items = before.items || [];
  const anchor = items.find((i) => i.id === body.anchorItemId) || null;
  const gate = addDirectionError(before, anchor, items);
  if (gate) return Response.json({ error: gate }, { status: 409 });
  const inputs = Array.isArray(body.formulas) ? body.formulas : [];
  if (!inputs.length) return Response.json({ error: 'ไม่มี direction ที่จะส่ง' }, { status: 400 });
  if (inputs.length > 10) return Response.json({ error: 'ส่งได้ครั้งละไม่เกิน 10 direction' }, { status: 400 });

  // ── ตรวจทุกตัวก่อนแตะอะไร — ช่องฟอร์ม · รหัสซ้ำกันเอง/ซ้ำทะเบียน · แผนทะเบียน (ตัวเดียวกับพรีวิวบนจอ) ──
  let registry;
  try {
    registry = await loadFormulas(supabase, { status: null });
  } catch (e) {
    return Response.json({ error: `อ่านทะเบียนสูตรไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  const taken = new Set(registry.map((f) => String(f.code || '').trim().toLowerCase()).filter(Boolean));
  const shape = { ...directionRowFrom(anchor), id: null };
  const existing = findFormulaByIdentity(registry, { categoryCode: anchor.categoryCode, scentId: anchor.scentId });
  const values = [];
  for (const [n, input] of inputs.entries()) {
    const label = `direction ที่ ${n + 1}`;
    const { value, error } = normalizeFormulaDelivery({ formula: input });
    if (error) return Response.json({ error: `${label}: ${error}` }, { status: 400 });
    const key = value.code.toLowerCase();
    if (taken.has(key)) return Response.json({ error: `${label}: รหัสสูตร ${value.code} ถูกใช้ไปแล้ว` }, { status: 400 });
    taken.add(key);
    const plan = planFormulaDelivery({
      row: shape, items, existing, clientDerivedFrom: value.derivedFromFormulaId, customerId: before.customerId || null,
    });
    // direction เพิ่มไม่มีทางผูกของเดิม (`directionOfItemId` ⇒ ของลูกค้าอื่นเป็น blocked) — กันไว้อีกชั้น
    if (plan.kind !== 'create') {
      return Response.json({ error: plan.error || 'ส่ง direction เพิ่มของกลิ่นนี้ไม่ได้' }, { status: 409 });
    }
    values.push({ value, plan });
  }

  const nowIso = new Date().toISOString();
  const today = businessDate();
  const scent = anchor.scentId ? await findScent(supabase, anchor.scentId).catch(() => null) : null;
  const created = [];
  try {
    for (const { value, plan } of values) {
      const formula = await createFormula(supabase, {
        name: value.name,
        code: value.code,
        formulaDate: value.formulaDate,
        customerTradeName: value.customerTradeName,
        derivedFromFormulaId: plan.derivedFromFormulaId,
        note: value.note,
        categoryCode: anchor.categoryCode,
        scentId: anchor.scentId,
        customerId: before.customerId || scent?.customerId || null,
        dealId: before.dealId || null,
      }, user, { accepted: true, developing: true });
      created.push(formula);
    }
    const base = Math.max(0, ...items.map((i) => i.sortOrder || 0));
    const rows = created.map((formula, n) => ({
      id: `DRI-${randomUUID()}`,
      ...directionRowFrom(anchor, { sortOrder: base + n + 1 }),
      ...hopPatch('ready', {}, user, today, { lineKind: 'product_dev' }),
      producedFormulaId: formula.id,
      producedFormulaAction: 'create',
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
    const { error: insertError } = await supabase.from('dept_request_items').insert(rows);
    if (insertError) throw insertError;
    /* ⚠️ **คอนเฟิร์มแทรกระหว่างตรวจกับเขียน** (รีวิว ม-157) — ด่านอ่านสแนปช็อตครั้งเดียว · คู่นี้ถูกคอนเฟิร์มไปแล้ว = แถวใหม่ไม่มีวันถูก
       คอนเฟิร์มได้อีก (ค้างถาวร) ⇒ อ่านสดหลังเขียน เจอ = ถอยแถวแล้วถอยสูตร (ผ่าน catch) */
    const { data: settledNow, error: recheckError } = await supabase.from('dept_request_items')
      .select('id').eq('requestId', id).eq('lineKind', 'product_dev')
      .eq('categoryCode', anchor.categoryCode).eq('scentId', anchor.scentId)
      .or('outcome.eq.confirmed,answerStatus.eq.done');
    if (recheckError || settledNow?.length) {
      const { error: rowUndoError } = await supabase.from('dept_request_items').delete().in('id', rows.map((r) => r.id));
      if (rowUndoError) {
        console.error('[request items] ถอยแถว direction ไม่สำเร็จ', rowUndoError.message);
        created.length = 0; // แถวยังถือสูตรอยู่ — ห้ามลบสูตรตาม
      }
      throw new Error(recheckError
        ? 'ตรวจรายการอื่นของกลิ่นนี้ไม่สำเร็จ — ยังไม่ได้ส่ง ลองกดอีกครั้ง'
        : 'ลูกค้าเพิ่งคอนเฟิร์มสูตรของกลิ่นนี้ — ส่ง direction เพิ่มไม่ได้แล้ว โหลดหน้าใหม่');
    }
  } catch (e) {
    for (const formula of created) {
      const { error: undoError } = await supabase.from('formulas').delete().eq('id', formula.id).eq('status', 'developing');
      if (undoError) console.error('[request items] ย้อนลบสูตร direction ไม่สำเร็จ', formula.id, undoError.message);
    }
    // mig 0411 ยังไม่รัน = ไม่มีคอลัมน์ directionOfItemId (42703/PGRST204) หรือดัชนีคู่ซ้ำเดิมตีกลับ (23505)
    const notMigrated = ['42703', 'PGRST204'].includes(e?.code) || (e?.code === '23505' && /product_pair_uk/.test(e?.message || ''))
      // ดัชนีตัวตนเดิม (ก่อน 0411) นับสูตรกำลังพัฒนา — `translateScentConflict` แปลเป็นข้อความนี้
      || String(e?.message || '').startsWith('หมวดสินค้านี้กับกลิ่นนี้มีสูตรอยู่แล้ว');
    return Response.json({
      error: notMigrated
        ? 'ระบบยังไม่พร้อมส่งหลาย direction (ฐานข้อมูลยังไม่อัปเดต mig 0411) — แจ้งผู้ดูแลระบบ'
        : `ส่ง direction เพิ่มไม่สำเร็จ: ${e.message}`,
    }, { status: notMigrated ? 503 : 400 });
  }

  // ใบตามแถว — แถวใหม่ยังไม่จบ ⇒ ตราปิดของใบ (ถ้ามี) ต้องหลุด · ตัวคิดตัวเดียวกับก้าวรายแถว
  let statusWarning = null;
  try {
    const afterAdd = await findRequest(supabase, id);
    const closurePatch = requestRowsClosurePatch(afterAdd, afterAdd?.items || [], nowIso, {
      actorSide: requestActorSide(user, afterAdd),
    });
    if (Object.keys(closurePatch).length) {
      const { error: closureError } = await supabase.from('dept_requests')
        .update({ ...closurePatch, updatedAt: nowIso }).eq('id', id);
      if (closureError) throw closureError;
    }
  } catch (e) {
    console.error('[request items] ปรับสถานะใบหลังส่ง direction ไม่สำเร็จ', id, e.message);
    statusWarning = `ส่ง direction แล้ว แต่ปรับสถานะใบไม่สำเร็จ (${e.message})`;
  }

  const names = created.map((f) => formulaName(f)).join(', ');
  await appendUpdate(supabase, {
    entityType: 'dept_request', entityId: id, kind: 'ready',
    body: `ส่งงาน direction เพิ่ม ${created.length} รายการ — ${requestedLabel(anchor.label)} · สูตร ${names}`,
    user,
  }).catch(() => {});
  const after = await findRequest(supabase, id).catch(() => null);
  await recordAudit({
    user, action: 'update', entityType: 'dept_request', entityId: id,
    before, after,
    summary: `ส่ง direction เพิ่ม ${created.length} รายการ (${names}) — ${requestedLabel(anchor.label)} (${before.docNo || id})`,
    request,
  });
  return Response.json({
    ...(after || {}),
    ...(statusWarning ? { _warning: statusWarning } : {}),
  }, { status: 201 });
}
