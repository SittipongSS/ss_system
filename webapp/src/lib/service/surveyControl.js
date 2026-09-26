// ── สิ่งที่การ์ดควบคุมและหัวพื้นที่ต้องวาด — ตัวตัดสินล้วน (PR2 ของการรื้อจอประเมิน) ──
//
// ⭐ **ทำไมแยกไฟล์จาก `survey.js`** — `survey.js` คือ *กฎของงาน* (ด่านหกข้อ · ล็อกหลังส่ง ·
//   สูตรแพ็คเกจ) ที่ทั้งจอและ server ถามร่วมกัน · ไฟล์นี้คือ *การประกอบคำตอบให้จอเดียว*
//   (สถานะ · โทน · เหตุผลที่กดส่งไม่ได้ · ข้อเท็จจริงรายพื้นที่) ⇒ กฎอยู่บ้านเดิมบ้านเดียว
//   ไฟล์นี้ **ไม่ประกาศกฎใหม่เลย** มันถามตัวเดิมทั้งหมด (`surveySendError` · `surveyRecallError`
//   · `surveyGateChecklist` · `surveyEditLockError`) แล้วจัดเป็นของที่การ์ดวางได้
//   🔴 กฎใหม่ของใบประเมินให้เขียนที่ `survey.js` เสมอ — เขียนที่นี่เมื่อไรจะได้กฎสองชุด
//      ที่ server มองไม่เห็นชุดหนึ่ง (บทเรียนเดิมของ `lib/requests/stages.js`)
//
// 🔑 **บริสุทธิ์ทั้งไฟล์** — ไม่ยิง I/O และ **ไม่อ่านนาฬิกา** · "วันนี้" รับมาทาง `today`
//   (กติกา thai-time ของระบบ: วันต้องมาจาก `businessDate()` ของผู้เรียก ไม่ใช่ `new Date()`
//   ที่นี่ ซึ่งจะเป็นนาฬิกาเครื่องผู้ใช้เมื่อถูกเรียกบนจอ)
//
// ⚠️ **"อ่านไม่สำเร็จ" ต้องไม่กลายเป็น "ไม่มี"** (กติกา supabase-never-throws) — ชิ้นที่
//   อ่านพลาดมาทาง `unknown` แล้วกลายเป็นข้อความ "ไม่ทราบ" บนจอ ไม่ใช่ขีดหรือศูนย์
import { fmtDateTime, fmtNumber, naText } from '@/lib/format';
import { attachmentHref } from '@/lib/master/attachmentStorage';
import { isPreviewableImage } from '@/lib/master/attachmentTypes';
import { requestRailSteps } from '@/lib/requests/requestRail';
import {
  SURVEY_DOC_SPOT,
  SURVEY_DOC_WIDE,
  SURVEY_GATES,
  parseSurveyMeters,
  spotCounts,
  suggestedPackages,
  surveyDocCounts,
  surveyEditLockError,
  surveyFieldMissing,
  surveyFieldProgress,
  surveyGateChecklist,
  surveyRecallError,
  surveySendBackDoneCountText,
  surveySendError,
  surveyTotals,
  surveyZoneName,
  surveyZoneSize,
} from '@/lib/service/survey';
import { surveySendVisitStep } from '@/lib/service/surveySendClose';
import { VISIT_STATUS_LABELS } from '@/lib/service/visitStatus';

/** ค่าที่จอต้องเขียนเมื่ออ่านข้อมูลชิ้นนั้นไม่สำเร็จ — ไม่ใช่ขีด ไม่ใช่ 0 */
export const SURVEY_UNKNOWN_TEXT = 'ไม่ทราบ';

/** ป้ายของชิ้นที่อ่านได้/อ่านไม่ได้ — ใช้เขียนกล่องแจ้ง "อ่านไม่สำเร็จ" ให้บอกว่าชิ้นไหน */
export const SURVEY_UNKNOWN_LABELS = {
  site: 'ข้อมูลไซต์',
  zoneCodes: 'รหัสพื้นที่ (ZN)',
  customer: 'รหัสลูกค้า (AR)',
  recall: 'ประวัติการดึงผลกลับ',
  visit: 'นัดสำรวจ',
  sendBack: 'ประวัติการส่งกลับให้ช่างแก้',
  /* ชื่อผู้ช่วยบนนัด (GET `crew` · แผน §10.5 S5) — อ่านจากบัญชีรายคน ล้มได้ทีละคน */
  crew: 'ชื่อทีมบนนัด',
};

const isCut = (row) => (row?.status || 'ok') === 'cut';
const activeZones = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));

/**
 * ชื่อพื้นที่ต่อกันในที่แคบ — เกิน 3 ชื่อแล้วยุบเป็น "อีก n"
 * ⚠️ รางขวากว้าง 330px · สิบชื่อในบรรทัดเดียวคือบรรทัดที่ไม่มีใครอ่าน และดันการ์ดล้นจอ
 */
export function surveyNameList(names = [], max = 3) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean).map(String);
  if (list.length <= max) return list.join(' · ');
  return `${list.slice(0, max).join(' · ')} อีก ${list.length - max}`;
}

/** "2 พื้นที่ · 88 ตร.ม. · 3 แพ็คเกจ" — ยอดที่ฝ่ายขายถือไปแล้วตอนดึงกลับ
 *  ⚠️ ไม่มี totals ในแถว (แถวเก่าก่อนมี meta) = "ไม่ทราบ" ไม่ใช่ศูนย์ */
export function surveyTotalsText(totals) {
  if (!totals) return SURVEY_UNKNOWN_TEXT;
  const zones = Number(totals.zones);
  const area = Number(totals.areaSqm);
  const pkg = Number(totals.packageQty);
  const parts = [];
  if (Number.isFinite(zones)) parts.push(`${fmtNumber(zones)} พื้นที่`);
  if (Number.isFinite(area)) parts.push(`${fmtNumber(area)} ตร.ม.`);
  if (Number.isFinite(pkg)) parts.push(`${fmtNumber(pkg)} แพ็คเกจ`);
  return parts.length ? parts.join(' · ') : SURVEY_UNKNOWN_TEXT;
}

/**
 * 🔑 **ข้อเท็จจริงของพื้นที่หนึ่งแถวที่ต้องตอบได้โดยไม่ต้องเปิดพื้นที่** (แถวรายการ · จุดของตัวเลื่อน ·
 *   การ์ดจัดการผล · หน้าคำร้อง)
 *
 * ⭐ กติกาของแบบที่อนุมัติ: แถวต้องตอบ "ครบไหม ได้เท่าไร" — ครบแล้วโชว์ตัวเลข
 *   (ตร.ม. · ลบ.ม. · สูตรกี่แพ็คเกจ · กี่จุด · กี่รูป) ยังไม่ครบโชว์ "ขาด: …"
 *   ⇒ ตัวเลขทุกตัวต้องมาจากที่นี่ ไม่ใช่ให้จอคำนวณเอง (สองจอจะคำนวณไม่เท่ากัน)
 *   🔄 เดิมคือหัวของการ์ดพื้นที่ที่พับอยู่ — การพับถอดแล้ว (§10.5 S7 · ค่าพับตั้งต้นถอดใน S10) กติกาย้ายมาที่แถวรายการ
 *
 * ⚠️ `files = []` ตอนยังโหลดไม่เสร็จ ⇒ ตอบว่า "ยังไม่มีรูป" ซึ่ง **fail-closed ถูกแล้ว**
 *   (เหตุผลเดียวกับ `surveyDocCounts`)
 *
 * @param zone  แถว `service_survey_zones`
 * @param files ไฟล์แนบของแถวนั้น
 */
export function surveyZoneFacts(zone = {}, files = []) {
  const cut = isCut(zone);
  const size = surveyZoneSize(zone.parts);
  const spots = spotCounts(zone.spots);
  const photos = surveyDocCounts(files);
  const qty = Number(zone.packageQty);
  const gaps = cut
    ? []
    : SURVEY_GATES
      .map((gate) => ({ gate, text: gate.missing(zone, files || []) }))
      .filter((x) => x.text)
      .map((x) => ({ key: x.gate.key, owner: x.gate.owner, short: x.gate.short, label: x.gate.label, text: x.text }));
  const crew = gaps.filter((g) => g.owner === 'crew');
  const head = gaps.filter((g) => g.owner === 'head');
  return {
    zoneId: zone.id || null,
    zoneName: surveyZoneName(zone),
    /* รหัส ZN อ่านสดจากทะเบียน — route เติมลงแถวให้
       🔴 **"ยังไม่มีรหัส" กับ "อ่านรหัสไม่สำเร็จ" ต้องแยกกัน** — พื้นที่ใหม่ของ SA ยังไม่มี
          `zoneId` จนกว่าจะกดส่งใบ (ว่างเป็นเรื่องปกติ) ส่วนอ่านไม่สำเร็จคือของที่มีอยู่
          แต่เราไม่รู้ ⇒ จอต้องเขียน "ไม่ทราบ" เฉพาะกรณีหลัง (route ปัก `zoneCodeUnknown`) */
    zoneCode: zone.zoneCode ?? null,
    zoneCodeUnknown: zone.zoneCodeUnknown === true,
    floor: zone.floor ?? null,
    cut,
    cutReason: cut ? (zone.cutReason || null) : null,
    areaSqm: size.areaSqm,
    volumeCbm: size.volumeCbm,
    parts: size.parts,
    measuredParts: size.measuredParts,
    sizeComplete: size.complete,
    suggestedPackages: suggestedPackages(size.volumeCbm),
    packageQty: Number.isFinite(qty) && qty > 0 ? qty : null,
    spotsTotal: spots.total,
    spotsSelected: spots.selected,
    photos: { ...photos, total: photos.wide + photos.plan + photos.spot },
    missing: gaps,
    missingCrew: crew,
    missingHead: head,
    /* บรรทัด "ขาด: …" ของแถวพื้นที่ = **ของฝั่งช่างเท่านั้น** — ของหัวหน้า (ผัง/เลือกจุด/
       แพ็คเกจ) ทำที่แท็บสรุปส่งผล ไม่ได้ทำในพื้นที่ ⇒ เขียนไว้บนหัวพื้นที่คือชี้ผิดที่ */
    missingText: crew.length ? `ขาด: ${crew.map((g) => g.short).join(' · ')}` : null,
    crewComplete: !cut && crew.length === 0,
    ready: !cut && gaps.length === 0,
    tone: cut ? 'cut' : (crew.length ? 'todo' : 'done'),
  };
}

