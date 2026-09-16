// ── การเคาะของหัวหน้าบนแท็บสรุปส่งผล — ตัวตัดสินล้วน (PR5) ────────────────
//
// ⭐ **แท็บสรุปเลิกบันทึกทุกคลิก** (มติผู้ใช้ 2026-09-16) — เดิมทุกครั้งที่กด +/− หรือ
//   ติ๊กจุด จอยิง `PUT` ทันที ⇒ หัวหน้าที่กำลังลองตัวเลขเขียนลงฐานไปแล้วสิบรอบ
//   โดยไม่มีจังหวะไหนเลยที่เขาพูดว่า "เอาตามนี้" · ตอนนี้เขาเคาะจนพอใจแล้วค่อยกด
//   "บันทึกการเคาะ" ครั้งเดียว
//
// 🔑 **ไฟล์นี้ไม่รู้จัก React และไม่ยิง API** — จอถือร่าง ไฟล์นี้ตอบสี่คำถาม:
//   ค่าตั้งต้นของพื้นที่นี้คืออะไร · ร่างต่างจากฐานไหม · ร่างนี้บันทึกได้หรือยัง ·
//   payload ที่ต้องส่งคืออะไร
//
// ⚠️ **ด่าน "ต่างจากสูตรต้องมีเหตุผล" ต้องตรงกับ server เป๊ะ** — route `PUT` ตรวจจาก
//   **ค่าหลังรวม patch** ไม่ใช่จาก body ⇒ ที่นี่ก็ต้องตรวจจากร่างที่รวมกับแถวแล้ว
//   ไม่งั้นจอปล่อยผ่านแล้วไปตายที่ server (หรือแย่กว่า: จอบล็อกทั้งที่ server ยอม)
import { packageNeedsNote, suggestedPackages, surveyZoneSize } from './survey.js';

const text = (v) => String(v ?? '').trim();
const isCut = (zone) => zone?.status === 'cut';

/* id ของจุดที่เลือกไว้ — **เรียงแล้วเสมอ** เพราะมันถูกเอาไปเทียบกันตรง ๆ
   ⚠️ ลำดับที่คนติ๊กไม่ใช่ข้อมูล ⇒ ติ๊กออกแล้วติ๊กกลับต้องได้ "ไม่ dirty" ไม่ใช่ dirty */
const spotIdList = (ids = []) => [...new Set((ids || []).filter((v) => v !== null && v !== undefined).map(String))].sort();

/** จุดทั้งหมดที่ช่างแจ้งมา (id เรียงตามที่ช่างกรอก) */
export function surveySpotIds(zone = {}) {
  const spots = Array.isArray(zone.spots) ? zone.spots : [];
  return spots.map((s) => String(s?.id)).filter((id) => id && id !== 'undefined');
}

/**
 * ค่าตั้งต้นของร่าง = สิ่งที่อยู่ในฐานตอนนี้
 * ⚠️ `packageQty` เป็น `null` เมื่อยังไม่เคาะ — ไม่ใช่ 0 และไม่ใช่สูตร · สูตรเป็นข้อเสนอ
 *   ที่หัวหน้าต้องกดรับ ไม่ใช่ค่าที่ระบบกรอกให้แล้วเขาลบทิ้งเอง
 */
export function surveyDecisionBase(zone = {}) {
  const qty = Number(zone.packageQty);
  const spots = Array.isArray(zone.spots) ? zone.spots : [];
  return {
    packageQty: Number.isFinite(qty) && qty > 0 ? qty : null,
    packageNote: text(zone.packageNote),
    spotIds: spotIdList(spots.filter((s) => s?.selected === true).map((s) => s?.id)),
  };
}

/** ร่างที่ยังไม่ถูกแตะ = ค่าตั้งต้น · ใช้ทั้งตอนเปิดจอและตอน "ยกเลิก" */
export function surveyDecisionDraft(zone = {}, draft = null) {
  const base = surveyDecisionBase(zone);
  if (!draft) return base;
  /* ⚠️ `undefined` = **ช่องนี้ยังไม่ถูกแตะ** ไม่ใช่ "ล้างค่า" — ร่างเก็บเฉพาะช่องที่คนแก้
     ⇒ แก้จุดติดตั้งอย่างเดียวแล้วจำนวนแพ็คเกจที่เคาะไว้แล้วต้องไม่หายไปด้วย
     การล้างค่าจริงส่ง `null` หรือ `''` มา (ช่องว่างในกล่องตัวเลข) */
  const qty = draft.packageQty === undefined ? base.packageQty
    : (draft.packageQty === null || draft.packageQty === '' ? null : Number(draft.packageQty));
  return {
    packageQty: Number.isFinite(qty) && qty > 0 ? qty : null,
    packageNote: draft.packageNote === undefined ? base.packageNote : text(draft.packageNote),
    spotIds: draft.spotIds === undefined ? base.spotIds : spotIdList(draft.spotIds),
  };
}

/** ร่างต่างจากฐานไหม — ตัวที่ยกธง "ยังไม่บันทึก" บนแถวและบนแถบของการ์ด */
export function surveyDecisionDirty(zone = {}, draft = null) {
  if (isCut(zone)) return false;
  const base = surveyDecisionBase(zone);
  const next = surveyDecisionDraft(zone, draft);
  return base.packageQty !== next.packageQty
    || base.packageNote !== next.packageNote
    || base.spotIds.join('|') !== next.spotIds.join('|');
}

