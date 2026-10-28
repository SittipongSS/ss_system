// ── ข้อความยืนยันก่อน "อนุมัติ" ทุกจุดในระบบ ─────────────────────────────────
//
// มติผู้ใช้ 2026-08-13: **ไม่ว่ากรณีใด การอนุมัติต้องมีโมดัลถามก่อนเสมอ** รวมถึง
// การที่บัญชีคอนเฟิร์มว่าเงินเข้าแล้ว ซึ่งไม่ใช่การอนุมัติเอกสาร แต่ถอยได้ทางเดียวคือบัญชี
// "ถอนคำรับรอง" พร้อมเหตุผล (action `unconfirm` · มีตั้งแต่ 2026-08-13) — ไม่ใช่กดผิดแล้วแก้เองได้
//
// ⭐ ทำไมต้องเป็นไฟล์กลาง ไม่ใช่ต่างคนต่างเขียนข้อความในหน้าตัวเอง:
// โมดัลยืนยันที่เขียนว่า "แน่ใจหรือไม่" เฉย ๆ ไม่มีค่าอะไรเลย — คนกดผ่านโดยไม่อ่าน
// สิ่งที่กันพลาดได้จริงคือ **บอกว่ากดแล้วเกิดอะไรขึ้นบ้าง** ซึ่งแต่ละหน้าจะเขียนเองไม่ครบ
// เสมอ (ตอนเพิ่มขั้นบัญชี mig 0250 โมดัลอนุมัติ SO ก็ยังบอกแค่ยอด Actual ทั้งที่การกด
// ครั้งนั้นสร้างงวดชำระและส่งใบเข้าคิวบัญชีไปด้วย) · บังคับผ่านตัวสร้างตัวเดียวแล้ว
// ลืมไม่ได้ เพราะ `effects` เป็นพารามิเตอร์บังคับ
//
// ใช้คู่กับ `confirmAction()` จาก components/ui/ConfirmDialog:
//   if (!await confirmAction(approvalPrompt({ ... }))) return;
//
// ⚠️ ไฟล์นี้ถูก import ฝั่งจอ — import ได้เฉพาะไฟล์ที่ไม่มี import ต่อ (historicalOrders ตั้งใจไม่มี import)
import { HISTORICAL_STATUS_NOTE } from '@/lib/sales/historicalOrders';

/** ข้อความเตือนของการกระทำที่ถอนคืนไม่ได้ — ขึ้นเป็นบรรทัดแรกของ detail เสมอ */
export const IRREVERSIBLE_NOTE = 'ย้อนกลับเองไม่ได้';

/**
 * สร้าง payload ให้ `confirmAction()` สำหรับการอนุมัติ/รับรองทุกชนิด
 *
 * @param subject       สิ่งที่กำลังอนุมัติ เช่น "ใบสั่งขาย SO-26080008-0"
 * @param effects       **บังคับ อย่างน้อย 1 ข้อ** — สิ่งที่จะเกิดขึ้นทันทีหลังกด
 *                      เขียนเป็นผลลัพธ์ที่คนอ่านตรวจได้ ไม่ใช่คำอธิบายปุ่ม
 *                      ✅ "ยอด Actual ฿30,000 เข้าดีลทันที"
 *                      ❌ "ระบบจะดำเนินการต่อ"
 * @param checklist     สิ่งที่ผู้อนุมัติควรตรวจ **ก่อน** กด (ไม่บังคับ) — ขึ้นก่อน `effects`
 *                      ใช้เมื่อการอนุมัตินั้นคือการรับรองว่าตรวจข้อมูลครบแล้ว เช่นขั้นบัญชี
 * @param confirmLabel  ป้ายปุ่มยืนยัน — ใช้คำกริยาเดียวกับปุ่มที่กดมา
 * @param irreversible  true = เติมบรรทัดเตือนว่าถอนคืนไม่ได้
 * @param title         หัวโมดัล (ปกติปล่อยค่าตั้งต้น)
 */
