// ── เปิดคำร้อง: จากค่าในฟอร์ม → คำร้องที่ "ส่งแล้ว" ─────────────────────
//
// ⚠️ มีสองทางเรียกใช้ (โมดัลบนหน้าคำร้อง + โมดัลบนใบขอราคาผลิต) จึงต้องเป็นชิ้น
// เดียวตามกฎ AGENTS.md · ก่อนหน้านี้สองที่นั้นประกอบ payload กันเอง แล้วเพี้ยนหา
// กันจริง: ฝั่งใบขอราคาผลิตคำนวณ `kind` ใหม่เองจนไม่ตรงกับที่ฟอร์มแสดง และไม่เคย
// ส่ง scentId/formulaId ที่หัวข้อนั้นบังคับ → 400 ทุกครั้ง
import {
  lineShapeForKind, requestHasItems, requestHasPdr, requestNeedsRef, requestShapeError,
} from '@/lib/master/requestTypes';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { pdrArtworkError } from '@/lib/requests/pdrFields';
import { uploadAttachment } from '@/lib/master/attachmentUpload';
import { apiFetch } from "@/lib/apiFetch";

/**
 * เหตุผลเดียวที่ยังส่งคำร้องไม่ได้ — คืนข้อความไทย หรือ null ถ้าพร้อมส่ง
 *
 * ⭐ **ที่เดียว** ที่ตัดสินว่าปุ่มส่งเปิดหรือไม่ และเป็นข้อความเดียวกับที่ฟอร์มแสดง —
 * ก่อนหน้านี้ `requestShapeError` คุมส่วนหนึ่ง แล้วผู้เรียกแต่ละที่เขียนเงื่อนไข
 * "ทุกรายการต้องมีวัสดุ" ต่อท้ายเอง → ปุ่มจางลง**โดยไม่มีข้อความบอกเหตุผล** ซึ่งเป็น
 * อาการเดียวกับที่เพิ่งแก้ไปในรอบนี้ แค่มาอีกทาง (ตรวจในเบราว์เซอร์แล้วเจอจริง)
 *
 * ⚠️ ด่านของ server คือ `requestShapeError` + `normalizeLinesFor` — ตัวนี้เป็น
 * ด่านฝั่งจอที่ **ครอบ** ของ server ไว้ ห้ามหลวมกว่า
 */