/**
 * บันทึกร่างนี้ได้หรือยัง — คืนข้อความเหตุผล หรือ `null` เมื่อผ่าน
 * 🔑 ตรวจจาก **ค่าหลังรวมร่างกับแถว** (ท่าเดียวกับ route `PUT`) ไม่ใช่จากร่างเปล่า ๆ
 */
export function surveyDecisionError(zone = {}, draft = null) {
  if (isCut(zone)) return 'พื้นที่นี้ถูกตัดออกจากใบแล้ว';
  const next = surveyDecisionDraft(zone, draft);
  if (next.packageQty !== null) {
    if (!Number.isInteger(next.packageQty) || next.packageQty < 1) return 'จำนวนแพ็คเกจต้องเป็นจำนวนเต็มอย่างน้อย 1';
    if (next.packageQty > 99) return 'จำนวนแพ็คเกจดูเหมือนพิมพ์ผิดหลัก';
  }
  if (next.packageNote.length > 500) return 'เหตุผลยาวเกิน 500 ตัวอักษร';
  /* 🔴 จุดที่เลือกต้องอยู่ในรายการที่ช่างแจ้งมา — server ตอบ 400 ถ้าไม่ใช่ ⇒ จอที่ถือร่าง
     ข้ามรอบโหลด (ช่างลบจุดทิ้งระหว่างที่หัวหน้าเปิดจอค้าง) ต้องจับเองก่อนกดส่ง */
  const known = new Set(surveySpotIds(zone));
  if (next.spotIds.some((id) => !known.has(id))) return 'มีจุดที่เลือกซึ่งไม่อยู่ในรายการที่ช่างแจ้งมาแล้ว — โหลดหน้าใหม่';
  const after = { ...zone, packageQty: next.packageQty, packageNote: next.packageNote };
  if (next.packageQty !== null && packageNeedsNote(after) && !next.packageNote) {
    return 'แพ็คเกจต่างจากที่สูตรบอก — ต้องบอกเหตุผลด้วย';
  }
  return null;
}

/**
 * payload สำหรับ `PUT` — **เฉพาะช่องที่เปลี่ยน** · ไม่มีอะไรเปลี่ยนคืน `null`
 * ⚠️ ส่งทุกช่องทุกครั้ง = เขียนทับของที่คนอื่นเพิ่งแก้ในช่องที่เราไม่ได้แตะ
 * ⚠️ `packageNote` ต้องไปด้วยเมื่อ qty เปลี่ยน แม้ตัวโน้ตเองไม่เปลี่ยน — ด่านของ server
 *   ตรวจจากค่าหลังรวม ซึ่งอ่านโน้ตจากแถวอยู่แล้ว แต่ถ้าคนเพิ่งพิมพ์โน้ตในรอบเดียวกัน
 *   แล้วเราไม่ส่ง โน้ตนั้นจะหายไปพร้อมกับด่านที่เด้งกลับ
 */
export function surveyDecisionPayload(zone = {}, draft = null) {
  const base = surveyDecisionBase(zone);
  const next = surveyDecisionDraft(zone, draft);
  const payload = {};
  if (base.packageQty !== next.packageQty) payload.packageQty = next.packageQty;
  if (base.packageNote !== next.packageNote) payload.packageNote = next.packageNote;
  if (base.spotIds.join('|') !== next.spotIds.join('|')) payload.selectedSpotIds = next.spotIds;
  if (!Object.keys(payload).length) return null;
  if (payload.packageQty !== undefined && payload.packageNote === undefined) payload.packageNote = next.packageNote;
  return payload;
}

/** สูตรบอกกี่แพ็คเกจ — ตัวเดียวกับที่แถวโชว์ใต้ตัวเลข */
export function surveySuggestedFor(zone = {}) {
  return suggestedPackages(surveyZoneSize(zone.parts).volumeCbm);
}

/**
 * สรุปการเคาะที่ค้างอยู่ทั้งใบ — แถบบนหัวการ์ดและด่าน `pendingDecisionZoneIds` อ่านตัวนี้
 * ⚠️ พื้นที่ที่ถูกตัดออกไม่นับ — แก้อะไรไม่ได้อยู่แล้ว ค่าค้างบนนั้นไม่ควรขวางการส่ง
 */
export function surveyPendingDecisions(zones = [], drafts = {}) {
  const rows = Array.isArray(zones) ? zones : [];
  const dirty = [];
  const blocked = [];
  for (const zone of rows) {
    if (!zone || isCut(zone)) continue;
    const draft = drafts?.[zone.id];
    if (!surveyDecisionDirty(zone, draft)) continue;
    dirty.push(zone);
    const error = surveyDecisionError(zone, draft);
    if (error) blocked.push({ id: String(zone.id), zoneName: zone.zoneName || '', error });
  }
  return {
    ids: dirty.map((z) => String(z.id)),
    rows: dirty,
    count: dirty.length,
    blocked,
    /* กดบันทึกได้เมื่อมีของค้าง **และไม่มีแถวไหนติดด่าน** — บันทึกครึ่งใบแล้วเหลือครึ่ง
       คือสภาพที่อธิบายยากกว่าเดิม (หัวหน้าไม่รู้ว่าอันไหนลงแล้ว) */
    canSave: dirty.length > 0 && blocked.length === 0,
  };
}