/* ภาพย่อบนช่องพื้นที่ของตารางสรุป — ช่องกว้าง ~13rem ⇒ สามช่องขนาดนิ้ว (44px) คือที่ที่มี
   ที่เหลือบอกด้วยตัวนับ "ภาพกว้าง n · ภาพจุด n" ข้างล่าง ไม่ใช่ภาพย่อแถวที่สอง */
const RESULT_THUMBS = 3;
const RESULT_PHOTO_KINDS = [
  { kind: 'wide', docType: SURVEY_DOC_WIDE, label: 'ภาพกว้าง' },
  { kind: 'spot', docType: SURVEY_DOC_SPOT, label: 'ภาพจุด' },
];
/* ช่องขนาดหนึ่งช่อง — ยังว่าง/ไม่ใช่เลขบวก = ขีด
   🐞 ตารางเดิมเขียน `fmtNumber(p.heightM)` ตรง ๆ ⇒ `fmtNumber('')` = "0" ⇒ ส่วนที่ยังวัดไม่ครบ
      ขึ้น "8 × 6 × 0" ซึ่งอ่านเหมือนวัดได้ศูนย์เมตร ไม่ใช่ "ยังไม่ได้วัด" */
const dimText = (value) => {
  const n = Number(value);
  return value !== '' && value !== null && Number.isFinite(n) && n > 0 ? fmtNumber(n) : naText(null);
};

/**
 * 🔑 **ช่อง "พื้นที่ · ผลวัดจากช่าง" ของตารางสรุปส่งผล** (แบบ AW-3 · แผน §10.5 S2)
 *
 * ⭐ หัวหน้าเคาะจุด/แพ็คเกจ **จากผลวัดของช่าง** ⇒ ของที่เขาต้องเห็นอยู่ช่องเดียวกับชื่อพื้นที่:
 *   ตัวเลข (ตร.ม. · ลบ.ม.) · ขนาดรายส่วน · ภาพย่อที่ช่างถ่าย · จำนวนรูป — เดิมแยกเป็นคอลัมน์ "ขนาด"
 *   กับ "รูป" (เลข "1 / 0 / 2") ซึ่งไม่มีภาพให้ดูเลย และผังปนอยู่ในตัวนับของช่าง
 * ⚠️ **ภาพผังไม่อยู่ในช่องนี้** — มันเป็นของหัวหน้า มีคอลัมน์ของตัวเอง (ที่อัปได้) · ภาพย่อที่นี่
 *   อ่านอย่างเดียว เพราะรูปของช่างแก้ที่หน้างาน ไม่ใช่ที่ตารางเคาะ
 * ⚠️ `thumbs` ≠ ตัวนับ — ไฟล์ที่ไม่ใช่รูป (PDF ที่ลากมาวาง) และแถวที่ไม่มีที่อยู่ไฟล์ให้เปิด
 *   ไม่มีภาพย่อ แต่ **นับ** เพราะด่าน "ภาพกว้าง" ของ server ก็นับ (`surveyDocCounts`) ·
 *   ตัวนับบนจอต้องตรงกับด่าน
 *
 * @param zone  แถว `service_survey_zones`
 * @param files ไฟล์ของแถวนั้น (ชุดสดจาก `useLiveZoneFiles`)
 * @returns `{ figures, dims, partsText, photos:{wide,plan,spot}, thumbs:[{file,href,kind,label,startsGroup}], moreThumbs }`
 */
export function surveyResultZoneCell(zone = {}, files = []) {
  const parts = Array.isArray(zone?.parts) ? zone.parts : [];
  const size = surveyZoneSize(parts);
  const rows = Array.isArray(files) ? files : [];
  /* ที่อยู่ไฟล์มาจากกติกาเดียวกับแผงไฟล์แนบ (`attachmentHref` — Drive ผ่าน proxy ที่ตรวจสิทธิ์) */
  const pictures = RESULT_PHOTO_KINDS.flatMap(({ kind, docType, label }) => rows
    .filter((f) => f?.docType === docType && isPreviewableImage(f))
    .map((file) => ({ file, href: attachmentHref(file), kind, label }))
    .filter((t) => t.href));
  const thumbs = pictures.slice(0, RESULT_THUMBS).map((t, i, list) => ({
    ...t,
    // เส้นคั่นระหว่างกลุ่ม (ภาพกว้าง | ภาพจุด) — ตัวแรกของกลุ่มที่สองเป็นคนบอก
    startsGroup: i > 0 && list[i - 1].kind !== t.kind,
  }));
  return {
    /* ยังไม่มีส่วนที่วัดครบ = ยังไม่มีตัวเลข (ไม่ใช่ "0 ตร.ม." ที่อ่านเหมือนวัดได้ศูนย์) */
    figures: size.measuredParts > 0
      ? `${fmtNumber(size.areaSqm)} ตร.ม. · ${fmtNumber(size.volumeCbm)} ลบ.ม.`
      : null,
    dims: parts.length
      ? `${parts.map((p) => `${dimText(p?.widthM)} × ${dimText(p?.lengthM)} × ${dimText(p?.heightM)}`).join(' + ')} ม.`
      : null,
    partsText: parts.length > 1 ? `${fmtNumber(parts.length)} ส่วน` : null,
    photos: surveyDocCounts(rows),
    thumbs,
    moreThumbs: pictures.length - thumbs.length,
  };
}

/* ตัวเลขที่พิมพ์คนละรูปแต่เป็นค่าเดียวกัน — "8.00" กับ 8 ต้องเท่ากัน
   (server ปรับรูปให้ตอนบันทึก ⇒ เทียบเป็นสตริงดิบจะได้ "ต่าง" ทุกครั้งหลังบันทึก)
   🐞 UAT 25/09 — เดิมใช้ `Number()` ⇒ '7,5' ได้ NaN แล้วเก็บข้อความดิบ ทั้งที่ตัวบันทึกอ่านเป็น 7.5 ⇒ ช่างแป้นจุลภาค
      พิมพ์ต่อระหว่างรอบันทึกเจอ "ถูกแก้จากที่อื่น" เพราะการบันทึกของตัวเอง ⇒ อ่านด้วยตัวเดียวกับตัวบันทึก
      · ค่าที่ตัวบันทึกไม่รับ (NaN) = ข้อความดิบ (ไม่หายเป็น "ว่าง") */
const sigNumber = (value) => {
  const n = parseSurveyMeters(value);
  if (n === null) return '';
  return Number.isFinite(n) ? String(n) : String(value).trim();
};

/**
 * 🔑 **ลายเซ็นของค่าที่กรอกในพื้นที่หนึ่ง** — ใช้ตอบคำถามเดียว: "ที่อยู่บนจอ ตรงกับที่
 * ลงฐานแล้วไหม" ⇒ จอเอาไปยกธง "ยังไม่บันทึก" และส่ง `dirtyZoneIds` ให้การ์ดควบคุม
 * บล็อกปุ่มส่งผล (ด่านที่ server มองไม่เห็น เพราะค่ายังไม่เคยถูกส่งไป)
 *
 * ⚠️ **แถวว่างล้วนไม่นับ** — การ์ดเปิดมาพร้อมช่องเปล่าหนึ่งแถวเสมอเมื่อยังไม่เคยวัด
 *   ถ้านับ พื้นที่ที่ไม่มีใครแตะจะขึ้น "ยังไม่บันทึก" ทั้งใบตั้งแต่เปิดหน้า
 * ⚠️ **ไม่รวม `id` ของแถว** — id ของแถวที่เพิ่มบนจอเป็นค่าสุ่ม และ id ที่กลับมาจาก
 *   server เป็นคนละตัว · เทียบ id = ทุกพื้นที่ "ค้าง" ตลอดกาลหลังบันทึกสำเร็จ
 */
export function surveyZoneDraftSignature({ parts = [], spots = [], note = '' } = {}) {
  const partRows = (Array.isArray(parts) ? parts : [])
    .map((p) => [
      String(p?.label ?? '').trim(),
      sigNumber(p?.widthM), sigNumber(p?.lengthM), sigNumber(p?.heightM),
    ])
    .filter((row) => row.some(Boolean));
  const spotRows = (Array.isArray(spots) ? spots : [])
    .map((s) => [String(s?.label ?? '').trim(), String(s?.note ?? '').trim()])
    .filter((row) => row.some(Boolean));
  return JSON.stringify([partRows, spotRows, String(note ?? '').trim()]);
}