export function requestFormBlocker(form) {
  if (!form) return 'ยังไม่มีข้อมูล';
  if (!form.kind || !form.dept) return 'เลือกฝ่ายและหัวข้อก่อน';

  // ส่งทั้ง form เข้าไปเลย — `requestShapeError` อ่านเฉพาะช่องที่หัวข้อนั้นต้องใช้
  // (ก่อนหน้านี้เลือกช่องส่งเองทีละตัว → เพิ่มของที่ต้องผูกใหม่แล้วลืมเติมที่นี่
  //  ด่านฝั่งจอจะหลวมกว่า server เงียบ ๆ ทันที)
  const shape = requestShapeError(form.kind, {
    ...form,
    items: requestHasItems(form.kind) ? form.items : undefined,
  });
  if (shape) return shape;

  // ⭐ **แถวเปล่าไม่นับว่ามีรายการ** (มติผู้ใช้ 2026-08-09: "ต้องบังคับเพิ่มรายการ")
  // `requestShapeError` เช็คแค่ `items.length` ⇒ กด "เพิ่มรายการ" เฉย ๆ แล้วไม่เลือก
  // อะไรเลยก็ผ่านด่านฝั่งจอ แล้วไปตายที่ server ตอนกดบันทึก (เสียรอบไปหนึ่งรอบ)
  // ⚠️ **ใช้ตัวตรวจตัวเดียวกับ server** (`normalizeLinesFor`) ไม่ใช่เขียนกฎซ้ำ —
  // กฎรายแถวอยู่ในรูปร่างบรรทัดของฝ่ายนั้น ๆ ที่เดียว
  if (requestHasItems(form.kind)) {
    const { error: lineError } = normalizeLinesFor(lineShapeForKind(form.kind), form.items);
    if (lineError) return lineError;
  }

  // ⭐ **ติ๊กว่ามีภาพประกอบ = ต้องแนบไฟล์ตั้งแต่ตอนนี้** (มติผู้ใช้ 2026-08-09)
  // เดิมด่านนี้ยิงเฉพาะจังหวะ "กดส่ง" เพราะหน้าเปิดคำร้องยังแนบไฟล์ไม่ได้ · ตอนนี้
  // ฟอร์มถือไฟล์ได้แล้ว (`value.files`) ⇒ บังคับตั้งแต่ตอนบันทึกร่างได้จริง และดีกว่า
  // ปล่อยให้ไปติดตอนกดส่งซึ่งเป็นคนละหน้ากัน
  // ⚠️ ใช้ `pdrArtworkError` ตัวเดียวกับ server ไม่ใช่เขียนเงื่อนไขใหม่
  if (requestHasPdr(form.kind)) {
    const artwork = pdrArtworkError(form.pdr || {}, {
      attachmentCount: (form.files || []).length,
      stage: 'submit',
    });
    if (artwork) return artwork;
  }

  // ⚠️ เดิมมีด่าน "ทุกรายการต้องเลือกวัสดุ" ต่อท้ายตรงนี้ — เป็นกฎของ**บรรทัดวัสดุ**
  // ซึ่งถูกถอดใน mig 0219 (ม-28) · ปล่อยไว้แล้วจะบล็อกบรรทัดพัฒนาสูตร/เอกสารทุกแถว
  // เพราะแถวพวกนั้นไม่มีช่อง `material` เลย ⇒ ปุ่มส่งจางถาวรโดยไม่มีทางแก้

  // ⭐ **ดีลที่ยังไม่ผูกโครงการ — บอกให้ตรงว่าติดอะไร**
  //
  // ฟอร์มไม่มีช่อง "โครงการ" ให้เลือก (โครงการมาจากดีล มติ 2026-08-06) ⇒ ข้อความ
  // "ต้องเลือกโครงการ" สั่งให้ผู้ใช้ทำสิ่งที่หน้าจอไม่มีให้ทำ · บน prod ตอนนับล่าสุด
  // **122 จาก 136 ดีลยังไม่ผูกโครงการ** ⇒ นี่คือทางที่คนเดินเจอบ่อยที่สุด
  if (requestNeedsRef(form.kind, 'project') && form.dealId && !form.projectId) {
    return 'ดีลนี้ยังไม่ผูกโครงการ — ผูกโครงการให้ดีลก่อนจึงเปิดคำร้องได้';
  }

  // ⚠️ ด่าน "ยอดที่ขอวางบิล" อยู่ใน `requestShapeError` (ที่เดียวกับของที่หัวข้อต้องมี)
  // เพื่อให้ **ลำดับการถามตรงกับลำดับช่องบนฟอร์ม** — ถามชื่อเรื่องก่อนยอดทั้งที่ยอด
  // อยู่แท็บแรก แปลว่าผู้ใช้ถูกส่งไปแก้ผิดแท็บ
  // ⚠️ ด่าน "ใบต้องอนุมัติแล้ว" (ม-ง) **ไม่ได้อยู่ฝั่งจอ** เพราะ blocker เห็นแต่ค่าใน
  // ฟอร์ม ไม่เห็นแถวใบเสนอราคา ⇒ กันด้วยการ**กรองลิสต์**ให้เลือกได้เฉพาะใบที่ผ่าน
  // (`billingQuotationOptions`) แล้วตรวจซ้ำที่ handler ด้วยฟังก์ชันตัวเดียวกัน
  // — แพตเทิร์นเดียวกับใบสั่งขายของบรีฟกลิ่น (`scentDesignOrderOptions`)
  return null;
}