export function approvalPrompt({
  subject,
  effects,
  checklist = [],
  confirmLabel,
  irreversible = false,
  title = 'ยืนยันการอนุมัติ',
  // คำในประโยคคำถาม — การรับรองที่ไม่ใช่ "อนุมัติเอกสาร" ต้องใช้คำของตัวเอง
  // ไม่งั้นจะได้ประโยคเพี้ยนแบบ "ยืนยันอนุมัติ ชำระเต็มจำนวน หรือไม่"
  verb = 'อนุมัติ',
}) {
  const lines = (Array.isArray(effects) ? effects : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  // 🔴 ตั้งใจให้พังตอน dev ไม่ใช่ปล่อยผ่านเป็นโมดัลเปล่า — โมดัลที่ไม่บอกผลลัพธ์
  // คือโมดัลที่คนกดผ่านโดยไม่อ่าน ซึ่งแย่กว่าไม่มีโมดัล เพราะสร้างความรู้สึกปลอดภัยปลอม ๆ
  if (!lines.length) throw new Error('approvalPrompt: ต้องบอกอย่างน้อย 1 อย่างที่จะเกิดขึ้นหลังกดอนุมัติ');

  const checks = (Array.isArray(checklist) ? checklist : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  // เว้นบรรทัดหลังคำเตือน — ไม่งั้นบนจอจริงมันไหลติดหัวข้อ "สิ่งที่จะเกิดขึ้นทันที:"
  // จนคำเตือนกลายเป็นบรรทัดแรกของรายการแทนที่จะเป็นคำเตือน (เห็นตอนกดดูจริง)
  const detail = [
    ...(irreversible ? [`⚠️ ${IRREVERSIBLE_NOTE}`, ''] : []),
    ...(checks.length ? ['สิ่งที่ต้องตรวจก่อนกด:', ...checks.map((line) => `· ${line}`), ''] : []),
    'สิ่งที่จะเกิดขึ้นทันที:',
    ...lines.map((line) => `· ${line}`),
  ].join('\n');

  return {
    title,
    // ไม่มี subject = ไม่เอ่ยชื่อของ แต่ยังต้องเป็นประโยคที่อ่านรู้เรื่อง
    // (อย่าเติม "การ" นำหน้า verb — คำอย่าง "การรับชำระ" มีอยู่ในตัวแล้ว จะได้ "การการ")
    description: subject ? `ยืนยัน${verb} ${subject} หรือไม่` : `ยืนยัน${verb}หรือไม่`,
    detail,
    confirmLabel: confirmLabel || 'ยืนยันอนุมัติ',
  };
}

/**
 * ผู้บริหารอนุมัติราคาผลิตรายสินค้า (หน้าใบขอราคา `/sa/costing/[id]`)
 *
 * 🐞 **พบตอนตรวจระบบ 2026-08-16:** โมดัลอนุมัติราคาผลิตเป็นโมดัล *กรอกข้อมูล* —
 * โชว์ต้นทุนต่อชิ้นกับช่องกรอกราคาแต่ละชั้น แล้วมีปุ่ม "อนุมัติ" **โดยไม่บอกสักบรรทัด
 * ว่ากดแล้วเกิดอะไรขึ้น** ซึ่งขัดกับกฎของไฟล์นี้เอง
 *
 * ⚠️ **การอนุมัติยังไม่ได้เขียนทับราคาสินค้า** — ราคาลง `approvedUnitPrice` ของแต่ละชั้น
 * ก่อน แล้วต้องมีคนกด "ป้อนต้นทุนเข้า FG" (`/api/sa/costing/[id]/feed-cost`) อีกขั้นถึงจะ
 * ทับ `costPrice` ของสินค้าจริง · ข้อความจึงต้องพูดตามลำดับนั้น ไม่ใช่ลัดว่า
 * "กดแล้วราคาขายเปลี่ยนทันที" ซึ่งไม่จริงและทำให้คนไม่เชื่อบรรทัดอื่นด้วย
 *
 * ⭐ แต่ต้องบอกปลายทางให้ครบ: `costPrice` **คือราคาขายบนใบเสนอราคาทั้งระบบ**
 * (`QUOTE_PRICE_FIELD` ใน lib/sales/quoteLines.js) ⇒ คนกดอนุมัติ "ราคาผลิต" กำลัง
 * ตั้งตัวเลขที่ลูกค้าจะเห็น ซึ่งเป็นสิ่งที่โมดัลเดิมไม่ได้บอกเลย
 *
 * @param tierCount จำนวนชั้นราคาที่กำลังอนุมัติ
 */
export function costingPriceApprovalEffects({ tierCount = 0 } = {}) {
  return [
    tierCount > 1
      ? `บันทึกราคาที่กรอกเป็นราคาที่ผู้บริหารอนุมัติ ครบทั้ง ${tierCount} ชั้นจำนวน`
      : 'บันทึกราคาที่กรอกเป็นราคาที่ผู้บริหารอนุมัติ',
    'ผูกการอนุมัติกับลายเซ็นอิเล็กทรอนิกส์ของคุณ',
    'รายการนี้เปลี่ยนเป็น "อนุมัติแล้ว" — อนุมัติครบทุกรายการเมื่อไร ใบจะเป็น "อนุมัติครบ"',
    'ปลดล็อกปุ่ม "ป้อนต้นทุนเข้า FG" ซึ่งเป็นขั้นที่เขียนราคานี้ทับต้นทุนของสินค้าจริง',
    'ต้นทุนของสินค้า = ราคาขายบนใบเสนอราคา ⇒ ตัวเลขนี้คือสิ่งที่ลูกค้าจะเห็น',
  ];
}

/** เวอร์ชันโมดัลยืนยันเต็มรูป — ใช้เมื่อจุดอนุมัติไม่มีฟอร์มของตัวเอง */
export function costingPriceApprovalPrompt({ subject, tierCount } = {}) {
  return approvalPrompt({
    title: 'ยืนยันอนุมัติราคาผลิต',
    subject,
    effects: costingPriceApprovalEffects({ tierCount }),
    confirmLabel: 'ยืนยันอนุมัติราคา',
  });
}

/**
 * AE Sup อนุมัติใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — **โมดัลเดียวทั้งผู้ตรวจปกติและ Admin Override**
 *
 * ⭐ ต่างจากใบ pipeline ทั้งชุด: ใบย้อนหลังขายไปก่อนเข้าระบบ ⇒ อนุมัติแล้ว **ไม่นับ Actual** · ไม่มีลายเซ็น ·
 *   ไม่สร้างงวดจากใบเสนอราคา · สิ่งที่เกิดจริงคือ เอกสารแทนสัญญาได้เลข CT · งวดหยุดยอดเข้าคิวบัญชี ·
 *   โซนเปิดให้ TS ตั้งรอบ ⇒ ป้าย "อนุมัติและนับ Actual" ของใบปกติ **ห้ามโผล่** กับใบนี้
 * ⭐ Override ใช้ **รายการตรวจชุดเดิม** แค่เติมบรรทัดของ override — ไม่ใช่โมดัลมือของใบ pipeline
 *   (ตัวนั้นไม่บอกผลลัพธ์ และไม่ส่งเวอร์ชันของใบ)
 * ⚠️ `effects` ของผู้เรียกยังบังคับอย่างน้อย 1 ข้อ — บรรทัด "ไม่นับ Actual" ที่เติมท้ายเสมอไม่นับแทนผลลัพธ์จริง
 *   (ไม่งั้นโมดัลที่พูดแต่ป้ายสถานะก็ผ่านด่านของ approvalPrompt ได้)
 *
 * @param subject    เช่น "ใบสั่งขาย SO-26090051-0"
 * @param checklist  สิ่งที่ AE Sup รับรองว่าตรวจแล้ว (ดู historicalApprovalFacts)
 * @param effects    สิ่งที่เกิดทันทีหลังกด (ไม่รวม HISTORICAL_STATUS_NOTE — เติมให้เอง)
 * @param override   null = ผู้ตรวจปกติ · `{ note }` = admin อนุมัติใบที่ตัวเองคีย์/ส่ง
 */
export function historicalApprovalPrompt({ subject, checklist = [], effects, override = null } = {}) {
  const given = (Array.isArray(effects) ? effects : []).map((line) => String(line || '').trim()).filter(Boolean);
  if (!given.length) throw new Error('approvalPrompt: ต้องบอกอย่างน้อย 1 อย่างที่จะเกิดขึ้นหลังกดอนุมัติ');
  const overrideNote = override ? String(override.note || '').trim() : '';
  return approvalPrompt({
    title: 'อนุมัติ ใบสั่งขาย',
    subject,
    checklist,
    effects: [...given, ...(overrideNote ? [overrideNote] : []), HISTORICAL_STATUS_NOTE],
    confirmLabel: override ? 'ยืนยัน Override ใบย้อนหลัง (ไม่นับ Actual)' : 'อนุมัติใบย้อนหลัง',
  });
}

/**
 * บัญชีคอนเฟิร์มว่าเงินงวดนี้เข้าจริง — ไม่ใช่การอนุมัติเอกสาร จึงใช้คำคนละชุด
 *
 * ⚠️ ถอยได้ทางเดียวคือบัญชี "ถอนคำรับรอง" พร้อมเหตุผล (action `unconfirm` · มติผู้ใช้ 2026-08-13 —
 * คอมเมนต์เดิมที่ว่า "ไม่มี un-confirm ในระบบ" ล้าสมัยตั้งแต่วันนั้น) ⇒ โมดัลต้องพูดเรื่องนี้ตรง ๆ ก่อนกด
 * ⭐ PR1 (mig 0376 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09): งวดที่คอนเฟิร์มแล้ว **ไม่ล็อกการย้อนการอนุมัติ/
 *   ออก Rev. อีกแล้ว** — RPC ออก Rev. ย้ายแถวไปใบ Rev. ทั้งแถว (สถานะ · หลักฐาน · ใบกำกับคงเดิม) ⇒ บรรทัด Rev. ของใบปกติ
 *   บอกผลนั้นแทนคำเดิม "ใบนี้จะย้อนการอนุมัติหรือออก Rev. ใหม่ไม่ได้อีก" (ซึ่งกลายเป็นเท็จ)
 *   · PR3 (mig 0378): ยกเลิกใบ pipeline ที่มีเงินรับแล้วได้ — เงินค้างอยู่กับใบ (ยกเข้าใบใหม่/บันทึกคืนเงิน · paymentCarryPrompt/
 *     paymentRefundPrompt) · ใบย้อนหลังยังล็อกการยกเลิกด้วยงวดปกติที่รับรองแล้ว (historicalCancelBlock — บรรทัดข้างล่าง)
 * ⭐ บัญชีกด "บันทึกการรับชำระ" เอง (แจ้ง+รับรองในก้าวเดียว) ใช้ข้อความชุดนี้ด้วย ผ่าน
 *   `installmentConfirmPrompt` (components/salesPlanning/InstallmentConfirmDialog.js)
 *
 * ⭐ **ใบสั่งขายย้อนหลัง (`historical`) พูดคนละชุด** (มติ 22/09 · mock FnConfirm):
 *   ใบนี้ไม่มี Rev. และไม่นับ Actual ตั้งแต่แรก ⇒ สองบรรทัดนั้นของใบปกติเป็นเรื่องไม่จริง
 *   สิ่งที่เกิดจริงคือ "จ่ายถึง" ขยับ (ด่านเงินของนัดบริการ) และผลต่อการยกเลิกใบ ⇒ ต้องบอกก่อนกด ไม่ใช่รู้ทีหลัง
 *   ⭐ มติเจ้าของ 24/09 (mig 0387) แยกสองกรณี:
 *     · งวดยกมา — ผู้จัดการฝ่ายขายยกเลิกใบเพื่อคีย์ใหม่ได้แม้รับรองแล้ว งวดนี้เป็นโมฆะตามใบ ⇒ บอกว่าใบใหม่ต้องรับรองอีกครั้ง
 *       (คำเดิม "AE Sup ยกเลิกใบนี้ไม่ได้อีก" กลายเป็นเท็จ)
 *     · งวดปกติ — เงินที่รับในระบบหลังอนุมัติ ยังล็อกการยกเลิกใบจนกว่าบัญชีถอนคำรับรอง**แล้วตีกลับ** (historicalCancelBlock)
 *       ซึ่งปิดทางแก้ข้อมูลผิด "ยกเลิกแล้วคีย์ใหม่" ชั่วคราว · review 25/09: ถอนอย่างเดียวแถวกลับเป็น "รอตรวจ" ซึ่งยังบล็อก ⇒ บอกครบสองขั้น
 *   ⚠️ ใบ pipeline ได้ผลลัพธ์เดิมทุกตัวอักษร (ค่าตั้งต้นของพารามิเตอร์ใหม่ทั้งหมด = ปิด)
 *
 * @param label               ชื่องวด เช่น "งวดที่ 2" หรือ "ชำระเต็มจำนวน"
 * @param amount              ยอดที่จะถูกบันทึกว่าเก็บได้แล้ว (ข้อความจัดรูปมาแล้ว)
 * @param historical          งวดของใบสั่งขายย้อนหลัง
 * @param opening             งวดยกมา (เงินที่เก็บก่อนเข้าระบบ)
 * @param paidThroughLabel    "จ่ายถึง" หลังรับรอง (ข้อความจัดรูปมาแล้ว) — ปกติ = ปลายช่วงครอบของงวดนี้
 * @param nextInstallmentLabel งวดที่ต้องเก็บถัดไป (ข้อความจัดรูปมาแล้ว) · ไม่มี = ไม่พูด
 * @param serviceZoneCount    ใบ pipeline: จำนวนโซนของรอบขายที่มีผลของใบ (server นับ — GET ใบ / แถวทะเบียน · PR-C C5) ·
 *                            0/ไม่รู้ = ไม่มีบรรทัดด่านเงินของนัดบริการ (ภาพนิ่งเดิม)
 * @param serviceContractLinked ใบ pipeline: ใบผูกสัญญาแล้วไหม — ค่าตั้งต้น true = ไม่รู้ ⇒ ไม่พูดเรื่องสัญญา (ไม่อ้างสิ่งที่ไม่ได้ตรวจ)
 * @param serviceGateThroughLabel ใบ pipeline: วันที่ด่านเงินของนัดเปิดจริงหลังรับรอง (`installmentConfirmOutlook.gateOpenThrough`
 *                            ข้อความจัดรูปแล้ว) · ไม่ส่ง = ใช้ "จ่ายถึง"
 * @param serviceGateHeld     งวดที่ค้างซึ่งกดวันนั้นไว้ `{ seq, dueLabel }` · ไม่มี = null
 * @param actualCountedLate   ใบรายงวด: งวด `so_approval` ที่นับ **หลัง** เวลาอนุมัติใบ (ปุ่มกู้ "นับงวด 1") — บรรทัด Actual ไม่อ้าง "ตอนอนุมัติใบ"
 */
/* สองบรรทัดของใบ pipeline ตามสถานะใบ (review UI-1 / F2) — PR0/PR3 เปิดให้บัญชีรับรองงวดบนใบยกเลิก · มติ D3 บนใบที่ย้อนการอนุมัติ
   และใบ Rev. ที่ยังไม่อนุมัติ ⇒ คำของใบที่อนุมัติอยู่ ("ถ้าถูกย้อน… ย้ายไปกับใบ Rev." · "Actual เต็มตั้งแต่ใบอนุมัติ") เป็นเท็จกับใบเหล่านั้น
   ⚠️ ไม่รู้สถานะ (ผู้เรียกไม่ส่ง) / approved = คำเดิมทุกตัวอักษร (ภาพนิ่งตรึงไว้) · Actual นับเฉพาะใบ approved (salesOrderAmountKind) */
/* บรรทัด Actual ของใบรายงวดตามทางที่งวดนี้ถูกนับ (`actualApprovedVia` ของงวด · UAT FN 27/10 ข้อ 4)
   🐞 เดิม "นับไปแล้วตอน AE Sup อนุมัติงวด" ทุกงวด — เท็จกับงวดที่นับตอนอนุมัติใบ (`so_approval`: งวด 1/งวด 0 บาท/งวดที่รับรองแล้ว ·
     แถวที่ยกเงินเข้ารับ Actual ของงวดที่ถูกแทน) และงวดของ "นับที่เหลือทั้งหมด" (`count_rest` — กดเอง หรือระบบนับให้ตามมติข้อ 10)
   ⭐ ไม่รู้ทาง (แถวรุ่นที่ไม่พก/งวดยังไม่นับ) = ไม่อ้างว่านับตอนไหน
   🐞 review รอบหก 27/10: `so_approval` มาได้สองทาง — คลิกอนุมัติใบ (route ส่งเวลาอนุมัติ ⇒ `actualApprovedAt` = `approvedAt` ของใบพอดี)
     และปุ่มกู้ "นับงวด 1"/"นับงวดที่ค้าง" หลังขั้นนับตอนอนุมัติล้ม (RPC ลงเวลาที่กด · via ยังเป็น so_approval) ⇒ ทางหลังพูด "ตอนอนุมัติใบ" ไม่ได้
     (แถว "นับ Actual" ของโมดัลเดียวกันโชว์เดือนที่กด) · ผู้เรียกบอกว่านับทีหลังด้วย `actualCountedLate` (installmentConfirmPrompt เทียบสองเวลา)
     ⚠️ ป้ายปุ่มเขียนตรงตัว — ไฟล์นี้ import salesOrderActualMode ไม่ได้ (หัวไฟล์) · ตรงกับ INSTALLMENT_ACTUAL_START_LABEL/START_LEFT_LABEL (ยามในเทสต์) */
const INSTALLMENT_ACTUAL_COUNTED_LINE = Object.freeze({
  review: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด',
  so_approval: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับไปแล้วตอน AE Sup อนุมัติใบ',
  so_recovery: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับไปแล้วหลังอนุมัติใบ ตอน AE Sup กด “นับงวด 1”/“นับงวดที่ค้าง”',
  count_rest: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับไปแล้วตอน AE Sup กด “นับที่เหลือทั้งหมด”',
  auto: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้ระบบนับให้อัตโนมัติแล้ว (ใบกด “นับที่เหลือทั้งหมด” ไว้ · มติข้อ 10)',
  unknown: 'ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับ Actual ไปแล้ว',
});
const installmentActualCountedLine = (via, auto, late = false) => (auto ? INSTALLMENT_ACTUAL_COUNTED_LINE.auto
  : via === 'so_approval' && late ? INSTALLMENT_ACTUAL_COUNTED_LINE.so_recovery
    : INSTALLMENT_ACTUAL_COUNTED_LINE[via] || INSTALLMENT_ACTUAL_COUNTED_LINE.unknown);

function pipelineConfirmEffects(orderStatus, {
  actualMode = 'order', nextInstallmentLabel = '', nextNeedsActualSubmit = false, actualApprovedVia = null, actualAutoCounted = false,
  actualCountedLate = false,
} = {}) {
  if (orderStatus === 'cancelled') {
    return [
      'ใบนี้ยกเลิกแล้ว — งวดนี้เป็น “เงินค้างจากใบที่ยกเลิก”: ยกเข้าใบใหม่ของดีลเดียวกัน (ปุ่ม “ยกเงินจากใบที่ยกเลิก” ที่ใบใหม่)'
        + ' หรือบัญชีบันทึกคืนเงินให้ลูกค้า',
      'ยอด Actual ไม่เปลี่ยน — ใบที่ยกเลิกไม่นับ Actual',
    ];
  }
  if (orderStatus === 'approval_revoked') {
    return [
      'ใบนี้ถูกย้อนการอนุมัติ — ตอนออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. บัญชีไม่ต้องรับรองซ้ำ',
      'ยอด Actual ไม่เปลี่ยน — ระหว่างรอ Rev. ใบนี้ไม่นับ Actual · Actual นับเมื่อใบ Rev. อนุมัติ',
    ];
  }
  if (orderStatus && orderStatus !== 'approved') {
    return [
      'ใบนี้ยังไม่อนุมัติ — Actual นับเมื่อ AE Sup อนุมัติใบ · งวดที่รับรองแล้วอยู่กับใบนี้ต่อ ไม่ต้องรับรองซ้ำ',
    ];
  }
  /* ⭐ ใบ "Actual รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026) — ยอดเต็มตั้งแต่ใบอนุมัติ **ไม่จริง** กับใบนี้:
     งวดนี้นับ Actual ไปแล้วตอน AE Sup อนุมัติงวด (ฐานกันการรับรองงวดที่ยังไม่อนุมัติ — installment_actual_not_approved)
     และการรับรองคือด่านเปิดให้ฝ่ายขายยื่นงวดถัดไป (มติข้อ 2) ⇒ บอกผลนั้นแทน · ใบทั้งใบ = คำเดิมทุกตัวอักษร
     ⚠️ บรรทัด "ยื่นงวดถัดไป" ขึ้นเฉพาะ `nextNeedsActualSubmit` (มีงวดถัดไปที่ยังไม่ยื่น/ถูกตีกลับ — ผู้เรียกคิดจากแถวงวด) ·
       งวดสุดท้าย / นับที่เหลือทั้งหมดแล้ว / งวดถัดไปยื่นหรือนับแล้ว = ไม่มีบรรทัดนี้ (เคยพูดถึงขั้นที่ไม่มีวันเกิด · review 26/10) */
  if (actualMode === 'installment') {
    const next = String(nextInstallmentLabel || '').trim();
    return [
      'ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. — บัญชีไม่ต้องรับรองซ้ำ',
      installmentActualCountedLine(actualApprovedVia, actualAutoCounted, actualCountedLate),
      ...(nextNeedsActualSubmit
        ? [next ? `ฝ่ายขายยื่นขอนับ Actual งวดถัดไป (${next}) ได้ทันทีหลังรับรอง` : 'ฝ่ายขายยื่นขอนับ Actual งวดถัดไปได้ทันทีหลังรับรอง']
        : []),
    ];
  }
  return [
    'ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. — บัญชีไม่ต้องรับรองซ้ำ',
    'ยอด Actual ของฝ่ายขายไม่เปลี่ยน — เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว',
  ];
}

/**
 * บรรทัดด่านเงินของนัดบริการของใบ pipeline ที่เปิดงานบริการแล้ว (PR-C C5 · C-D14 · r2 F1 · critique M3) — ที่เดียวที่ประกอบประโยค
 * ⭐ "เปิด**ด่านเงิน**ของนัดบริการ" ไม่ใช่ "เปิดนัดบริการ" ของสเปก/ม็อก: ด่าน① สัญญายังบล็อกทุกนัดของใบที่ไม่มีสัญญาที่มีผล
 *   (lib/service/visitGate.js) ⇒ "เปิดนัด" เป็นคำเท็จ · คำเดียวกับบรรทัดของใบย้อนหลัง ("เปิดด่านเงินของนัดบริการถึง …")
 * ⭐ ใบยังไม่ผูกสัญญา ⇒ ต่อท้ายว่านัดยังติดด่านสัญญา · ผูกแล้วแต่ยังไม่ลงนาม = ไม่ต่อท้าย (ประโยคเรื่องเงินยังจริง ไม่อ้างสิ่งที่ไม่ได้ตรวจ)
 * @param through        วันที่ด่านเงินของนัดเปิดถึงหลังรับรอง (ข้อความจัดรูปมาแล้ว) — ปกติ = "จ่ายถึง" · ถูกงวดอื่นที่ค้างกดไว้ = วันครบกำหนดของงวดนั้น
 * @param zones          จำนวนโซนของรอบขายที่มีผลของใบ
 * @param contractLinked ใบผูกสัญญาแล้วไหม (ไม่ส่ง = ผูกแล้ว/ไม่รู้ ⇒ ไม่มีท่อนสัญญา)
 * @param heldBy         งวดที่ยังไม่รับรองซึ่งกดวันเปิดด่านไว้ `{ seq, dueLabel }` (review 29/09) — บอกงวดนั้นแทน "งวดถัดไป"
 */
export function FN_SERVICE_GATE_LINE({ through, zones, contractLinked = true, heldBy = null } = {}) {
  const until = heldBy?.seq
    ? `งวดที่ ${heldBy.seq}${heldBy.dueLabel ? ` (ครบกำหนด ${heldBy.dueLabel})` : ''}`
    : 'งวดถัดไป';
  return `เปิดด่านเงินของนัดบริการของใบนี้ถึง ${through} (${zones} โซน) — นัดหลังจากนั้นยังติดด่านเงินจนกว่าจะรับรอง${until}`
    + (contractLinked === false ? ' · นัดยังติดด่านสัญญาจนกว่าฝ่ายขาย (SA) ผูกสัญญา' : '');
}

/* อ่านรอบขายของใบไม่ขึ้น (GET ใบ `serviceTermZonesError` · review 29/09) — บอกว่าไม่รู้ ไม่ใช่เงียบเหมือนใบที่ไม่มีโซนบริการ
   ⚠️ ไม่อ้างว่าไม่มีผล: ถ้าใบมีรอบขาย การรับรองยังเปิดด่านเงินของนัดตามปกติ · แผง = ก่อนเปิดโมดัล · โมดัล = ข้างบรรทัดผลลัพธ์ */
export const FN_SERVICE_GATE_UNREAD_PANEL = 'โมดัลรับรองงวดของใบนี้จะไม่บอกผลต่อด่านเงินของนัดบริการ — เปิดหน้าใหม่อีกครั้ง';
export const FN_SERVICE_GATE_UNREAD_MODAL = 'อ่านรอบขายของใบไม่สำเร็จ — รายการข้างล่างไม่ได้บอกผลต่อด่านเงินของนัดบริการ '
  + '(ถ้าใบมีรอบขาย การรับรองยังเปิดด่านเงินของนัดตามปกติ) · เปิดหน้าใหม่อีกครั้ง';

/* @param actualMode        ใบ pipeline: แบบการนับ Actual ของใบ ('order' | 'installment' · mig 0412) — ไม่ส่ง = ทั้งใบ (คำเดิม)
 *                          ใบรายงวดที่อนุมัติอยู่พูดว่า "งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด" + ยื่นงวดถัดไปได้หลังรับรอง
 *                          (ชื่องวดถัดไปมาจาก `nextInstallmentLabel` ตัวเดิม — ไม่มี = บรรทัดไม่มีชื่องวด)
 * @param nextNeedsActualSubmit ใบรายงวด: งวดถัดไปยังต้องยื่นขอนับ (ยังไม่ยื่น/ถูกตีกลับ) — false/ไม่ส่ง = ไม่มีบรรทัด "ยื่นงวดถัดไป"
 * @param actualApprovedVia ใบรายงวด: ทางที่งวดนี้ถูกนับ ('review' · 'so_approval' · 'count_rest') — บรรทัด Actual บอก "นับตอนไหน" ตามทางนั้น
 *                          (UAT FN 27/10 ข้อ 4) · ไม่ส่ง = ไม่อ้างจังหวะ
 * @param actualAutoCounted ใบรายงวด: งวดนี้ระบบนับให้เอง (มติข้อ 10 · installmentActualAutoCounted) — ชนะ `actualApprovedVia` */
export function paymentConfirmPrompt({
  label, amount, historical = false, opening = false, paidThroughLabel = null, nextInstallmentLabel = null,
  orderStatus = null, serviceZoneCount = 0, serviceContractLinked = true,
  serviceGateThroughLabel = null, serviceGateHeld = null, actualMode = 'order', nextNeedsActualSubmit = false,
  actualApprovedVia = null, actualAutoCounted = false, actualCountedLate = false,
} = {}) {
  if (historical) {
    const through = String(paidThroughLabel || '').trim();
    const next = String(nextInstallmentLabel || '').trim();
    return approvalPrompt({
      title: 'บัญชีคอนเฟิร์มการชำระ',
      verb: 'การรับชำระ',
      subject: [label, amount].filter(Boolean).join(' · '),
      irreversible: true,
      effects: [
        'บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
        ...(opening ? ['งวดยกมา — เงินที่เก็บก่อนเข้าระบบ รับรองครั้งเดียว'] : []),
        through
          ? `เปิดด่านเงินของนัดบริการถึง ${through}`
          : 'เปิดด่านเงินของนัดบริการตามช่วงครอบของงวดนี้',
        opening
          ? 'ถ้าผู้จัดการฝ่ายขายยกเลิกใบเพื่อคีย์ใหม่ งวดยกมานี้เป็นโมฆะตามใบ — ใบใหม่ต้องรับรองงวดยกมาอีกครั้ง'
          : 'ผู้จัดการฝ่ายขายยกเลิกใบนี้ไม่ได้จนกว่าบัญชีถอนคำรับรองแล้วตีกลับงวดนี้ — ถ้ายอดหรือช่วงครอบผิด ให้ตีกลับแทนการรับรอง',
        ...(next ? [`งวดถัดไป ${next}`] : []),
        HISTORICAL_STATUS_NOTE,
      ],
      confirmLabel: 'ยืนยันว่าเงินเข้าแล้ว',
    });
  }
  const through = String(paidThroughLabel || '').trim();
  return approvalPrompt({
    title: 'บัญชีคอนเฟิร์มการชำระ',
    verb: 'การรับชำระ',
    subject: [label, amount].filter(Boolean).join(' · '),
    /* ไม่ใช่ irreversible (UAT 23/09): บัญชีถอนคำรับรองเองได้ (unconfirm) และงวดที่รับรองแล้วไม่ล็อกการย้อน/ยกเลิกใบอีก
       ⇒ "ย้อนกลับเองไม่ได้" เป็นเท็จ — บอกทางถอนเป็นผลลัพธ์บรรทัดท้ายแทน (ใบย้อนหลังข้างบนคงคำเดิมตามม็อกที่เจ้าของผ่าน) */
    effects: [
      'บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
      /* PR-C C5: ใบที่มีรอบขายที่มีผล (server นับให้เฉพาะใบอนุมัติที่เปิดงานบริการแล้ว) + รู้ "จ่ายถึง" + ใบอนุมัติอยู่/ไม่รู้สถานะ
         ⚠️ ใบที่ไม่อยู่ในสถานะอนุมัติ รอบขายของใบไม่มีผล (termOrderActive) ⇒ ไม่พูด แม้ผู้เรียกส่งจำนวนค้างมา */
      /* review 29/09: วันที่พูด = วันที่ด่านเปิดจริง (`serviceGateThroughLabel` · งวดอื่นที่ค้างกดไว้ได้) · ไม่ส่ง = "จ่ายถึง" (ผู้เรียกเดิม) */
      ...(serviceZoneCount > 0 && through && (!orderStatus || orderStatus === 'approved')
        ? [FN_SERVICE_GATE_LINE({
          through: String(serviceGateThroughLabel || '').trim() || through,
          zones: serviceZoneCount,
          contractLinked: serviceContractLinked,
          heldBy: serviceGateHeld,
        })]
        : []),
      ...pipelineConfirmEffects(orderStatus, {
        actualMode, nextInstallmentLabel, nextNeedsActualSubmit, actualApprovedVia, actualAutoCounted, actualCountedLate,
      }),
      'ถ้ารับรองผิด บัญชีถอนได้ที่เมนู “ถอนคำรับรอง” ของงวดนี้ (ต้องใส่เหตุผล)',
    ],
    confirmLabel: 'ยืนยันว่าเงินเข้าแล้ว',
  });
}

/**
 * AE Sup/admin **ปรับแผนงวดชำระ** ของใบสั่งขายที่อนุมัติแล้ว (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติ D1/D5)
 *
 * ⭐ ใบยังอนุมัติอยู่ ⇒ Actual ไม่ขยับ — แต่คนกดต้องเห็นว่า "ไม่ขยับ" เป็นตัวเลขจริง (ยอด + เดือนไทยของ approvedAt)
 *   ไม่ใช่เดาเอาจากชื่อปุ่ม · งวดที่มีเงิน/เอกสารผูกไม่ถูกแตะ · Σ งวด = ยอดใบ · ทะเบียนบัญชีเห็นทันที
 * ⭐ D5: ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา — แผงงวดและทะเบียนบัญชีขึ้นป้าย "ปรับแผนหลังอนุมัติ" แทน
 * ⚠️ ไม่ใช่ irreversible — ปรับซ้ำได้อีก (ตราบที่บัญชียังไม่ปิดใบ)
 * ⚠️ ข้อความจัดรูปมาแล้วจาก `replanPromptFacts` (lib/sales/installmentReplan.js) — ไฟล์นี้ import ต่อไม่ได้ (หัวไฟล์)
 *
 * @param changes            บรรทัดรายงวด (ก่อน→หลัง · เพิ่ม · ลบ) — **บังคับอย่างน้อย 1**
 * @param actualAmountLabel  ยอด Actual ของใบ (จัดรูปแล้ว) — บังคับ
 * @param actualMonthLabel   เดือน Actual = เดือนของ approvedAt เวลาไทย (จัดรูปแล้ว) — บังคับ
 * @param installmentActualLabel ใบ "Actual รายงวด" (mig 0412): ยอดที่นับแล้ว (จัดรูปแล้ว) — มีค่า = บรรทัด Actual แบบรายงวด
 *                           (งวดที่ยื่นขอนับอยู่ล็อก ไม่ถูกแตะ · งวดที่นับแล้วปรับยอด/วันได้แต่ Actual ที่นับไว้คงเดิม — มติข้อ 9 ·
 *                           งวดที่ยังไม่นับคิดส่วนแบ่งจากยอดงวดใหม่) · ใบทั้งใบ = ''
 * @param actualAutoCountLine มติข้อ 10: ใบที่กด "นับที่เหลือทั้งหมด" แล้ว — บรรทัด "งวดที่เพิ่มนับ Actual ให้อัตโนมัติตอนบันทึก ไม่ต้องยื่น"
 *                           (จัดรูปแล้วจาก `autoCountLine` ของ installmentReplan.js) · มีค่า = ไม่พูดกติกายื่น/อนุมัติรายงวดของงวดที่ยังไม่นับ
 * @param complete           หลังปรับทุกงวดรับเงินแล้ว ⇒ ใบเข้าคิวปิดใบของบัญชี
 */
export function paymentPlanEditPrompt({
  orderNumber = '', beforeCount = 0, afterCount = 0, changes = [], lockedCount = 0, lockedAmountLabel = '',
  totalLabel = '', actualAmountLabel = '', actualMonthLabel = '', installmentActualLabel = '', actualAutoCountLine = '',
  quotationNumber = '', serviceRounds = false, paidThroughLabel = '', coverageNotes = [], contractNumber = null, complete = false,
} = {}) {
  const rowLines = (Array.isArray(changes) ? changes : []).map((line) => String(line || '').trim()).filter(Boolean);
  if (!rowLines.length) throw new Error('paymentPlanEditPrompt: ต้องมีอย่างน้อย 1 งวดที่เปลี่ยน');
  const actual = String(actualAmountLabel || '').trim();
  const month = String(actualMonthLabel || '').trim();
  if (!actual || !month) throw new Error('paymentPlanEditPrompt: ต้องบอกยอดและเดือนของ Actual ที่ไม่เปลี่ยน');
  const quote = String(quotationNumber || '').trim();
  const through = String(paidThroughLabel || '').trim();
  const autoCount = String(actualAutoCountLine || '').trim();
  return approvalPrompt({
    title: 'ยืนยันปรับแผนงวดชำระ',
    verb: 'การปรับแผนงวด',
    subject: `${orderNumber} · ${beforeCount} งวด → ${afterCount} งวด`,
    irreversible: false,
    effects: [
      ...rowLines,
      lockedCount
        ? `งวดที่รับเงินแล้ว/รอบัญชีตรวจ/มีเอกสารผูก ${lockedCount} งวด ${lockedAmountLabel} ไม่ถูกแตะ (ยอด หลักฐาน ใบกำกับคงเดิม)`
        : null,
      `ยอดรวมทุกงวด ${totalLabel} = ยอดใบ (รวม VAT)`,
      String(installmentActualLabel || '').trim()
        ? `ยอด Actual รายงวดที่นับแล้ว ${String(installmentActualLabel).trim()} ไม่เปลี่ยน — งวดที่นับแล้วปรับยอด/วันได้แต่ Actual ที่นับไว้คงเดิม`
          /* มติข้อ 10: ใบที่กดนับที่เหลือทั้งหมดแล้วไม่มีงวดที่ยื่นอยู่/รอยื่น — บรรทัดถัดไปบอกว่างวดที่เพิ่มนับให้เอง */
          + (autoCount ? '' : ' · งวดที่ยื่นขอนับอยู่ไม่ถูกแตะ · งวดที่ยังไม่นับคิดส่วนแบ่งจากยอดงวดใหม่ตอน AE Sup อนุมัติงวด')
        : `ยอด Actual ${actual} เดือน ${month} ไม่เปลี่ยน — ใบยังอนุมัติอยู่ ไม่ต้องย้อนการอนุมัติ`,
      autoCount || null,
      'ทะเบียนรับชำระของบัญชีแสดงยอดใหม่ทันที',
      `ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา${quote ? ` ${quote}` : ''} — แผงงวดและทะเบียนบัญชีขึ้นป้าย “ปรับแผนหลังอนุมัติ”`,
      serviceRounds
        ? (through ? `“จ่ายถึง” ยังเป็น ${through}` : '“จ่ายถึง” ยังว่าง — ยังไม่มีงวดที่บัญชีรับรองครอบบริการ')
        : null,
      ...(serviceRounds && Array.isArray(coverageNotes) ? coverageNotes : []),
      contractNumber ? `สัญญา ${contractNumber} ข้อ 3 ยังระบุงวดเดิม — ทำบันทึกเพิ่มเติมถ้าต้องให้ลูกค้าลงนาม` : null,
      complete ? 'ทุกงวดรับเงินครบ — ใบเข้าคิวปิดใบของบัญชี' : null,
    ],
    confirmLabel: 'ยืนยันปรับแผนงวด',
  });
}

/* ══ PR3 · เงินค้างจากใบที่ยกเลิก (mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ═════════════════════
   ข้อความจัดรูปมาแล้วจากผู้เรียก (`carryPromptFacts` ใน lib/sales/installmentCarry.js · ตัวเลขเงินจาก fmtMoney) —
   ไฟล์นี้ import ต่อไม่ได้ (หัวไฟล์) */

/**
 * AE Sup/admin/บัญชี **ยกเงินจากใบที่ยกเลิก** เข้าใบใหม่ของดีลเดียวกัน
 * ⭐ แถวเงินย้ายทั้งแถว (สลิป · คำรับรอง · ใบกำกับคงเดิม) — บัญชีไม่ต้องรับรองซ้ำ · แผนที่เหลือของใบนี้หักงวดแรก ๆ ก่อน
 * ⚠️ irreversible — ไม่มีทางยกกลับ (ใบเดิมยกเลิกแล้ว) · คนกดต้องเห็นแผนก่อน/หลังของใบนี้ครบ (ความเสี่ยงของแผน:
 *   บัญชีเป็นคนกดแล้วแผนของฝ่ายขายขยับ)
 */
export function paymentCarryPrompt({
  orderNumber = '', sourceNumber = '', count = 0, amountLabel = '', reportedCount = 0, reportedAmountLabel = '',
  invoiceNos = [], carriedLines = [], changes = [], totalLabel = '', actualAmountLabel = '', actualMonthLabel = '',
  installmentActualLabel = '', actualMovedLine = '', actualAutoCountLine = '', quotationNumber = '', remainingCount = 0,
  remainingAmountLabel = '', complete = false, warnings = [],
} = {}) {
  if (!(Number(count) > 0)) throw new Error('paymentCarryPrompt: ต้องยกอย่างน้อย 1 งวด');
  const moved = String(actualMovedLine || '').trim();
  /* มติข้อ 10: ใบที่กด "นับที่เหลือทั้งหมด" แล้ว — แถวที่ยกมานับให้อัตโนมัติตอนยก (autoCountLine ของ installmentReplan.js) ⇒ แทนคำ "ต้องยื่นอีกรอบ" */
  const autoCount = String(actualAutoCountLine || '').trim();
  const actual = String(actualAmountLabel || '').trim();
  const month = String(actualMonthLabel || '').trim();
  if (!actual || !month) throw new Error('paymentCarryPrompt: ต้องบอกยอดและเดือนของ Actual ที่ไม่เปลี่ยน');
  const quote = String(quotationNumber || '').trim();
  const invoices = (Array.isArray(invoiceNos) ? invoiceNos : []).map((no) => String(no || '').trim()).filter(Boolean);
  return approvalPrompt({
    title: 'ยืนยันยกเงินจากใบที่ยกเลิก',
    verb: 'การยกเงิน',
    subject: `${count} งวด ${amountLabel} จาก ${sourceNumber} → ${orderNumber}`,
    irreversible: true,
    effects: [
      `ย้ายงวดที่มีเงิน ${count} งวด ${amountLabel} จาก ${sourceNumber} (ยกเลิกแล้ว) มาเป็นงวดของใบนี้`
        + ' — สลิป · วันจ่าย · คำรับรองของบัญชี · ใบกำกับภาษีคงเดิม บัญชีไม่ต้องรับรองซ้ำ',
      ...(Array.isArray(carriedLines) ? carriedLines : []),
      reportedCount ? `สลิปรอบัญชีตรวจ ${reportedCount} งวด ${reportedAmountLabel} ย้ายมาอยู่ในคิวบัญชีของใบนี้` : null,
      invoices.length ? `ใบกำกับภาษี ${invoices.join(', ')} ย้ายมากับงวด — ไม่ต้องออกใหม่` : null,
      ...(Array.isArray(changes) ? changes : []),
      `ยอดรวมทุกงวด ${totalLabel} = ยอดใบ (รวม VAT)`,
      /* ใบ "Actual รายงวด" (mig 0412 · docs/so-installment-actual.md): แถวที่ยกมาถูกล้างช่อง Actual (RPC ยกเงินของ 0412)
         ⇒ ต้องยื่น-อนุมัตินับในใบนี้อีกรอบ · ยอดที่นับแล้วของใบนี้ไม่เปลี่ยน */
      /* (review รอบสอง 26/10) เงินที่ยกมาแทนงวดที่นับตอนอนุมัติใบทั้งงวด = Actual ของงวดนั้นย้ายมาอยู่กับแถวที่ยกแถวแรก (RPC 0412 C2)
         ⇒ แถวนั้นไม่ต้องยื่นอีก · แถวที่ยกมาอื่นยังต้องยื่น-อนุมัติ */
      moved || null,
      String(installmentActualLabel || '').trim()
        ? `ยอด Actual รายงวดที่นับแล้วของใบนี้ ${String(installmentActualLabel).trim()} ไม่เปลี่ยน — ${autoCount
          ? 'ไม่มีงวดที่ยกมาต้องยื่นขอนับ'
          : moved
            ? (Number(count) > 1 ? 'งวดที่ยกมางวดอื่นต้องยื่นขอนับและให้ AE Sup อนุมัติในใบนี้อีกรอบ' : 'ไม่มีงวดที่ยกมาต้องยื่นขอนับเพิ่ม')
            : 'งวดที่ยกมาต้องยื่นขอนับและให้ AE Sup อนุมัติในใบนี้อีกรอบ'} (${sourceNumber} ยกเลิกแล้วไม่นับ Actual อยู่แล้ว)`
        : `ยอด Actual ${actual} เดือน ${month} ของใบนี้ไม่เปลี่ยน — ${sourceNumber} ยกเลิกแล้วไม่นับ Actual อยู่แล้ว`,
      autoCount || null,
      remainingCount
        ? `${sourceNumber} ยังเหลือเงินค้าง ${remainingCount} งวด ${remainingAmountLabel} — ยกเพิ่มหรือให้บัญชีบันทึกคืนเงินได้ภายหลัง`
        : `${sourceNumber} ไม่เหลือเงินค้าง — ออกจากหัวข้อ “เงินค้างจากใบที่ยกเลิก” ของบัญชี`,
      `ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา${quote ? ` ${quote}` : ''} — งวดที่ต่างจากแผนขึ้นป้าย “ปรับแผนหลังอนุมัติ”`,
      complete ? 'ทุกงวดรับเงินครบ — ใบเข้าคิวปิดใบของบัญชี' : null,
      /* คำเตือนสลิปชื่อซ้ำกับงวดของใบนี้ (carryDuplicates · review MONEY-1) — ชื่อไฟล์ตรงอย่างเดียวไม่บล็อก แต่ต้องเห็นก่อนกด */
      ...(Array.isArray(warnings) ? warnings : []).map((w) => String(w || '').trim()).filter(Boolean).map((w) => `⚠ ${w}`),
    ],
    confirmLabel: 'ยืนยันยกเงิน',
  });
}

/**
 * บัญชี **บันทึกคืนเงิน** งวดหนึ่งของใบที่ยกเลิก (คืนเต็มจำนวน)
 * ⚠️ ไม่ใช่ irreversible — ถอนการบันทึกได้ (refund-clear) · แต่ระหว่างที่บันทึกไว้ งวดนี้ยก/ถอนคำรับรองไม่ได้
 * @param amount ยอดที่คืน (จัดรูปแล้ว) — บังคับ
 */
export function paymentRefundPrompt({
  label = '', amount = '', orderNumber = '', refundedOnLabel = '', taxInvoiceNo = '', creditNoteNo = '',
} = {}) {
  const money = String(amount || '').trim();
  if (!money) throw new Error('paymentRefundPrompt: ต้องบอกยอดที่คืน');
  const invoice = String(taxInvoiceNo || '').trim();
  const creditNote = String(creditNoteNo || '').trim();
  const on = String(refundedOnLabel || '').trim();
  return approvalPrompt({
    title: 'บันทึกคืนเงินให้ลูกค้า',
    verb: 'การบันทึกคืนเงิน',
    subject: [label, money].filter(Boolean).join(' · '),
    effects: [
      `บันทึกว่าคืนเงินงวดนี้ ${money} ให้ลูกค้าเต็มจำนวนแล้ว${on ? ` (วันที่คืน ${on})` : ''}`,
      `งวดออกจาก “เงินค้างจากใบที่ยกเลิก”${orderNumber ? ` ของ ${orderNumber}` : ''} และยอดเก็บได้ในทะเบียนบัญชีลดลง ${money}`,
      invoice ? `งวดนี้มีใบกำกับภาษี ${invoice} — บันทึกคู่กับใบลดหนี้${creditNote ? ` ${creditNote}` : ''}` : null,
      'งวดที่คืนเงินแล้วยกไปใบใหม่และถอนคำรับรองไม่ได้ — บันทึกผิดให้ “ถอนการบันทึกคืนเงิน” (เมนูแถว)',
      'ยอด Actual ไม่เปลี่ยน — ใบนี้ยกเลิกแล้วไม่นับ Actual อยู่แล้ว',
    ],
    confirmLabel: 'ยืนยันบันทึกคืนเงิน',
  });
}

/** บัญชี **ถอนการบันทึกคืนเงิน** (บันทึกผิดงวด/ผิดยอด) — งวดกลับเป็นเงินค้าง */
export function paymentRefundClearPrompt({ label = '', amount = '', creditNoteNo = '' } = {}) {
  const money = String(amount || '').trim();
  const creditNote = String(creditNoteNo || '').trim();
  return approvalPrompt({
    title: 'ถอนการบันทึกคืนเงิน',
    verb: 'การถอนการบันทึกคืนเงิน',
    subject: [label, money].filter(Boolean).join(' · '),
    effects: [
      `งวดนี้กลับเป็น “เงินค้างจากใบที่ยกเลิก” ${money} — ยกไปใบใหม่ของดีลเดียวกันหรือบันทึกคืนใหม่ได้`,
      `ล้างวันที่คืน เหตุผล และเลขใบลดหนี้${creditNote ? ` ${creditNote}` : ''} ของงวดนี้ — ร่องรอยอยู่ในประวัติการแก้ไข`,
      `ยอดเก็บได้ในทะเบียนบัญชีเพิ่มกลับ ${money}`,
    ],
    confirmLabel: 'ยืนยันถอนการบันทึก',
  });
}

/* ══ นับ Actual รายงวด (mig 0412 · มติเจ้าของ 26/10/2026 · docs/so-installment-actual.md) ═════════════════════════════
   วงจรงวด: ฝ่ายขาย "ยื่นขอนับงวดนี้" → AE Sup "อนุมัติงวดและนับ Actual" (หรือ "ตีกลับงวด") → ฝ่ายขายแจ้งสลิป → บัญชีรับรอง →
   งวดถัดไปยื่นได้ · AE Sup "นับที่เหลือทั้งหมด" (ทางเดียว + เหตุผล) · "นับงวด 1" = ทางกู้เมื่อขั้นนับงวด 1 หลังอนุมัติใบล้ม
   ⭐ ตัวเลขทุกตัวจัดรูปมาแล้วจากผู้เรียก — ส่วนแบ่งก่อน VAT มาจาก `salesOrderActualMode.js` (คู่กับ SQL ทุกสตางค์) ·
     เดือนเป็น `formatMonthLabel(currentMonth())` เวลาไทย · ไฟล์นี้ import ต่อไม่ได้ (หัวไฟล์) จึงประกอบประโยคอย่างเดียว
   ⭐ คำเรียกกอง "รออนุมัติ" / "รอนับรายงวด" ผู้เรียกส่งจากค่าคงที่ของระบบ (PENDING_APPROVAL_LABEL · INSTALLMENT_REMAINING_LABEL)
     ค่าตั้งต้นที่นี่เป็นคำเดียวกัน — ใช้เมื่อผู้เรียกไม่ส่งเท่านั้น */

/**
 * ฝ่ายขาย **ยื่นขอนับ Actual งวดนี้** (ยังไม่ต้องมีสลิป · มติข้อ 4)
 * @param label        ชื่องวด เช่น "งวดที่ 2"
 * @param shareLabel   ยอดประมาณก่อน VAT ของงวด (ส่วนแบ่ง ณ ตอนนี้ — ตรึงจริงตอน AE Sup อนุมัติ)
 * @param slipStatus   สถานะเงินของงวด 'reported' | 'confirmed' | null (แถวที่ยกมา/จ่ายก่อนอนุมัติใบ) · review รอบสาม 26/10:
 *                     เดิมบอก "แจ้งสลิปงวดนี้ได้หลัง AE Sup อนุมัติ" ทั้งที่แจ้งไว้แล้ว (ทางเดียวกับที่รอบสองแก้ในโมดัลอนุมัติ)
 *                     · review รอบสี่: รับรองแล้ว ≠ แจ้งไว้แล้ว (ธงเดิม `slipReported` = 'reported' — ยังรับเพื่อเข้ากันได้)
 * @param selfApprover คนยื่นเป็นผู้อนุมัติ (AE Sup · CM · CD — ไม่ใช่ admin) ⇒ อนุมัติงวดที่ตัวเองยื่นไม่ได้ (RPC self_approval) · บอกก่อนกด
 */
/* 🐞 review รอบสี่ 26/10: เดิมรับ `slipReported` (reported/confirmed รวมเป็นธงเดียว) ⇒ งวดที่ยกมาจากใบที่ยกเลิกซึ่งบัญชีรับรองแล้ว (C1 ล้างช่อง Actual
   ต้องยื่นใหม่) ถูกบอก "บัญชีรับรองเงินได้หลัง…อนุมัติ" ทั้งที่รับรองแล้ว ⇒ รับสถานะจริงของงวด (`slipStatus`)
   @param slipStatus 'reported' | 'confirmed' | null — สถานะเงินของงวด (ผู้เรียกส่งเฉพาะสองค่านี้) · `slipReported` (เดิม) = 'reported' */
const slipStatusOf = (slipStatus, slipReported) => (['reported', 'confirmed'].includes(slipStatus) ? slipStatus
  : slipReported ? 'reported' : null);

export function installmentActualSubmitPrompt({
  label = '', shareLabel = '', pendingLabel = 'รออนุมัติ', remainingLabel = 'รอนับรายงวด', slipStatus = null, slipReported = false,
  selfApprover = false,
} = {}) {
  const share = String(shareLabel || '').trim();
  const slip = slipStatusOf(slipStatus, slipReported);
  return approvalPrompt({
    title: 'ยื่นขอนับ Actual งวดนี้',
    verb: 'ยื่นขอนับ Actual',
    subject: [label, share].filter(Boolean).join(' · '),
    effects: [
      `ยอดประมาณ ${share || 'ของงวดนี้'} (ก่อน VAT) ย้ายจาก “${remainingLabel}” ขึ้นเป็น “${pendingLabel}” — ยังไม่นับเป็น Actual จนกว่า AE Sup อนุมัติงวด`,
      'แจ้งผู้อนุมัติ (AE Sup) ให้ตรวจ · อนุมัติแล้วยอดเข้า Actual ของเดือนที่อนุมัติงวด',
      selfApprover ? 'งวดที่คุณยื่นเอง คุณอนุมัติเองไม่ได้ — ต้องให้ผู้อนุมัติคนอื่นกดอนุมัติ' : null,
      (slip === 'confirmed'
        ? 'งวดนี้บัญชีรับรองเงินแล้ว — อนุมัติแล้วนับ Actual ได้ทันที'
        : slip === 'reported'
          ? 'สลิปงวดนี้แจ้งไว้แล้ว — บัญชีรับรองเงินได้หลัง AE Sup อนุมัติงวด'
          : 'แจ้งสลิปงวดนี้ได้หลัง AE Sup อนุมัติ')
        + ' · ผู้ยื่นดึงคำขอกลับได้ก่อน AE Sup ตัดสิน',
    ],
    confirmLabel: 'ยื่นขอนับงวดนี้',
  });
}

/** ผู้ยื่น **ดึงคำขอนับงวดกลับ** ก่อน AE Sup ตัดสิน */
export function installmentActualWithdrawPrompt({
  label = '', shareLabel = '', pendingLabel = 'รออนุมัติ', remainingLabel = 'รอนับรายงวด',
} = {}) {
  const share = String(shareLabel || '').trim();
  return approvalPrompt({
    title: 'ดึงคำขอนับงวดกลับ',
    verb: 'ดึงคำขอนับ',
    subject: [label, share].filter(Boolean).join(' · '),
    effects: [
      `ยอดประมาณ ${share || 'ของงวดนี้'} (ก่อน VAT) ออกจาก “${pendingLabel}” กลับไปกอง “${remainingLabel}”`,
      'งวดกลับเป็น “ยังไม่ยื่น” — ยื่นใหม่ได้ทุกเมื่อ · AE Sup ไม่เห็นคำขอนี้ในคิวแล้ว',
    ],
    confirmLabel: 'ดึงคำขอกลับ',
  });
}

/**
 * AE Sup **อนุมัติงวดและนับ Actual** — ยอดของงวดตรึงเป็น Actual ของเดือนที่กด (มติข้อ 1)
 * @param shareLabel        ยอดก่อน VAT ที่จะตรึง (installmentActualShareAtApproval)
 * @param monthLabel        เดือนไทยที่ยอดเข้า (เดือนที่กด)
 * @param countedAfterLabel Actual ของใบหลังนับงวดนี้ · @param totalLabel Actual เต็มของใบ (ก่อน VAT)
 * @param progressAfterLabel "x/y งวด" หลังนับงวดนี้
 */
/* 🐞 review รอบสอง 26/10: บรรทัดสลิป/งวดถัดไปเคยตายตัว — อนุมัติงวดสุดท้ายก็สัญญา "งวดถัดไปยื่นได้…" ทั้งที่ไม่มีงวดถัดไป ·
   งวดที่แจ้งสลิปไว้แล้ว (จ่ายก่อนอนุมัติใบ) ก็บอก "แจ้งสลิปงวดนี้ได้" ⇒ ผู้เรียกบอกสองข้อนี้จากแถวจริง (เกณฑ์เดียวกับโมดัลรับรองของบัญชี)
   @param nextNeedsSubmit งวดถัดไป (เลขถัดไป) ยังไม่ยื่น/ถูกตีกลับ = ยังต้องยื่น · ไม่มี/ยื่นแล้ว/นับแล้ว = false
   @param slipStatus     สถานะเงินของงวด 'reported' | 'confirmed' | null (review รอบสี่ — รับรองแล้ว ≠ แจ้งไว้แล้ว) · `slipReported` (เดิม) = 'reported'
   ⭐ งวดที่บัญชีรับรองแล้ว: ไม่มีอะไรรอบัญชี และงวดถัดไปยื่นได้ทันที (ด่านยื่นดูแค่งวดก่อนหน้ารับรองเงินครบ) */
export function installmentActualApprovePrompt({
  label = '', shareLabel = '', monthLabel = '', countedAfterLabel = '', totalLabel = '', progressAfterLabel = '',
  submittedByName = '', pendingLabel = 'รออนุมัติ', nextNeedsSubmit = false, slipStatus = null, slipReported = false,
} = {}) {
  const share = String(shareLabel || '').trim();
  const slip = slipStatusOf(slipStatus, slipReported);
  const month = String(monthLabel || '').trim();
  const by = String(submittedByName || '').trim();
  return approvalPrompt({
    title: 'อนุมัติงวดและนับ Actual',
    verb: 'อนุมัตินับ Actual',
    subject: [label, share].filter(Boolean).join(' · '),
    effects: [
      `ยอด ${share || 'ของงวดนี้'} (ก่อน VAT) ย้ายจาก “${pendingLabel}” เข้าเป็น Actual ของเดือน ${month || 'นี้'} (เดือนที่อนุมัติงวด) — ขึ้นบนดีลทันที`,
      countedAfterLabel && totalLabel
        ? `Actual ของใบเป็น ${countedAfterLabel} จาก ${totalLabel}${progressAfterLabel ? ` (นับแล้ว ${progressAfterLabel})` : ''}`
        : null,
      slip === 'confirmed'
        ? `งวดนี้บัญชีรับรองเงินแล้ว${nextNeedsSubmit ? ' — งวดถัดไปยื่นขอนับได้ทันที' : ''}`
        : (slip === 'reported'
          ? 'สลิปงวดนี้แจ้งไว้แล้ว — บัญชีรับรองเงินได้หลังอนุมัติ'
          /* ชื่อในวงเล็บต้องมีวรรคก่อน "แจ้ง" (UAT 27/10 ข้อ 2 — เดิม "ฝ่ายขาย (ชื่อ)แจ้งสลิป") */
          : `ฝ่ายขาย${by ? ` (${by}) ` : ''}แจ้งสลิปงวดนี้ได้ แล้วบัญชีรับรองเงิน`)
          + (nextNeedsSubmit ? ' — งวดถัดไปยื่นได้หลังบัญชีรับรองงวดนี้' : ''),
      'งวดที่นับแล้วถอนรายงวดไม่ได้ — ถอยได้ทางเดียวคือย้อนการอนุมัติทั้งใบ',
    ],
    confirmLabel: 'อนุมัติงวดและนับ Actual',
  });
}

/** คำอธิบายในกล่องเหตุผลของ **ตีกลับงวด** (ReasonDialog · เหตุผล 10–500 ตัวอักษร) — บรรทัดละข้อ */
export function installmentActualRejectLines({
  shareLabel = '', pendingLabel = 'รออนุมัติ', remainingLabel = 'รอนับรายงวด',
} = {}) {
  const share = String(shareLabel || '').trim();
  return [
    `ยอดประมาณ ${share || 'ของงวดนี้'} (ก่อน VAT) ออกจาก “${pendingLabel}” กลับไปกอง “${remainingLabel}” — ไม่นับเป็น Actual`,
    'งวดขึ้น “ตีกลับ” พร้อมเหตุผลนี้ — ฝ่ายขายแก้แล้วยื่นใหม่ได้',
  ];
}

/**
 * AE Sup **นับที่เหลือทั้งหมด** (มติข้อ 8 — ทางเดียว: รายงวด → ทั้งใบ) — บรรทัดผลในกล่องเหตุผล (ReasonDialog)
 * @param count            จำนวนงวดที่ยังไม่นับ (รวมงวดที่ยื่นรออยู่)
 * @param amountLabel      ยอดก่อน VAT ที่จะเข้า Actual (= Actual เต็ม − นับแล้ว)
 * @param submittedCount   งวดที่ยื่นรอ AE Sup อยู่ในชุดนี้ (นับรวมไปด้วย ไม่ต้องอนุมัติทีละงวด)
 */
export function installmentActualCountRestLines({
  count = 0, amountLabel = '', monthLabel = '', totalLabel = '', submittedCount = 0, freezeFirst = false,
} = {}) {
  const month = String(monthLabel || '').trim();
  return [
    /* review รอบสี่ 26/10: route ตรึงงวดที่ยังไม่ตรึงก่อนนับ (ตัวหยุดยอดล้มตอนอนุมัติ) — ไม่งั้นเงินของทุกงวดรับรองไม่ได้ */
    freezeFirst ? 'ตรึงงวดชำระที่ยังไม่ตรึงก่อน — แผนงวดของใบนี้เป็นแผนจริง ฝ่ายขายแจ้งสลิป/บัญชีรับรองเงินได้' : null,
    `งวดที่ยังไม่นับ ${count} งวด รวม ${amountLabel} (ก่อน VAT) เข้าเป็น Actual ของเดือน ${month || 'นี้'} ทันที — Actual ของใบครบ ${totalLabel}`,
    submittedCount ? `งวดที่ยื่นรออนุมัติอยู่ ${submittedCount} งวด นับรวมไปด้วย` : null,
    'เงินยังเก็บตามงวดเดิม — ฝ่ายขายแจ้งสลิป บัญชีรับรองทีละงวดตามปกติ',
    /* มติข้อ 10 (26/10): กดแล้วใบนับทั้งก้อนถาวร — งวดที่โผล่ทีหลังฐานนับให้ตอนบันทึก · Rev. แบบรายงวดก็นับทุกงวดที่ค้างตอนอนุมัติ */
    'ทางเดียว — ใบนี้นับทั้งก้อนจากนี้ไป: งวดที่เพิ่มทีหลัง (ปรับแผนแบ่งงวด · ยกเงินเข้า) ระบบนับ Actual ให้เองทันที ไม่ต้องยื่น'
      + ' · Rev. ที่อนุมัติแบบรายงวดก็นับให้ทั้งหมด (กลับไปยื่นรายงวดไม่ได้)',
  ].filter(Boolean);
}

/**
 * ทางกู้ **"นับงวด 1" / "นับงวดที่ค้าง"** — ใบอนุมัติแบบรายงวดแล้วแต่ขั้นนับตอนอนุมัติล้ม (route ตอบ `installmentActualStartFailed`)
 * @param startLabel   งวดที่จะนับ เช่น "งวด 1" (รวมงวดยอด 0 / งวดที่รับรองเงินแล้ว ถ้ามี — "งวด 1, 3") · หัวโมดัลใช้คำนี้
 *                     (review รอบสาม 26/10: หัวตายตัว "นับ Actual งวดแรก" ขณะนับงวด 3 ของปุ่ม "นับงวดที่ค้าง")
 * @param freezeFirst  ใบมีงวดที่ยังไม่ตรึง (ตัวหยุดยอดล้มตอนอนุมัติ) — route ตรึงก่อนนับ (แผนจริงของใบ · แจ้งสลิป/รับรองเงินได้)
 */
export function installmentActualStartPrompt({
  startLabel = 'งวด 1', amountLabel = '', monthLabel = '', restAmountLabel = '', remainingLabel = 'รอนับรายงวด',
  freezeFirst = false,
} = {}) {
  const month = String(monthLabel || '').trim();
  const rest = String(restAmountLabel || '').trim();
  /* review รอบสี่ 26/10: ปุ่มกู้โชว์ตราบที่มีงวดยังไม่ตรึง แม้ไม่มีงวดค้างให้นับ (เช่นงวดถูกนับไปตอนยังไม่ตรึง) — ผู้เรียกส่ง startLabel ว่าง
     ⇒ โมดัลบอกผลจริง: ตรึงอย่างเดียว ไม่นับอะไร (ไม่ใช่ "นับ Actual งวด 1 ฿0") */
  if (!String(startLabel || '').trim()) {
    return approvalPrompt({
      title: 'ตรึงงวดชำระ',
      verb: 'ตรึงงวดชำระ',
      subject: 'งวดที่ยังไม่ตรึงของใบนี้',
      effects: [
        'ตรึงงวดชำระที่ยังไม่ตรึง — แผนงวดของใบนี้เป็นแผนจริง ฝ่ายขายแจ้งสลิป/บัญชีรับรองเงินได้ และยื่น/อนุมัตินับงวดได้ต่อ',
        'ไม่มีงวดค้างให้นับตอนนี้ — Actual ของใบไม่เปลี่ยน',
      ],
      confirmLabel: 'ตรึงงวดชำระ',
    });
  }
  return approvalPrompt({
    title: `นับ Actual ${startLabel}`,
    verb: 'นับ Actual',
    subject: [startLabel, amountLabel].filter(Boolean).join(' · '),
    effects: [
      freezeFirst ? 'ตรึงงวดชำระที่ยังไม่ตรึงก่อน — แผนงวดของใบนี้เป็นแผนจริง ฝ่ายขายแจ้งสลิป/บัญชีรับรองเงินได้' : null,
      `${startLabel} ${amountLabel} (ก่อน VAT) เข้าเป็น Actual ของเดือน ${month || 'นี้'} — ขึ้นบนดีลทันที`,
      rest ? `ที่เหลือ ${rest} (ก่อน VAT) ยังอยู่กอง “${remainingLabel}” จนกว่า AE Sup อนุมัติแต่ละงวด` : null,
      'กดซ้ำได้ไม่นับซ้ำ — งวดที่นับแล้วถูกข้าม',
    ],
    confirmLabel: `นับ Actual ${startLabel}`,
  });
}
