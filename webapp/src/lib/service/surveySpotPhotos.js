// ── รูปจุดติดตั้ง ↔ จุด (PR-S · มติเจ้าของ 28–30/09) — ตรรกะล้วน ไม่แตะ DB/HTTP ──────────
//
// ⭐ **จุดหนึ่งจุด = หนึ่งแถว** (รูป + ชื่อ + รายละเอียด · มติ 28/09) — ตัวเชื่อมคือ
//   `attachments.metadata.spotId` (jsonb ของ mig 0028) ⇒ **ไม่มี migration**
//   · ผูกตอนอัป: ช่างถ่ายจากแถวของจุด ⇒ POST ส่ง `metadata: { spotId }` มาด้วย
//   · ผูกทีหลัง: ถาด "ยังไม่ได้ผูกจุด" ⇒ PATCH `metadata: { spotId }` (ตัวรัน `surveySpotLink.js`)
// 🔴 **ห้ามผูกด้วยลำดับการอัป** — ม็อกกระดานแจกป้ายตามลำดับ ของจริงไม่มีวันเดาแบบนั้น:
//   รูปที่ไม่มี spotId = ไม่รู้ว่าเป็นของจุดไหน ⇒ ลงถาด ให้คนที่อยู่หน้างาน/หัวหน้าเลือกเอง
// ⭐ **ลบจุด = รูปย้ายลงถาด ไม่มีไฟล์หาย** — ไม่ต้องมีโค้ดย้าย: spotId ที่ไม่ตรงจุดไหนในรายการ
//   ตกถาดเองที่ `spotPhotoGroups` (id ของจุดไม่ถูกใช้ซ้ำ ⇒ ไม่มีรูปไปเกาะจุดใหม่ผิดตัว)
// ⚠️ ตัวนับรูปของด่านหกข้อ (`surveyDocCounts`) **นับตาม docType เหมือนเดิม** — ด่านหกข้อไม่รู้จักการผูกจุด
//   🔄 มติ 01/10: การผูกจุดมีด่านของตัวเองสองตัว (ท้ายไฟล์ · `surveySpotGates`) — G1 ช่างส่งงาน · G2 หัวหน้าส่งผล
//   ⚠️ ไม่ได้ต่อเข้า `SURVEY_GATES` เพราะ `survey.js` ห้าม import ไฟล์นี้ (วงวน survey → spotPhotos → attachmentTypes
//      → survey · `attachmentTypes` อ่าน `SURVEY_DOC_*` ตอนโหลดโมดูล = TDZ พัง) ⇒ ผู้เรียกถามสองตัวคู่กันเสมอ
import { isPreviewableImage } from '@/lib/master/attachmentTypes';
import { SURVEY_DOC_SPOT, surveyEditLockError, surveyZoneName } from '@/lib/service/survey';

/** ชื่อถาดของรูปที่ยังไม่รู้ว่าเป็นของจุดไหน — คำของเจ้าของ 30/09 */
export const SPOT_TRAY_LABEL = 'ยังไม่ได้ผูกจุด';

/* รูปร่างเดียวกับ id จุดที่ระบบออก: `genId('SPT')` ของ server · `new-…` ของจอ (id ร่างคงเดิมตอนบันทึก —
   `normalizeSurveySpots`) · ตรงกับ `SPOT_ID_RE` ของจุดบนโซน (`zones.js`) */
const SPOT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const list = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 🔑 **"รูปของจุด" คืออะไร — กติกาเดียวของทุกที่** (จอหน้างาน · ถาด · แท็บผล · กล่องถามก่อนลบจุด · เอกสารประเมิน)
 *   = ไฟล์ `survey_spot` ที่เปิดเป็นรูปได้ (`isPreviewableImage` ตัวเดียวกับที่แผงไฟล์แนบส่งให้แถวของจุด)
 * 🐞 review 30/09 — PDF ที่ลาก/วางลงหัวข้อจุด (`survey_spot` ไม่มีกติกาชนิดไฟล์) เคยถูกนับว่า "ยังไม่ได้ผูกจุด" บนแท็บผล
 *   ทั้งที่ถาดบนจอหน้างานไม่มีมัน (แผงส่งเฉพาะรูป) ⇒ บรรทัดบนแท็บผลชี้ไปที่ถาดที่ไม่มีไฟล์ให้ผูก · ด่านรูปไม่ผูกของ
 *   เอกสารประเมิน (§8.1) จะไม่มีทางออก ⇒ ไฟล์ที่ไม่ใช่รูปไม่ใช่ "รูปของจุด" — ไม่อยู่ใต้จุด ไม่อยู่ในถาด (ยังเป็นไฟล์แนบธรรมดา)
 */