/**
 * ส่วนไหนของร่างที่ต่างจากแถวที่ร่างตั้งต้น — การบันทึกส่ง **เฉพาะส่วนที่แก้** (route รับทีละส่วน: ไม่ส่ง = ไม่แตะ)
 * 🐞 review 26/09 รอบสอง — ช่างสองคนบนพื้นที่เดียว: ผู้ช่วยเพิ่มจุดบนร่างเก่า (ส่วนว่าง) แล้วกดทับหลังป้าย "ถูกแก้จากที่อื่น"
 *   ⇒ ส่ง `parts: []` ทั้งก้อน ลบขนาดที่คนนำเพิ่งวัด ทั้งที่ผู้ช่วยไม่ได้แตะขนาดเลย · ส่งเฉพาะส่วนที่แก้ = ทับได้แค่ของที่ตั้งใจทับ
 *   ⚠️ แถวส่วน/จุดที่ว่างทั้งแถวไม่นับ (ลายเซ็นตัดทิ้งอยู่แล้ว) — ส่วนว่างที่จอเติมให้ไม่ใช่ "แก้ขนาด"
 * @param baseSig `surveyZoneDraftSignature(แถวที่ร่างตั้งต้น)`
 * @returns `{ parts, spots, note }` (true = แก้) · `null` = ไม่รู้แถวตั้งต้น (ผู้เรียกส่งทั้งก้อนแบบเดิม)
 */
export function surveyZoneChangedSections(baseSig, draft = {}) {
  let base;
  try {
    base = JSON.parse(baseSig);
  } catch {
    return null;
  }
  if (!Array.isArray(base) || base.length !== 3) return null;
  const now = JSON.parse(surveyZoneDraftSignature(draft));
  return {
    parts: JSON.stringify(base[0]) !== JSON.stringify(now[0]),
    spots: JSON.stringify(base[1]) !== JSON.stringify(now[1]),
    note: base[2] !== now[2],
  };
}

/**
 * 🔑 **แถวที่โหลดใหม่ไหลเข้ามา — รับเลย หรือเก็บร่างไว้แล้วบอกว่าชน** (ยกมาจาก `SurveyZoneCard` · แผน §10.5 S5)
 *
 * 🐞 ที่มา (บทเรียนของการ์ดเดิม): หน้านี้โหลดซ้ำเองทุกครั้งที่กลับมาที่แท็บ และนัดหนึ่งใบมีช่างได้หลายคน
 *   ⇒ แถวที่อีกคนเพิ่งบันทึกไหลเข้ามาระหว่างที่ช่องยังโชว์เลขเก่า · ถ้าไม่รับ ช่องค้างเลขเก่าและขึ้น "ยังไม่บันทึก"
 *   ทั้งที่ไม่ได้แตะอะไร (แล้วกดบันทึกก็ทับงานของอีกคนเงียบ ๆ) · ถ้ารับทับทุกครั้ง ค่าที่ผู้ใช้พิมพ์ค้างหาย
 *   ⇒ แยกสองกรณี: **ไม่มีของค้าง = รับแถวใหม่** · **มีของค้างจริง = เก็บร่าง แล้วบอกว่าแถวถูกแก้จากที่อื่น**
 * ⭐ ย้ายมาเป็นตัวตัดสินล้วน เพราะหน้าพื้นที่ของแบบ A (S7) ต้องถามกติกาเดียวกันเป๊ะ — เขียนซ้ำในจอ = สองกติกา
 *
 * ลายเซ็นทุกตัวมาจาก `surveyZoneDraftSignature`
 * @param prevSavedSig แถวที่ร่างนี้ตั้งต้นจาก (รอบก่อน)
 * @param savedSig     แถวที่เพิ่งโหลดมา
 * @param draftSig     ร่างบนจอตอนนี้
 * @param sentSig      ของที่จอนี้ **บันทึกสำเร็จไปเอง** ล่าสุด (server ปรับรูปเลขก่อนส่งกลับ ⇒ เทียบกับแถวตรง ๆ ไม่ได้)
 * @returns `'same'` ไม่ต้องทำอะไร (แถวเดิม · หรือแถวใหม่คือผลการบันทึกของเราเองขณะที่ผู้ใช้พิมพ์ต่อ — ไม่ใช่การชน)
 *   · `'adopt'` รับแถวใหม่ลงช่อง · `'conflict'` เก็บร่างไว้ แล้วขึ้นป้าย "ถูกแก้จากที่อื่น" พร้อมทางเลือก
 */
export function surveyDraftSync({ prevSavedSig, savedSig, draftSig, sentSig = null } = {}) {
  if (savedSig === prevSavedSig) return 'same';
  /* ผู้ใช้ไม่มีของค้าง: ร่างตรงกับแถวเดิม · ตรงกับแถวใหม่ · หรือตรงกับที่เราเพิ่งบันทึกไป */
  if (draftSig === prevSavedSig || draftSig === savedSig || (sentSig !== null && draftSig === sentSig)) {
    return 'adopt';
  }
  /* มีของค้างจริง — แถวใหม่คือผลการบันทึกของเราเอง (พิมพ์ต่อระหว่างรอคำตอบ) = ไม่ชน · นอกนั้นมีคนอื่นแก้ */
  return sentSig !== null && savedSig === sentSig ? 'same' : 'conflict';
}

/* ── ขั้นของใบ — ชุด 6 ขั้นเดียวกับหน้าคำร้อง ────────────────────────────────
   ⭐ **ห้ามเขียนชื่อขั้นชุดที่สอง** — ฝ่ายขายอ่านรางบนหน้าคำร้อง TS อ่านการ์ดนี้
      สองชุดที่ชื่อไม่ตรงกันคือสองฝ่ายที่คุยกันคนละเรื่องทั้งที่ดูใบเดียวกัน
   ⚠️ ทับเฉพาะ **บรรทัดใต้ขั้นปัจจุบัน** ด้วยข้อเท็จจริงของใบประเมิน (วัดแล้วกี่พื้นที่ ·
      ดึงกลับเมื่อไร) ซึ่งรางกลางไม่รู้จัก — ชื่อขั้นไม่แตะ */
function stepOf(request, { cancelled, recallPending, recall, progress, visit }) {
  /* ⭐ ส่งนัดของการ์ดลงไปด้วย — รางหน้างานเดินตามนัด (`fieldRail`) · ไม่ส่ง = รางอ่าน `surveyVisit`
     บนแถวคำร้อง ซึ่ง GET ของใบประเมินไม่ได้ติดมา ⇒ ใบที่ช่างวัดอยู่จะชี้ขั้น "ลงคิว" */
  const { steps, index } = requestRailSteps(request || {}, { visit: visit || null });
  const current = steps[index] || steps[steps.length - 1] || null;
  let hint = current?.hint || null;
  if (cancelled) {
    hint = request?.cancelledAt ? `ยกเลิก ${fmtDateTime(request.cancelledAt)}` : 'ยกเลิกแล้ว';
  } else if (recallPending) {
    hint = `ดึงกลับ ${recall?.at ? fmtDateTime(recall.at) : SURVEY_UNKNOWN_TEXT} — รอส่งอีกครั้ง`;
  } else if (current?.id === 'acknowledged' && progress.total > 0) {
    hint = `วัดแล้ว ${progress.done}/${progress.total} พื้นที่`;
  }
  return {
    id: current?.id || null,
    label: current?.label || null,
    hint,
    index,
    total: steps.length,
    cancelled,
    steps,
  };
}

/** เลยกำหนดส่งมากี่วัน — `null` เมื่อยังไม่เลย หรือยังไม่รู้ว่าวันนี้วันอะไร
 *  ⚠️ "ไม่เลย" กับ "เลย 0 วัน" คนละความหมาย ⇒ คืน null ไม่ใช่ 0 (ท่าเดียวกับ `overdueDays`) */
