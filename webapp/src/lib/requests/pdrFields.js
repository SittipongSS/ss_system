// ── PDR: หัวข้อ · ป้ายชื่อ · ลำดับ — **แหล่งเดียวของทั้งสามจอ** ────────────
//
// 🐞 ของจริงที่ผู้ใช้ทักมา: "ฟอร์มกรอก · ตอนโชว์รายละเอียด · ตอนแก้ มันไม่เหมือนกันเลย"
// เพราะทั้งสามที่ต่างคนต่างเขียนลิสต์ของตัวเอง แล้วเพี้ยนกันทุกมิติ:
//
//   · **หัวข้อ** ฟอร์มมี "ข้อมูลคำขอ" + "ข้อมูลลูกค้า" แยกกัน · จอแสดงยุบเป็น
//     "ข้อมูลลูกค้าและคำขอ" ก้อนเดียว · เอกสารใช้ "1. ข้อมูลลูกค้า"
//   · **ลำดับ** มูลค่าโปรเจกต์อยู่ที่ 3 ในฟอร์ม แต่อยู่ที่ 7 ในจอแสดง
//   · **ป้ายชื่อ** "Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)" บนฟอร์ม → "Target
//     Cost / KG" บนจอแสดง → "Target Cost / Unit (ราคาต้นทุน/KG)" บนเอกสาร
//   · **ช่องที่หายไป** ผู้ร้องขอ · ลูกค้า · จำนวนกลิ่น อยู่บนฟอร์มและบนเอกสาร
//     แต่จอแสดงไม่มีเลย
//   · **ค่าดิบหลุดออกเอกสาร** เอกสารพิมพ์ `new_product` · `premium` · `existing`
//     ตรง ๆ เพราะไม่ได้แปลง enum ⇒ ลูกค้าได้กระดาษที่มีรหัสของระบบอยู่บนนั้น
//   · **ข้อกำหนดเฉพาะอื่น ๆ** อยู่คนละหัวข้อ: ฟอร์ม/เอกสารไว้ใต้ "กฎระเบียบ"
//     จอแสดงเอาไปรวมกับ "ข้อกำหนดผลิตภัณฑ์"
//
// ⇒ ไฟล์นี้ประกาศครั้งเดียว ทั้งสามจออ่านจากที่นี่ · เพิ่ม/แก้ช่องต้องมาที่นี่ที่เดียว
// และเพี้ยนกันอีกไม่ได้เชิงโครงสร้าง ไม่ใช่เพราะมีคนคอยไล่ดูให้ตรงกัน

// ⚠️ ตัวนับเดียวกับที่ด่านหน้าประตูของหัวข้อใช้ — "จำนวนกลิ่นที่ขาย" ต้องเป็นเลข
// เดียวกันทั้งตอนกันไม่ให้เปิดใบผิด และตอนพิมพ์ลงกระดาษ
import { scentCountForOrder } from '@/lib/requests/scentDesignOrders';
import { categoryLabel } from '@/lib/master/categoryOf';
import { fmtDate, fmtNumber } from '@/lib/format';
// แถวข้อ 2.2/2.3 อยู่คนละตาราง — รางต้องบวกตัวนับของมันเข้ามาเอง (ดู `pdrRailSections`)
import {
  PDR_TEXTURE_OPTIONS, pdrTargetValuesFrom, pdrTargetsProgress, pdrTargetsScentCount,
} from '@/lib/requests/pdrTargets';
import { BRAND_ARCHETYPES } from '@/lib/requests/kinds/rd/scentBriefTypes';
import { addressTextIn, customerAddresses, primaryBillingAddress } from '@/lib/master/addresses';
import { requestPdrRowsPickScent, requestUsesScentBriefs } from '@/lib/master/requestTypes';

export const PDR_REQUEST_TYPES = [
  { value: 'new_product', label: 'New Product' },
  { value: 'modification', label: 'Product Modification' },
  { value: 'rd_test', label: 'R&D Test' },
  { value: 'cost_reduction', label: 'Cost Reduction' },
];

// ⚠️ ต้นทางอยู่ที่ `pdrTargets.js` (ข้อ 2.5 ย้ายลงแถวสินค้า · mig 0352) — ช่องหัวใบเดิม
//    (legacy) กับแถวสินค้าต้องใช้ชุดเดียวกัน · ประกาศซ้ำตรงนี้ไม่ได้ (วงจร import)
export const PDR_TEXTURES = PDR_TEXTURE_OPTIONS;

export const PDR_CUSTOMER_KINDS = [
  { value: 'new', label: 'ลูกค้าใหม่' },
  { value: 'existing', label: 'ลูกค้าเก่า' },
];

// 2.8 รูปแบบบรรจุภัณฑ์ — เลือกได้หลายอย่าง
export const PDR_PACKAGING_FORMS = [
  { value: 'bottle', label: 'ขวด' },
  { value: 'cap', label: 'ฝา' },
  { value: 'box', label: 'กล่อง' },
  // ⭐ ทางออกที่ต้องมี (มติผู้ใช้ 2026-08-09) — บรรจุภัณฑ์นอกสามอย่างนี้มีจริง
  // (ถุงซิป · หลอดบีบ · ขวดสเปรย์) · ไม่มีทางออก = คนติ๊กตัวที่ใกล้เคียงที่สุด
  // แล้วตัวเลข "ขอขวดกี่ใบ" ผิดเงียบ ๆ · ติ๊กแล้วมีช่องพิมพ์ต่อ
  { value: 'other', label: 'อื่น ๆ' },
];

// ⭐ มติผู้ใช้: **ติ๊กว่ามีภาพประกอบ = ต้องแนบภาพจริง** ⇒ ด่านบังคับอยู่ที่
// `pdrArtworkError()` ท้ายไฟล์ · ปล่อยให้ติ๊กแล้วไม่แนบ = RD ตามหาภาพที่ไม่มีอยู่
export const PDR_ARTWORK = [
  { value: 'has', label: 'มีภาพประกอบ' },
  { value: 'none', label: 'ไม่มีภาพประกอบ' },
];

// Regulatory & Compliance — มติผู้ใช้: ติ๊กได้ทั้ง 6 ตัว **แต่ไม่ติ๊กไว้ล่วงหน้า**
// (กระดาษเขียนว่าสี่ตัวแรก "มีให้เป็นพื้นฐาน" แต่ยังมีช่องติ๊ก ⇒ ให้ AE ยืนยันเอง)
export const PDR_DOCUMENTS = [
  { value: 'coa', label: 'COA' },
  { value: 'msds', label: 'MSDS' },
  { value: 'ifra', label: 'IFRA' },
  { value: 'fda', label: 'อย.' },
  { value: 'halal', label: 'ฮาลาล (Halal)' },
  { value: 'export', label: 'เอกสารส่งออก' },
  // ⭐ ทางออกเดียวกับชุดบรรจุภัณฑ์ — ติ๊กแล้วมีช่องพิมพ์ต่อ
  { value: 'other', label: 'อื่น ๆ' },
];

/**
 * รหัสหมวด "หัวน้ำหอม" (FRAGRANCE OIL) — เลือกหมวดนี้แล้วต้องบอกปลายทางด้วย
 *
 * ⚠️ **รหัสตายตัวโดยตั้งใจ** — โน้ตสีแดงบนกระดาษข้อ 1.11 ผูกกับสินค้าตัวนี้ตัวเดียว
 * (หัวน้ำหอมเป็นวัตถุดิบ ไม่ใช่ปลายทาง) ไม่ใช่คุณสมบัติที่หมวดอื่นจะมีบ้างในอนาคต
 * · วันไหนมีหมวด "วัตถุดิบ" แบบเดียวกันเพิ่ม ให้ย้ายไปเป็นช่องติ๊กบนทะเบียนหมวด
 * (ท่าเดียวกับ `isExcise`/`requiresFdaNotice` — ดู lib/master/categoryOf.js)
 */
export const PDR_FRAGRANCE_OIL_CODE = '02-020';

const labelOf = (list, value) => list.find((o) => o.value === value)?.label || null;

/**
 * โครงของฟอร์ม — เรียงตามฟอร์มกระดาษ FM-RD-01 Rev.02
 *
 * field:
 *   key      ชื่อช่องในฟอร์ม (สั้น — อยู่ในบริบท PDR อยู่แล้ว)
 *   column   คอลัมน์บนแถวคำร้อง (mig 0214 · prefix `pdr` กันปนกับกลไกคำร้อง)
 *   label    ป้ายชื่อ — **ชุดเดียวทั้งสามจอ**
 *   no       เลขข้อบนกระดาษ FM-RD-01 (เช่น '1.1') — เอกสารพิมพ์นำหน้าป้าย **และฟอร์ม
 *            ก็แสดงแล้ว** (มติผู้ใช้ 2026-09-11 · ทับเหตุผลเดิมที่ว่าบนจอเป็นสัญญาณรบกวน)
 *            — AE กับ RD คุยกันด้วยเลขข้อ ฟอร์มที่ไม่มีเลขต้องไล่หาว่า "ข้อ 2.4" คือช่องไหน
 *            ⚠️ ยังแยกจาก label โดยตั้งใจ — จอสรุปกับตัวอ่านป้ายอื่นใช้ป้ายเปล่า
 *            ช่องที่ไม่มีบนกระดาษ (ดีล) ไม่มี `no`
 *   switch   (type) ธงจริง/เท็จ เก็บเป็น boolean — ค่าในฟอร์มเป็น 'true' | 'false' | ''
 *   notes    (type) ข้อความเขียนต่อของช่องติ๊กหลายตัว (`of` = key ของช่องติ๊ก) · jsonb
 *   docHidden  ไม่พิมพ์เป็นแถวของตัวเองบนกระดาษ/จอสรุป (ค่าถูกพิมพ์ผ่านช่องอื่น)
 *   hint     คำขยายในวงเล็บ · ฟอร์มแสดงต่อท้ายป้าย จอแสดง/เอกสารไม่แสดง (กินที่)
 *   type     'text' | 'money' | 'date' | 'select' | 'tick' | 'derived'
 *   options  ตัวเลือกของ select — ใช้แปลงค่าดิบเป็นป้ายด้วย
 *   derive   ที่มาของค่าที่ระบบเติมให้เอง (ไม่ได้อยู่ในคอลัมน์ pdr*)
 *
 * ⚠️ **ลำดับในไฟล์นี้ = ลำดับบนกระดาษ** — ทั้งสามจอเรียงตามนี้ · เดิม 1.9 กับ 1.12
 * แทรกอยู่ระหว่าง 1.3 กับ 1.4 และ 1.10 ตกไปท้ายสุด คนที่ถือกระดาษกรอกตามจอจึงต้อง
 * กระโดดไปมา
 */