// ค่าในฟอร์ม → body ของ POST /api/sa/requests
//
// ⚠️ ไม่ส่ง projectId / customerId / customerName: server ดึงจากแถวดีลเสมอ (ดีล
// บังคับแล้ว ลูกค้าจึงมีคำตอบเดียว) · ไม่ส่ง note: เลิกใช้ช่องนั้นแล้ว
export function requestPayload(form, extra = {}) {
  return {
    kind: form.kind,
    dept: form.dept || null,
    // ทีมเจ้าของคำร้อง — ว่าง = ทีมหลักของคนเปิด (server เติมให้ผ่าน attributionTeam)
    // ช่องนี้โผล่บนฟอร์มเฉพาะตอนคนเปิดอยู่หลายทีม (มติ 2026-08-11)
    team: form.team || null,
    // ของที่ผูก — ส่งไปเท่าที่มี server ตรวจตามหัวข้อเอง (ดู `needs`)
    dealId: form.dealId || null,
    salesOrderId: form.salesOrderId || null,
    // อ้างอิงเพิ่มของขอเอกสาร (ม-88) — ว่างได้ · server ตรวจว่าเป็นของดีลเดียวกัน
    // ⭐ หัวข้อขอเอกสารการเงินใช้ช่องนี้เป็น **ต้นทาง** (ม-ค) — server derive ดีล
    // และลูกค้าจากใบนี้ ไม่ใช่จาก `dealId` ที่ฟอร์มเติมไว้ให้ดูเฉย ๆ
    quotationId: form.quotationId || null,
    // ยอดที่ขอวางบิล (B-2) — `billAmount` คือค่าที่บัญชีเอาไปออกเอกสาร ส่วนอีกสองค่า
    // ตอบว่ามันมาจากไหน · ⚠️ server คิดใหม่จากยอดจริงของใบเสมอ ไม่เชื่อ base ที่ส่งมา
    billPercent: form.billPercent === '' || form.billPercent == null ? null : Number(form.billPercent),
    billAmount: form.billAmount === '' || form.billAmount == null ? null : Number(form.billAmount),
    // FG หลายรายการ (ม-89) — server ตรวจทุกตัวว่ามีจริง แล้วเก็บ snapshot เอง
    productIds: (form.productIds || []).filter(Boolean),
    title: form.title || null,
    body: form.body || null,
    urgent: !!form.urgent,
    urgentReason: form.urgentReason || null,
    requestedDueDate: form.requestedDueDate || null,
    scentId: form.scentId || null,
    formulaId: form.formulaId || null,
    productId: form.productId || null,
    formulaCode: form.formulaCode || null,
    formulaName: form.formulaName || null,
    // ส่วนหัว PDR + บรีฟรายกลิ่น — ส่งเฉพาะหัวข้อที่ประกาศว่าใช้ PDR
    //
    // 🐞 **ค่าที่กรอกหายทั้ง 21 ช่องมาตลอด** — คอมเมนต์เดิมตรงนี้เขียนไว้ว่า "ยังไม่
    // ส่ง `form.pdr` เพราะยังไม่มีที่เก็บ · รอ migration ส่วนหัวก่อน" · migration
    // นั้นคือ 0214 ซึ่งออกและรันไปแล้ว แต่ไม่มีใครกลับมาถอดคำว่า "ยังไม่ส่ง" ออก
    // ⇒ ผู้ใช้กรอกส่วนหัวครบ กดบันทึก แล้วหน้ารายละเอียดขึ้นว่า "ยังไม่ได้กรอก
    // ส่วนนี้" ทุกใบ · ของจริงที่ผู้ใช้เจอบนจอ ไม่ใช่เคสสมมติ
    // ⚠️ `pdrTargets` (ข้อ 2.2/2.3 · mig 0229) ต้องเดินทางมากับ `pdr` เสมอ — ลืมส่ง
    // แล้วอาการจะเหมือนบั๊กข้างบนเป๊ะ: กรอกครบ กดบันทึก แล้วรายการหายทั้งชุด
    ...(requestHasPdr(form.kind) ? {
      pdr: form.pdr || {},
      briefs: form.briefs || [],
      pdrTargets: form.pdrTargets || [],
    } : {}),
    // หัวข้อที่ไม่มีบรรทัดต้องไม่ส่ง items ไปเลย ไม่ใช่ส่ง [] — server ใช้หัวข้อเป็น
    // ตัวตัดสินอยู่แล้ว แต่ส่งของที่ไม่เกี่ยวไปด้วยทำให้ debug ยากขึ้นเปล่า ๆ
    // 🐞 **บั๊กที่ปิดตรงนี้** — เดิมแถวทุกรูปร่างถูก map เป็นโครงของ*บรรทัดวัสดุ*
    // (kind · materialId · label · tiers) ⇒ `categoryCode`/`scentId` ของพัฒนาสูตร
    // และ `docType` ของขอเอกสาร **ถูกทิ้งระหว่างทาง** แล้ว server ตอบ "ต้องเลือก
    // หมวดสินค้า" ทั้งที่ผู้ใช้เลือกไปแล้ว ⇒ สองหัวข้อนั้นเปิดใบไม่ได้เลย
    // ⇒ ส่งแถวตามที่ตัวแก้ไขบรรทัดของหัวข้อนั้นประกอบไว้ **ไม่ตีความใหม่ที่นี่**
    // (ตัวตรวจจริงคือ `normalizeLinesFor` ฝั่ง server ซึ่งรู้จักทุกรูปร่างอยู่แล้ว)
    ...(requestHasItems(form.kind) ? { items: form.items || [] } : {}),
    ...extra,
  };
}