function overdueBy(dueDate, today) {
  const due = String(dueDate || '').trim();
  const now = String(today || '').trim();
  if (!due || !now || due >= now) return null;
  const from = new Date(`${due}T00:00:00Z`);
  const to = new Date(`${now}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const days = Math.round((to - from) / 86400000);
  return days > 0 ? days : null;
}

/** ข้อที่หัวหน้าขอ — `sentBack.items` (S3) · ของที่ไม่มี items (ส่งจากตัวอ่านรุ่นเก่า) = note ทั้งก้อนเป็นหนึ่งข้อ
 *  ⚠️ ส่งออกให้การ์ดส่งกลับของช่าง (`surveyFieldView` · S5) นับข้อชุดเดียวกับการ์ดของหัวหน้า — เลขข้อที่ช่างติ๊ก
 *    (`doneItems`) อ้างลำดับของลิสต์นี้ ⇒ สองจอนับคนละแบบเมื่อไร ติ๊กข้อหนึ่งจะไปขึ้นเป็นอีกข้อ */
export const surveySendBackAsks = (sentBack) => (Array.isArray(sentBack?.items) && sentBack.items.length
  ? sentBack.items
  : (sentBack?.note ? [sentBack.note] : []));
const numberedAsks = (asks, indexes) => indexes.map((i) => `(${i + 1}) ${asks[i]}`).join(' ');

/**
 * ⭐ ข้อที่หัวหน้าส่งกลับเป็นบรรทัดเดียว (แผน §10.5 S3) — ข้อเดียว = ข้อความเดิมเป๊ะ · หลายข้อ = "2 ข้อ: (1) … (2) …"
 * ⚠️ กล่องแจ้ง/กล่องยืนยันไม่ตัดบรรทัดตาม `\n` ⇒ ใช้ `note` ตรง ๆ ไม่ได้อีกแล้ว (ข้อจะติดกันเป็นประโยคเดียว)
 *   และคั่นด้วย " · " ก็ไม่ได้ — ข้อความของหัวหน้าเองมีจุดคั่นอยู่ข้างในได้ (ม็อก A-5)
 * @returns ข้อความ หรือ `''` เมื่อไม่มีข้อ
 */
export function surveySendBackAskText(sentBack) {
  const asks = surveySendBackAsks(sentBack);
  if (asks.length <= 1) return asks[0] || '';
  return `${asks.length} ข้อ: ${numberedAsks(asks, asks.map((_, i) => i))}`;
}

/**
 * 🔑 **ทุกอย่างที่การ์ด "จัดการผลประเมิน" วาด — คำนวณที่เดียว**
 *
 * ⭐ **สถานะไม่ได้มาจาก `answeredAt` ตัวเดียว** (ข้อที่แบบเดิมพลาด) — มันมาจากสามอย่าง:
 *   `surveyEditLockError` (ยกเลิก/ปิดแล้ว/ส่งแล้ว) + `answeredAt` + **แถว recall**
 *   ⇒ ใบที่ถูกดึงกลับมี `answeredAt = null` และ `status = 'acknowledged'` เท่ากับใบที่
 *     ไม่เคยส่ง · ถ้าไม่อ่านแถว recall จอจะบอกว่า "กำลังวัด" เฉย ๆ ทั้งที่ฝ่ายขายถือ
 *     ตัวเลขชุดเก่าอยู่ในมือและกำลังรอของใหม่
 *
 * ⚠️ **ปุ่มถามด่านตัวเดียวกับ server เสมอ** — `surveySendError` / `surveyRecallError`
 *   ไม่ใช่เงื่อนไขที่การ์ดคิดเอง (ปุ่มที่รู้มากกว่า server = ปุ่มที่จางเงียบโดยไม่บอกเหตุ)
 *
 * @param request        แถว `dept_requests`
 * @param zones          แถวผลวัดทุกแถวของใบ (รวมที่ถูกตัดออก)
 * @param filesByZone    `{ [zoneRowId]: ไฟล์ของแถวนั้น }`
 * @param visit          นัดของใบ (ใช้บอกว่าแจ้งช่างได้ไหม)
 * @param recall         ผลของ `surveyRecallRecord` — `null` = ไม่เคยดึงกลับ
 * @param sendBack       ผลของ `surveySendBackState` — `null` = อ่านไม่สำเร็จ/ไม่ส่งมา (ไม่ใช่ "ไม่เคยส่งกลับ")
 * @param unknown        `{ site?, zoneCodes?, customer?, recall?, visit? }` ชิ้นที่อ่านไม่สำเร็จ
 * @param viewer         `{ canWrite, canDecide, canOpenRequest, writeBlockedReason, onVisit }` — มาจาก server ทุกตัว
 *                       (`onVisit` = คนดูเป็นคนไป/คนช่วยบนนัด — Senior ที่ออกหน้างานเองอ่านถ้อยคำของช่าง)
 *                       (`canOpenRequest` = เปิดหน้าคำร้องได้ไหม · `writeBlockedReason` = เหตุที่เขียนไม่ได้)
 * @param dirtyZoneIds   พื้นที่ที่มีค่าพิมพ์ค้างยังไม่บันทึก (จอส่งมา · PR4)
 * @param pendingDecisionZoneIds พื้นที่ที่เคาะแล้วยังไม่กดบันทึก (จอส่งมา · PR5)
 * @param tab            แท็บที่เปิดอยู่ (`field` | `result`) — ใช้เลือกปุ่มพาไป
 * @param today          วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก) — ไม่ส่ง = ไม่คำนวณวันเลยกำหนด
 */
export function surveyControlView({
  request = null,
  zones = [],
  filesByZone = {},
  visit = null,
  recall = null,
  sendBack = null,
  unknown = {},
  viewer = {},
  dirtyZoneIds = [],
  pendingDecisionZoneIds = [],
  tab = 'field',
  today = null,
} = {}) {
  const rows = Array.isArray(zones) ? zones : [];
  const files = filesByZone && typeof filesByZone === 'object' ? filesByZone : {};
  const active = activeZones(rows);
  const canWriteRaw = viewer?.canWrite === true;
  const canDecide = viewer?.canDecide === true;
  /* ⚠️ **fail-closed** — ไม่ส่งมา = ไม่โชว์ลิงก์ · ลิงก์ที่หายไปคนเดาออกว่าไม่มีสิทธิ์
     ส่วนลิงก์ที่กดแล้วเจอ 403 อ่านเหมือนระบบพัง (กติกา ui-visibility) */
  const canOpenRequest = viewer?.canOpenRequest === true;

  const cancelled = !!request?.cancelledAt;
  const sent = !!request?.answeredAt;
  /* 🔴 **"ปิดแล้ว" มีสองความหมาย และคนละสถานะกันคนละทาง** —
     `settled` = ส่งผลแล้ว *และ* ฝ่ายขายปิดเรื่องแล้ว = ทางจบปกติของทุกใบ
       (`closureStatus()` เขียน `status='closed'` ให้เองเมื่อ `answeredAt && closedAt`
        ⇒ ใบที่จบครบทุกใบมาอยู่ตรงนี้ ไม่ใช่เคสขอบ)
     `closedWithoutAnswer` = ปิดโดยไม่เคยส่งผลเลย (§5E ③) = ทางตันที่ไม่มีทางกลับ
     ⚠️ ธงเดิมชื่อ `closed` เฉย ๆ ซึ่งอ่านเหมือนอย่างแรกแต่หมายถึงอย่างหลัง ⇒ เปลี่ยนชื่อ
        ก่อนที่จอจะไปอ่านผิดความหมาย (ยังไม่มีใครเรียก) */
  const settled = sent && !cancelled && (!!request?.closedAt || request?.status === 'closed');
  const closedWithoutAnswer = !cancelled && !sent
    && (!!request?.closedAt || request?.status === 'closed');
  const lockReason = surveyEditLockError(request);
  const locked = !!lockReason;
  /* 🐞 **`canWrite` ของ server ไม่รู้จักการล็อก** — `visitWriteAccess` ตอบแค่ "เป็นช่างของนัดใบนี้ไหม" ไม่เคยดู
     `answeredAt`/`cancelledAt`/`closedAt` ⇒ หักล็อกที่นี่ที่เดียว แล้วจอถาม `flags.canWrite` (พื้นที่ตั้งต้นของบานขวา ·
     แถบ · ช่องกรอก) · 🔄 เดิมบทเรียนนี้อยู่กับค่าพับตั้งต้น (`surveyFoldDefaults`) ซึ่งถอดไปพร้อมการพับใน §10.5 S10 */
  const canWrite = canWriteRaw && !locked;
  const readOnly = !canWriteRaw && !canDecide;
  /* ใบที่ถูกดึงกลับ **และยังไม่ได้ส่งซ้ำ** — แถว recall ค้างอยู่ตลอดไป ⇒ ต้องคู่กับ
     "ยังไม่มี answeredAt" เสมอ ไม่งั้นใบที่ส่งรอบสองไปแล้วจะอ่านว่ายังถูกดึงกลับอยู่ */
  const recallPending = !!recall && !sent && !cancelled;
  /* ⭐ **นัดยังเปิดอยู่ = ช่างยังไม่กด "ส่งงาน"** (มติผู้ใช้ 2026-09-21) — วัดครบแล้วยังไม่ใช่
     "ส่วนของช่างจบ" จนกว่าจะส่งงาน (ปิดนัด + กระดิ่งถึงหัวหน้า) · 🐞 ก่อนแก้ รางขวาบอกช่างว่า
     "รอหัวหน้าเคาะ" ข้างแถบที่ยังขอให้กดส่งงาน = สองข้อความเถียงกันบนจอเดียว
     ⚠️ ไม่มีนัด (`visit` = null) = ใช้ถ้อยคำเดิม — ใบเก่า/เทสต์ที่ไม่ส่งนัดมาไม่ควรเปลี่ยนความหมาย */
  const visitNotStarted = visit?.status === 'scheduled';
  const crewNotSubmitted = visitNotStarted || visit?.status === 'in_progress';
  /* ใครกำลังอ่าน — ถ้อยคำ "กด ส่งงาน" ต้องขึ้นเฉพาะคนที่มีแถบส่งงานบนจอจริง
     (กติกาเดียวกับ `showFieldBar` ของหน้า: เขียนได้ และไม่ใช่หัวหน้า หรือเป็นหัวหน้าที่อยู่บนนัดเอง)
     🐞 ไม่แยก = คนอ่านอย่างเดียวถูกสั่งให้กดปุ่มที่ไม่มี · Senior ที่ออกหน้างานเองถูกเรียกว่า "ช่าง" */
  const onVisit = viewer?.onVisit === true;
  const actsAsCrew = canWrite && (!canDecide || onVisit);

  const progress = surveyFieldProgress(rows, files);
  const leftZones = active.filter((r) => surveyFieldMissing(r, files[r.id] || []).length > 0);
  const totals = surveyTotals(rows);
  const allGates = surveyGateChecklist(rows, files);
  /* ช่างเห็นเฉพาะสามข้อของตัวเอง — ข้อของหัวหน้าเขาแก้ไม่ได้ (แบบที่อนุมัติ: หัวข้อ
     "ของที่ช่างต้องเก็บ") ⇒ เอามาโชว์ = กำแพงที่บอกว่าเขาทำงานไม่เสร็จทั้งที่เสร็จแล้ว */
  const gates = canDecide ? allGates : allGates.filter((g) => g.owner === 'crew');
  const gatesFailed = gates.filter((g) => !g.ok);

  /* ── ค่าที่ยังอยู่บนจอ ยังไม่ลงฐาน (จอส่ง id มา) ─────────────────────────
     🔴 **ตัดสินจากลิสต์ที่รับมา ไม่ใช่จากผลกรองแถว** — ของเดิมกรอง id ผ่าน `rows` ก่อน
        ⇒ id ที่แมตช์ไม่เจอสักแถว (แถวเพิ่งถูกลบ · จอส่ง key คนละชุด · พิมพ์ผิด) หายเงียบ
        แล้ว **ปุ่มส่งกลับกดได้** ทั้งที่ยังมีค่าค้าง — fail-open บนด่านที่มีไว้กันข้อมูล
        ที่ยังไม่ถูกบันทึกโดยเฉพาะ · หาชื่อพื้นที่ไม่เจอก็เขียนกลาง ๆ ไป แต่ต้องบล็อก
     ⚠️ ยกเว้นแถวที่ **ถูกตัดออก** — แก้อะไรไม่ได้อยู่แล้ว ค่าค้างบนนั้นไม่ควรขวางการส่ง */
  const cutIds = new Set(rows.filter(isCut).map((r) => String(r.id)));
  const listed = (ids) => [...new Set((ids || []).filter(Boolean).map(String))]
    .filter((id) => !cutIds.has(id));
  const dirtyIds = listed(dirtyZoneIds);
  const pendingIds = listed(pendingDecisionZoneIds);
  const dirtyRows = active.filter((r) => dirtyIds.includes(String(r.id)));

  // ── สถานะ + โทน ────────────────────────────────────────────────────────
  const leftText = surveyNameList(leftZones.map(surveyZoneName));
  const measuredSub = `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`
    + (leftText ? ` · เหลือ ${leftText}` : '');
  let status;
  if (cancelled) {
    /* ⚠️ **ไม่มีคอลัมน์ "ยกเลิกโดยใคร" บน `dept_requests`** — มีแต่ `cancelledAt` กับ
       `cancelReason` · ใบเก่าบางใบไม่มีชื่อผู้กดให้อ่านเลย ⇒ ไม่มีชื่อก็ **ไม่เขียนชื่อ**
       ห้ามเดาเป็นผู้เปิดเรื่อง (คนละคนกันได้ และการเดาผิดคือหลักฐานปลอม) */
    const who = request?.cancelledByName || null;
    const when = request?.cancelledAt ? fmtDateTime(request.cancelledAt) : null;
    const stamp = [
      who && `ยกเลิกโดย ${who}`,
      when && (who ? when : `ยกเลิกเมื่อ ${when}`),
    ].filter(Boolean).join(' · ');
    status = {
      key: 'cancelled', tone: 'neutral', headline: 'คำร้องถูกยกเลิก',
      sub: stamp ? `${stamp} — แก้ผลและส่งไม่ได้` : 'แก้ผลและส่งไม่ได้',
    };
  } else if (closedWithoutAnswer && request?.status !== 'closed') {
    /* 🐞 **ฝ่ายขายปิดฝั่งตัวเองไปก่อนได้ผล** (ใบก่อนมติ 24/09 ข้อ 3) — `closedAt` มีแต่ใบยังไม่ `closed`
       ⇒ **เปิดกลับได้** ด้วย "ยังไม่จบ" · ห้ามบอก "เปิดใบใหม่" (ผลวัดบนใบนี้ยังอยู่ครบ) */
    status = {
      key: 'closed', tone: 'neutral', headline: 'ฝ่ายขายปิดเรื่องไปก่อนได้ผล',
      sub: 'แก้ผลและส่งไม่ได้ · กด “ยังไม่จบ” ที่ใบคำร้องเพื่อเปิดใบกลับ แล้วค่อยแก้/ส่งผล',
    };
  } else if (closedWithoutAnswer) {
    /* 🔴 ใบที่ **ปิดโดยไม่ได้ส่งผล** (§5E ③) — สภาพที่ไม่มีทางกลับ (`reopenRequestError`
       ตัด `closed` ไว้) ⇒ ข้อความต้องชี้ทางที่เหลือจริง คือเปิดใบใหม่ */
    status = {
      key: 'closed', tone: 'neutral', headline: 'ใบนี้ถูกปิดไปแล้ว',
      sub: 'ปิดโดยไม่ได้ส่งผลประเมิน — แก้ผลและส่งไม่ได้ · ถ้าต้องประเมินใหม่ ให้เปิดใบใหม่',
    };
  } else if (sent) {
    const who = request?.answeredByName || SURVEY_UNKNOWN_TEXT;
    const when = request?.answeredAt ? fmtDateTime(request.answeredAt) : SURVEY_UNKNOWN_TEXT;
    /* 🐞 บรรทัดนี้เคยเขียน "รอฝ่ายขายปิดเรื่อง" ตายตัว ⇒ ใบที่ฝ่ายขายปิดไปแล้วยังบอกว่ารอ
       ทั้งที่บรรทัดขั้นตอนในคำตอบก้อนเดียวกันขึ้น "ปิดเรื่อง · ปิดโดย …" อยู่ข้าง ๆ
       ⇒ การ์ดกับรางเถียงกันเองบนจอเดียว · ค่าอยู่ในมือแล้ว (`closedAt`) แค่ไม่ได้ดู */
    const closedWhen = request?.closedAt ? fmtDateTime(request.closedAt) : null;
    const tail = settled
      ? `ฝ่ายขายปิดเรื่องแล้ว${closedWhen ? ` ${closedWhen}` : ''}`
      : 'รอฝ่ายขายปิดเรื่อง';
    status = {
      key: 'sent', tone: 'success',
      headline: settled ? 'ส่งผลแล้ว · ฝ่ายขายปิดเรื่องแล้ว' : 'ส่งผลให้ฝ่ายขายแล้ว',
      sub: `ส่งโดย ${who} · ${when} · ${tail}`,
    };
  } else if (!active.length) {
    /* ใบที่ไม่เหลือพื้นที่ให้ประเมิน — ฝ่ายขายยังไม่ได้ระบุ หรือถูกตัดออกหมด
       ⚠️ ต้องเป็นสถานะของตัวเอง ไม่ใช่ "กำลังวัด 0/0" ซึ่งอ่านเหมือนงานกำลังเดิน */
    status = {
      key: 'no-zones', tone: 'neutral', headline: 'ยังไม่มีพื้นที่ที่ต้องประเมิน',
      sub: totals.cutZones
        ? `ถูกตัดออกหมดทั้ง ${totals.cutZones} พื้นที่ — ส่งผลไม่ได้`
        : 'ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ',
    };
  } else if (recallPending) {
    status = {
      key: 'recalled', tone: 'warning', headline: 'ดึงผลกลับมาแก้',
      sub: progress.complete ? 'วัดครบแล้ว · รอหัวหน้าส่งผลอีกครั้ง' : measuredSub,
    };
  } else if (visitNotStarted && allGates.some((g) => !g.ok)) {
    /* ยังไม่กดเริ่มงาน = ยังไม่มีใครไปหน้างาน **ไม่ว่าจะกรอกล่วงหน้าไปแล้วเท่าไร** · 🐞 เดิมขึ้น
       "กำลังวัดหน้างาน"/"กด ส่งงาน" ข้างแถบที่มีแค่ปุ่ม "เริ่มงาน" บนจอเดียวกัน
       ⚠️ ใบที่ผ่านครบหกข้อแล้ว (หัวหน้าเคาะแล้ว) ยังขึ้น "พร้อมส่งผล" — การส่งผลไม่รอนัด และส่งแล้ว
          **ปิดนัดที่ยังเปิดให้ด้วย** (มติเจ้าของ 24/09 ข้อ 2 · แทนมติ 16/09 · ดู `send.closesVisit`) */
    /* ⚠️ บรรทัดรองใช้คำ "วัดแล้ว" ชุดเดียวกับหัวลิสต์ · ป้ายการ์ด · รางขั้นตอน — เคยเขียน
       "กรอกล่วงหน้าแล้ว" แล้วรางเถียงกับตัวเองบนจอเดียว */
    status = { key: 'not-started', tone: 'neutral', headline: 'ยังไม่เริ่มงานหน้างาน', sub: measuredSub };
  } else if (!progress.complete) {
    status = { key: 'measuring', tone: 'warning', headline: 'กำลังวัดหน้างาน', sub: measuredSub };
  } else if (allGates.some((g) => !g.ok)) {
    const measured = `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`;
    status = !crewNotSubmitted
      ? {
        key: 'awaiting-decision', tone: 'info', headline: 'วัดครบแล้ว — รอหัวหน้าเคาะ',
        sub: `${measured} · เหลือเคาะจุดและแพ็คเกจ`,
      }
      : actsAsCrew
        ? {
          key: 'awaiting-submit', tone: 'info',
          /* Senior ที่ออกหน้างานเองคือคนเคาะเองต่อ — "เพื่อแจ้งหัวหน้า" คือการแจ้งตัวเอง */
          headline: canDecide ? 'วัดครบแล้ว — กด “ส่งงาน” เพื่อปิดงานหน้างาน' : 'วัดครบแล้ว — กด “ส่งงาน” เพื่อแจ้งหัวหน้า',
          /* บรรทัดรองบอก **ก้าวถัดไปของใคร** ไม่ใช่ท่องพาดหัวซ้ำ */
          sub: canDecide
            ? `${measured} · ส่งงานแล้วเคาะจุดและแพ็คเกจต่อได้เลย`
            : `${measured} · ส่งแล้วหัวหน้าเคาะจุดและแพ็คเกจต่อ`,
        }
        : {
          key: 'awaiting-submit', tone: 'info', headline: 'วัดครบแล้ว — ช่างยังไม่กดส่งงาน',
          sub: canDecide ? `${measured} · เคาะจุดและแพ็คเกจได้เลย ไม่ต้องรอ` : measured,
        };
  } else {
    status = {
      key: 'ready', tone: 'info', headline: 'พร้อมส่งผลให้ฝ่ายขาย',
      sub: `${fmtNumber(totals.zones)} พื้นที่ · ${fmtNumber(totals.areaSqm)} ตร.ม. · ${fmtNumber(totals.packageQty)} แพ็คเกจ`,
    };
  }

  // ── ด่านที่ติด รวมเป็นกลุ่มต่อพื้นที่ ────────────────────────────────────
  /* ⭐ **กลุ่มต่อพื้นที่ ไม่ใช่กำแพงหกแถว** — หัวหน้าที่กดส่งไม่ได้มีคำถามเดียว:
     "ต้องไปทำอะไรที่ไหน" · เรียงตามข้อ = เขาต้องประกอบเองว่าพื้นที่ไหนติดอะไรบ้าง
     🔑 **คำนวณก่อนบรรทัดเหตุผลใต้ปุ่มส่ง เพราะบรรทัดนั้นหยิบปุ่มพาไปจากที่นี่** —
        "ไปไหนถึงจะแก้ข้อนี้ได้" ต้องมีคำตอบชุดเดียวทั้งจอ (ดูกฎในลูป) */
  const gateKeys = new Set(gates.map((g) => g.key));
  const gapRows = [];
  for (const row of active) {
    const facts = surveyZoneFacts(row, files[row.id] || []);
    const crew = facts.missingCrew.filter((g) => gateKeys.has(g.key));
    const head = facts.missingHead.filter((g) => gateKeys.has(g.key));
    if (!crew.length && !head.length) continue;
    const targets = [];
    /* 🔑 **กฎ "ไปไหนถึงจะแก้ข้อนี้ได้" มีชุดเดียว และอยู่ตรงนี้ที่เดียว** —
       ขนาด/ภาพกว้าง/จุดหน้างาน (ของช่าง) แก้ในพื้นที่ · **ภาพผัง** เลือกจุด แพ็คเกจ (ของหัวหน้า)
       ทำที่แท็บสรุปส่งผล · อยู่แท็บนั้นแล้ว = ไม่มีปุ่มพาไป (ของที่ต้องทำอยู่ในตารางตรงหน้า)
       🔄 **ผังย้ายจากการ์ดพื้นที่ไปคอลัมน์ของตารางสรุป** (มติเจ้าของ 25/09 · แผน §10.5 S2) —
          เดิมช่องอัปผังอยู่ในการ์ดพื้นที่ของแท็บหน้างาน ⇒ แถวที่ขาดผังได้ปุ่ม "เปิด <พื้นที่>"
          · ตอนนี้ปุ่มนั้นพาไปหน้าที่ไม่มีช่องผังแล้ว = ทางตัน ⇒ ของหัวหน้าทั้งสามข้อไปทางเดียวกัน
       🐞 บรรทัดเหตุผลใต้ปุ่มส่งเคยมีกฎของตัวเองที่ลืมข้อ "ภาพผัง" ⇒ ปุ่มพาไปทางตัน
          ⇒ บรรทัดนั้นหยิบ `targets` ของแถวนี้ไปใช้ ไม่คิดเอง (ยามคือเทสต์ "กฎไปไหนต้องมีชุดเดียว") */
    if (crew.length) {
      targets.push({ kind: 'zone', zoneId: row.id, label: `เปิด ${surveyZoneName(row)}` });
    }
    if (canDecide && !crew.length && head.length && tab !== 'result') {
      targets.push({ kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' });
    }
    gapRows.push({
      zoneId: row.id,
      zoneName: surveyZoneName(row),
      zoneCode: row.zoneCode ?? null,
      zoneCodeUnknown: row.zoneCodeUnknown === true,
      crew: crew.map((g) => g.short),
      head: head.map((g) => g.short),
      crewText: crew.length ? `ช่างต้องเก็บ: ${crew.map((g) => g.short).join(' · ')}` : null,
      headText: head.length ? `หัวหน้าต้องทำ: ${head.map((g) => g.short).join(' · ')}` : null,
      targets,
    });
  }
  const SHOWN = 3;
  const crewIds = [visit?.assigneeId, ...(visit?.assistantIds || [])].filter(Boolean).map(String);
  const zoneGaps = {
    rows: gapRows,
    shown: gapRows.slice(0, SHOWN),
    hidden: Math.max(0, gapRows.length - SHOWN),
    /* ปุ่ม "แจ้งช่างให้กลับไป" มีครั้งเดียวต่อใบ และโชว์เฉพาะตอนที่ยังมีของฝั่งช่างค้าง
       ⚠️ แจ้งไม่ถึงใครถ้านัดไม่มีช่าง — ด่านจริงอยู่ที่ `surveySendBackError` ที่ปุ่มถามต่อ */
    crewPending: canDecide && !locked && gapRows.some((r) => r.crew.length > 0),
    crewIds,
  };
  /* 🔄 **ปุ่ม "ส่งกลับให้ช่างแก้" ไม่ผูกกับของขาดแล้ว** (มติเจ้าของ 25/09 · แผน §10.5 S4 · ม็อก A-5/AW-2)
     — ด่านสามข้อของช่างบอกได้แค่ "มีรูปไหม" ไม่ได้บอกว่า "รูปใช้ได้ไหม" · เดิมปุ่มขึ้นตาม `crewPending`
     ⇒ ฝั่งช่างเขียวครบแล้วหัวหน้าเห็นว่าภาพกว้างถ่ายไม่ถึงส่วน B ก็ขอเพิ่มในระบบไม่ได้
     ⚠️ `crewPending` ยังอยู่และยังหมายถึง "มีของช่างค้าง" — ไม่ยืดความหมาย
     ⚠️ นัดไม่มีช่าง = ยังไม่มีใครไปทำอะไรมาให้ส่งกลับ (ไม่ใช่ด่านที่รอผ่าน) ⇒ ไม่มีปุ่ม
        · ด่านจริงยังอยู่ที่ `surveySendBackError` (route ตีกลับด้วยเหตุเดียวกัน)
     `message` = บรรทัดหลักของกล่องยืนยัน — ฝั่งช่างครบแล้วต้องไม่ขึ้น "ข้อที่ติด: " ว่าง ๆ */
  const crewGapRows = gapRows.filter((r) => r.crew.length > 0);
  const sendBackAction = {
    show: canDecide && !locked && crewIds.length > 0,
    label: 'ส่งกลับให้ช่างแก้',
    message: crewGapRows.length
      ? `ข้อที่ติด: ${crewGapRows.map((r) => `${r.zoneName} (${r.crew.join(' · ')})`).join(' · ')}`
      : 'ฝั่งช่างครบทุกพื้นที่แล้ว — ช่างจะได้เฉพาะข้อที่พิมพ์ด้านล่าง',
  };

  // ── เหตุผลที่ยังกดส่งไม่ได้ + จุดที่พาไปแก้ ───────────────────────────────
  /* 🔑 ด่านตัวเดียวกับ server เป็นตัวตัดสิน `allowed` เสมอ · สองข้อแรกเป็นของที่ server
     มองไม่เห็น (ค่าที่ยังอยู่บนจอ) ⇒ มันเพิ่มด่านได้ แต่ **ลดไม่ได้** */
  const serverSendReason = surveySendError(rows, files, { canSend: canDecide });
  /* ⭐ **ส่งผลแล้วนัดจะเป็นยังไง** — ตัวตัดสินตัวเดียวกับที่ route ส่งผลใช้ปิดนัดจริง (มติ 24/09 ข้อ 2)
     ⚠️ `visit` ต้องเป็นนัดที่ยังค้างถ้ามี (GET ใช้ `preferOpen`) — ไม่งั้นโมดัลบอกคนละนัดกับที่ปิดจริง */
  const visitStep = surveySendVisitStep(visit, { today });
  let sendReason = null;
  if (!locked) {
    /* 🐞 **ไม่มีสิทธิ์ส่ง = เหตุผลเดียว ห้ามประกอบบรรทัดด่านหกข้อทับ** — ของเดิมเขียน
       `text` เป็น "ยังส่งไม่ได้ — ติด 6 ข้อ … รอช่างเก็บงาน" พร้อมปุ่มพาไป ขณะที่
       `detail` (ด่านจริงของ server) บอกว่า "ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ"
       ⇒ สองบรรทัดในออบเจ็กต์เดียวกันบอกคนละเรื่อง และชวนช่างไปเก็บงานเพื่อกดปุ่มที่
       เขาไม่มีวันกดได้ · ด่านที่แข็งกว่าต้องพูดคนเดียว */
    if (!canDecide) {
      sendReason = { key: 'no-permission', text: serverSendReason, detail: serverSendReason, target: null };
    } else if (pendingIds.length) {
      sendReason = {
        key: 'result-dirty',
        text: `มีการเคาะที่ยังไม่บันทึก ${pendingIds.length} พื้นที่ — บันทึกก่อนส่ง`,
        target: tab === 'result' ? null : { kind: 'tab', tab: 'result', label: 'ไปบันทึกการเคาะ' },
      };
    } else if (dirtyIds.length) {
      const names = surveyNameList(dirtyRows.map(surveyZoneName));
      sendReason = {
        key: 'field-dirty',
        text: names ? `${names} มีค่าที่พิมพ์ค้าง ยังไม่บันทึก` : 'มีค่าที่พิมพ์ค้าง ยังไม่บันทึก — บันทึกก่อนส่ง',
        target: dirtyRows[0]
          ? { kind: 'zone', zoneId: dirtyRows[0].id, label: `ไปที่ ${surveyZoneName(dirtyRows[0])}` }
          : null,
      };
    } else if (serverSendReason) {
      const failed = allGates.filter((g) => !g.ok);
      const stuckNames = [...new Set(failed.flatMap((g) => g.zones))];
      const crewStuck = failed.some((g) => g.owner === 'crew');
      /* พาไปที่พื้นที่ที่ **ช่างยังค้าง** ก่อน ถ้าไม่มีก็พื้นที่แรกที่ติดอะไรก็ได้
         🔑 **ถาม `targets` ของแถวนั้นว่า "ไปไหน" — ไม่คิดเอง** (นั่นคือกฎชุดที่สองที่
            เคยลืมข้อ "ภาพผัง" ไป) · ที่ต่างกันมีแค่ **คำบนปุ่ม** ซึ่งแบบที่อนุมัติเขียน
            ไว้คนละที่จริง ๆ: บรรทัดใต้ปุ่มส่งใช้ "ไปเคาะที่แท็บสรุปส่งผล" ส่วนปุ่มใน
            กลุ่มด่านต่อพื้นที่ใช้ "เคาะที่สรุปส่งผล" (§4 vs §5) */
      const firstStuck = gapRows.find((r) => r.crew.length > 0) || gapRows[0] || null;
      const stuckTarget = firstStuck?.targets?.[0] || null;
      sendReason = {
        key: crewStuck ? 'crew-gaps' : 'head-gaps',
        text: failed.length
          ? `ยังส่งไม่ได้ — ติด ${failed.length} ข้อ ที่ ${surveyNameList(stuckNames)}${crewStuck ? ' · รอช่างเก็บงาน' : ''}`
          : serverSendReason,
        /* 🔑 ข้อความเต็มของด่าน server — โมดัลยืนยันใช้ตัวนี้ ไม่ใช่บรรทัดย่อของราง
           (บรรทัดย่อมีไว้ให้รางกว้าง 330px อ่านได้ ไม่ได้มีไว้แทนเหตุผล) */
        detail: serverSendReason,
        target: stuckTarget && (stuckTarget.kind === 'tab'
          ? { ...stuckTarget, label: 'ไปเคาะที่แท็บสรุปส่งผล' }
          : stuckTarget),
      };
    } else if (visitStep.action === 'block') {
      /* นัดยังเป็นร่าง — route ตีกลับด้วยประโยคเดียวกัน · ทางออกอยู่ที่หน้าจัดคิว ไม่ใช่บนจอนี้ */
      sendReason = { key: 'visit-draft', text: visitStep.error, detail: visitStep.error, target: null };
    }
  }
  /* ⭐ **นัดที่ส่งผลจะปิดให้** — โมดัลยืนยันต้องบอกผลนี้ก่อนกด (กติกาโมดัลบอกผลลัพธ์) และจอต้องส่ง `id`
     กลับไปกับคำขอ (`closeVisitId`) ให้ route ยืนยันว่าเป็นนัดตัวเดียวกับที่ผู้ใช้เห็น
     ⚠️ ไม่มีเวลาจบเสมอ — ส่งผลไม่ประทับเวลาจบให้ (วันส่งผล ≠ วันเข้าพื้นที่) */
  const closesVisit = visitStep.action === 'close'
    ? {
      id: visitStep.visit.id,
      code: visitStep.visit.code || visitStep.visit.id,
      status: visitStep.visit.status,
      statusLabel: VISIT_STATUS_LABELS[visitStep.visit.status] || visitStep.visit.status,
      actualDate: visitStep.patch.actualDate,
      startTime: visitStep.visit.actualStartTime ? String(visitStep.visit.actualStartTime).slice(0, 5) : null,
    }
    : null;
  const send = {
    // ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · ติดด่าน = โชว์แล้วบอกเหตุ (กติกา ui-visibility)
    show: canDecide && !locked,
    label: recallPending ? 'ส่งผลให้ฝ่ายขายอีกครั้ง' : 'ส่งผลให้ฝ่ายขาย',
    allowed: canDecide && !locked && !serverSendReason && !sendReason && visitStep.action !== 'block',
    reason: sendReason,
    closesVisit,
    /* 🐞 review 26/09 — **ส่งกลับให้ช่างแก้ค้างอยู่** (ช่างยังไม่แจ้งว่าแก้แล้ว) — ตั้งแต่ S4 ค้างได้ทั้งที่ด่านเขียวหมด
       ⇒ โมดัลต้องบอกก่อนกดว่าส่งผลจะปิดเรื่องนั้นและช่างแก้ต่อไม่ได้ (ใบล็อกแล้ว GET ซ่อนเรื่องค้างเอง — `surveySendBackOnSheet` · ไม่เขียนแถวปิดลงเธรด) · **เตือน ไม่บล็อก**
       (ไม่เข้า `allowed`/`reason`) — หัวหน้าเห็นของครบแล้วตัดสินใจส่งได้ · `null` = ไม่มีเรื่องค้าง/อ่านเธรดไม่ได้ */
    sendBackPending: canDecide && !locked && sendBack?.pending
      ? { itemCount: Array.isArray(sendBack.sentBack?.items) ? sendBack.sentBack.items.length : 0 }
      : null,
  };

  /* ⚠️ เหตุผลของการดึงกลับยังไม่ถูกพิมพ์ตอนนี้ (อยู่ในโมดัล) ⇒ ยิงค่ายาวพอผ่านด่าน
     ความยาว เพื่อถาม **เฉพาะเงื่อนไขอื่น** ของด่านตัวเดียวกับ server */
  const recallGate = surveyRecallError(request, { reason: 'x'.repeat(10), canRecall: canDecide });
  const recallAllowed = !recallGate;

  // ── กล่องแจ้ง ───────────────────────────────────────────────────────────
  const notices = [];
  /* ⚠️ ไม่มีเหตุผลบันทึกไว้ (ใบเก่าก่อนที่ด่านจะบังคับ) = **ไม่ขึ้นกล่องเปล่า** — กล่องที่
     เขียนว่า "ไม่ทราบ" ตรงนี้จะอ่านเหมือนอ่านข้อมูลไม่สำเร็จ ทั้งที่ของมันไม่เคยมี */
  const cancelReason = String(request?.cancelReason ?? '').trim();
  if (cancelled && cancelReason) {
    notices.push({ key: 'cancelled', tone: 'neutral', title: 'เหตุผล', text: cancelReason });
  }
  if (recallPending) {
    notices.push({
      key: 'recall', tone: 'warning', title: 'ดึงกลับเพราะ',
      text: recall.reason || SURVEY_UNKNOWN_TEXT,
      meta: `${recall.byName || SURVEY_UNKNOWN_TEXT} · ${recall.at ? fmtDateTime(recall.at) : SURVEY_UNKNOWN_TEXT}`
        + ` · ผลเดิม ${surveyTotalsText(recall.totals)}`,
    });
  }
  if (readOnly && !cancelled) {
    /* ⭐ **เหตุผลของ server มาก่อนประโยคกลาง ๆ** — `visitWriteAccess` รู้เหตุรายคน
       ("นัดนี้ไม่ใช่งานของคุณ — แก้ได้เฉพาะงานที่ถูกมอบหมายให้คุณ") ส่วนประโยคสำรอง
       บอกได้แค่ว่าใครแก้ได้บ้าง · ของที่ server พิมพ์ไว้แล้วต้องไม่ถูกทิ้ง
       ⚠️ ใบที่ถูกล็อก (ส่งแล้ว/ปิดแล้ว) เหตุอยู่ที่ `lockReason` ไม่ใช่ที่นี่ */
    const serverReason = String(viewer?.writeBlockedReason ?? '').trim();
    notices.push({
      key: 'read-only', tone: 'neutral',
      text: serverReason && !locked
        ? serverReason
        : 'ดูได้อย่างเดียว — บันทึกผลได้เฉพาะช่างในนัดและหัวหน้าบริการ',
    });
  } else if (!canDecide && canWriteRaw && sent) {
    /* 🐞 คำแนะนำเดิมบอกช่างให้ไปกด "ยังไม่จบ" ที่ใบคำร้อง — ซึ่ง role `ts` เปิดไม่ได้ (403)
       ⇒ ทางออกต้องเป็นทางที่คนอ่านคนนั้นเดินได้จริง คือบอกหัวหน้าให้กดดึงกลับ */
    notices.push({
      key: 'crew-sent', tone: 'neutral',
      text: 'ส่งผลแล้ว แก้ไม่ได้ — ถ้าตัวเลขต้องเปลี่ยน แจ้งหัวหน้าบริการให้กด "ดึงผลกลับมาแก้"',
    });
  } else if (!canDecide && canWrite && progress.complete && active.length > 0 && !visit) {
    /* ⚠️ **เฉพาะใบที่ไม่มีนัด** — มีนัดเมื่อไร แถบงานของช่าง (ส่งงานแล้ว · รอหัวหน้าเคาะ) กับพาดหัว
       สถานะพูดเรื่องนี้ครบแล้ว · 🐞 เคยขึ้นกล่องแจ้งซ้ำพาดหัว (ก่อนส่ง: "กด ส่งงาน ที่แถบล่าง" ซึ่ง
       ชี้ผิดทิศบนจอแคบ · หลังส่ง: ข้อเท็จจริงเดียวสามกล่องซ้อนกัน) */
    notices.push({
      key: 'crew-done', tone: 'success',
      text: 'ส่วนของช่างครบแล้ว — หัวหน้าบริการเป็นคนเคาะแพ็คเกจและส่งผล',
    });
  }
  /* ⭐ **วงส่งกลับให้ช่างแก้** (มติผู้ใช้ 2026-09-22) — หัวหน้าต้องเห็นว่ากำลังรอช่างอยู่ หรือช่าง
     แจ้งแล้วว่าแก้ครบ · 🐞 ก่อนหน้านี้ส่งกลับไปแล้วเงียบทั้งสองทาง ต้องเดาจากเช็คลิสต์เอาเอง
     ⚠️ เฉพาะหัวหน้า และใบที่ยังไม่ล็อก — ฝั่งช่างเห็นเรื่องเดียวกันบนแถบงาน (มีปุ่มแจ้ง)
     ⚠️ "แจ้งแล้ว" ขึ้นเฉพาะรอบล่าสุดที่ยังไม่ถูกส่งกลับซ้ำ (ส่งกลับซ้ำ = ค้างใหม่) */
  if (canDecide && !lockReason && sendBack?.sentBack) {
    const back = sendBack.sentBack;
    const asks = surveySendBackAsks(back);
    const askText = surveySendBackAskText(back);
    if (sendBack.pending) {
      notices.push({
        key: 'send-back-pending', tone: 'warning',
        text: `ส่งกลับให้ช่างแก้${back.at ? ` ${fmtDateTime(back.at)}` : ''}${askText ? ` — ${askText}` : ''}`
          + ' · รอช่างแจ้งว่าแก้แล้ว',
      });
    } else if (sendBack.done) {
      const done = sendBack.done;
      /* "แก้แล้ว 1 / 2 ข้อ" ต้องบอกด้วยว่า **ข้อไหน** ยังไม่ติ๊ก — ตัวเลขเฉย ๆ หัวหน้าต้องเปิดเทียบเอง
         ⚠️ ติ๊กไม่ครบ = กล่องเหลือง (ช่างบอกเองว่ายังไม่ได้ทำ) · ไม่รู้ว่าติ๊กอะไร = คำเดิม กล่องเขียว */
      const doneItems = Array.isArray(done.doneItems) ? done.doneItems : null;
      const count = doneItems ? surveySendBackDoneCountText(doneItems.length, done.itemCount) : null;
      const open = count ? asks.map((_, i) => i).filter((i) => !doneItems.includes(i)) : [];
      const facts = [count, done.at ? fmtDateTime(done.at) : null].filter(Boolean).join(' · ');
      notices.push({
        key: 'send-back-done', tone: open.length ? 'warning' : 'success',
        text: `ช่างแจ้งว่าแก้แล้ว${facts ? ` ${facts}` : ''}${done.byName ? ` · ${done.byName}` : ''}`
          + (done.note ? ` — ${done.note}` : '')
          + (open.length ? ` · ยังไม่ติ๊ก: ${numberedAsks(asks, open)}` : ''),
      });
    }
  }
  /* 🔴 **อ่านไม่สำเร็จต้องพูดออกมา** — ชิ้นที่หายไปเงียบ ๆ อ่านเหมือน "ไม่มีข้อมูลนี้"
     ซึ่งเป็นคนละเรื่องกันคนละทาง (ไซต์ไม่มีที่อยู่ ≠ อ่านที่อยู่ไม่สำเร็จ) */
  const unknownKeys = Object.keys(unknown || {}).filter((k) => unknown[k]);
  if (unknownKeys.length) {
    notices.push({
      key: 'unknown', tone: 'warning',
      text: `อ่านข้อมูลบางส่วนไม่สำเร็จ — ${unknownKeys.map((k) => SURVEY_UNKNOWN_LABELS[k] || k).join(' · ')}`
        + ` แสดงเป็น "${SURVEY_UNKNOWN_TEXT}" · ลองโหลดหน้าใหม่`,
      keys: unknownKeys,
    });
  }

  const nextZone = leftZones[0]
    ? { id: leftZones[0].id, name: surveyZoneName(leftZones[0]) }
    : null;

  return {
    status,
    progress: {
      done: progress.done,
      total: progress.total,
      complete: progress.complete,
      percent: progress.total ? Math.round((progress.done / progress.total) * 100) : 0,
      cut: totals.cutZones,
      leftNames: leftZones.map(surveyZoneName),
      leftText,
    },
    totals,
    gates,
    gatesFailed: gatesFailed.length,
    gatesTitle: canDecide ? 'ด่านก่อนส่งผล' : 'ของที่ช่างต้องเก็บ',
    send,
    recallAllowed,
    recallBlockedReason: recallGate,
    /* ปุ่มดึงกลับเป็น **ของหัวหน้าและใบที่ส่งแล้วเท่านั้น** — โทนอำพัน ไม่ใช่แดง เพราะย้อนได้ */
    recallAction: {
      show: canDecide && sent && !cancelled,
      allowed: recallAllowed,
      hint: 'ต้องใส่เหตุผล · ฝ่ายขายได้แจ้งเตือนว่าตัวเลขเดิมใช้ไม่ได้',
    },
    recall: recallPending ? recall : null,
    nextZone,
    notices,
    zoneGaps,
    sendBackAction,
    step: stepOf(request, { cancelled, recallPending, recall, progress, visit }),
    /* ⭐ **กำหนดของจอนี้คือวันส่งผล ไม่ใช่วันเข้าพื้นที่** (มติผู้ใช้ 2026-09-21 · mig 0368)
       — ทั้งจอเป็นเรื่องการส่งตัวเลขให้ฝ่ายขาย · วันนัดเข้าพื้นที่มีแถวของตัวเองอยู่แล้ว
         ("นัดสำรวจ") ⇒ เอามาโชว์ซ้ำตรงนี้คือข้อมูลเดียวกันสองที่ที่นับถอยหลังผิดเรื่อง
       ⚠️ **ถอยไปใช้วันนัดเมื่อใบยังไม่มีวันส่งผล** — ใบที่ลงคิวไว้ก่อน mig 0368 มีแต่วันนัด
          ปล่อยว่างเมื่อไร จอจะบอกว่า "ไม่มีกำหนด" ทั้งที่ใบมีคำสัญญาอยู่ */
    due: {
      date: request?.committedResultDate || request?.committedDueDate || null,
      overdueDays: locked
        ? null
        : overdueBy(request?.committedResultDate || request?.committedDueDate, today),
    },
    flags: {
      sent, cancelled, locked, readOnly,
      /* เปิดหน้าคำร้องได้ไหม — ตอบโดย server (ผูกกับ role ไม่ใช่กับสถานะใบ) */
      canOpenRequest,
      /* 🔴 ชื่อธงต้องบอกว่าเป็นการปิดแบบไหน — `settled` = จบครบ (ส่งแล้ว + ฝ่ายขายปิด)
         `closedWithoutAnswer` = ปิดทิ้งโดยไม่เคยส่งผล · เดิมมีธงเดียวชื่อ `closed`
         ซึ่งอ่านเหมือนอย่างแรกแต่หมายถึงอย่างหลัง */
      settled, closedWithoutAnswer,
      canWrite, canDecide,
      /* ⭐ **อัปภาพผังได้ไหม** (ช่องอัปอยู่คอลัมน์ของตารางสรุป · §10.5 S2) = คนเคาะ **และ** คนเขียน
         ผลวัดของใบนี้ได้ · 🔴 ต้องมีทั้งสองข้อ — ด่านเขียนไฟล์ของ server (`canWriteSurveyZoneFiles`)
         ถาม `visitWriteAccess` ตัวเดียวกับ `canWrite` ไม่ได้ถาม "เป็นหัวหน้าไหม" ⇒ ผู้บริหารที่ส่งผล
         ได้แต่ไม่มีสิทธิ์เขียนผลวัด (CD/CM) กดอัปแล้วเจอ 403 · ล็อกแล้วก็อัปไม่ได้ (`canWrite` หักแล้ว) */
      canUploadPlan: canDecide && canWrite,
      recallPending,
      /* ⚠️ `recallPending === false` แปลว่า "ไม่ได้ถูกดึงกลับ" **ก็ต่อเมื่อ `recallKnown`**
         — อ่านแถว recall ไม่สำเร็จแล้วตอบว่า "ไม่เคยดึงกลับ" คือการแปลงความล้มเหลว
         เป็นข้อเท็จจริง (กติกา supabase-never-throws) · กล่องแจ้ง `unknown` พูดแทนแล้ว */
      recallKnown: unknown?.recall !== true,
      /* ลำดับใน DOM: ช่างที่ยังกรอกได้ถามว่า "พื้นที่ไหนต้องวัด" ⇒ เนื้อมาก่อนการ์ด ·
         คนอื่นถามว่า "ใบนี้อยู่สถานะไหน" ⇒ การ์ดมาก่อน */
      /* ⚠️ ใช้ `actsAsCrew` ตัวเดียวกับถ้อยคำ "กด ส่งงาน" — 🐞 Senior ที่ออกหน้างานเอง (หัวหน้า
         ที่อยู่บนนัด) เคยได้การ์ดขึ้นก่อน ⇒ จอ 390 พาดหัวสั่ง "กด ส่งงาน" แต่แถบส่งงานอยู่ใต้
         พื้นที่ทั้งหมด ต้องเลื่อนหาเอง
         ⚠️ Senior ได้เนื้อก่อน **เฉพาะตอนแถบส่งงานยังมีปุ่ม** — ส่งงานแล้วงานถัดไปของเขาคือเคาะและ
            ส่งผล ซึ่งอยู่บนการ์ด ⇒ กลับไปการ์ดก่อนเหมือนหัวหน้าคนอื่น */
      controlFirst: !(canWrite && (!canDecide || (onVisit && crewNotSubmitted))),
    },
    lockReason,
    unknown: { ...(unknown || {}) },
  };
}