export const PDR_SECTIONS = [
  {
    key: 'request',
    // ⭐ `paperNo` = เลขหมวดบนกระดาษ — Request Information ไม่มีเลข (มติผู้ใช้ 2026-09-11:
    // รางเคยนับเอง 1–5 แล้วไม่ตรงกับเลขข้อ "หมวด 3 ทำไมข้อย่อยเป็น 2")
    paperNo: null,
    title: 'ข้อมูลคำขอ',
    note: 'ผู้ร้องขอ วันที่ และแผนก ระบบเติมให้จากคนที่เปิดใบ',
    fields: [
      // ⭐ AE/AC มาจาก **ผู้ดูแล/ผู้ประสานงานของโครงการ** (mig 0190) ไม่ใช่คนกดปุ่ม
      // (มติผู้ใช้: "คล้าย ๆ โครงการ ที่มีผู้ดูแล AE กับผู้ประสานงาน AC")
      // ⚠️ ถอยไปใช้ชื่อคนเปิดใบเมื่อโครงการยังไม่ได้ระบุ — ช่องว่างบนเอกสารที่ต้อง
      // มีชื่อคนรับผิดชอบเสมอ แย่กว่าชื่อที่ใกล้เคียงความจริงที่สุด
      // ⭐ **วันที่ร้องขอ = วันที่ยื่นคำร้อง** (มติผู้ใช้ 2026-08-08) ไม่ใช่วันที่สร้างร่าง
      //
      // 🐞 เดิมบรรทัดนี้ hardcode อยู่ที่หัวเอกสาร (`pdrDocument.js`) ด้วย `createdAt`
      // ⇒ สองปัญหาพร้อมกัน: (1) ฟอร์มกับหน้ารายละเอียด **ไม่มีช่องนี้เลย** ทั้งที่
      // เป็นข้อแรกของ Request Information บนกระดาษ · (2) ร่างที่ค้างไว้สามวันแล้วค่อย
      // กดส่ง จะพิมพ์วันที่สร้างร่างลงกระดาษ ซึ่งไม่ใช่วันที่ยื่นจริง
      //
      // ⚠️ ร่างที่ยังไม่ส่ง = ยังไม่มีวันยื่น ⇒ N/A ตามกติกา ไม่ใช่ถอยไปใช้ createdAt
      // ⭐ `inHeader` — เอกสารพิมพ์ไว้บนหัวใบ (มติผู้ใช้ 2026-08-09: "วันที่ [ร้องขอ]
      // ใต้โครงการ") ไม่ใช่ในตาราง · จอแสดงกับฟอร์มไม่มีหัวใบ จึงยังโชว์ในลิสต์ตามเดิม
      { key: 'requestedAt', label: 'วันที่ร้องขอ', type: 'derived', derive: 'requestedAt', from: 'วันที่ยื่นคำร้อง', inHeader: true },
      { key: 'requester', label: 'ผู้ร้องขอ (AE)', type: 'derived', derive: 'requester', from: 'เติมจากผู้ดูแลโครงการ' },
      { key: 'coordinator', label: 'ผู้ร้องขอ (AC)', type: 'derived', derive: 'coordinator', from: 'เติมจากผู้ประสานงานโครงการ' },
      { key: 'department', label: 'แผนก', type: 'derived', derive: 'department', from: 'การขายและบริการ' },
      {
        key: 'requestType', column: 'pdrRequestType', max: 40, label: 'ประเภทของคำขอ',
        type: 'select', options: PDR_REQUEST_TYPES,
      },
      // ⭐ สองประเภทบนกระดาษมีช่องกรอกต่อ (Product Modification → รหัสสินค้าก่อนหน้า ·
      // Cost Reduction → รหัสลูกค้า/รหัสสินค้าก่อนหน้า) — ช่องเดียวรับทั้งสองแบบ
      {
        key: 'prevProductCode', column: 'pdrPrevProductCode', max: 200, label: 'รหัสสินค้า/ลูกค้าก่อนหน้า',
        hint: 'สำหรับ Product Modification และ Cost Reduction', type: 'text',
        showFor: ['modification', 'cost_reduction'],
      },
      // ⚠️ **ไม่ใช่คอลัมน์ pdr*** — วันนี้คือ `requestedDueDate` ของกลไกคำร้องซึ่งมี
      // อยู่ก่อนแล้ว · เก็บซ้ำอีกช่องเมื่อไรก็ได้สองวันที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนจริง
      {
        key: 'sampleDue', label: 'วันที่คาดหวังกำหนดส่งตัวอย่างกลิ่น',
        type: 'derived', derive: 'sampleDue', from: 'เติมจากช่อง "วันที่ต้องการรับงาน"',
      },
      {
        // ⭐ หัวฟอร์มกระดาษเขียนไว้ว่า "หากเป็นงานด่วน … พร้อมแจ้งเหตุผลว่าทำไม"
        // ⇒ เป็น **คำถามในฟอร์ม** ไม่ใช่แค่ธงบนใบ · ช่องกรอกอยู่ที่ฟอร์มเปิดคำร้อง
        // (ติ๊กด่วนแล้วช่องนี้โผล่) — ที่นี่เป็นฝั่งอ่านสำหรับจอสรุปกับกระดาษ
        key: 'urgentReason', label: 'เหตุผลที่เป็นงานด่วน',
        type: 'derived', derive: 'urgentReason', from: 'กรอกตอนเปิดคำร้อง (เฉพาะงานด่วน)',
      },
    ],
  },
  {
    key: 'customer',
    paperNo: '1',
    // ⭐ "ข้อมูลลูกค้า/แบรนด์" (มติผู้ใช้ 2026-09-11) — ครึ่งหนึ่งของหมวดนี้คือเรื่องแบรนด์
    // (ชื่อแบรนด์ · Mood & Tone · ทิศทาง · Archetype) ไม่ใช่เรื่องบริษัทลูกค้า
    title: 'ข้อมูลลูกค้า/แบรนด์',
    fields: [
      // ⭐ 1.1/1.2 มาจาก **ทะเบียนลูกค้า** (มติผู้ใช้) ไม่ใช่ช่องกรอกซ้ำ — พิมพ์ซ้ำ
      // เมื่อไรก็ได้เบอร์สองชุดที่ขัดกัน และเบอร์ที่ RD โทรจะเป็นเบอร์ที่เก่ากว่า
      // ⚠️ **นำหน้า 1.1** (มติผู้ใช้ 2026-08-09) — ไม่มีข้อนี้บนกระดาษ แต่มันคือ "งานนี้
      // คืองานไหน" ซึ่งต้องรู้ก่อนรายละเอียดผู้ติดต่อ · ไม่ได้ทำให้เลขข้อ 1.1–1.14 เพี้ยน
      // เพราะช่องที่ไม่มีบนกระดาษไม่มีเลขข้ออยู่แล้ว
      //
      // ⭐ `docLabel` = **ป้ายเฉพาะบนกระดาษ** — เอกสารทุกชนิดของบริษัทเรียกดีลว่า
      // "โครงการ" (QT/SO/ET/ไทม์ไลน์) ส่วนบนจอต้องเป็น "ดีล" เพราะระบบมี *โครงการ*
      // (รหัส PJ) เป็นอีกสิ่งหนึ่งจริง ๆ ⇒ ใช้คำเดียวกันบนจอจะชี้ผิดตัว
      {
        key: 'deal', label: 'ดีล', docLabel: 'โครงการ',
        type: 'derived', derive: 'deal', from: 'เติมจาก SO', fromDealOnly: 'เติมจากดีล',
      },
      { key: 'contactName', no: '1.1', label: 'ชื่อผู้ติดต่อ', type: 'derived', derive: 'contactName', from: 'เติมจากทะเบียนลูกค้า' },
      { key: 'contactPhone', no: '1.2', label: 'Phone / Line', type: 'derived', derive: 'contactPhone', from: 'เติมจากทะเบียนลูกค้า' },
      { key: 'customer', no: '1.3', label: 'ชื่อบริษัท', type: 'derived', derive: 'customer', from: 'เติมจาก SO', fromDealOnly: 'เติมจากดีล' },
      { key: 'customerBrand', no: '1.4', column: 'pdrCustomerBrand', max: 200, label: 'ชื่อแบรนด์', type: 'text' },
      // ⭐ สามช่องนี้เป็นข้อความยาว (IS-26080006 · 2026-08-12) — `type` ที่นี่ไม่ได้
      // เลือกคอนโทรลให้ฟอร์ม (`PdrForm` เป็นเจ้าของชนิดช่องกรอก) แต่ต้องตรงกับของจริง
      // ไม่งั้นทะเบียนกลายเป็นเอกสารที่โกหกคนอ่านคนถัดไป
      { key: 'moodTone', no: '1.5', column: 'pdrMoodTone', max: 500, label: 'Mood & Tone', type: 'textarea' },
      { key: 'brandDirection', no: '1.6', column: 'pdrBrandDirection', max: 500, label: 'ทิศทางการเติบโตของแบรนด์', type: 'textarea' },
      /* ⭐ **1.7 = ที่อยู่ลูกค้าจากทะเบียน · 1.7.1 = ที่อยู่จัดส่งตัวอย่าง** (มติผู้ใช้
         2026-09-11) — เดิม 1.7 เป็นช่องพิมพ์ที่อยู่จัดส่งอย่างเดียว ⇒ ที่อยู่ลูกค้าที่ระบบรู้
         อยู่แล้วต้องพิมพ์ซ้ำทุกใบ · ตอนนี้ดึงที่อยู่หลัก (ออกบิล) ของลูกค้ามาให้ แล้วมี
         สวิตช์ว่าส่งตัวอย่างไปที่เดียวกันไหม ปิด = พิมพ์ที่อยู่จัดส่งเอง
         ⚠️ อ่านสดจากทะเบียน ไม่ snapshot — เอกสาร PDR ไม่ถูกแช่แข็ง (ช่อง 1.1/1.2 ก็อ่านสด) */
      { key: 'customerAddress', no: '1.7', label: 'ที่อยู่ลูกค้า', type: 'derived', derive: 'customerAddress', from: 'เติมจากทะเบียนลูกค้า' },
      // ⚠️ ไม่มีแถวของตัวเองบนกระดาษ — ผลของมันคือค่าที่ 1.7.1 พิมพ์ (`docHidden`)
      { key: 'shipToSameAsCustomer', column: 'pdrShipToSameAsCustomer', label: 'ส่งตัวอย่างไปที่อยู่เดียวกับลูกค้า', type: 'switch', docHidden: true },
      { key: 'shipTo', no: '1.7.1', column: 'pdrShipTo', max: 500, label: 'ที่อยู่จัดส่งตัวอย่าง', type: 'textarea', hideWhenOn: 'shipToSameAsCustomer' },
      {
        key: 'customerKind', no: '1.8', column: 'pdrCustomerKind', max: 40, label: 'ประเภทลูกค้า',
        type: 'select', options: PDR_CUSTOMER_KINDS,
      },
      // ⚠️ **ไม่ derive จากดีล** — ถามมูลค่าทั้งโครงการ ไม่ใช่ค่าออกแบบกลิ่นในใบนี้
      // (ลูกค้าอาจจ่ายค่าออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน — ผู้ใช้ทักเอง)
      {
        // ⚠️ หน่วยอยู่ในป้าย ไม่ใช่ในคำใบ้ (มติผู้ใช้ 2026-08-10) — คำใบ้จางและหายไป
        // ตอนพิมพ์ลงกระดาษ · หน่วยของตัวเลขต้องติดกับตัวเลขเสมอ ไม่งั้น "1,200" อ่านได้
        // ทั้งบาทและพันบาท (ป้ายนี้ใช้ร่วมกันสามจอ: ฟอร์ม · จอสรุป · เอกสาร)
        key: 'projectValue', no: '1.9', column: 'pdrProjectValue',
        label: 'มูลค่าโปรเจกต์ทั้งหมด (บาท)',
        type: 'money', placeholder: 'ทั้งโครงการ ไม่ใช่แค่ค่าออกแบบกลิ่น',
      },
      // ⭐ ติ๊กแล้วเขียนต่อ (มติผู้ใช้) — สามช่องนี้คือข้อ 1.10 ข้อเดียวบนกระดาษ
      {
        key: 'targetDemographic', no: '1.10', column: 'pdrTargetDemographic', max: 500, label: 'DemoGraphic',
        hint: 'เพศ · อายุ · การศึกษา · รายได้', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
      {
        key: 'targetPsychographic', column: 'pdrTargetPsychographic', max: 500, label: 'PsychoGraphic',
        hint: 'ความสนใจ · ไลฟ์สไตล์', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
      {
        key: 'targetPainpoint', column: 'pdrTargetPainpoint', max: 500, label: 'Painpoint',
        hint: 'ทำไมต้องทำแบรนด์นี้', type: 'tick', group: 'กลุ่มลูกค้าเป้าหมาย',
      },
      // ⭐ **หมวดสินค้าหลายรายการ** (มติผู้ใช้ 2026-08-09) — เลือกจากทะเบียนเดียวกับ
      // บรรทัดคำร้อง/ฟอร์มดีล ไม่ใช่พิมพ์เอง ⇒ นับได้ว่าขอพัฒนาหมวดไหนกี่ครั้ง
      // โน้ตสีแดงบนกระดาษข้อ 1.11 — ลูกค้าที่สั่ง Fragrance ต้องบอกปลายทางด้วย
      // ไม่งั้น RD ตั้งความเข้มข้นกับเบสไม่ได้ (น้ำหอมกับน้ำยาปรับผ้านุ่มคนละโจทย์)
      {
        key: 'productKinds', no: '1.11', column: 'pdrProductKinds',
        label: 'ประเภทสินค้า', type: 'categories',
        hint: 'หากผลิตเป็น Fragrance Oil ให้ระบุด้วยว่านำไปใช้กับสินค้าประเภทใด',
      },
      // ⭐ คำตอบของโน้ตสีแดงข้อ 1.11 (มติผู้ใช้ 2026-08-09 · mig 0228) — เดิมคำเตือน
      // เป็นแค่คำขยายป้าย ไม่มีที่ให้กรอกคำตอบ ⇒ ไม่มีใครตอบ
      // ⚠️ เงื่อนไขการโผล่มาจากทะเบียน (`showForMulti`) ไม่ใช่ `if` ในฟอร์ม — กติกา
      // เดียวกับช่อง "อื่น ๆ" ของบรรจุภัณฑ์/เอกสาร
      // ⚠️ เพดาน 500 → 200 (ผลตรวจช่องยาว/สั้น 2026-09-11) — บรรทัดเดียว · ของจริงยาวสุด ≤67 ตัว
      {
        key: 'fragranceUse', column: 'pdrFragranceUse', max: 200,
        label: 'หัวน้ำหอมนี้นำไปใช้กับสินค้าประเภทใด', type: 'text',
        hint: 'เช่น น้ำหอม EDP · น้ำยาปรับผ้านุ่ม · เทียนหอม',
        showForMulti: { key: 'productKinds', value: PDR_FRAGRANCE_OIL_CODE },
      },
      // ⚠️ ช่องข้อความอิสระเดิม **เก็บไว้อ่านใบเก่า** — 0227 ไม่ย้ายค่าให้ เพราะข้อความ
      // อย่าง "ครีมบำรุงผิว" แปลงเป็นรหัสหมวดอัตโนมัติไม่ได้ · ฟอร์มไม่เขียนลงตัวนี้แล้ว
      // แต่จอสรุป/เอกสารยังพิมพ์ถ้าใบนั้นมีค่า (ไม่งั้นข้อมูลเก่าหายไปจากกระดาษ)
      {
        key: 'productKind', column: 'pdrProductKind', max: 200, label: 'ประเภทสินค้า (บันทึกไว้เดิม)',
        type: 'text', legacy: true,
      },
      {
        key: 'scentCount', no: '1.12', label: 'จำนวนกลิ่นที่ต้องการพัฒนา',
        type: 'derived', derive: 'scentCount', from: 'เติมจากใบสั่งขาย',
        fromDealOnly: 'นับกลิ่นไม่ซ้ำจากแถวสินค้าในหมวด 2',
      },
      { key: 'wantedAt', no: '1.13', column: 'pdrWantedAt', label: 'วันที่ต้องการสินค้า', type: 'date' },
      { key: 'sellFrom', no: '1.14', column: 'pdrSellFrom', label: 'วันที่ต้องการจำหน่าย', type: 'date' },
      /* ⭐ **1.15 Archetype ของแบรนด์** (มติผู้ใช้ 2026-09-11 · mig 0352) — ไฟล์ PDR ของ AE
         วางไว้ที่ 2.1.6 ในกล่องบรีฟ แต่มันเป็นของ **แบรนด์** ไม่ใช่รายกลิ่น และใบพัฒนาสูตร
         ไม่มีบรีฟแล้ว ⇒ ต่อท้ายหมวด 1 (เลขเดิมไม่เลื่อน) ใช้ร่วมสองหัวข้อ
         ติ๊กได้หลายตัว + เขียนต่อได้ (ท่าเดียวกับ Scentotype · มติผู้ใช้) */
      {
        key: 'archetypes', no: '1.15', column: 'pdrArchetypes', label: 'Archetype ของแบรนด์',
        type: 'multi', options: BRAND_ARCHETYPES, notes: 'archetypeNotes',
      },
      { key: 'archetypeNotes', column: 'pdrArchetypeNotes', max: 200, label: 'Archetype — เขียนต่อ', type: 'notes', of: 'archetypes', docHidden: true },
    ],
  },
  {
    key: 'spec',
    paperNo: '2',
    title: 'ข้อกำหนดผลิตภัณฑ์',
    fields: [
      // ⭐ **2.2/2.3 ย้ายไปเป็นรายการรายสินค้าแล้ว** (มติผู้ใช้ 2026-08-10 · mig 0229)
      // — หนึ่งแถวถือทั้งต้นทุนต่อกิโล (แยกสวิตช์ F/FB) และราคาขายต่อชิ้น · แถวอยู่ใน
      // ตารางลูก `dept_request_pdr_targets` ไม่ใช่คอลัมน์บนหัวใบ จึงไม่มี `column`
      // ที่นี่ และ **ไม่ผ่าน `normalizePdr`** (ด่านอยู่ที่ `lib/requests/pdrTargets.js`
      // แพตเทิร์นเดียวกับบรีฟกลิ่น)
      /* ⭐ **ข้อ 2.1–2.7 เป็นรายสินค้าทั้งหมดแล้ว** (มติผู้ใช้ 2026-09-11 · mig 0352) — แถวถือ
         กลิ่น (ใบพัฒนาสูตร) · ต้นทุน · ราคาขาย · MOQ · เนื้อ · สี · ขนาด · จำนวน · หมายเหตุ
         ⚠️ ป้าย/เลขข้อของแต่ละช่องในแถวอยู่ที่ `PDR_TARGET_SPEC`/`PDR_TARGET_LABELS`
         (pdrTargets.js) ที่เดียว · ช่องนี้เป็นแค่ "รายการสินค้า" จึงไม่มีเลขข้อของตัวเอง */
      {
        key: 'targets', label: 'สินค้าที่ขอพัฒนา',
        hint: 'กรอกข้อ 2.x แยกรายสินค้า', type: 'targets',
      },
      // ⚠️ สองช่องเดิม **เก็บไว้อ่านใบเก่า** — ตัวเลขเดียวทั้งใบที่ไม่รู้ว่าเป็นของหมวดไหน
      // ย้ายมาลงตารางใหม่ไม่ได้โดยไม่เดา · ฟอร์มไม่เขียนลงแล้ว แต่จอสรุป/เอกสารยังพิมพ์
      // ถ้าใบนั้นมีค่า (กติกาเดียวกับ `productKind` ตอน 0227)
      {
        key: 'targetCost', column: 'pdrTargetCost', label: 'Target Cost / KG (บันทึกไว้เดิม)',
        type: 'money', legacy: true,
      },
      {
        key: 'targetPrice', column: 'pdrTargetPrice', label: 'Target Price / Unit (บันทึกไว้เดิม)',
        type: 'money', legacy: true,
      },
      /* ⚠️ **สี่ช่องระดับใบเดิม (2.4–2.7) เก็บไว้อ่านใบเก่าเท่านั้น** (mig 0352) — ย้ายไปเป็น
         รายสินค้าในแถว 2.x แล้ว · ค่าเดิมเป็นข้อความรวมทั้งใบ แตกลงแถวอัตโนมัติไม่ได้โดยไม่เดา
         ⇒ `legacy`: ฟอร์มไม่เขียน · จอสรุป/เอกสารพิมพ์เฉพาะใบที่มีค่า (กติกาเดียวกับ targetCost) */
      { key: 'moq', no: '2.4', column: 'pdrMoq', max: 100, label: 'MOQ ที่คาดหวัง (บันทึกไว้เดิม)', type: 'text', legacy: true },
      {
        key: 'texture', no: '2.5', column: 'pdrTexture', max: 40, label: 'ลักษณะเนื้อผลิตภัณฑ์ (บันทึกไว้เดิม)',
        type: 'select', options: PDR_TEXTURES, legacy: true,
      },
      { key: 'color', no: '2.6', column: 'pdrColor', max: 200, label: 'สีเนื้อผลิตภัณฑ์ (บันทึกไว้เดิม)', type: 'text', legacy: true },
      { key: 'packSize', no: '2.7', column: 'pdrPackSize', max: 500, label: 'ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น (บันทึกไว้เดิม)', type: 'text', legacy: true },
      // 2.8 รูปแบบบรรจุภัณฑ์ — กระดาษรวม ขวด/ฝา/กล่อง กับ มี/ไม่มีภาพประกอบ ไว้ข้อเดียว
      {
        key: 'packagingForms', no: '2.8', column: 'pdrPackagingForms', label: 'รูปแบบบรรจุภัณฑ์',
        type: 'multi', options: PDR_PACKAGING_FORMS, group: 'รูปแบบบรรจุภัณฑ์',
      },
      // ⚠️ เพดาน 500 → 200 (ผลตรวจช่องยาว/สั้น 2026-09-11) — บรรทัดเดียว · ของจริงยาวสุด ≤67 ตัว
      {
        key: 'packagingFormsOther', column: 'pdrPackagingFormsOther', max: 200,
        label: 'รูปแบบบรรจุภัณฑ์ — อื่น ๆ ระบุ', type: 'text', wide: true,
        group: 'รูปแบบบรรจุภัณฑ์', showForMulti: { key: 'packagingForms', value: 'other' },
        placeholder: 'เช่น ถุงซิป · หลอดบีบ · ขวดสเปรย์',
      },
      {
        key: 'packagingArtwork', column: 'pdrPackagingArtwork', max: 40, label: 'ภาพประกอบบรรจุภัณฑ์',
        type: 'select', options: PDR_ARTWORK, group: 'รูปแบบบรรจุภัณฑ์',
      },
      // 2.9 Value Proposition — **ของทั้งใบ ไม่ใช่รายกลิ่น** (มติผู้ใช้)
      {
        key: 'vpAttribute', no: '2.9', column: 'pdrVpAttribute', max: 2000, label: 'Attribute',
        hint: 'คุณสมบัติของสินค้า', type: 'tick', group: 'Value Proposition', wide: true,
      },
      {
        key: 'vpBenefit', column: 'pdrVpBenefit', max: 2000, label: 'Benefit',
        hint: 'ประโยชน์ที่ผู้ใช้ได้รับ', type: 'tick', group: 'Value Proposition', wide: true,
      },
      {
        key: 'vpValue', column: 'pdrVpValue', max: 2000, label: 'Value',
        hint: 'คุณค่าที่แบรนด์ส่งมอบ', type: 'tick', group: 'Value Proposition', wide: true,
      },
      { key: 'brandSample', no: '2.10', column: 'pdrBrandSample', max: 500, label: 'ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)', type: 'text', wide: true },
    ],
  },
  {
    key: 'regulatory',
    title: 'ข้อกำหนดด้านเอกสารและกฎระเบียบ',
    note: 'เอกสารที่ติ๊กจะยังไม่สร้างคำร้องขอเอกสาร — ฟอร์มระบุเองว่าได้รับหลังผลิตเป็นสินค้าแล้ว',
    fields: [
      {
        key: 'documents', column: 'pdrDocuments', label: 'เอกสารที่ลูกค้าต้องการ',
        type: 'multi', options: PDR_DOCUMENTS,
      },
      // ⚠️ เพดาน 500 → 200 (ผลตรวจช่องยาว/สั้น 2026-09-11) — บรรทัดเดียว · ของจริงยาวสุด ≤67 ตัว
      {
        key: 'documentsOther', column: 'pdrDocumentsOther', max: 200, label: 'เอกสาร — อื่น ๆ ระบุ',
        type: 'text', wide: true, showForDocument: 'other',
        placeholder: 'ระบุชื่อเอกสารที่ลูกค้าขอ',
      },
      // ⚠️ เพดาน 500 → 200 (ผลตรวจช่องยาว/สั้น 2026-09-11) — บรรทัดเดียว · ของจริงยาวสุด ≤67 ตัว
      {
        key: 'exportDocNote', column: 'pdrExportDocNote', max: 200, label: 'เอกสารส่งออก — ระบุ',
        type: 'text', wide: true, showForDocument: 'export',
        placeholder: 'ประเทศปลายทาง / ชนิดเอกสาร',
      },
      {
        key: 'specialRequirements', column: 'pdrSpecialRequirements', max: 2000, label: 'ข้อกำหนดเฉพาะอื่น ๆ',
        type: 'textarea', wide: true,
        placeholder: 'เช่น ห้ามใช้สารพาราเบน · Vegan · No Alcohol',
      },
    ],
  },
  {
    // ── ผู้เซ็นบนเอกสาร (ม-45 · mig 0221) ────────────────────────────────
    //
    // ⭐ **ชื่อบนกระดาษ ไม่ใช่ role ในระบบ** (มติผู้ใช้: "ตำแหน่งบนเอกสารก่อน
    // ยังไม่ต้องเป็น role จริง") — ตารางลายเซ็นของ FM-RD-01 มี 7 แถว
    //
    // ⚠️ **AE Supervisor ย้ายมาอยู่ชุดนี้แล้ว** (ม-124 · mig 0261) — เดิมอ่านจาก
    // `approvedByName` ของประตูหัวหน้า (mig 0216) ซึ่งถูกถอดทั้งขั้นใน ม-121 ⇒
    // คอลัมน์นั้นไม่มีใครเขียนอีก แถวเลยพิมพ์ `N/A` ค้างทุกใบและกรอกไม่ได้เลย
    // ⇒ ระบบรู้จริงเหลือแถวเดียว: AE (คนเปิดใบ) · ที่เหลือเป็นชื่อบนกระดาษทั้งหมด
    //
    // ⚠️ **ลำดับในอาร์เรย์นี้คือลำดับแถวบนกระดาษ** — `SIGN_ROWS` ใน pdrDocument.js
    // ต่อท้าย AE ด้วยชุดนี้ตรง ๆ ⇒ สลับที่นี่แล้วกระดาษสลับตาม
    //
    // ⚠️ **ไม่มีช่องไหนบังคับ และไม่บล็อกการปิดเรื่อง** — ใครยังไม่เซ็นก็เว้นไว้
    // แล้วเซ็นมือบนกระดาษได้เหมือนเดิม
    key: 'signers',
    title: 'ผู้เซ็นบนเอกสาร',
    // ⭐ `optional` = หมวดที่ **ไม่มีช่องไหนบังคับเลย** ⇒ รางแสดงจำนวนที่กรอกเฉย ๆ
    // ไม่ใช่ x/y · เขียนคู่กับบรรทัด "ไม่มีช่องไหนบังคับ" ข้างบนเพื่อไม่ให้สองอย่างนี้
    // เดินออกจากกัน
    // 🐞 เดิมรางขึ้น "0/6" เหมือนหมวดที่กรอกไม่ครบ ทั้งที่ตั้งใจให้เว้นว่างได้ ⇒ อ่านเป็น
    // หนี้ค้างที่ไม่มีวันเคลียร์ และจุดสีไม่มีวันเขียว
    optional: true,
    note: 'ชื่อที่จะพิมพ์ในตารางลายเซ็นของ PDR — เป็นชื่อบนกระดาษ ไม่ใช่สิทธิ์ในระบบ · เว้นว่างได้',
    /* ⭐ **`roles` = ตำแหน่งในระบบที่คู่กับช่องนี้** (มติผู้ใช้ 2026-09-01) — ช่องจะได้
       เสนอรายชื่อคนที่ถือตำแหน่งนั้นให้เลือก แทนพิมพ์ชื่อมือทุกใบ
       ⚠️ **ยังเก็บเป็น "ชื่อ" ไม่ใช่ id** — นี่คือชื่อที่จะถูก *พิมพ์ลงกระดาษ* ตอนที่ใบ
       นั้นออก ⇒ คนลาออก/เปลี่ยนชื่อทีหลัง เอกสารเก่าต้องไม่เปลี่ยนตาม (กติกาเดียวกับ
       ชื่อบนเอกสารทั้งระบบ) · และเลือกจากรายชื่อไม่ได้ก็ยังพิมพ์เองได้ ⇒ คนเซ็นที่
       ไม่มีบัญชี (Sale & Marketing Manager) ไม่ถูกกั้น
       ⚠️ ชื่อ role ต้องมีจริงในทะเบียน — มีเทสต์คุม (`pdrFields.test.mjs`) */
    fields: [
      { key: 'signAeSupervisor', column: 'pdrSignAeSupervisor', max: 200, label: 'Account Executive Supervisor', type: 'text', roles: ['ae_supervisor'] },
      // ไม่มี role นี้ในระบบ — ตำแหน่งบนกระดาษล้วน ⇒ พิมพ์เองอย่างเดียว
      { key: 'signSalesManager', column: 'pdrSignSalesManager', max: 200, label: 'Sale & Marketing Manager', type: 'text' },
      { key: 'signPerfumer', column: 'pdrSignPerfumer', max: 200, label: 'Perfumer', type: 'text', roles: ['rd_perfumer'] },
      { key: 'signChemist', column: 'pdrSignChemist', max: 200, label: 'Product Development Chemist', type: 'text', roles: ['rd_chemist'] },
      { key: 'signCoordinator', column: 'pdrSignCoordinator', max: 200, label: 'Project Coordinator', type: 'text', roles: ['rd_coordinator'] },
      { key: 'signFinalApprover', column: 'pdrSignFinalApprover', max: 200, label: 'Final Approval (RD Supervisor)', type: 'text', roles: ['rd_supervisor'] },
    ],
  },
];

/* ── ป้าย + เลขข้อของบรีฟรายกลิ่น (ข้อ 2.1.x · พัฒนากลิ่นเท่านั้น) ──────────────
   ⭐ ที่เดียวของสามจอ (ฟอร์ม · จอสรุป · เอกสาร) — บรีฟอยู่คนละตาราง (mig 0213) จึงไม่อยู่ใน
   `PDR_SECTIONS` แต่คำต้องเป็นชุดเดียวกันด้วยเหตุผลเดียวกับทะเบียนช่องข้างบน
   ⭐ **2.1.4 = Performance · 2.1.5 = Scentotype** ตามไฟล์ PDR ของ AE (มติผู้ใช้ 2026-09-11)
   — สลับกับลำดับเดิม · Archetype (2.1.6 ในไฟล์นั้น) ย้ายไปเป็นข้อ 1.15 ระดับใบ
   `paper` = คำเต็มบนกระดาษเมื่อยาวกว่าป้ายบนจอ */
export const PDR_BRIEF_LABELS = Object.freeze({
  label: { label: 'ชื่อเรียก' },
  brief: { label: 'บรีฟกลิ่น' },
  inspiration: { no: '2.1.1', label: 'แรงบันดาลใจ', paper: 'แรงบันดาลใจ (Why แก่นของแบรนด์)' },
  likedNotes: { no: '2.1.2', label: 'ช่วงกลิ่นที่ชื่นชอบ' },
  dislikedNotes: { no: '2.1.3', label: 'กลิ่นที่ End-user ไม่ชอบ' },
  researchTopic: { label: 'ให้ทำวิจัยเรื่อง', paper: 'หากต้องการให้ทำวิจัย ระบุ' },
  performance: { no: '2.1.4', label: 'Performance ของกลิ่น' },
  scentotypes: { no: '2.1.5', label: 'Scentotype' },
});

// ทุกช่องที่มีคอลัมน์จริง — ใช้ตรวจว่าไม่มีคอลัมน์ไหนหลุดจากจอ
export const PDR_FIELDS = PDR_SECTIONS.flatMap((s) => s.fields);
// key → คอลัมน์ — ใช้ตอนช่องหนึ่งต้องอ่านค่าของอีกช่อง (สวิตช์ 1.7.1 · ข้อความเขียนต่อ 1.15)
const FIELD_COLUMN = Object.fromEntries(PDR_FIELDS.filter((f) => f.column).map((f) => [f.key, f.column]));

/* ช่องผู้เซ็นบนเอกสาร — **ที่เดียว** ที่ทั้งฟอร์ม PDR และกล่องรับเรื่องอ่านว่ามีช่องอะไร
   ⚠️ อ่านจากทะเบียนเดียวกัน ไม่ใช่ไล่เขียนชื่อช่องซ้ำ — สองที่จะเพี้ยนหากันทันทีที่
   เพิ่ม/ตัดช่อง (โรคเดิมของฟอร์มนี้ที่ ม-45 เพิ่งแก้ไป) */
export const PDR_SIGNER_FIELDS = PDR_SECTIONS.find((s) => s.key === 'signers')?.fields || [];
export const PDR_COLUMNS = PDR_FIELDS.map((f) => f.column).filter(Boolean);

const money = (v) => (v == null || v === '' ? null : fmtNumber(v));

/**
 * ค่าที่ **พร้อมแสดง** ของช่องหนึ่ง — คืน string หรือ null ถ้าไม่ได้กรอก
 *
 * ⚠️ ที่เดียวที่แปลง enum เป็นป้ายไทย — เดิมเอกสารไม่ได้แปลง ⇒ พิมพ์ `new_product`
 * · `premium` · `existing` ลงกระดาษที่ส่งให้ลูกค้า
 *
 * ⚠️ ค่าที่ไม่รู้จักคืนค่าดิบ ไม่ใช่ null — ข้อมูลเก่าที่ enum เปลี่ยนไปแล้วต้องยัง
 * เห็นบนจอ ไม่ใช่หายเงียบจนดูเหมือนไม่เคยกรอก
 */
export function pdrFieldText(field, request = {}, context = {}) {
  if (!field) return null;

  if (field.type === 'derived') {
    const { briefs = [] } = context;
    switch (field.derive) {
      // ⚠️ AE/AC เป็นของ **โครงการ** (mig 0190) ไม่ใช่คนกดปุ่ม — แต่ถอยไปใช้ชื่อคน
      // เปิดใบเมื่อโครงการยังไม่ระบุ · ช่องว่างบนเอกสารที่ต้องมีคนรับผิดชอบเสมอ
      // แย่กว่าชื่อที่ใกล้ความจริงที่สุด
      // ⚠️ อ่านจาก `submittedAt` ที่เดียว — ร่างยังไม่ส่ง = ยังไม่มีวันยื่น ⇒ N/A
      case 'requestedAt': return context.requestedAt ?? requestedAtText(request);
      case 'requester': return context.requester || request.requestedByName || null;
      case 'coordinator': return context.coordinator || null;
      case 'department': return 'การขายและบริการ';
      case 'customer': return context.customer || request.customerName || null;
      case 'deal': return context.deal || null;
      case 'contactName': return context.contactName || null;
      case 'contactPhone': return context.contactPhone || null;
      // ⭐ 1.7 ที่อยู่หลัก (ออกบิล) ของลูกค้า — ประกอบที่ `pdrContext` ด้วยตัวกลางของทะเบียน
      // ที่อยู่ (`addressTextIn`) ห้ามต่อสตริงเอง (บทเรียน "ที่อยู่หางซ้ำ" · "สาขาหาย")
      case 'customerAddress': return context.customerAddress || null;
      // ⚠️ วันเดียวกับ `requestedDueDate` ของกลไกคำร้อง ไม่ใช่คอลัมน์ใหม่
      case 'sampleDue': return context.sampleDue ?? sampleDueText(request);
      // ⚠️ ใบที่ไม่ได้ติ๊กด่วนต้องได้ค่าว่าง **ไม่ใช่ค่าที่ค้างจากตอนเคยติ๊ก** —
      // API ล้างคอลัมน์ให้เมื่อถอดธงอยู่แล้ว ตรงนี้กันอีกชั้นสำหรับแถวเก่า
      case 'urgentReason': return request.urgent ? (request.urgentReason || '') : '';
      // ⚠️ **จำนวนกลิ่นมาจากใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ** (มติผู้ใช้ 2026-08-08)
      //
      // 🐞 เดิมถอยไปใช้ `briefs.length` เมื่อผู้เรียกไม่ส่งมา ⇒ ใบที่ AE **รวบเป็น
      // บรีฟเดียว** (ลูกค้าบอกแนวเดียว "ทำแนวสดชื่นมา 3 ทาง" — โหมดที่ฟอร์มเปิดให้ทำ
      // อยู่แล้ว) จะพิมพ์ลงกระดาษว่า **1 กลิ่น** ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3
      // ⇒ จำนวนที่ลูกค้าจ่ายไปแล้วต้องมาจาก qty ของบรรทัดออกแบบกลิ่นเสมอ
      //
      // ⚠️ ไม่มีค่าจากผู้เรียก = ไม่รู้ ⇒ N/A · **ห้ามเดาจากจำนวนก้อน** เพราะเดาแล้ว
      // ผิดเงียบ ซึ่งแย่กว่าช่องว่างที่บอกตรง ๆ ว่ายังไม่รู้
      case 'scentCount': {
        const n = context.scentCount ?? null;
        return n ? `${n} กลิ่น` : null;
      }
      default: return null;
    }
  }

  const raw = request[field.column];

  // ⭐ ธงจริง/เท็จ (1.7.1 สวิตช์) — ไม่มีแถวของตัวเองบนกระดาษ แต่จอ/เธรดยังอ่านได้
  if (field.type === 'switch') return raw === true ? 'ใช่' : raw === false ? 'ไม่ใช่' : null;
  // ข้อความเขียนต่อพิมพ์ติดกับช่องติ๊กของมัน (ดู `notes` ของช่อง multi) ไม่ใช่แถวแยก
  if (field.type === 'notes') return null;

  // ⭐ 1.7.1 — เปิดสวิตช์ "ส่งไปที่อยู่เดียวกับลูกค้า" = ไม่มีที่อยู่จัดส่งของตัวเอง
  // ⚠️ `true` เท่านั้น — NULL/false คือใช้ข้อความ (ใบเก่าทุกใบพิมพ์เหมือนเดิม · mig 0352)
  if (field.hideWhenOn && request[FIELD_COLUMN[field.hideWhenOn]] === true) {
    return 'ที่อยู่เดียวกับลูกค้า (ข้อ 1.7)';
  }

  // ⚠️ ช่องติ๊กหลายตัวมาเป็น array — ว่างคือ "ยังไม่ได้เลือก" ไม่ใช่ค่าที่แสดงเป็น []
  if (field.type === 'multi') {
    const list = Array.isArray(raw) ? raw : [];
    if (!list.length) return null;
    // ⭐ ช่องที่มีข้อความเขียนต่อ (1.15 Archetype) — พิมพ์ต่อท้ายตัวที่ติ๊ก ท่าเดียวกับ
    // Scentotype บนกระดาษ ("☑ CAREGIVER — ดูแลแขกเหมือนคนในบ้าน")
    const notes = field.notes ? (request[FIELD_COLUMN[field.notes]] || {}) : {};
    return list.map((v) => {
      const text = labelOf(field.options || [], v) || String(v);
      const note = String(notes?.[v] ?? '').trim();
      return note ? `${text} — ${note}` : text;
    }).join(' · ');
  }

  // ⭐ หมวดสินค้าหลายรายการ — ป้ายมาจากทะเบียนที่ผู้เรียกส่งมา (`context.categories`)
  // ⚠️ ไม่มีทะเบียน = พิมพ์รหัสดิบ ไม่ใช่ค่าว่าง — ใบที่มีข้อมูลต้องอ่านออกเสมอ
  // แม้จอที่เรียกจะลืมส่งทะเบียนมา (บทเรียนเดียวกับ docTypeLabel)
  if (field.type === 'categories') {
    const list = Array.isArray(raw) ? raw : [];
    if (!list.length) return null;
    const registry = context.categories || [];
    return list.map((code) => categoryLabel(code, registry)).join(' · ');
  }

  if (raw == null || String(raw).trim() === '') return null;
  if (field.type === 'select') return labelOf(field.options || [], raw) || String(raw);
  if (field.type === 'money') return money(raw);
  // ⚠️ ช่อง `type: 'date'` เคยตกมาที่ `String(raw)` ท้ายไฟล์ ⇒ พิมพ์ ISO ดิบลงกระดาษ
  // (ข้อ 1.13 วันที่ต้องการสินค้า · 1.14 วันที่ต้องการจำหน่าย) · คอลัมน์เป็น `date`
  // ล้วน `fmtDate` จึงเดินทาง date-only ไม่แปลงเป็น moment = ไม่มีวันเลื่อนจาก timezone
  if (field.type === 'date') return fmtDate(String(raw).trim());
  return String(raw).trim();
}

/**
 * ช่องนี้ควรโผล่บนฟอร์มไหม — บางช่องขึ้นต่อเมื่อเลือกตัวเลือกบางตัวเท่านั้น
 *
 * ⭐ รหัสสินค้าก่อนหน้า ขึ้นเฉพาะ Product Modification / Cost Reduction
 * ⭐ "เอกสารส่งออก — ระบุ" ขึ้นเฉพาะเมื่อติ๊ก "เอกสารส่งออก"
 *
 * ⚠️ **ซ่อนบนฟอร์มเท่านั้น ไม่ลบค่า** — ผู้ใช้สลับประเภทไปมาแล้วค่าที่พิมพ์ไว้ต้อง
 * ไม่หาย · และจอแสดง/เอกสารยังโชว์ค่าที่มีอยู่เสมอ ไม่งั้นข้อมูลจะหายไปจากสายตา
 * ทั้งที่ยังอยู่ในฐานข้อมูล
 */
export function pdrFieldVisible(field, values = {}) {
  // ⭐ 1.7.1 ที่อยู่จัดส่ง — ซ่อนเมื่อเปิดสวิตช์ "ส่งไปที่อยู่เดียวกับลูกค้า" (ค่าฟอร์ม 'true')
  if (field?.hideWhenOn) return String(values[field.hideWhenOn] ?? '') !== 'true';
  // สวิตช์กับข้อความเขียนต่อมีคอนโทรลของตัวเองติดกับช่องแม่ — ไม่ใช่ช่องที่วาดเดี่ยว
  if (field?.type === 'switch' || field?.type === 'notes') return true;
  if (field?.showFor) return field.showFor.includes(values.requestType);
  if (field?.showForDocument) {
    const list = Array.isArray(values.documents) ? values.documents : [];
    return list.includes(field.showForDocument);
  }
  // ⭐ เงื่อนไขทั่วไป "ติ๊กค่านี้ในชุดไหน" (2026-08-09) — `showForDocument` เป็นกรณี
  // เฉพาะของชุดเอกสารที่มีมาก่อน · ตัวนี้ใช้ได้กับทุกชุดติ๊กหลายตัว
  if (field?.showForMulti) {
    const list = Array.isArray(values[field.showForMulti.key]) ? values[field.showForMulti.key] : [];
    return list.includes(field.showForMulti.value);
  }
  // ⚠️ ช่องที่เก็บไว้อ่านของเก่าอย่างเดียว — ฟอร์มไม่แสดง (ผู้เรียกฝั่งอ่านข้ามเอง
  // ด้วย `field.legacy` เพราะจอสรุป/เอกสารยังต้องพิมพ์ค่าที่ใบเก่ามี)
  return true;
}

/**
 * ความคืบหน้าของส่วนหนึ่ง **ฝั่งกรอก** — `{ total, filled }`
 *
 * ⭐ มติผู้ใช้ 2026-08-09 (รีดีไซน์ฟอร์มคำร้อง): ส่วนพับ `<details>` เดิมโชว์แค่ชื่อ
 * ⇒ ต้องกางทุกลิ้นชักถึงจะรู้ว่ากรอกครบยัง · ตัวเลขนี้ไปอยู่บนหัวส่วนและบนรางข้าง
 *
 * ⚠️ **ตัวนับของเกจมีตัวเดียว และคือตัวนี้** — ฝั่งอ่านเคยมี `pdrSectionProgress`
 * ของตัวเองที่นับจากแถวในฐาน (รวมช่องที่ระบบเติม) ⇒ เกจอันเดียวกันให้เลขคนละชุด
 * ระหว่างโหมดอ่านกับโหมดแก้ · ถอดทิ้งแล้ว ฝั่งอ่านแปลงแถวเป็นค่าฟอร์มก่อนเข้าตัวนี้
 * (`pdrRailSectionsFromRequest`)
 *
 * ⚠️ "แสดงช่องที่ระบบเติม" กับ "นับช่องที่ระบบเติม" คนละเรื่อง — จอแสดงยังโชว์ครบ
 * ผ่าน `pdrSectionRows` เหมือนเดิม ที่ตัดออกคือ **ตัวหารของเกจ** เท่านั้น
 *
 * ⚠️ ช่องที่ซ่อนตามประเภทคำขอ (`showFor`) ไม่นับ — นับเมื่อไรตัวหารจะเปลี่ยนไปมา
 * ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
 */
export function pdrFormProgress(section, values = {}) {
  const fields = (section?.fields || [])
    // ⚠️ `legacy` = ช่องที่ฟอร์มไม่แสดงแล้ว — นับเข้าตัวหารจะกรอกให้ครบไม่ได้ตลอดกาล
    // ⚠️ `targets` (ข้อ 2.2/2.3) เก็บอยู่คนละตาราง ไม่ได้อยู่ใน `values` ⇒ นับที่นี่
    // แล้วเกจจะขาดหนึ่งช่องตลอดกาล · ตัวนับของมันอยู่ที่ `pdrTargetsProgress`
    // ซึ่งรางเลือกส่วนบวกเข้ามาเอง (บทเรียนเดียวกับเกจ 12% ใน form-design-rules)
    // ⚠️ สวิตช์ไม่ใช่ "ช่องที่ต้องกรอก" (ปิดก็คือคำตอบหนึ่ง) · ข้อความเขียนต่อเว้นว่างได้
    .filter((f) => f.type !== 'derived' && f.type !== 'targets' && !f.legacy
      && f.type !== 'switch' && f.type !== 'notes'
      && pdrFieldVisible(f, values));
  const filled = fields.filter((f) => {
    const v = values?.[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim() !== '';
  }).length;
  return { total: fields.length, filled };
}

/**
 * ติ๊กว่ามีภาพประกอบแล้วต้องแนบจริง — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ มติผู้ใช้ตอนไล่ฟอร์ม: "แยกแต่ถ้าบอกมี ต้องแนบภาพประกอบนะ" · ปล่อยให้ติ๊กแล้ว
 * ไม่แนบ = RD ตามหาภาพที่ไม่มีอยู่จริง ซึ่งแย่กว่าติ๊กว่าไม่มีตั้งแต่แรก
 *
 * ⚠️ **ไม่บังคับตอนเปิดใบ** — หน้า `/requests/new` แนบไฟล์ไม่ได้ (ต้องมี id ก่อน)
 * ⇒ ผู้เรียกส่ง `stage: 'submit'` ตอนกดส่งเท่านั้น ซึ่งเป็นจังหวะที่แนบได้แล้ว
 */
export function pdrArtworkError(values = {}, { attachmentCount = 0, stage = null } = {}) {
  if (stage !== 'submit') return null;
  if (values.packagingArtwork !== 'has') return null;
  return attachmentCount > 0 ? null : 'ติ๊กว่ามีภาพประกอบบรรจุภัณฑ์แล้ว — ต้องแนบไฟล์ภาพก่อนส่ง';
}

/**
 * แถวของหัวข้อหนึ่ง พร้อมแสดง — [[ป้าย, ค่า], …]
 *
 * `includeEmpty: true` สำหรับเอกสาร (ช่องว่างต้องพิมพ์เป็นเส้นให้เขียนมือ)
 * · ค่าเริ่มต้นตัดช่องว่างทิ้ง สำหรับบนจอ (21 ช่องส่วนใหญ่ไม่บังคับ ⇒ แสดงครบ
 *   จะกลบของที่กรอกจริงจนหาไม่เจอ)
 */
/**
 * รางหมวดของแบบฟอร์ม PDR — **ที่เดียวของทั้งสามจอ** (เปิดคำร้อง · อ่าน · แก้)
 *
 * 🐞 เดิมมีสองตัว: ฝั่งกรอก/แก้ใช้ `pdrRailSections` (อยู่ใน PdrForm) นับด้วย
 * `pdrFormProgress` · ฝั่งอ่านใช้ `pdrReadRailSections` (อยู่ใน PdrSummary) นับด้วย
 * `pdrSectionProgress` ⇒ **ใบเดียวกันกดปุ่มแก้แล้วเลขเปลี่ยนใต้ตาคน**
 * (SB-26080002: ข้อมูลคำขอ 6/8 → 1/1 · ข้อมูลลูกค้า 14/18 → 9/12 · สเปก 6/13 → 4/10)
 * และป้ายหมวดก็คนละชุด (ฝั่งอ่านมีเลขนำ ฝั่งแก้ไม่มี) — โรคเดียวกับที่หัวไฟล์นี้
 * บอกว่าไฟล์นี้มีอยู่เพื่อกัน
 *
 * ⚠️ **เกจถามคำถามเดียวเสมอ: "เหลืออีกกี่ช่องที่คนต้องพิมพ์"** ⇒ นับด้วย
 * `pdrFormProgress` ทั้งสองฝั่ง · ฝั่งอ่านจึงแปลงแถวเป็นค่าฟอร์มก่อนด้วย
 * `pdrValuesFrom` (ดู `pdrRailSectionsFromRequest`)
 *
 * ⚠️ ช่องที่ระบบเติมให้ (`derived`) **แสดงบนจอ แต่ไม่เข้าตัวหาร** — สองอย่างนี้คนละ
 * เรื่อง · การนับมันเข้าไปคือเหตุที่หมวด "ข้อมูลคำขอ" ค้าง 6/8 ตลอดกาลและจุดสี
 * ไม่มีวันเขียว ทั้งที่ผู้ใช้กรอกครบทุกช่องที่ตัวเองแตะได้แล้ว
 *
 * ⚠️ "บรีฟกลิ่น" ไม่ได้อยู่ใน `PDR_SECTIONS` (ไม่ใช่ช่องบนกระดาษ FM-RD-01 แต่เป็น
 * ก้อนของระบบ) จึงแทรกด้วยมือตรงตำแหน่งเดิม — ระหว่างลูกค้ากับสเปก · เลขหมวด
 * จึงข้ามมันไป ตรงกับเลขข้อบนกระดาษ
 */
export function pdrRailSections(values = {}, briefs = [], targets = [], { withBriefs = true } = {}) {
  const of = (key) => PDR_SECTIONS.find((s) => s.key === key);
  /* ⭐ **เลขหมวด = เลขบนกระดาษ** (`paperNo`) ไม่ใช่ลำดับในราง (มติผู้ใช้ 2026-09-11) —
     🐞 เดิมนับ index+1 ⇒ "3 ข้อกำหนดผลิตภัณฑ์" แต่ข้อย่อยข้างในเป็น 2.x ผู้ใช้ถามเอง
     ว่าทำไม · Request Information / Regulatory / Final Review บนกระดาษไม่มีเลข */
  const labelOfSection = (key) => [of(key).paperNo, of(key).title].filter(Boolean).join(' ');
  const count = (key) => ({ ...pdrFormProgress(of(key), values), optional: !!of(key).optional });
  // ⚠️ หมวดสเปกมีทั้งช่องธรรมดาและ **แถวรายสินค้า** (ข้อ 2.2/2.3 · mig 0229) ที่อยู่
  // คนละตาราง ⇒ บวกสองตัวนับเข้าด้วยกัน ไม่งั้นเลข "กรอกแล้ว/ทั้งหมด" บนหัวหมวด
  // จะไม่รวมของที่ผู้ใช้เพิ่งกรอกไป
  const specCount = () => {
    const base = count('spec');
    const rows = pdrTargetsProgress(targets);
    return { total: base.total + rows.total, filled: base.filled + rows.filled };
  };
  const section = (key) => ({ key, label: labelOfSection(key), count: count(key) });
  return [
    section('request'),
    section('customer'),
    /* ⚠️ ใบที่เลือกกลิ่นจากทะเบียน (พัฒนาสูตร NPD) ไม่มีส่วนนี้เลย — ผู้เรียกบอกด้วย
       `withBriefs` ที่อ่านจากทะเบียนหัวข้อ (`requestUsesScentBriefs`) ไม่ใช่เดาจากจำนวนก้อน */
    ...(withBriefs ? [{
      key: 'briefs',
      label: '2.1 บรีฟกลิ่น',
      // ⚠️ นับ **ก้อนที่มีเนื้อบรีฟ** ไม่ใช่ก้อนที่มีชื่อ — ชื่อเรียกที่เว้นว่างไว้จะถูก
      // เติม "กลิ่นที่ N" ให้ตอนบันทึก (scentBriefs.js) ⇒ ถ้านับชื่อ เกจจะเด้งเป็น
      // เต็มทันทีที่กดบันทึกครั้งแรก ทั้งที่ยังไม่ได้เขียนบรีฟสักตัว
      count: {
        total: briefs.length,
        filled: briefs.filter((b) => String(b?.brief || '').trim()).length,
      },
    }] : []),
    { key: 'spec', label: labelOfSection('spec'), count: specCount() },
    section('regulatory'),
    section('signers'),
  ];
}

/**
 * รางหมวดฝั่ง **อ่าน** — แถวคำร้องจากฐาน ไม่ใช่ค่าฟอร์ม
 *
 * ⚠️ แปลงเป็นค่าฟอร์มก่อนแล้วเข้าตัวเดียวกับฝั่งกรอก — ห้ามนับเองที่นี่
 * (ตัวแปลงเป็นตัวเดียวกับที่ปุ่ม "แก้ไข" ใช้เปิดโหมดแก้ ⇒ เลขก่อนกดกับหลังกดตรงกัน
 * โดยโครงสร้าง ไม่ใช่เพราะบังเอิญเขียนเหมือนกัน)
 */
export function pdrRailSectionsFromRequest(request = {}, briefs = [], targets = []) {
  return pdrRailSections(
    pdrValuesFrom(request),
    briefs,
    (targets || []).map(pdrTargetValuesFrom),
    { withBriefs: requestUsesScentBriefs(request) },
  );
}

/**
 * `withSource: true` — ต่อองค์ประกอบที่สามเป็น "ค่านี้มาจากไหน" สำหรับช่องที่ระบบ
 * เติมให้เอง (`derived`) · จอแสดงใช้บอกว่าช่องนี้ไม่ใช่ของที่คนกรอกลืม
 *
 * 🐞 ข้อความ `from` ("เติมจากผู้ดูแลโครงการ" · "เติมจากทะเบียนลูกค้า" · "เติมจาก SO")
 * ประกาศอยู่ในทะเบียนมาตั้งแต่ต้น แต่ **ไม่มีที่ไหนเรนเดอร์เลย** ⇒ ช่องที่ระบบเติม
 * กับช่องที่คนลืมกรอกหน้าตาเหมือนกันเป๊ะบนจอ
 * (หน้าใบสั่งขายทำถูกอยู่แล้ว — พิมพ์กำกับว่า "ตามใบเสนอราคา QT-… แก้ที่นี่ไม่ได้")
 *
 * ⚠️ ปิดไว้เป็นค่าตั้งต้น — ผู้เรียกอื่น (และเทสต์) ยังได้คู่ [ป้าย, ค่า] เหมือนเดิม
 */
/**
 * ก้อน context ที่ฟอร์ม PDR ใช้วาดช่องเส้นประ — รวม "ของที่ server ประกอบ" กับ "ของที่คิดสดจากฟอร์ม"
 *
 * ⭐ **โหมดแก้ใช้ก้อนของ server เป็นฐาน** (`req.pdrContext`) — หน้ารายละเอียดไม่ได้โหลดทะเบียน
 *    ลูกค้า/โครงการมาทั้งชุด · 🐞 เดิมคิดฝั่งจอทั้งสองโหมด ⇒ โหมดแก้ได้ผู้ติดต่อ/ที่อยู่เป็นเส้นประ
 * ⚠️ สองค่าที่ **ต้องคิดสดเสมอ** เพราะเปลี่ยนตามที่กำลังพิมพ์: วันส่งตัวอย่าง (จากช่องวันที่ของใบ)
 *    กับจำนวนกลิ่น (ใบที่เลือกกลิ่นรายแถว = นับจากแถวในฟอร์ม · ใบพัฒนากลิ่น = จาก SO ที่เลือก
 *    ถอยไปค่าของ server เมื่อฟอร์มยังไม่รู้)
 * @param form ค่าฟอร์มทั้งใบ (ต้องมี kind/variant/pdrTargets) · @param derived ผลของ `pdrContext` ฝั่งจอ
 * @param serverContext `req.pdrContext` (โหมดแก้) หรือ null · @param soScentCount จำนวนกลิ่นจาก SO ที่เลือก
 */
export function pdrFormContext({ form = {}, derived = {}, serverContext = null, soScentCount = null } = {}) {
  const scentCount = requestPdrRowsPickScent(form)
    ? pdrTargetsScentCount(Array.isArray(form.pdrTargets) ? form.pdrTargets : [])
    : (soScentCount ?? serverContext?.scentCount ?? null);
  return { ...(serverContext || derived), sampleDue: derived.sampleDue ?? null, scentCount };
}

/**
 * "ค่านี้มาจากไหน" ของช่องที่ระบบเติม — ใบที่ผูกแค่ดีล (พัฒนาสูตร NPD · เลือกกลิ่นจาก
 * ทะเบียนรายแถว) ไม่มีใบสั่งขาย ⇒ คำว่า "เติมจาก SO" จะชี้ไปของที่ใบนี้ไม่มี
 * ⚠️ ถามทะเบียนหัวข้อด้วยทั้งใบ ไม่ใช่เดาจาก `salesOrderId` ว่าง (ร่างพัฒนากลิ่นที่ยังไม่
 *    เลือก SO ก็ว่าง แต่ช่องยังจะเติมจาก SO เมื่อเลือกแล้ว)
 */
export function pdrFieldFrom(field, request = {}) {
  return (field?.fromDealOnly && requestPdrRowsPickScent(request)) ? field.fromDealOnly : field?.from || null;
}

export function pdrSectionRows(section, request = {}, {
  includeEmpty = false, context = {}, withSource = false,
  // ⭐ ต่อเลขข้อบนกระดาษหน้าป้าย ("1.4 ชื่อแบรนด์") — จอสรุปใช้ ให้พูดเลขเดียวกับฟอร์มและเอกสาร
  numbered = false,
} = {}) {
  return (section?.fields || [])
    // ⚠️ ช่อง `legacy` โผล่เฉพาะใบที่มีค่าจริง — ใบใหม่ไม่เขียนลงช่องนี้แล้ว ปล่อยให้
    // `includeEmpty` ลากมาด้วยจะได้บรรทัด "ประเภทสินค้า (บันทึกไว้เดิม): N/A" ติดทุกใบ
    .filter((f) => !f.legacy || (pdrFieldText(f, request, context) ?? '') !== '')
    // ⚠️ ข้อ 2.2/2.3 ไม่ใช่คู่ป้าย/ค่า แต่เป็น **ตารางรายสินค้า** (mig 0229) — ผู้เรียก
    // วาดเองจาก `request.targets` · ลากมาเป็นแถวว่างที่นี่จะได้บรรทัดที่ไม่มีวันมีค่า
    .filter((f) => f.type !== 'targets' && !f.docHidden)
    .map((f) => {
      const value = pdrFieldText(f, request, context);
      const label = numbered && f.no ? `${f.no} ${f.label}` : f.label;
      if (!withSource) return [label, value];
      const from = f.type === 'derived' ? pdrFieldFrom(f, request) : null;
      // ⚠️ บางช่องระบบเติมค่าคงที่ (แผนก = "การขายและบริการ") แล้ว `from` ก็เขียนคำ
      // เดียวกัน ⇒ จะได้บรรทัดเดียวกันสองครั้งติดกัน · ที่มาที่พูดซ้ำกับค่าไม่ได้บอกอะไร
      return [label, value, from && String(from).trim() === String(value ?? '').trim() ? null : from];
    })
    .filter(([, v]) => includeEmpty || (v != null && String(v).trim() !== ''));
}

/**
 * ช่องของหัวข้อหนึ่ง **จัดกลุ่มตามข้อบนกระดาษแล้ว** — สำหรับตัวสร้างเอกสาร
 *
 * ⭐ กระดาษ FM-RD-01 มีบางข้อที่รวมหลายช่องไว้ในกล่องเดียว (1.10 กลุ่มลูกค้าเป้าหมาย
 * · 2.8 รูปแบบบรรจุภัณฑ์ · 2.9 Value Proposition) ⇒ ต้องพิมพ์เป็นแถวเดียว ไม่ใช่
 * สามแถวแยก ไม่งั้นเลขข้อบนกระดาษกับบนเอกสารนับไม่ตรงกัน
 *
 * ⚠️ จับกลุ่มจาก `group` ของช่องที่ **ติดกัน** เท่านั้น — ช่องที่ group ซ้ำแต่อยู่คนละที่
 * ต้องไม่ถูกดูดมารวมกันข้ามลำดับบนกระดาษ
 *
 * คืน [{ no, title, fields }] · `title` = ชื่อกลุ่มถ้ามี ไม่งั้นเป็นป้ายของช่องเดียวนั้น
 *
 * ⚠️ ต้องส่ง `request`/`context` มาด้วยเพื่อ **ตัดช่อง `legacy` ที่ใบนี้ไม่มีค่า** —
 * กติกาเดียวกับ `pdrSectionRows` · ไม่ตัด กระดาษทุกใบใหม่จะมีบรรทัด
 * "ประเภทสินค้า (บันทึกไว้เดิม): N/A" ติดมาตลอด (เคยหลุดมาแล้วรอบหนึ่ง)
 */
/**
 * ช่องนี้เก็บเป็น **อาเรย์** ไหม (คอลัมน์ `text[]`)
 *
 * 🐞 ที่ต้องมีตัวกลาง: กติกา "อาเรย์คือชนิดไหนบ้าง" เคยกระจายอยู่ 4 ที่ (ฟอร์มค่าว่าง ·
 * ตัวอ่านค่าจากแถว · ตัวตรวจก่อนเขียน DB · ตัวแปลงป้าย) · พอเพิ่มชนิด `categories`
 * (0227) มีที่หนึ่งที่ลืมแก้ ⇒ `pdrValuesFrom` คืนค่าเป็น **สตริง** ให้ช่องที่ฟอร์ม
 * เรียก `.map()` ⇒ กด "แก้แบบฟอร์ม PDR" แล้วเข้าหมวดข้อมูลลูกค้า **จอพังทั้งหมวด**
 * ⇒ ตอนนี้ทุกที่ถามฟังก์ชันนี้ที่เดียว
 */
export const pdrIsArrayField = (field) => ['multi', 'categories'].includes(field?.type);

/**
 * ค่าเริ่มต้นของฟอร์ม — derive จากทะเบียน เพิ่มช่องแล้วฟอร์มรู้เองว่าต้องมีคีย์นั้น
 * (เดิมไล่เขียนมือ ⇒ ช่องใหม่เป็น undefined แล้ว React ด่าเรื่อง uncontrolled input)
 */
export const emptyPdr = () => Object.fromEntries(
  // ⚠️ สวิตช์เริ่มที่ '' (ยังไม่ตอบ) ไม่ใช่เปิดไว้ให้ — "ไม่มีค่าตั้งต้นให้กับสิ่งที่เป็น
  // การตัดสินใจ" (กติกาฟอร์ม) · ส่งตัวอย่างผิดที่เพราะสวิตช์เปิดมาเอง แย่กว่าพิมพ์ที่อยู่
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.key,
    pdrIsArrayField(f) ? [] : f.type === 'notes' ? {} : '']),
);

/**
 * คอลัมน์ `pdr*` บนแถวคำร้อง → ค่าที่ฟอร์มใช้ — ทางกลับของ `normalizePdr`
 *
 * ⚠️ ชื่อช่องในฟอร์มสั้นเพราะอยู่ในบริบท PDR อยู่แล้ว · DB ต้อง prefix เพื่อไม่ให้ปน
 * กับคอลัมน์ของกลไกคำร้อง ⇒ ต้องมีตัวแปลงทั้งสองทาง ไม่ใช่ทางเดียว
 * ⚠️ **อยู่ในทะเบียน ไม่ใช่ในคอมโพเนนต์** — มันเป็นตรรกะล้วนที่พังเงียบได้ (บั๊กอาเรย์
 * ข้างบน) · อยู่ในไฟล์ JSX แล้วเทสต์ node เรียกไม่ได้ จึงไม่มีใครดักไว้
 */
export function pdrValuesFrom(row = {}) {
  return Object.fromEntries(
    PDR_FIELDS.filter((f) => f.column).map((f) => {
      const raw = row[f.column];
      // ช่องอาเรย์ต้องกลับมาเป็นอาเรย์ — ไม่งั้น `String([])` ได้ "" แล้วค่าที่ติ๊กไว้
      // หายทั้งชุดตอนเปิดโหมดแก้ (และช่องที่เรียก `.map()` จะพังทั้งหมวด)
      if (pdrIsArrayField(f)) return [f.key, Array.isArray(raw) ? raw : []];
      if (f.type === 'notes') return [f.key, raw && typeof raw === 'object' ? { ...raw } : {}];
      // ⚠️ boolean → 'true' | 'false' · NULL → '' (ยังไม่ตอบ) — แยกสามสถานะให้ออก
      if (f.type === 'switch') return [f.key, raw === true ? 'true' : raw === false ? 'false' : ''];
      return [f.key, raw == null ? '' : String(raw)];
    }),
  );
}

export function pdrSectionGroups(section, request = null, context = {}) {
  // ⚠️ ข้อ 2.2/2.3 เป็นตารางรายสินค้า (mig 0229) ไม่ใช่คู่ป้าย/ค่า — ผู้เรียกวาดเอง
  // จาก `request.targets` · ปล่อยเข้ามาที่นี่จะได้กล่องว่างบนกระดาษที่ไม่มีวันมีค่า
  const keep = (field) => field.type !== 'targets' && !field.docHidden
    && (!field.legacy || !request || (pdrFieldText(field, request, context) ?? '') !== '');
  const out = [];
  for (const field of (section?.fields || []).filter(keep)) {
    const last = out[out.length - 1];
    if (field.group && last?.group === field.group) {
      last.fields.push(field);
      continue;
    }
    out.push({
      group: field.group || null,
      no: field.no || null,
      title: field.group || field.label,
      fields: [field],
    });
  }
  return out;
}

/**
 * ค่าที่ระบบเติมให้เอง — ประกอบจากแถวที่โหลดมาแล้ว คืน object ที่ส่งเป็น `context`
 *
 * ⭐ **ที่เดียวที่รู้ว่าค่าเติมเองมาจากตารางไหน** — จอแสดง เอกสาร และฟอร์มตอนเปิดใบ
 * เรียกตัวนี้ทั้งหมด ⇒ "ผู้ร้องขอ AE บนเอกสาร" กับ "ผู้ร้องขอ AE บนจอ" เป็นคนเดียวกัน
 * เสมอ ไม่ใช่เพราะบังเอิญเขียนเหมือนกัน
 *
 * ⚠️ AE/AC เป็นของ **โครงการ** (mig 0190) — ใช้ `aeOwner`/`acOwner` ซึ่งเป็น *ชื่อ*
 * ไม่ใช่ `aeOwnerId` · ชื่อคือสิ่งที่ต้องพิมพ์ลงเอกสาร และเป็น snapshot ตามเจตนาเดิม
 *
 * ⚠️ ผู้ติดต่อเอาจาก `contacts[0]` ก่อน แล้วค่อยถอยไป `contactPerson/contactPhone`
 * — 0033 ย้ายไป contacts[] แต่คอลัมน์เก่ายังมีค่าอยู่บนแถวที่ไม่เคยถูกแก้
 */
// วันที่คาดหวังตัวอย่าง — `requestedDueDate` ของกลไกคำร้อง ไม่ใช่คอลัมน์ของ PDR
//
// ⚠️ "ด่วน" ต่อท้ายเพราะกระดาษสั่งให้ระบุคำนี้ตรง ๆ เมื่อเป็นงานด่วน · ใบที่ติดธงด่วน
// แต่ยังไม่ระบุวันต้องยังขึ้นให้เห็นว่าด่วน ไม่ใช่เงียบไปทั้งช่อง
// วันที่ยื่นคำร้อง — ตัดเหลือ YYYY-MM-DD (คอลัมน์เป็น timestamptz)
//
// ⚠️ **ไม่ถอยไปใช้ `createdAt`** — สองวันนี้ต่างกันจริงเมื่อร่างค้างไว้ก่อนกดส่ง
// และกระดาษถามหา "วันที่ร้องขอ" ซึ่งคือวันที่เรื่องออกจากมือผู้ขอ ไม่ใช่วันที่เริ่มพิมพ์
// ⚠️ **DD/MM/YYYY ไม่ใช่ ISO** (มติผู้ใช้ 2026-08-10) — เดิมคืน `slice(0, 10)` ดิบ ⇒
// หัวใบพิมพ์ "2026-08-07" ซึ่งเป็นรูปของฐานข้อมูล ไม่ใช่รูปที่คนไทยอ่านวันที่
// ผ่าน `fmtDate` ตัวกลาง (ค.ศ. เหมือนทั้งระบบ — พ.ศ. ใช้เฉพาะ "วันที่มีผล" ของ
// เอกสารควบคุมเท่านั้น) · **คงค่า null ไว้** ไม่ให้กลายเป็น "-" เพราะร่างที่ยังไม่ส่ง
// ต้องขึ้น N/A ตามกติกาของช่อง ไม่ใช่ขีดที่อ่านเหมือนว่าไม่มีวัน
function requestedAtText(request = {}) {
  const at = request.submittedAt || null;
  return at ? fmtDate(String(at).slice(0, 10)) : null;
}

function sampleDueText(request = {}) {
  const at = request.requestedDueDate || null;
  if (!at && !request.urgent) return null;
  return `${at ? fmtDate(at) : 'ยังไม่ระบุวัน'}${request.urgent ? ' · ด่วน' : ''}`;
}

// ⚠️ `salesOrderLines` = บรรทัดของใบสั่งขายที่ผูกอยู่ — ใช้หา **จำนวนกลิ่นที่ขาย**
// ไม่ใช่จำนวนก้อนบรีฟ (ดูเหตุผลที่ `case 'scentCount'`) · ไม่ส่งมา = ช่องนั้นขึ้น N/A
export function pdrContext({
  request = {}, project = null, customer = null, deal = null, briefs = [], salesOrderLines = null,
  /* แถวสินค้าข้อ 2.x — ใบที่เลือกกลิ่นจากทะเบียน (พัฒนาสูตร NPD) นับ 1.12 จากกลิ่นในแถว
     ⚠️ ใบพัฒนากลิ่นยังนับจาก SO เสมอ (ดูเหตุผลที่ `case 'scentCount'`) */
  targets = null,
  // ⚠️ ทะเบียนหมวดสินค้า — ช่อง `type:'categories'` เก็บแต่รหัส (`MM-TTT`) ชื่อจึงต้อง
  // มาจากทะเบียน · ไม่ส่งมา = จอ/กระดาษพิมพ์รหัสเปล่า ("01-005 · 01-003") ซึ่งอ่านไม่ออก
  // ⇒ อยู่ใน context ตัวกลางที่เดียว ไม่ใช่ต่างจอต่างเดินสายเอง (จอไหนลืมก็เพี้ยนจอนั้น)
  categories = [],
} = {}) {
  const primary = (Array.isArray(customer?.contacts) ? customer.contacts[0] : null) || {};
  const phone = primary.phone || customer?.contactPhone || null;
  const line = primary.line || customer?.line || null;
  return {
    requestedAt: requestedAtText(request),
    requester: project?.aeOwner || request.requestedByName || null,
    coordinator: project?.acOwner || null,
    customer: request.customerName || customer?.name || null,
    // ⚠️ **ชื่องาน ไม่ใช่รหัสดีล** (มติผู้ใช้ 2026-08-09) — ใบมีเลขที่เอกสารเป็นรหัส
    // อยู่แล้ว รหัสที่สองอ่านแล้วสับสนว่าอันไหนคือเลขของใบนี้
    // ⚠️ ถอยไปใช้รหัสเมื่อดีลยังไม่ได้ตั้งชื่อ — ช่องว่างแย่กว่ารหัสที่อ่านออก
    deal: deal?.title || deal?.code || deal?.id || null,
    contactName: primary.name || customer?.contactPerson || null,
    // Phone / Line เป็นช่องเดียวบนกระดาษ — ต่อกันด้วย · เมื่อมีทั้งคู่
    contactPhone: [phone, line].filter(Boolean).join(' · ') || null,
    sampleDue: sampleDueText(request),
    /* ⚠️ **ทะเบียนหัวข้อเป็นคนตัดสินว่านับจากไหน** ไม่ใช่ "มีบรรทัด SO ไหม" — ใบที่ไม่มี
       SO ได้ `salesOrderLines = []` (ไม่ใช่ null) จาก findRequest ⇒ เช็คความจริงของ
       อาเรย์จะนับ SO ว่างได้ 0 แล้ว 1.12 ของ NPD ขึ้นว่างทุกใบ */
    scentCount: requestPdrRowsPickScent(request)
      ? pdrTargetsScentCount(Array.isArray(targets) ? targets : [])
      : salesOrderLines ? scentCountForOrder(salesOrderLines) : null,
    // ⭐ 1.7 — ที่อยู่หลัก (ออกบิล) จากทะเบียน · ตัวกลางถอยไปอ่านคอลัมน์สำเนาเดิมเองเมื่อ
    // ลูกค้ายังไม่มี `addresses` (ใบรายการลูกค้าส่งมาแต่สำเนา) ⇒ ฝั่งจอกับฝั่งเซิร์ฟเวอร์ได้คำเดียวกัน
    customerAddress: customer ? (addressTextIn(primaryBillingAddress(customerAddresses(customer)), 'th') || null) : null,
    briefs,
    categories,
  };
}
