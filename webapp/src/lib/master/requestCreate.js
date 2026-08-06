// ── เปิดคำร้อง: จากค่าในฟอร์ม → คำร้องที่ "ส่งแล้ว" ─────────────────────
//
// ⚠️ มีสองทางเรียกใช้ (โมดัลบนหน้าคำร้อง + โมดัลบนใบขอราคาผลิต) จึงต้องเป็นชิ้น
// เดียวตามกฎ AGENTS.md · ก่อนหน้านี้สองที่นั้นประกอบ payload กันเอง แล้วเพี้ยนหา
// กันจริง: ฝั่งใบขอราคาผลิตคำนวณ `kind` ใหม่เองจนไม่ตรงกับที่ฟอร์มแสดง และไม่เคย
// ส่ง scentId/formulaId ที่หัวข้อนั้นบังคับ → 400 ทุกครั้ง
import { requestHasItems, requestHasPdr, requestShapeError } from '@/lib/master/requestTypes';
import { uploadAttachment } from '@/lib/master/attachmentUpload';

/**
 * เหตุผลเดียวที่ยังส่งคำร้องไม่ได้ — คืนข้อความไทย หรือ null ถ้าพร้อมส่ง
 *
 * ⭐ **ที่เดียว** ที่ตัดสินว่าปุ่มส่งเปิดหรือไม่ และเป็นข้อความเดียวกับที่ฟอร์มแสดง —
 * ก่อนหน้านี้ `requestShapeError` คุมส่วนหนึ่ง แล้วผู้เรียกแต่ละที่เขียนเงื่อนไข
 * "ทุกรายการต้องมีวัสดุ" ต่อท้ายเอง → ปุ่มจางลง**โดยไม่มีข้อความบอกเหตุผล** ซึ่งเป็น
 * อาการเดียวกับที่เพิ่งแก้ไปในรอบนี้ แค่มาอีกทาง (ตรวจในเบราว์เซอร์แล้วเจอจริง)
 *
 * ⚠️ ด่านของ server คือ `requestShapeError` + `normalizeRequestItems` — ตัวนี้เป็น
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

  if (requestHasItems(form.kind)) {
    const incomplete = (form.items || [])
      .some((it) => !it.material?.materialId && !(it.material?.label || '').trim());
    if (incomplete) return 'ต้องเลือกวัสดุของทุกรายการ (หรือพิมพ์ชื่อวัสดุใหม่)';
  }
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
    // ของที่ผูก — ส่งไปเท่าที่มี server ตรวจตามหัวข้อเอง (ดู `needs`)
    dealId: form.dealId || null,
    salesOrderId: form.salesOrderId || null,
    title: form.title || null,
    body: form.body || null,
    urgent: !!form.urgent,
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
    ...(requestHasPdr(form.kind) ? { pdr: form.pdr || {}, briefs: form.briefs || [] } : {}),
    // หัวข้อที่ไม่มีบรรทัดต้องไม่ส่ง items ไปเลย ไม่ใช่ส่ง [] — server ใช้หัวข้อเป็น
    // ตัวตัดสินอยู่แล้ว แต่ส่งของที่ไม่เกี่ยวไปด้วยทำให้ debug ยากขึ้นเปล่า ๆ
    ...(requestHasItems(form.kind) ? {
      items: (form.items || []).map((it) => ({
        kind: it.kind,
        materialId: it.material?.materialId || null,
        label: it.material?.label || '',
        spec: it.spec,
        componentId: it.componentId || null,
        tiers: it.tiers,
      })),
    } : {}),
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

  for (const file of form.files || []) {
    const up = await uploadAttachment({
      entityType: 'dept_request', entityId: id, file, docType: 'other',
    });
    if (!up.ok) return { id, error: `แนบ "${file.name}" ไม่สำเร็จ: ${up.error}` };
  }

  return { id, ...(await submitRequest(id, { mentions: form.mentions })) };
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
  const res = await fetch('/api/sa/requests', {
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
  const sent = await fetch(`/api/sa/requests/${id}`, {
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