export const isSpotPhoto = (file) => file?.docType === SURVEY_DOC_SPOT && isPreviewableImage(file);

/** spotId ของรูปหนึ่งรูป — สตริงไม่ว่างเท่านั้น (ค่าแปลกปลอม = ไม่ผูก) */
export function photoSpotId(file) {
  const v = file?.metadata?.spotId;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** ค่า spotId ที่รับจากคำขอ → สตริง หรือ `null` (= ถอดการผูก) */
export function normalizeSpotId(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

/** รูปร่างของ spotId ที่รับจากคำขอ — `null`/ว่าง = ถอดการผูก (ผ่าน) · คืนข้อความไทยหรือ `null` */
export function spotIdError(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !SPOT_ID_RE.test(value.trim())) return 'รหัสจุดติดตั้งไม่ถูกต้อง';
  return null;
}

/* เก่าก่อน — เทียบ `createdAt` เป็นสตริง (PostgREST ตอบรูปเดียวกันทุกแถว · ตัวแปลงเวลาของ JS ตัดเศษ
   ไมโครวินาที ⇒ สองรูปที่ห่างกันไม่ถึงมิลลิวินาทีจะสลับที่ได้) · เท่ากัน = เรียงตาม id ให้ผลนิ่ง */
const oldestFirst = (a, b) => {
  const x = String(a?.createdAt ?? '');
  const y = String(b?.createdAt ?? '');
  if (x !== y) return x < y ? -1 : 1;
  const i = String(a?.id ?? '');
  const j = String(b?.id ?? '');
  return i < j ? -1 : i > j ? 1 : 0;
};

/**
 * 🔑 **รูปของแต่ละจุด + ถาด** — ตัวเดียวทั้งจอหน้างาน · แท็บผล · เอกสารประเมิน (แผน survey-report-doc)
 *
 * @param spots รายการจุดตามลำดับบนจอ (จอหน้างานส่ง **ร่าง** มา ⇒ แถวที่ยังไม่บันทึกก็รับรูปของมันได้ทันที)
 * @param files ไฟล์ของพื้นที่นั้นทั้งกอง — ตัวนี้หยิบเฉพาะรูปของจุด (`isSpotPhoto`) เอง
 * @returns `{ rows: [{ spot, photos }], unlinked }` — `rows` ลำดับเดียวกับ `spots` · รูปเรียงเก่าก่อน
 *   · `unlinked` = ไม่มี spotId หรือชี้จุดที่ไม่มีในรายการ (ลบไปแล้ว/ยังไม่มาถึงจอ)
 * ⚠️ id จุดซ้ำในรายการ (ไม่ควรเกิด — ตัวจัดแถวตีกลับ) = รูปไปจุดแรกตัวเดียว ไม่นับซ้ำสองแถว
 */
export function spotPhotoGroups({ spots = [], files = [] } = {}) {
  const rows = list(spots).filter(isObj).map((spot) => ({ spot, photos: [] }));
  const byId = new Map();
  for (const row of rows) {
    const id = normalizeSpotId(row.spot.id);
    if (id && !byId.has(id)) byId.set(id, row);
  }
  const unlinked = [];
  const photos = list(files).filter(isSpotPhoto).sort(oldestFirst);
  for (const file of photos) {
    const row = byId.get(photoSpotId(file));
    (row ? row.photos : unlinked).push(file);
  }
  return { rows, unlinked };
}

/**
 * 🔑 **แถวจุดบนร่างที่มีรูปแล้ว = แถวจริง** (review 30/09) — ช่างถ่ายรูปจากแถวใหม่ที่ยังว่างได้ (ถ่ายก่อน พิมพ์ชื่อทีหลัง)
 *   รูปขึ้นไปพร้อม spotId ของแถวนั้นแล้ว ⇒ ถ้าตัวจัดแถวยังนับแถวนั้นว่า "ว่าง" (ไม่ค้าง · ไม่ส่ง · ไม่บล็อก) แถวหายเงียบ
 *   ตอนย้ายพื้นที่/บันทึกส่วนอื่น แล้วรูปตกถาดโดยไม่มีใครบอก
 * @param draftSpots จุดบนจอ (ร่าง) · @param savedSpots `zone.spots` ที่ลงฐานแล้ว · @param files ไฟล์ของพื้นที่ (ชุดสด)
 * @returns `{ ownerIds, unsavedPhotos }`
 *   · `ownerIds` = id ของแถวร่างที่มีรูปอย่างน้อยหนึ่งรูป → ใส่ในร่างเป็น `photoSpotIds` ⇒ ลายเซ็น (`surveyZoneDraftSignature`)
 *     นับแถวว่างที่มีรูปว่า "ค้าง" · ตัวส่ง (`surveyZoneSavePayload`) บล็อกด้วย "จุดที่ n มีรูปแล้วแต่ยังไม่มีชื่อ" แทนการข้าม
 *   · `unsavedPhotos` = รูปบนแถวที่ยังไม่ลงฐาน — ทิ้งร่าง = รูปพวกนี้ย้ายไปถาด (กล่องถามก่อนทิ้งต้องบอก)
 */
export function spotDraftPhotos({ draftSpots = [], savedSpots = [], files = [] } = {}) {
  const saved = new Set(list(savedSpots).map((s) => normalizeSpotId(s?.id)).filter(Boolean));
  const ownerIds = [];
  let unsavedPhotos = 0;
  for (const { spot, photos } of spotPhotoGroups({ spots: draftSpots, files }).rows) {
    const id = normalizeSpotId(spot.id);
    if (!id || !photos.length) continue;
    ownerIds.push(id);
    if (!saved.has(id)) unsavedPhotos += photos.length;
  }
  return { ownerIds, unsavedPhotos };
}

/**
 * ผูก/ย้าย/ถอดรูปหนึ่งรูปได้ไหม (ด่านข้อมูล — สิทธิ์อยู่ที่ `surveySpotLinkDecision`) · ข้อความไทยหรือ `null`
 * @param spots **จุดที่บันทึกแล้ว** ของพื้นที่ (`service_survey_zones.spots`) — ถาดผูกได้เฉพาะจุดที่มีตัวตนในฐาน
 */
export function spotLinkError({ file = null, spotId = null, spots = [] } = {}) {
  if (file?.docType !== SURVEY_DOC_SPOT) return 'ผูกจุดได้เฉพาะภาพจุดติดตั้ง';
  const shape = spotIdError(spotId);
  if (shape) return shape;
  const id = normalizeSpotId(spotId);
  if (id === null) return null;
  if (!list(spots).some((s) => normalizeSpotId(s?.id) === id)) {
    return 'ไม่พบจุดนี้ในพื้นที่แล้ว — บันทึกจุดก่อน หรือโหลดใหม่แล้วเลือกอีกครั้ง';
  }
  return null;
}

/**
 * ตัวเลือกของ "ผูกกับจุด…" — จุดที่บันทึกแล้ว มี id มีชื่อ · ไม่มีจุดที่รูปผูกอยู่แล้ว
 * ⭐ เลขตามลำดับแถวบนจอ (แถวที่ 2 = "2.") ⇒ คนเลือกเห็นเลขเดียวกับแถวที่ตาเห็น
 */
export function spotAssignTargets({ spots = [], file = null } = {}) {
  const current = photoSpotId(file);
  return list(spots)
    .map((spot, index) => ({ spot, number: index + 1 }))
    .filter(({ spot }) => isObj(spot) && normalizeSpotId(spot.id) && String(spot.label ?? '').trim())
    .filter(({ spot }) => normalizeSpotId(spot.id) !== current)
    .map(({ spot, number }) => ({
      id: normalizeSpotId(spot.id),
      number,
      label: `${number}. ${String(spot.label).trim()}`,
    }));
}

/** ชื่อแถวของจุดที่โปรแกรมอ่านจอได้ยิน ("จุดที่ 2 มุมเตียง") — แผ่นถ่ายรูปของทุกแถวตาเห็นคำเดียวกัน ต้องบอกว่าของแถวไหน */
export function spotRowLabel(index, spot) {
  const label = String(spot?.label ?? '').trim();
  return `จุดที่ ${Number(index) + 1}${label ? ` ${label}` : ''}`;
}

/**
 * 🔑 **ตัวเลือก "ผูกกับจุด" ของรูปหนึ่งรูปบนจอหน้างาน** — เลขตามแถวบนจอ (ร่าง) · ผูกได้เฉพาะจุดที่ **บันทึกแล้ว**
 *   (ด่าน PATCH ตอบ 409 กับจุดที่ยังไม่ลงฐาน — ยื่นตัวเลือกที่กดแล้วพังคือปุ่มโกหก)
 * ⚠️ จุดที่ลบในร่างแต่ยังไม่บันทึก = ไม่มีแถวบนจอ ⇒ ไม่อยู่ในตัวเลือก (ตาเห็นอะไร เลือกได้แค่นั้น)
 * @param draftSpots จุดบนจอ (ร่าง) · @param savedSpots `zone.spots` ที่ลงฐานแล้ว · @param file รูปที่จะผูก
 * @returns `{ targets, unsaved, linked }` — `unsaved` = แถวที่มีชื่อแต่ยังไม่บันทึก (บอกเหตุที่มันไม่อยู่ในตัวเลือก)
 *   · `linked` = รูปอยู่ใต้แถวของจุดบนจอ ⇒ **ถอดกลับถาดได้** (`spotId: null` — ด่าน PATCH รับ · แผน §8.3 "or null")
 *     🐞 UAT 01/10: เดิมมีแต่ "ย้ายไปจุดอื่น" ⇒ รูปที่ผูกผิดจุดแต่ไม่ใช่ของจุดไหนเลยไม่มีทางออก (ใบล็อกลบก็ไม่ได้)
 *     · รูปในถาด (ไม่มี spotId · ชี้จุดที่ไม่มีบนจอ) = `false` — อยู่ในถาดอยู่แล้ว
 */
export function spotLinkChoices({ draftSpots = [], savedSpots = [], file = null } = {}) {
  const saved = new Set(list(savedSpots).map((s) => normalizeSpotId(s?.id)).filter(Boolean));
  const targets = spotAssignTargets({ spots: draftSpots, file }).filter((t) => saved.has(t.id));
  const unsaved = list(draftSpots)
    .filter((s) => isObj(s) && String(s.label ?? '').trim() && !saved.has(normalizeSpotId(s.id))).length;
  const current = photoSpotId(file);
  const linked = current !== null && list(draftSpots).some((s) => isObj(s) && normalizeSpotId(s.id) === current);
  return { targets, unsaved, linked };
}

/**
 * คำของถาด "ยังไม่ได้ผูกจุด" บนจอหน้างาน
 * @param count   จำนวนรูปในถาด · @param canLink ธง `canLinkSpotPhotos` ของ server (ด่านเดียวกับ PATCH)
 * @param unsaved `spotLinkChoices(...).unsaved` ของรูปแรก (จุดร่างเหมือนกันทุกรูป)
 */
export function spotTrayView({ count = 0, canLink = false, unsaved = 0 } = {}) {
  const n = Math.max(0, Number(count) || 0);
  const title = n ? `${SPOT_TRAY_LABEL} · ${n} รูป` : SPOT_TRAY_LABEL;
  if (!canLink) return { title, note: 'ยังไม่รู้ว่าเป็นรูปของจุดไหน' };
  const note = unsaved > 0
    ? 'แตะชื่อจุดที่ตรงกับรูป · จุดที่ยังไม่บันทึกผูกไม่ได้ — กดบันทึกพื้นที่ก่อน'
    : 'แตะชื่อจุดที่ตรงกับรูป';
  return { title, note };
}

/** metadata ใหม่ของรูป — เติม/แทน spotId · ถอด = ลบคีย์ทิ้ง · คีย์อื่นคงเดิม · ไม่แก้ของเดิมในที่ */
export function withSpotLink(metadata, spotId) {
  const next = isObj(metadata) ? { ...metadata } : {};
  const id = normalizeSpotId(spotId);
  if (id === null) delete next.spotId;
  else next.spotId = id;
  return next;
}

/** คำขอนี้แก้ **การผูกจุดอย่างเดียว** ไหม — ข้อยกเว้นของใบที่ส่งผลแล้ว (Q1a) รับเฉพาะรูปนี้ */
export function isSpotLinkPatch(metadata) {
  if (!isObj(metadata)) return false;
  const keys = Object.keys(metadata);
  return keys.length === 1 && keys[0] === 'spotId';
}

/** กล่องถามก่อนลบจุดที่มีรูป (แผน §11c) — ไม่มีรูป = ไม่ต้องถาม (`null`) */
export function spotRemovalNotice({ spot = null, files = [] } = {}) {
  const id = normalizeSpotId(spot?.id);
  if (!id) return null;
  const count = list(files).filter((f) => isSpotPhoto(f) && photoSpotId(f) === id).length;
  if (!count) return null;
  return `จุดนี้มี ${count} รูป — รูปจะย้ายไปกลุ่ม “${SPOT_TRAY_LABEL}” ไม่มีรูปไหนถูกลบ`;
}

/**
 * 🔑 **ใครผูกรูปกับจุดได้ตอนไหน** — ตัวตัดสินเดียวของด่าน PATCH (`surveySpotLinkAccess`) และธงบนจอ (GET ใบประเมิน)
 *
 * · ใบยังเปิด = คนที่แนบไฟล์ของพื้นที่ได้วันนี้ (`canWrite` — ช่างบนนัด · หัวหน้า · แอดมิน)
 * · ⭐ **ใบที่ส่งผลแล้ว (Q1a · มติ 29–30/09)** = หัวหน้าฝ่าย (`canSendSurveyResult`) ผูกได้ต่อ
 *   เพราะใบที่ส่งก่อนมีเอกสารประเมิน รูปทุกใบไม่มี spotId และต้องผูกก่อนกด "ออกเอกสาร"
 *   ⚠️ แก้ **metadata อย่างเดียว** — ชุดรูปกับตัวเลขที่ฝ่ายขายได้ไปไม่ขยับ (เพิ่ม/ลบรูปยังล็อกเหมือนเดิม)
 *   ⚠️ แคบเฉพาะ "ส่งผลแล้ว ไม่ถูกยกเลิก" — ใบยกเลิก/ปิดโดยไม่ได้ประเมิน/ฝ่ายขายปิดก่อนได้ผล ไม่มีเอกสารให้ออก
 * · แอดมินผ่านด่านเวลาเหมือนด่านไฟล์เดิม (เก็บกวาด)
 *
 * @param canWrite  ด่านเขียนไฟล์ของพื้นที่ **ส่วนที่ไม่ใช่ล็อกเวลา** (อ่านได้ + ช่าง/หัวหน้า + นัด)
 * @returns `{ ok, locked, error }` — `locked` = ใบล็อกแล้ว (ผู้เรียกลง audit เมื่อผ่านด้วยข้อยกเว้น)
 */
export function surveySpotLinkDecision(request, { canWrite = false, canDecide = false, isAdmin = false } = {}) {
  if (!request) return { ok: false, locked: false, error: 'ไม่พบใบคำร้อง' };
  const lock = surveyEditLockError(request);
  if (!lock || isAdmin) {
    return canWrite
      ? { ok: true, locked: !!lock, error: null }
      : { ok: false, locked: !!lock, error: 'ไม่มีสิทธิ์ผูกรูปกับจุดของใบนี้' };
  }
  const sent = !!request.answeredAt && !request.cancelledAt;
  if (sent && canDecide) return { ok: true, locked: true, error: null };
  return {
    ok: false,
    locked: true,
    error: sent ? 'ใบนี้ส่งผลให้ฝ่ายขายแล้ว — ผูกรูปกับจุดได้เฉพาะหัวหน้าฝ่าย' : lock,
  };
}

/**
 * metadata ของรูปที่กำลังอัป (POST) — ตรวจ spotId เฉพาะไฟล์ของผลวัดพื้นที่
 * ⭐ ตรวจแค่รูปร่าง ไม่เทียบกับจุดที่บันทึกแล้ว — ช่างถ่ายจากแถวที่ยังไม่ได้กดบันทึกได้ (id ร่างคงเดิมตอนบันทึก)
 *   ถ้าแถวนั้นไม่ถูกบันทึกเลย รูปตกถาดเอง (`spotPhotoGroups`) ไม่มีอะไรพัง
 * ⚠️ entity อื่นไม่ถูกแตะเลย (คืนของเดิม)
 * @returns `{ metadata, error }`
 */
export function surveySpotUploadMetadata(entityType, docType, metadata) {
  if (entityType !== 'service_survey_zone' || !isObj(metadata) || !('spotId' in metadata)) {
    return { metadata, error: null };
  }
  const shape = spotIdError(metadata.spotId);
  if (shape) return { metadata: null, error: shape };
  const id = normalizeSpotId(metadata.spotId);
  if (id !== null && docType !== SURVEY_DOC_SPOT) return { metadata: null, error: 'ผูกจุดได้เฉพาะภาพจุดติดตั้ง' };
  return { metadata: withSpotLink(metadata, id), error: null };
}

/* ══ ด่านรูปจุด (มติเจ้าของ 01/10) ═══════════════════════════════════════════════════════
 *
 * G1 **ช่างกด "ส่งงาน"** ได้ต่อเมื่อทุกจุดมีรูปที่ผูกกับจุดนั้นอย่างน้อยหนึ่งรูป **และ** ถาด "ยังไม่ได้ผูกจุด" ว่าง
 *    (ช่างผูกเองได้ในถาด) · เหตุบอกชื่อพื้นที่ + เลขจุด ("Reception · จุด 1.3 ยังไม่มีรูป")
 * G2 **หัวหน้ากด "ส่งผลให้ฝ่ายขาย"** ไม่ได้ตราบใดที่ถาดของพื้นที่ไหนยังมีรูป — "มีรูปจุดที่ยังไม่ได้ผูก n รูป — ผูกก่อนส่งผล"
 *    ⭐ จุดที่ไม่มีรูปไม่บล็อกการส่งผล (มติ G2 = ถาดอย่างเดียว · เอกสารประเมิน §8.1 "จุดที่ไม่มีรูปพิมพ์ชื่อ + หมายเหตุ")
 *    🔴 **ยกเว้นส่งผลที่ปิดนัดที่ยังเปิด** (`closesVisit`) — มติ 24/09 ข้อ 2: ส่งผลปิดนัดให้ได้ "แต่ต้องมีด่าน งานที่ต้องส่งด้วย"
 *       ⇒ ส่งผลตอนช่างยังไม่กดส่งงาน = ส่งงานแทนช่าง ⇒ G1 ต้องผ่านด้วย ไม่งั้นนัดปิดเป็น "เข้าแล้ว" ทั้งที่จุดยังไม่มีรูป
 *       (เทสต์ความครอบใน `surveySpotGates.test.mjs` คู่กับของด่านหกข้อใน `survey.test.mjs`)
 * ⭐ นับด้วยกติกาเดียวกับถาด (`isSpotPhoto` + `spotPhotoGroups().unlinked`) ⇒ ถาดบนจอกับด่านเห็นรูปชุดเดียวกัน
 * ⚠️ พื้นที่ที่ถูกตัด (`status='cut'` — CHECK ของ mig 0354 มีแค่ ok/cut/added) ไม่ต้องผ่านด่านไหน · ใบเก่าที่รูปทุกใบ
 *   `metadata {}` ด่านใช้ตามปกติ (เจ้าของรับแล้ว 01/10) — หัวหน้าผูกได้แม้ใบล็อก (`surveySpotLinkDecision`)
 * 🔑 **server กับจอถามตัวเดียวกัน**: route ส่งงาน (`surveySpotSubmitError`) · route ส่งผล (`surveySpotSendError`) ·
 *   การ์ด (`surveySpotGates`) · แถบ/กล่องส่งงาน (`surveySpotSubmitReason` / `surveySpotSubmitError`)
 *   ⭐ เอกสารประเมิน (แผน survey-report-doc §8.1/§9 ข้อ 5) ใช้ตัวนับ `surveySpotPhotoGaps().unlinkedTotal` ตัวนี้เป็นด่านตรึง
 */

export const SPOT_GATE_PHOTOS = 'spotPhotos';
export const SPOT_GATE_LINKED = 'spotLinked';

const SHOWN_ZONES = 3;
const SHOWN_SPOTS = 5;
const isCutZone = (row) => (row?.status || 'ok') === 'cut';

/**
 * 🔑 **ตัวนับของด่านรูปจุด** — ต่อพื้นที่ที่ยังอยู่ในใบ: จุดที่ยังไม่มีรูป + จำนวนรูปในถาด
 * ⭐ เลขจุด `k.n` = ลำดับพื้นที่ในใบ (นับรวมพื้นที่ที่ตัด — เลขเดียวกับวงบนรายการพื้นที่ `surveyZoneListView().index`)
 *   · ลำดับจุดบนจอ (`spotNo` ของหน้าพื้นที่) ⇒ ช่างอ่านเลขแล้วรู้ว่าแถวไหน · ตรงกับเลขบนผังของเอกสาร (§8.1 "k.n")
 * ⚠️ ไฟล์ของพื้นที่ยังไม่มา (`[]`) = ทุกจุดยังไม่มีรูป — fail-closed เหมือน `surveyDocCounts`
 * @returns `{ zones: [{ zoneId, zoneName, number, missing: [{ spotId, number, label }], unlinked }], active, missingTotal, unlinkedTotal }`
 *   `zones` = ทุกพื้นที่ที่ยังอยู่ในใบ (ลำดับเดียวกับใบ) · `active` = จำนวนพื้นที่นั้น
 */
export function surveySpotPhotoGaps(rows = [], filesByZone = {}) {
  const files = isObj(filesByZone) ? filesByZone : {};
  const zones = [];
  let missingTotal = 0;
  let unlinkedTotal = 0;
  list(rows).filter((row) => isObj(row) && row.id).forEach((row, index) => {
    if (isCutZone(row)) return;
    const k = index + 1;
    const groups = spotPhotoGroups({ spots: list(row.spots), files: list(files[row.id]) });
    const missing = groups.rows
      .map((r, j) => ({ r, number: `${k}.${j + 1}` }))
      .filter(({ r }) => r.photos.length === 0)
      .map(({ r, number }) => ({ spotId: normalizeSpotId(r.spot.id), number, label: String(r.spot.label ?? '').trim() }));
    missingTotal += missing.length;
    unlinkedTotal += groups.unlinked.length;
    zones.push({ zoneId: row.id, zoneName: surveyZoneName(row), number: k, missing, unlinked: groups.unlinked.length });
  });
  return { zones, active: zones.length, missingTotal, unlinkedTotal };
}

const moreZones = (n) => (n > SHOWN_ZONES ? ` และอีก ${n - SHOWN_ZONES} พื้นที่` : '');
const spotNumbers = (missing) => missing.slice(0, SHOWN_SPOTS).map((m) => m.number).join(', ')
  + (missing.length > SHOWN_SPOTS ? ` และอีก ${missing.length - SHOWN_SPOTS} จุด` : '');
/* "Reception · จุด 1.3 ยังไม่มีรูป | ห้อง MD · จุด 2.1, 2.2 ยังไม่มีรูป" — ชื่อพื้นที่ก่อน (เหตุต้องบอกว่าที่ไหน) */
const missingText = (stuck) => stuck.slice(0, SHOWN_ZONES)
  .map((z) => `${z.zoneName} · จุด ${spotNumbers(z.missing)} ยังไม่มีรูป`).join(' | ') + moreZones(stuck.length);
const trayNames = (zones) => zones.slice(0, SHOWN_ZONES).map((z) => z.zoneName).join(' · ') + moreZones(zones.length);

/** หมายเหตุของพื้นที่หนึ่งแถว (แถวในกล่องส่งงาน) — ไม่มีเรื่อง = `null` */
export function spotGapNote(zoneGap) {
  if (!zoneGap) return null;
  const parts = [];
  if (list(zoneGap.missing).length) parts.push(`จุด ${spotNumbers(zoneGap.missing)} ยังไม่มีรูป`);
  if (zoneGap.unlinked > 0) parts.push(`${SPOT_TRAY_LABEL} ${zoneGap.unlinked} รูป`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * 🔑 **แถวด่านรูปจุด** — รูปร่างเดียวกับ `surveyGateChecklist` (`key · owner · label · short · ok · done · total · zones`)
 *   + `reason` (ข้อความเต็มของ server เมื่อไม่ผ่าน) · `zoneIds` (ชื่อพื้นที่ซ้ำกันได้) · `count` (จุด/รูปที่ติด)
 *   ⇒ การ์ดวางต่อท้ายด่านหกข้อได้เลย
 * @param mode `'submit'` (ช่างส่งงาน · G1) | `'send'` (หัวหน้าส่งผล · G2)
 * @param closesVisit ส่งผลครั้งนี้ปิดนัดที่ยังเปิดด้วย (`surveySendVisitStep(...).action === 'close'`) ⇒ G1 มาด้วย
 * ⚠️ `owner` ของแถวผูกรูป = คนที่ต้องลงมือตอนนั้น — ส่งงาน = ช่าง (ผูกในถาดเอง) · ส่งผล = หัวหน้า (ไม่ต้องส่งกลับให้ช่าง)
 */
export function surveySpotGates(rows = [], filesByZone = {}, { mode = 'send', closesVisit = false } = {}) {
  const submit = mode === 'submit';
  const gaps = surveySpotPhotoGaps(rows, filesByZone);
  const out = [];
  if (submit || closesVisit) {
    const stuck = gaps.zones.filter((z) => z.missing.length > 0);
    const text = stuck.length ? missingText(stuck) : null;
    out.push({
      key: SPOT_GATE_PHOTOS,
      owner: 'crew',
      short: 'รูปจุด',
      label: 'ทุกจุดมีรูปอย่างน้อย 1 รูป',
      ok: stuck.length === 0,
      done: gaps.active - stuck.length,
      total: gaps.active,
      zones: stuck.map((z) => z.zoneName),
      zoneIds: stuck.map((z) => z.zoneId),
      count: gaps.missingTotal,
      reason: text && (submit ? text : `${text} — ช่างยังไม่ส่งงาน ส่งผลจะปิดนัดให้ ทุกจุดต้องมีรูปก่อน`),
    });
  }
  const tray = gaps.zones.filter((z) => z.unlinked > 0);
  const n = gaps.unlinkedTotal;
  out.push({
    key: SPOT_GATE_LINKED,
    owner: submit ? 'crew' : 'head',
    short: 'ผูกรูปจุด',
    label: `รูปจุดผูกกับจุดครบ ไม่เหลือใน “${SPOT_TRAY_LABEL}”`,
    ok: n === 0,
    done: gaps.active - tray.length,
    total: gaps.active,
    zones: tray.map((z) => z.zoneName),
    zoneIds: tray.map((z) => z.zoneId),
    count: n,
    reason: n === 0 ? null
      : submit
        ? `มีรูปที่ยังไม่ได้ผูกจุด ${n} รูป (${trayNames(tray)})`
        : `มีรูปจุดที่ยังไม่ได้ผูก ${n} รูป — ผูกก่อนส่งผล (${trayNames(tray)})`,
  });
  return out;
}

const failedReasons = (gates) => gates.filter((g) => !g.ok).map((g) => g.reason).filter(Boolean);

/** เหตุ G1 แบบไม่มีคำนำ — แถบส่งงานมีพาดหัว "ยังส่งไม่ได้" อยู่แล้ว · ผ่าน = `null` */
export function surveySpotSubmitReason(rows = [], filesByZone = {}) {
  const reasons = failedReasons(surveySpotGates(rows, filesByZone, { mode: 'submit' }));
  return reasons.length ? reasons.join(' | ') : null;
}

/**
 * 🔑 **G1 — ด่านส่งงานของช่าง ส่วนรูปจุด** · ผู้เรียกถามต่อจาก `surveyFieldSubmitError` เสมอ (route ปิดนัด · กล่องส่งงาน)
 * ⚠️ ใบที่ล็อกแล้ว ผู้เรียกข้ามเหมือนด่านเดิม (ช่างแก้อะไรไม่ได้แล้ว บล็อกไว้ = นัดค้างตลอดกาล)
 */
export function surveySpotSubmitError(rows = [], filesByZone = {}) {
  const reason = surveySpotSubmitReason(rows, filesByZone);
  return reason ? `ยังส่งงานไม่ได้ — ${reason}` : null;
}

/**
 * 🔑 **G2 — ด่านส่งผล ส่วนรูปจุด** · ผู้เรียกถามต่อจาก `surveySendError` เสมอ (route ส่งผล · การ์ด)
 * @param closesVisit ส่งผลนี้ปิดนัดที่ยังเปิดด้วย ⇒ G1 (ทุกจุดมีรูป) มาด้วย — ดูหัวข้อ
 */
export function surveySpotSendError(rows = [], filesByZone = {}, { closesVisit = false } = {}) {
  const reasons = failedReasons(surveySpotGates(rows, filesByZone, { mode: 'send', closesVisit }));
  return reasons.length ? reasons.join(' | ') : null;
}