/**
 * สามสเต็ปในการกดครั้งเดียว — คืน { id, error }
 *
 * ⭐ ทำงานคล้ายเธรด (มติผู้ใช้ 2026-08-03): ไม่มีขั้น "สร้างร่างไว้แล้วไปกดส่งอีกหน้า"
 * ให้ผู้ใช้เห็น · กลไกร่างยังอยู่ข้างในเพราะไฟล์แนบต้องมี id ของคำร้องก่อน
 *   1 POST     → ร่าง + id (ยังไม่กินเลขที่ ตามกติกาเดิม)
 *   2 upload   → ไฟล์แนบเกาะ id นั้น
 *   3 PATCH ส่ง → ออกเลขที่ · ลงเธรดคำร้อง+เธรดดีล · แจ้งเตือนคนที่ถูก @
 *
 * ⚠️ ล้มกลางทาง **ไม่ลบร่างทิ้ง** — คืน id มาด้วยเสมอถ้าสร้างสำเร็จแล้ว ผู้เรียกพา
 * ผู้ใช้ไปหน้ารายละเอียดให้ทำต่อได้ ดีกว่าลบแล้วให้พิมพ์ใหม่ทั้งใบ
 */
export async function createAndSendRequest(form, extra = {}) {
  const { id, error } = await createRequestDraft(form, extra);
  if (error) return { id, error };

  const uploadError = await uploadDraftFiles(id, form.files);
  if (uploadError) return { id, error: uploadError };

  return { id, ...(await submitRequest(id, { mentions: form.mentions })) };
}

/**
 * อัปไฟล์ที่ค้างในฟอร์มให้คำร้องที่เพิ่งได้ id — คืนข้อความ error หรือ null
 *
 * ⭐ หน้า `/requests/new` เรียกหลัง `createRequestDraft` (มติผู้ใช้ 2026-08-08:
 * แนบได้ตั้งแต่หน้าสร้าง ไม่ต้องรอไปหน้ารายละเอียด) — ไฟล์เก็บใน `form.files`
 * ระหว่างกรอก แล้วอัปทีเดียวตรงนี้เพราะ endpoint ต้องมี entityId ก่อน
 *
 * ⚠️ **ล้มกลางทางไม่ rollback ร่าง** — ไฟล์ที่อัปไปแล้วอยู่ครบ ผู้เรียกพาไปหน้า
 * รายละเอียดให้แนบตัวที่เหลือต่อได้ (กติกาเดียวกับสามสเต็ปของปุ่มส่ง)
 */
export async function uploadDraftFiles(id, files = []) {
  for (const file of files || []) {
    const up = await uploadAttachment({
      entityType: 'dept_request', entityId: id, file, docType: 'other',
    });
    if (!up.ok) return `แนบ "${file.name}" ไม่สำเร็จ: ${up.error}`;
  }
  return null;
}

/**
 * ขั้นแรกอย่างเดียว: ค่าในฟอร์ม → **ร่าง** ที่ยังไม่กินเลขที่ — คืน { id, error }
 *
 * ⭐ หน้า `/requests/new` หยุดที่นี่ (ปุ่ม "บันทึกร่าง") แล้วพาไปหน้ารายละเอียด ซึ่ง
 * เป็นที่เดียวที่ **แนบไฟล์ได้จริง** (`AttachmentsPanel` ต้องมี `entityId` ก่อน) และ
 * เป็นที่ที่กดส่ง · แยกสองขั้นได้ขั้นทบทวนก่อนเลขที่ออก ซึ่งออกแล้วย้อนไม่ได้
 *
 * ⚠️ โมดัลในใบขอราคาผลิตยังเดินสามขั้นรวด (`createAndSendRequest`) — ที่นั่นไฟล์แนบ
 * เก็บในฟอร์มมาก่อนแล้ว และไม่มีจอให้กลับไปกดส่ง
 */
export async function createRequestDraft(form, extra = {}) {
  const res = await apiFetch('/api/sa/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload(form, extra)),
  });
  const created = await res.json().catch(() => ({}));
  if (!res.ok) return { id: null, error: created.error || 'เปิดคำร้องไม่สำเร็จ' };
  return { id: created.id, error: null };
}

// ส่งร่างที่มีอยู่แล้ว — ออกเลขที่ · ลงเธรด · แจ้งคนที่ถูก @ · คืน { error }
// รับ mentions ได้ทั้ง [{id,name}] (จากฟอร์ม) และ [id] (จากหน้ารายละเอียด)
export async function submitRequest(id, { mentions = [] } = {}) {
  const sent = await apiFetch(`/api/sa/requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submit',
      mentions: (mentions || []).map((m) => (typeof m === 'string' ? m : m.id)),
    }),
  });
  if (!sent.ok) {
    const err = await sent.json().catch(() => ({}));
    return { error: err.error || 'ส่งคำร้องไม่สำเร็จ' };
  }
  return { error: null };
}
