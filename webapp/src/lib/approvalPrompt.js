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
 *     paymentRefundPrompt) · `paymentLockReason` เหลือล็อกการยกเลิกเฉพาะใบย้อนหลัง (บรรทัดของใบย้อนหลังข้างล่างจึงยังจริง)
 * ⭐ บัญชีกด "บันทึกการรับชำระ" เอง (แจ้ง+รับรองในก้าวเดียว) ใช้ข้อความชุดนี้ด้วย ผ่าน
 *   `installmentConfirmPrompt` (components/salesPlanning/InstallmentConfirmDialog.js)
 *
 * ⭐ **ใบสั่งขายย้อนหลัง (`historical`) พูดคนละชุด** (มติ 22/09 · mock FnConfirm):
 *   ใบนี้ไม่มี Rev. และไม่นับ Actual ตั้งแต่แรก ⇒ สองบรรทัดนั้นของใบปกติเป็นเรื่องไม่จริง
 *   สิ่งที่เกิดจริงคือ "จ่ายถึง" ขยับ (ด่านเงินของนัดบริการ) และ AE Sup ยกเลิกใบไม่ได้อีก
 *   จนกว่าบัญชีถอนคำรับรอง (`paymentLockReason` ล็อกการยกเลิกด้วย) — ซึ่งปิดทางแก้ข้อมูลผิด
 *   "ยกเลิกแล้วคีย์ใหม่" ⇒ ต้องบอกก่อนกด ไม่ใช่รู้ทีหลัง
 *   ⚠️ ใบ pipeline ได้ผลลัพธ์เดิมทุกตัวอักษร (ค่าตั้งต้นของพารามิเตอร์ใหม่ทั้งหมด = ปิด)
 *
 * @param label               ชื่องวด เช่น "งวดที่ 2" หรือ "ชำระเต็มจำนวน"
 * @param amount              ยอดที่จะถูกบันทึกว่าเก็บได้แล้ว (ข้อความจัดรูปมาแล้ว)
 * @param historical          งวดของใบสั่งขายย้อนหลัง
 * @param opening             งวดยกมา (เงินที่เก็บก่อนเข้าระบบ)
 * @param paidThroughLabel    "จ่ายถึง" หลังรับรอง (ข้อความจัดรูปมาแล้ว) — ปกติ = ปลายช่วงครอบของงวดนี้
 * @param nextInstallmentLabel งวดที่ต้องเก็บถัดไป (ข้อความจัดรูปมาแล้ว) · ไม่มี = ไม่พูด
 */
export function paymentConfirmPrompt({
  label, amount, historical = false, opening = false, paidThroughLabel = null, nextInstallmentLabel = null,
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
        'AE Sup ยกเลิกใบนี้ไม่ได้อีกจนกว่าบัญชีถอนคำรับรอง — ถ้ายอดหรือช่วงครอบผิด ให้ตีกลับแทนการรับรอง',
        ...(next ? [`งวดถัดไป ${next}`] : []),
        HISTORICAL_STATUS_NOTE,
      ],
      confirmLabel: 'ยืนยันว่าเงินเข้าแล้ว',
    });
  }
  return approvalPrompt({
    title: 'บัญชีคอนเฟิร์มการชำระ',
    verb: 'การรับชำระ',
    subject: [label, amount].filter(Boolean).join(' · '),
    irreversible: true,
    effects: [
      'บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
      'ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. — บัญชีไม่ต้องรับรองซ้ำ',
      'ยอด Actual ของฝ่ายขายไม่เปลี่ยน — เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว',
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
 * @param complete           หลังปรับทุกงวดรับเงินแล้ว ⇒ ใบเข้าคิวปิดใบของบัญชี
 */
export function paymentPlanEditPrompt({
  orderNumber = '', beforeCount = 0, afterCount = 0, changes = [], lockedCount = 0, lockedAmountLabel = '',
  totalLabel = '', actualAmountLabel = '', actualMonthLabel = '', quotationNumber = '',
  serviceRounds = false, paidThroughLabel = '', coverageNotes = [], contractNumber = null, complete = false,
} = {}) {
  const rowLines = (Array.isArray(changes) ? changes : []).map((line) => String(line || '').trim()).filter(Boolean);
  if (!rowLines.length) throw new Error('paymentPlanEditPrompt: ต้องมีอย่างน้อย 1 งวดที่เปลี่ยน');
  const actual = String(actualAmountLabel || '').trim();
  const month = String(actualMonthLabel || '').trim();
  if (!actual || !month) throw new Error('paymentPlanEditPrompt: ต้องบอกยอดและเดือนของ Actual ที่ไม่เปลี่ยน');
  const quote = String(quotationNumber || '').trim();
  const through = String(paidThroughLabel || '').trim();
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
      `ยอด Actual ${actual} เดือน ${month} ไม่เปลี่ยน — ใบยังอนุมัติอยู่ ไม่ต้องย้อนการอนุมัติ`,
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
  quotationNumber = '', remainingCount = 0, remainingAmountLabel = '', complete = false,
} = {}) {
  if (!(Number(count) > 0)) throw new Error('paymentCarryPrompt: ต้องยกอย่างน้อย 1 งวด');
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
      `ยอด Actual ${actual} เดือน ${month} ของใบนี้ไม่เปลี่ยน — ${sourceNumber} ยกเลิกแล้วไม่นับ Actual อยู่แล้ว`,
      remainingCount
        ? `${sourceNumber} ยังเหลือเงินค้าง ${remainingCount} งวด ${remainingAmountLabel} — ยกเพิ่มหรือให้บัญชีบันทึกคืนเงินได้ภายหลัง`
        : `${sourceNumber} ไม่เหลือเงินค้าง — ออกจากหัวข้อ “เงินค้างจากใบที่ยกเลิก” ของบัญชี`,
      `ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา${quote ? ` ${quote}` : ''} — งวดที่ต่างจากแผนขึ้นป้าย “ปรับแผนหลังอนุมัติ”`,
      complete ? 'ทุกงวดรับเงินครบ — ใบเข้าคิวปิดใบของบัญชี' : null,
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
