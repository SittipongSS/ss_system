"use client";
// ── โมดัล "วิธีประเมินรายพื้นที่" — หัวหน้าสลับ ลงหน้างาน ↔ ประเมินจากแบบ รายพื้นที่ (งวด S2b · แผน survey-desk-assessment §3.3 · ม็อก B2) ──
//
// ⭐ **กล่องผลลัพธ์มาจากแผนตัวเดียวกับที่ server จะเขียน** (`surveyMethodSwitchPlan`) — โมดัลเรียกมันทุกครั้งที่หัวหน้าเลือก/พิมพ์
//    ⇒ บรรทัด "กดแล้วเกิดขึ้นทันที" · ช่องที่ต้องกรอก · ป้ายปุ่ม · เหตุที่ยังกดไม่ได้ ไม่มีสักอย่างที่ไฟล์นี้คิดเอง
//    (แยกสองที่เมื่อไร = กล่องบอกว่า "นัดจะถูกยกเลิก" แต่ server ไม่ได้ยกเลิก โดยไม่มีอะไรฟ้อง)
// ⭐ **ทุกคำของฟีเจอร์เป็นค่าคงที่ของ `surveyMethodSwitch.js`** — ชื่อวิธี · คำบนตัวเลือกเหตุผลสำเร็จรูป · ป้ายช่อง · ข้อผิดพลาด
//    ไฟล์นี้ไม่พิมพ์ซ้ำสักคำ (ยาม: `surveySheetDrawingScreen.test.mjs`)
// 🔴 **ไม่อ่านคอลัมน์วิธีของแถวเอง** — ถามผ่าน `zoneMethod` · ค่าของวิธีมาจากค่าคงที่ของโมดูลใบ (`surveyMethod.js`)
//
// ⚠️ **ไม่มีอะไรถูกบันทึกจนกว่าจะกดปุ่มหลัก** (กฎจอตัดสินใจ: ไม่มี auto-save) · ติดด่านข้อมูล = กดได้แล้วบอกเหตุ ไม่ใช่ปุ่มจาง:
//    ช่องที่ติดขึ้นขอบแดง **พร้อมประโยคของเหตุใต้ช่อง** · เหตุที่ไม่ใช่ของช่องไหน ("ยังไม่ได้เปลี่ยน…") = ประโยคใต้ปุ่มหลัก
//    🐞 (S2b แก้หลังตรวจจอ head-r3-4) ปุ่มหลักเคยเป็น `GatedAction` — เหตุขึ้นสองที่ (ใต้ช่อง + toast) และ toast ทับชื่อกล่อง / กากบาท / ปุ่มท้าย
//       ⇒ ปุ่มธรรมดา บอกเหตุในกล่องที่เดียว (ท่าเดียวกับกล่อง "ตัดพื้นที่และยกเลิกนัด")
// ⚠️ **ปุ่ม Esc ไม่ทิ้งของที่กรอก** (S2b แก้หลังตรวจจอ head-r3-52) — มีพื้นที่ที่เลือกเปลี่ยนหรือเหตุผลที่พิมพ์ไว้ = Esc ไม่ปิดกล่อง
//    ปิดได้ด้วยการกดที่ตั้งใจเท่านั้น ("ปิด" ท้ายกล่อง · กากบาท) · คลิกพื้นหลังไม่ปิดอยู่แล้ว (`Modal` ค่าตั้งต้น `closeOnOverlay` = false)
//    · กล่องดับแล้ว (`dead` — บันทึกจากกล่องนี้ไม่ได้อีก) = Esc ปิดได้ ไม่มีอะไรให้ถือไว้
// 🔴 **กล่อง "กดแล้วเกิดขึ้นทันที" อยู่ในแถบท้ายที่นิ่ง ติดกับปุ่มหลัก — ไม่อยู่ในเนื้อที่เลื่อน** (UAT S2b S06):
//    กล่องนี้คือที่เดียวที่บอกว่ากดแล้วนัดของช่างถูกยกเลิก / ใบออกจากคิว (ไม่มีกล่องยืนยันชั้นสอง) · เดิมอยู่ท้ายเนื้อ ใต้รายการพื้นที่
//    ⇒ บนมือถือหัวหน้ากด "ทั้งใบ" → ตัวเลือกเหตุผล → ปุ่มหลัก ได้โดยไม่เคยเห็นสักบรรทัด · ลำดับที่ตาเห็นยังเป็นของม็อก B2
//    (เหตุผล → ผลของการกด → ปุ่ม) แค่ไม่เลื่อนหนีปุ่ม
// ⚠️ **เลขการกด (`actionId`)** — สัญญาของ `surveyMethodActionId`: เปิดโมดัลใหม่ = เลขใหม่ · ส่ง body เดิมซ้ำเท่านั้นจึงใช้เลขเดิม
//    (server กันซ้ำด้วยเลขนี้ ⇒ กดซ้ำหลัง "บันทึกไม่ครบ" / คำตอบหายกลางทาง ปลอดภัย และ `retry: true` ของ apiFetch ก็ปลอดภัยด้วยเหตุเดียวกัน)
// ⚠️ **หลังกดส่งครั้งแรก โมดัลถือแถวชุดที่ส่งไว้จนปิด** (`held`) — หน้าใบอ่านใบใหม่เบื้องหลังได้ตลอด (กลับมาที่แท็บ · รูปขึ้นเสร็จ):
//    ถ้าโมดัลวาดจากแถวชุดใหม่หลัง "บันทึกไม่ครบ" พื้นที่ที่เขียนไปแล้วจะหายจากรายการที่เปลี่ยน ⇒ body ของการกดซ้ำไม่เหมือนเดิม
//    ⇒ ได้เลขการกดใหม่ และบรรทัดเธรด/วันส่งผลของรอบแรกหล่นหาย · ก่อนกดส่ง โมดัลเดินตามแถวสดตามปกติ
// ⚠️ คำตอบที่ไม่สำเร็จแยกด้วย `code` / สถานะ ไม่เทียบประโยค (`surveyMethodFailure`) · ข้อความขึ้นในแถบท้ายที่นิ่ง (`role="alert"`)
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { PencilLine } from "lucide-react";
import Modal from "@/components/Modal";
import thaiText, { keepPhrases } from "@/components/ThaiText";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { apiJson } from "@/lib/apiFetch";
import { fmtNumber, naText } from "@/lib/format";
import { surveyZoneTitle } from "@/lib/service/surveyFieldView";
import { SURVEY_METHOD_DRAWING, SURVEY_METHOD_ONSITE, zoneMethod } from "@/lib/service/surveyMethod";
import {
  SURVEY_METHOD_CHIP, SURVEY_METHOD_ERRORS, SURVEY_METHOD_LABEL, SURVEY_METHOD_MODAL_TITLE, SURVEY_METHOD_REASON_CHIPS,
  SURVEY_METHOD_REASON_LABEL, SURVEY_METHOD_REASON_MAX, SURVEY_METHOD_RESULT_DATE_LABEL, SURVEY_METHOD_SHORTCUTS,
  surveyMethodErrorTexts, surveyMethodSwitchPlan,
} from "@/lib/service/surveyMethodSwitch";
import styles from "./SurveyMethodDialog.module.css";
import { surveyCardUnits } from "./surveyControlCardUnits";

const SAVE_FAILED = "บันทึกวิธีประเมินไม่สำเร็จ";

/* สองตัวเลือกของทุกแถว — ค่าเป็นค่าคงที่ของโมดูลใบ · คำเป็นของโมดูลสลับวิธี */
const TARGET_OPTIONS = [
  { value: SURVEY_METHOD_ONSITE, label: SURVEY_METHOD_LABEL.onsite },
  { value: SURVEY_METHOD_DRAWING, label: SURVEY_METHOD_LABEL.drawing },
];
const LOCKED_OPTIONS = TARGET_OPTIONS.map((option) => ({ ...option, disabled: true }));

const isCutRow = (zone) => (zone?.status || "ok") === "cut";

/* ⭐ **บรรทัดผลของการกดวาดเป็นชิ้นที่ไม่ตัดบรรทัดข้างใน** — ตัวเลือกชิ้นตัวเดียวกับการ์ด (`surveyCardUnits`: ป้ายใน “…” · วงเล็บสั้น · "ฝ่ายขาย")
   + วันไทย "อ. 13 ต.ค." + คำของบรรทัดชุดนี้ที่ ICU ตัดกลาง
   🐞 UAT 26/10 (S06 · S08 · S09 · S10 ที่ 375): "แล้วกด “ส่ง / งาน”" · "ผู้วาง / คิว" · "รับปากส่งผล อ. / 13 ต.ค." · "ต้องลงหน้า / งานแล้ว" ·
      "จุดที่มาร์ / กจากแบบ" (ICU ตัด `มาร์|ก` = ไม่ใช่คำ) · "จุดติด / ตั้ง" — head-r3-12 แก้ชนิดนี้ไว้ที่การ์ดอย่างเดียว
   ⚠️ ตัวหนังสือไม่ถูกแตะ (nowrap ทั้งชิ้น) · ท่อนระหว่างชิ้นผ่าน `thaiText` กลางตามเดิม */
const OUTCOME_DAY = /(?:อา|จ|อ|พ|พฤ|ศ|ส)\. \d{1,2} [\u0E00-\u0E7F]{1,3}\.[\u0E00-\u0E7F]{1,2}\./gu;
const OUTCOME_WORDS = ["ผู้วางคิว", SURVEY_METHOD_LABEL.onsite, "จุดติดตั้ง", "มาร์ก"];
function outcomeText(line) {
  if (typeof line !== "string" || line.length < 2) return line;
  const kept = keepPhrases(line, surveyCardUnits(line, [...(line.match(OUTCOME_DAY) || []), ...OUTCOME_WORDS]));
  if (kept === line) return thaiText(line);
  return kept.map((part, index) => (typeof part === "string" ? <Fragment key={`t${index}`}>{thaiText(part)}</Fragment> : part));
}
const keyOf = (zone) => String(zone.id);

/**
 * เลขประจำ **การกดหนึ่งครั้ง** (`actionId`) — รูปที่ `surveyMethodActionId` ของ server รับ (ตัวอักษร/เลข/ขีด 8–64 ตัว)
 * ⚠️ `crypto.randomUUID` มีเฉพาะหน้าที่เปิดผ่าน https / localhost — เครื่องทดสอบที่เปิดผ่าน IP ในวงแลนไม่มี ⇒ ถอยไปสุ่มไบต์เอง
 *    (ไม่มี `crypto` เลย = เวลา + เลขสุ่ม — ยังไม่ซ้ำในทางปฏิบัติ และ server ผูกเลขนี้กับคนกดอีกชั้น)
 * ใช้ร่วมกับกล่อง "ตัดพื้นที่และยกเลิกนัด" ของหน้าใบประเมิน
 */
export function newSurveyActionId() {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues === "function") {
    return Array.from(source.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(12, "0");
}

/* ── บรรทัดผลของกล่อง "ตัดพื้นที่และยกเลิกนัด" ของหน้าใบประเมิน ตามวันส่งผลที่อยู่ในช่อง ─────────────────────────
   🐞 UAT S2b S08: บรรทัดที่ server ส่งมาพูดวันส่งผลของตอนเปิดกล่อง ("หัวหน้ารับปากส่งผล 13/10/2026") — หัวหน้าแก้ช่องวันเป็น 14 ต.ค.
      (หรือลบทิ้ง) บรรทัดยังพูด 13 ⇒ กล่องบอกวันที่มันจะไม่เขียน
   ⭐ บรรทัดของ server มาจาก `surveyMethodSwitchPlan` ตัวเดียวกับของโมดัลนี้ ⇒ ตอนเปิดกล่อง คิดแผนเดียวกันจากใบที่จอถืออยู่
      **แล้วเทียบกับบรรทัดของ server ทีละตัวอักษร** (`surveyFlipBasis`): ตรงกัน = คืนชุดอินพุตนั้นให้หน้าถือไว้ แล้วคิดบรรทัดใหม่เมื่อวัน
      ในช่องเปลี่ยน (`surveyFlipLinesAt`) · ไม่ตรง (ใบบนจอเก่ากว่าของ server) = `null` — กล่องพิมพ์บรรทัดของ server ตามเดิม ไม่เดาเอง
   ⚠️ อยู่ไฟล์นี้เพราะแผนของการสลับวิธีถูกเรียกจากจอได้ที่เดียว (ยาม `surveySheetDrawingScreen.test.mjs`: หน้าใบไม่เรียกแผนเอง)
   ⚠️ ฟังก์ชันล้วน · `input` = `{ rows, cut: { zoneId, to: 'cut' }, visit, request, sendBack, reason }` (อาร์กิวเมนต์ของแผน เว้นวันส่งผล) */
const planLines = (value) => (Array.isArray(value) ? value.filter((line) => typeof line === "string") : []);
export function surveyFlipLinesAt(input, resultDate) {
  return planLines(surveyMethodSwitchPlan({ ...input, resultDate: resultDate || "" }).lines);
}
export function surveyFlipBasis(input, flip) {
  const sent = planLines(flip?.lines);
  const mine = surveyFlipLinesAt(input, flip?.defaults?.resultDate);
  return mine.length === sent.length && mine.every((line, i) => line === sent[i]) ? input : null;
}

/**
 * กดตัวเลือกเหตุผลสำเร็จรูป → ข้อความใหม่ของช่องเหตุผล — **เติมคำ ไม่ทับของที่หัวหน้าพิมพ์** (ม็อก B2)
 *   ช่องว่าง หรือมีแค่คำของตัวเลือกอีกตัว            ⇒ เป็นคำของตัวเลือกนี้
 *   ขึ้นต้นด้วยคำของตัวเลือกนี้อยู่แล้ว               ⇒ ไม่เปลี่ยน
 *   ขึ้นต้นด้วย "คำของตัวเลือกอีกตัว — " (ท่อนที่ตัวเลือกเติมเอง) ⇒ สลับเฉพาะท่อนนั้น (ไม่ซ้อนสองคำนำ)
 *   นอกนั้น                                          ⇒ `คำ — ` นำหน้าของที่พิมพ์ไว้
 * ⚠️ ฟังก์ชันล้วน ไม่อ้างอะไรนอกอาร์กิวเมนต์ — เทสต์หยิบซอร์สไปรันตรง ๆ
 */
export function surveyReasonWithPreset(current, word, presets) {
  const text = String(current ?? "");
  const typed = text.trim();
  const others = (Array.isArray(presets) ? presets : []).filter((item) => item !== word);
  if (!typed || others.includes(typed)) return word;
  if (text.startsWith(word)) return text;
  const led = others.find((item) => text.startsWith(`${item} — `));
  if (led) return `${word}${text.slice(led.length)}`;
  return `${word} — ${text}`;
}

/**
 * คำตอบที่ไม่สำเร็จของเส้นสลับวิธี → จอต้องทำอะไร — แยกด้วย `code` / สถานะ **ไม่เทียบประโยค**
 *   `dead: true`  ใบไม่อยู่ในสภาพที่กล่องนี้บอกแล้ว: ถูกแก้จากที่อื่น (`stale`) · ส่งผลไปแล้ว (`sent`) · ไม่มีสิทธิ์ (403) ·
 *                 409 ที่ไม่มีรหัส (สวิตช์ถูกปิด · ยังไม่รับเรื่อง · ใบล็อก) ⇒ ทุกช่องดับ เหลือปุ่ม "ปิด" และหน้าใบอ่านใบใหม่
 *   `dead: false` ฟอร์มอยู่ครบ กดซ้ำได้: บันทึกไม่ครบ (`partial`) · ไม่มีอะไรเปลี่ยน (`nothing`) · ช่องผิด (400) · ฐานพัง (500) ·
 *                 ไม่ได้คำตอบ (ต่อไม่ติด) — กดซ้ำด้วย body เดิม = เลขการกดเดิม
 * ⚠️ ฟังก์ชันล้วน — เทสต์หยิบซอร์สไปรันตรง ๆ
 */
export function surveyMethodFailure(error) {
  const code = error?.data?.code ?? null;
  const status = error?.status ?? null;
  const dead = code === "stale" || code === "sent" || status === 403 || (status === 409 && !code);
  return { dead };
}

/**
 * (S2b แก้หลังตรวจจอ head-r3-52) คำขอปิดกล่องครั้งนี้ต้องถูกเมิน — `true` เมื่อมาจากปุ่ม Esc **และ** กล่องถือของที่หัวหน้ากรอกไว้
 *   🐞 เลือกพื้นที่และพิมพ์เหตุผลไว้แล้ว กด Esc พลาดครั้งเดียว กล่องปิดและของที่กรอกหายหมดโดยไม่ถาม
 *   ⇒ ของค้างอยู่ = ปิดได้ด้วยการกดที่ตั้งใจเท่านั้น ("ปิด" · กากบาท) · ไม่มีอะไรค้าง = Esc ปิดได้ตามเดิม · ไม่มีกล่องถามซ้ำ (ไม่มีคำใหม่)
 * ⚠️ ฟังก์ชันล้วน — เทสต์หยิบซอร์สไปรันตรง ๆ
 */
export function surveyMethodEscapeKeeps({ viaEscape = false, dirty = false } = {}) {
  return viaEscape === true && dirty === true;
}

/**
 * (S2b แก้หลังตรวจจอ head-r3-5) ระยะที่ต้องเลื่อนเนื้อลง (px) เมื่อช่องวันส่งผลเพิ่งโผล่ — เลื่อนเท่าที่ต้องให้ช่องขึ้นจอพร้อมที่ว่างด้านล่าง
 * (`block: "nearest"` + `room`) แล้ว **ไม่เลื่อนจนขอบบนของแถวที่เพิ่งเปลี่ยนพ้นขอบบนของเนื้อ**
 *   🐞 เดิมเลื่อนให้เห็นทั้งช่องเสมอ — บนมือถือแถวที่เพิ่งเปลี่ยนและปุ่มที่เพิ่งกดหลุดจากจอ หัวหน้ามองไม่เห็นผลของสิ่งที่เพิ่งกด
 *      และช่องวันไปชิดขอบท้ายเนื้อ ⇒ แถวที่เพิ่งกดสำคัญกว่า (กล่อง "กดแล้วเกิดขึ้นทันที" ในแถบท้ายพูดวันส่งผลอยู่แล้ว)
 *   🐞 (S2b แก้หลังตรวจจอ head-r3-5 · ตรวจรอบสอง) เลื่อนถึงเพดานแล้วช่องยังไม่ขึ้นจอ (มือถือ 375 กด "ทั้งใบ: ประเมินจากแบบ" — ช่องอยู่ใต้ขอบราว 500px)
 *      = เลื่อนไปก็ไม่ได้อะไรสักอย่าง: ช่องไม่โผล่ ส่วนปุ่มที่เพิ่งกดกับแถวแรกหลุดจอ ⇒ ไม่เลื่อนเลย
 *      (ช่องที่ยังว่างพาขึ้นจอเองตอนกดปุ่มหลัก · วันที่เติมให้ขึ้นในกล่อง "กดแล้วเกิดขึ้นทันที")
 * @param view    `{ top, bottom }` ของเนื้อที่เลื่อน (`.drawer-body`) · @param target ช่องวัน · @param anchor แถวที่เพิ่งเปลี่ยน (`null` = ไม่ยึด)
 * @param peek    ส่วนของช่องที่ต้องขึ้นจอจึงนับว่า "ช่องโผล่แล้ว" (ตัวช่องกรอกวันพร้อมค่าที่เติมให้) — ไม่ส่ง = ทั้งช่อง
 * @param room    ที่ว่างใต้ช่อง (px — `scroll-margin-bottom` ของช่อง)
 * ⚠️ ฟังก์ชันล้วน — เทสต์หยิบซอร์สไปรันตรง ๆ
 */
export function surveyRevealScroll({ view, target, peek = target, anchor = null, room = 0 }) {
  const need = target.bottom + room - view.bottom;
  if (!(need > 0)) return 0;
  if (!anchor) return need;
  const by = Math.max(0, Math.min(need, anchor.top - view.top));
  return peek.bottom - by <= view.bottom ? by : 0;
}

/**
 * @param open       เปิดโมดัล — ปิดแล้วฟอร์มถูกล้าง (เปิดใหม่ = เริ่มจากวิธีที่บันทึกอยู่ · เลขการกดใหม่)
 * @param requestId  id ของใบประเมิน
 * @param request    แถวคำร้องของ GET (แผนอ่านวันส่งผลที่รับปากไว้ · เลขที่ใบ)
 * @param zones      แถวพื้นที่ทุกแถวของ GET (รวมที่ตัด — แผนต้องเห็นครบ · รายการในกล่องโชว์เฉพาะที่ยังอยู่ในใบ)
 * @param visit      นัดของใบจาก GET (ตัวที่ยังเปิดก่อน) · @param sendBack  สภาพเรื่องส่งกลับของ GET
 * @param siteReached `siteVisitReached` ของ GET — ใบมีนัดที่เข้าพื้นที่แล้วสักนัดไหม (route ถามฐานเรื่องเดียวกันเอง) · `null` = อ่านไม่สำเร็จ
 * @param subtitle   บรรทัดบริบทใต้ชื่อ ("RQ-… · ไซต์ · นัด SV-… วัน") — หน้าใบประกอบจากหัวงาน
 * @param onClose    ปิดโดยไม่บันทึก
 * @param onDone     `({ already, plan, reload: true })` — บันทึกสำเร็จ: หน้าใบปิดกล่อง · toast · อ่านใบใหม่ (ไม่วาดจากคำตอบ)
 * @param onStale    ใบไม่อยู่ในสภาพที่กล่องบอกแล้ว — ขอให้หน้าใบอ่านใบใหม่เบื้องหลัง **โดยกล่องยังเปิด** (กล่องเหลือปุ่ม "ปิด")
 */
export default function SurveyMethodDialog({
  open, requestId, request, zones, visit, siteReached = null, sendBack, subtitle,
  onClose, onDone, onStale,
}) {
  /* `targets` = เฉพาะพื้นที่ที่หัวหน้าเลือกให้ **ต่างจากวิธีที่บันทึกอยู่** (id → วิธีเป้า) — ไม่ใช่สำเนาวิธีของทุกแถว:
     หน้าใบอ่านใบใหม่ทันทีที่กล่องเปิด ⇒ ถ้าถือสำเนาของแถวตอนเปิด พื้นที่ที่อีกคนเพิ่งสลับจะโผล่เป็น "การเปลี่ยน" ที่หัวหน้าไม่ได้เลือก */
  const [targets, setTargets] = useState({});
  const [reason, setReason] = useState("");
  const [resultDate, setResultDate] = useState("");
  const [error, setError] = useState("");
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  /* กดปุ่มหลักไปแล้วอย่างน้อยครั้งหนึ่ง — ช่องที่ติดขึ้นขอบแดงหลังจากนี้ (ไม่แดงตั้งแต่เปิดกล่อง) */
  const [tried, setTried] = useState(false);
  /* แถวชุดที่ส่งไปกับการกดครั้งแรก — ถือไว้จนปิดกล่อง (ดูหัวไฟล์) */
  const [held, setHeld] = useState(null);
  /* body ที่ส่งล่าสุดกับเลขการกดของมัน — body เดิม = เลขเดิม · ต่างไป = เลขใหม่ */
  const sent = useRef({ key: null, id: null });
  const prefilled = useRef({ reason: false, date: false });
  const firstTarget = useRef(null);
  const primaryRef = useRef(null);
  const closeRef = useRef(null);
  const footRef = useRef(null);
  const reasonBoxRef = useRef(null);
  const dateBoxRef = useRef(null);
  /* รายการพื้นที่ (`<ol>`) และแถวที่หัวหน้าเพิ่งกด — ตัวยึดของการเลื่อนตอนช่องวันโผล่ (head-r3-5) */
  const rowsNode = useRef(null);
  const pressedRow = useRef(null);
  /* คำขอปิดที่มาจากปุ่ม Esc — ตั้งก่อน `Modal` เห็นปุ่ม (ฟังช่วงจับ) แล้วล้างหลังจบเหตุการณ์นั้น (head-r3-52) */
  const escapeRef = useRef(false);
  /* นับครั้งที่กดปุ่มหลักตอนยังติดด่าน — แต่ละครั้งพาช่องที่ติดขึ้นจอ (ดู effect ข้างล่าง) */
  const [blockedPress, setBlockedPress] = useState(0);
  const reasonId = useId();
  const reasonLabelId = useId();
  const dateId = useId();
  const blockedId = useId();

  /* ปิดกล่อง = ล้างทั้งฟอร์ม (ล้างตอนปิด ไม่ใช่ตอนเปิด — เปิดรอบหน้าต้องสะอาดตั้งแต่เฟรมแรก) */
  useEffect(() => {
    if (open) return;
    setTargets({});
    setReason("");
    setResultDate("");
    setError("");
    setDead(false);
    setBusy(false);
    setTried(false);
    setHeld(null);
    pressedRow.current = null;
    sent.current = { key: null, id: null };
    prefilled.current = { reason: false, date: false };
  }, [open]);

  const source = held || { zones, visit, siteReached, request, sendBack };
  const rows = Array.isArray(source.zones) ? source.zones.filter((zone) => zone?.id != null) : [];
  const active = rows.filter((zone) => !isCutRow(zone));
  const targetOf = (zone) => targets[keyOf(zone)] ?? zoneMethod(zone);
  const changes = active
    .filter((zone) => targetOf(zone) !== zoneMethod(zone))
    .map((zone) => ({ zoneId: keyOf(zone), method: targetOf(zone) }));
  /* 🔑 ฟังก์ชันเดียวกับที่ route เรียก — ผลลัพธ์บนจอ = สิ่งที่ถูกเขียน */
  const plan = surveyMethodSwitchPlan({
    rows, changes, visit: source.visit, siteReached: source.siteReached, request: source.request, sendBack: source.sendBack,
    reason, resultDate,
  });
  const locked = busy || dead;

  /* ค่าตั้งต้นของสองช่อง — เติมให้ **ครั้งเดียว** ต่อการเปิดหนึ่งรอบ และเฉพาะตอนช่องยังว่าง (ลบทิ้งแล้วไม่เติมซ้ำ)
     · เหตุผลของ "ยกเลิกนัดอย่างเดียว" (ใบจากแบบทั้งใบที่ยังมีนัดค้าง) · วันส่งผลที่ใบรับปากไว้แล้ว */
  const planKind = plan.kind;
  const defaultReason = plan.defaults.reason;
  useEffect(() => {
    if (!open || planKind !== "cancel-only" || prefilled.current.reason) return;
    prefilled.current.reason = true;
    setReason((text) => (text === "" ? defaultReason : text));
  }, [open, planKind, defaultReason]);
  const needsDate = plan.needs.resultDate;
  const defaultDate = plan.defaults.resultDate;
  useEffect(() => {
    if (!open || !needsDate || prefilled.current.date) return;
    prefilled.current.date = true;
    setResultDate((value) => (value === "" ? defaultDate : value));
  }, [open, needsDate, defaultDate]);

  /* 🐞 UAT S2b S06 / S08: ช่อง "วันที่จะส่งผลประเมิน" โผล่ **ใต้ขอบล่างของเนื้อที่เลื่อน** (กล่องผลอยู่ในแถบท้ายที่นิ่ง เนื้อจึงเตี้ย)
     — หัวหน้ากด "ทั้งใบ: ประเมินจากแบบ" แล้วบันทึกวันที่ระบบเติมให้ได้โดยไม่เคยเห็นช่อง ⇒ ช่องโผล่เมื่อไร เลื่อนเนื้อให้ช่องขึ้นจอ
     (ไม่ย้ายโฟกัส: หัวหน้ายังอยู่ที่ปุ่มที่เพิ่งกด)
     🐞 (S2b แก้หลังตรวจจอ head-r3-5) เดิม `scrollIntoView({ block: "nearest" })` ทั้งช่อง — บนมือถือแถวที่เพิ่งเปลี่ยนกับปุ่มที่เพิ่งกดหลุดจากจอ
        ⇒ เลื่อนเท่าที่ต้อง + ที่ว่างใต้ช่อง (`scroll-margin-bottom` ของช่อง) แต่ไม่พ้นแถวที่เพิ่งเปลี่ยน (`surveyRevealScroll`)
        · ถึงเพดานแล้วตัวช่องกรอกวันยังไม่ขึ้นจอ = ไม่เลื่อนเลย
        แถวยึด = แถวที่เพิ่งกด (ยังอยู่ในรายการ) · กดทางลัดทั้งใบ = แถวที่เปลี่ยน **แถวแรก**
        🐞 (head-r3-5 · ตรวจรอบสอง) เดิมยึดแถวที่เปลี่ยนแถวสุดท้าย — ทางลัดเปลี่ยนทุกแถวในการกดเดียว ยึดแถวท้ายจึงพาปุ่มที่เพิ่งกดกับแถวแรก ๆ
           หลุดจอ · ทุกแถวที่ทางลัดเปลี่ยนคือ "แถวที่เพิ่งเปลี่ยน" ⇒ เพดานต้องเป็นของแถวบนสุด */
  useEffect(() => {
    if (!open || !needsDate) return;
    const box = dateBoxRef.current;
    const view = box?.closest(".drawer-body");
    if (!box || !view) return;
    const list = rowsNode.current;
    const pressed = list && pressedRow.current && list.contains(pressedRow.current) ? pressedRow.current : null;
    const anchor = pressed || list?.querySelector("li[data-changed]") || null;
    const by = surveyRevealScroll({
      view: view.getBoundingClientRect(),
      target: box.getBoundingClientRect(),
      peek: (box.querySelector(".date-input-wrap") || box).getBoundingClientRect(),
      anchor: anchor ? anchor.getBoundingClientRect() : null,
      room: parseFloat(getComputedStyle(box).scrollMarginBottom) || 0,
    });
    if (by > 0) view.scrollBy({ top: by });
  }, [open, needsDate]);

  /* กดปุ่มหลักตอนยังติดด่าน = พาช่องแรกที่ติดขึ้นจอและรับโฟกัส (เหตุผลก่อน แล้ววันส่งผล — ลำดับบนจอ)
     🐞 เดิมมีแค่ toast + ขอบแดง: ช่องที่แดงอยู่ใต้ขอบล่างของเนื้อ หัวหน้าถูกบอกให้กรอกช่องที่ไม่อยู่บนจอ
     ⚠️ เดินหลังเรนเดอร์ของการกด (ขอบแดงและประโยคใต้ช่องขึ้นแล้ว) · ไม่มีช่องไหนติด (ยังไม่ได้เปลี่ยนพื้นที่ไหน) = ไม่ทำอะไร */
  const stuckField = surveyMethodErrorTexts(plan.errors);
  const stuckReason = !!stuckField.reason;
  const stuckDate = !!stuckField.resultDate;
  useEffect(() => {
    if (!blockedPress) return;
    const box = stuckReason ? reasonBoxRef.current : stuckDate ? dateBoxRef.current : null;
    if (!box) return;
    box.scrollIntoView({ block: "nearest" });
    box.querySelector("textarea:not([disabled]), input:not([disabled])")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เดินครั้งเดียวต่อการกดหนึ่งครั้ง ไม่เดินตามที่พิมพ์
  }, [blockedPress]);

  /* ล้มแล้วปุ่มที่เพิ่งกดถูกดับระหว่างรอ ⇒ โฟกัสหล่นไป body — คืนให้ปุ่มในกล่อง (เฉพาะตอนโฟกัสหลุดออกนอกกล่องจริง) */
  useEffect(() => {
    if (!open || !error || busy) return;
    const dialog = footRef.current?.closest('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) {
      (closeRef.current || primaryRef.current)?.focus({ preventScroll: true });
    }
  }, [open, error, busy, dead]);

  /* โฟกัสแรก = ตัวเลือกของพื้นที่แรก (ไม่ใช่กากบาทปิด) — `Modal` อ่าน ref นี้ตอนเปิด · รายการถูกวาดก่อน effect ของมันเดิน */
  const rowsRef = useCallback((node) => {
    rowsNode.current = node;
    firstTarget.current = node ? node.querySelector('button[role="radio"]:not([disabled])[tabindex="0"]') : null;
  }, []);
  /* แถวที่หัวหน้าเพิ่งกด (เมาส์ / นิ้ว / ลูกศรของแถบเลือก) — จำไว้ให้ตัวเลื่อนของช่องวันยึด (head-r3-5)
     กดนอกแถว (ทางลัดทั้งใบ) = ไม่มีแถว ⇒ ตัวเลื่อนยึดแถวที่เปลี่ยนแถวแรก */
  const notePress = (event) => {
    pressedRow.current = event.target instanceof Element ? event.target.closest("li") : null;
  };

  /* Esc ผ่าน `Modal` มาทาง `onClose` ทางเดียวกับกากบาท — แยกด้วยการฟัง keydown **ช่วงจับ** ที่ document (เดินก่อนตัวฟังของ `Modal`)
     แล้วล้างหลังเหตุการณ์นั้นจบ (`setTimeout` — microtask ล้างก่อนตัวฟังของ `Modal` จะเดิน) · ไม่แก้ `Modal` ของกลาง (head-r3-52) */
  useEffect(() => {
    if (!open) return undefined;
    const mark = (event) => {
      if (event.key !== "Escape") return;
      escapeRef.current = true;
      setTimeout(() => { escapeRef.current = false; }, 0);
    };
    document.addEventListener("keydown", mark, true);
    return () => document.removeEventListener("keydown", mark, true);
  }, [open]);

  const pick = (zone, to) => setTargets((prev) => {
    const next = { ...prev };
    if (to === zoneMethod(zone)) delete next[keyOf(zone)];
    else next[keyOf(zone)] = to;
    return next;
  });
  const setAll = (to) => setTargets(
    Object.fromEntries(active.filter((zone) => zoneMethod(zone) !== to).map((zone) => [keyOf(zone), to])),
  );
  const fillReason = (word) => setReason((text) => surveyReasonWithPreset(text, word, SURVEY_METHOD_REASON_CHIPS));

  /* ของที่หัวหน้ากรอกค้างในกล่อง — พื้นที่ที่เลือกเปลี่ยน หรือเหตุผลที่พิมพ์ (เหตุผลที่ระบบเติมให้ของ "ยกเลิกนัดอย่างเดียว" ไม่นับ)
     ⚠️ ใบไม่อยู่ในสภาพที่กล่องบอกแล้ว (`dead` — ทุกช่องดับ เหลือปุ่ม "ปิด") = ไม่มีอะไรให้ถือไว้ ⇒ Esc ปิดได้
        (S2b แก้หลังตรวจจอ head-r3-52 · ตรวจรอบสอง: ของที่กรอกยังค้างในสถานะ แต่บันทึกจากกล่องนี้ไม่ได้อีกแล้ว — กด Esc แล้วเงียบ คนใช้แป้นต้องไล่ Tab หาปุ่ม) */
  const dirty = !dead && (changes.length > 0 || (reason.trim() !== "" && reason !== defaultReason));
  const close = () => {
    if (busy) return;
    if (surveyMethodEscapeKeeps({ viaEscape: escapeRef.current, dirty })) return;
    onClose?.();
  };

  const submit = async () => {
    if (locked) return;
    const body = {
      changes,
      reason: reason.trim(),
      seenMix: plan.before.mix,
      ...(plan.needs.resultDate ? { committedResultDate: resultDate } : {}),
      ...(plan.visit.action === "cancel" ? { cancelVisitId: String(plan.visit.id) } : {}),
    };
    const key = JSON.stringify(body);
    if (sent.current.key !== key) sent.current = { key, id: newSurveyActionId() };
    setHeld(source);
    setBusy(true);
    setError("");
    try {
      const res = await apiJson(`/api/service/surveys/${requestId}/method`, {
        method: "POST", json: { ...body, actionId: sent.current.id }, retry: true, fallbackError: SAVE_FAILED,
      });
      onDone?.({ already: res?.already === true, plan: res?.plan || { kind: plan.kind }, reload: true });
    } catch (e) {
      setError(e.message || SAVE_FAILED);
      if (surveyMethodFailure(e).dead) {
        setDead(true);
        onStale?.();
      }
    } finally {
      setBusy(false);
    }
  };

  /* เหตุที่ปุ่มหลักยังไม่ไป = ของแผน (ยังไม่ได้เปลี่ยนพื้นที่ไหน · เหตุผลสั้น/ยาวเกิน · ยังไม่ระบุวัน)
     ช่องไหนติดก็ถามจากลิสต์เดียวกัน (ค่าคงที่ตัวเดียวกับที่แผนใส่) ไม่เขียนกติกาซ้ำที่นี่ */
  const blocker = plan.disabledReason || plan.errors.join(" · ");
  const fieldErrors = surveyMethodErrorTexts(plan.errors);
  /* (S2b แก้หลังตรวจจอ head-r3-4) กดปุ่มหลัก: ผ่าน = บันทึก · ติดด่าน = ไม่ยิง ไม่มี toast — เหตุอยู่ในกล่องที่เดียว
     ช่องที่ติดขึ้นขอบแดง + ประโยคใต้ช่อง (และพาช่องขึ้นจอ — effect ของ `blockedPress`) · เหตุที่ไม่ใช่ของช่องไหน = ประโยคใต้ปุ่ม (`blockedNote`) */
  const press = () => {
    setTried(true);
    if (blocker) {
      setBlockedPress((n) => n + 1);
      return;
    }
    submit();
  };
  /* ประโยคใต้ปุ่มหลัก — เฉพาะเหตุระดับแผน (ยังไม่ได้เปลี่ยนพื้นที่ไหน · ใบถูกแก้จากที่อื่น) หลังกดแล้ว · เหตุของช่องอยู่ใต้ช่องของมันแล้ว */
  const blockedNote = tried && !dead ? plan.disabledReason : null;
  /* เหตุผลยาวเกิน = บอกทันที ไม่รอให้กดปุ่มหลัก: ตัวเลือกสำเร็จรูปเติมคำนำหน้าได้จนเกินเพดาน (ช่องเองพิมพ์เกินไม่ได้) —
     ไม่บอกตรงนี้ หัวหน้าจะเจอช่องที่ "พิมพ์เพิ่มไม่ได้ ลบได้อย่างเดียว" โดยไม่รู้เหตุ */
  const reasonOver = reason.trim().length > SURVEY_METHOD_REASON_MAX;
  const reasonError = (tried || reasonOver) ? fieldErrors.reason : null;
  const dateError = tried ? fieldErrors.resultDate : null;
  const mix = plan.after.mix;
  const countsText = `${fmtNumber(mix.onsite + mix.drawing)} พื้นที่ · ${SURVEY_METHOD_CHIP.onsite} ${fmtNumber(mix.onsite)} · ${SURVEY_METHOD_CHIP.drawing} ${fmtNumber(mix.drawing)}`;

  /* ข้อความล้มเหลว + ปุ่ม อยู่ในแถบท้ายที่นิ่ง (ไม่จมไปกับรายการพื้นที่ที่เลื่อน) · ใบถูกแก้จากที่อื่น = ปุ่มเดียว "ปิด" */
  const footer = (
    <div className={styles.foot} ref={footRef}>
      {/* ── ผลของการกด — ทุกบรรทัดมาจากแผน · ที่ห่ออยู่เสมอให้โปรแกรมอ่านจอประกาศตอนบรรทัดเปลี่ยน · ไม่มีบรรทัด = ไม่มีกล่อง
             ใบไม่อยู่ในสภาพที่กล่องบอกแล้ว (`dead`) = ไม่มีกล่อง: ไม่มีปุ่มไหนทำตามบรรทัดพวกนี้ได้อีก ── */}
      <div className={styles.live} aria-live="polite">
        {!dead && plan.lines.length ? (
          <div className={styles.outcome}>
            <p className={styles.outcomeTitle}>กดแล้วเกิดขึ้นทันที</p>
            <ul className={styles.outcomeList}>
              {plan.lines.map((line) => <li key={line}>{outcomeText(line)}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
      {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
      <div className={styles.footBtns}>
        {dead ? (
          <Button ref={closeRef} tone="primary" onClick={close}>ปิด</Button>
        ) : (
          <>
            {/* (S2b แก้หลังตรวจจอ head-r3-1) ปุ่มปิดกล่องคือ "ปิด" ทุกรูปของกล่อง — "ยกเลิก" ติดกับปุ่มหลัก "ยกเลิกนัด" กดผิดปุ่มเดียว
                นัดหายและช่างได้รับแจ้ง · คำเดียวกับปุ่มของสภาพ `dead` · ไม่สลับคำตามรูป (ปุ่มเดิมไม่เปลี่ยนชื่อไปมาตอนกดไทล์) */}
            <Button variant="quiet" onClick={close} disabled={busy}>ปิด</Button>
            <Button
              ref={primaryRef}
              tone="primary"
              onClick={press}
              disabled={busy}
              aria-busy={busy || undefined}
              aria-describedby={blockedNote ? blockedId : undefined}
            >
              {busy ? "กำลังบันทึก…" : plan.confirmLabel}
            </Button>
          </>
        )}
      </div>
      {blockedNote ? <p className={styles.blocked} id={blockedId} role="alert">{blockedNote}</p> : null}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={SURVEY_METHOD_MODAL_TITLE}
      subtitle={subtitle || undefined}
      size="md"
      sheetOnPhone
      dismissible={!busy}
      initialFocusRef={firstTarget}
      footer={footer}
    >
      <div className={styles.body}>
        {/* ── พื้นที่ทุกแถวที่ยังอยู่ในใบ + ทางลัดทั้งใบ ── */}
        <section className={styles.zones} aria-label={SURVEY_METHOD_MODAL_TITLE} onClickCapture={notePress} onKeyDownCapture={notePress}>
          <div className={styles.zonesHead}>
            <p className={styles.counts}>{countsText}</p>
            <div className={styles.shortcuts}>
              {/* ปุ่มมีขอบ (พื้นโปร่ง) ตามม็อก B2 — ปุ่มไร้ขอบบนแถบนี้อ่านเป็นข้อความต่อจากตัวนับที่อยู่ข้าง ๆ ไม่ใช่ของที่กดได้ */}
              <Button variant="outline" className={styles.shortcut} disabled={locked}
                onClick={() => setAll(SURVEY_METHOD_ONSITE)}>
                {SURVEY_METHOD_SHORTCUTS.onsite}
              </Button>
              <Button variant="outline" className={styles.shortcut} disabled={locked}
                onClick={() => setAll(SURVEY_METHOD_DRAWING)}>
                {SURVEY_METHOD_SHORTCUTS.drawing}
              </Button>
            </div>
          </div>
          <ol className={styles.rows} ref={rowsRef}>
            {active.map((zone, index) => {
              const title = surveyZoneTitle(zone);
              const target = targetOf(zone);
              const changed = target !== zoneMethod(zone);
              return (
                <li key={keyOf(zone)} className={styles.row} data-changed={changed ? "" : undefined}>
                  <span className={styles.num} aria-hidden="true">{index + 1}</span>
                  <div className={styles.name}>
                    <span className={styles.title}>{title}</span>
                    <span className={styles.sub}>
                      <span className={styles.code}>{naText(zone.zoneCode)}</span>
                      {/* แถวที่เลือกต่างจากที่บันทึกอยู่ — บอกด้วยคำ ไม่ใช่แถบสีอย่างเดียว (WCAG 1.4.1) */}
                      {changed ? (
                        <span className={styles.unsaved}>
                          <PencilLine size={12} aria-hidden="true" />
                          ยังไม่บันทึก
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Segmented
                    className={styles.seg}
                    selection="radio"
                    value={target}
                    onChange={(to) => pick(zone, to)}
                    options={locked ? LOCKED_OPTIONS : TARGET_OPTIONS}
                    ariaLabel={`วิธีประเมินของ ${title}`}
                  />
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── เหตุผล (ฝ่ายขายจะเห็น) — ตัวเลือกสำเร็จรูปเติมคำให้ ไม่ทับของที่พิมพ์ ── */}
        <div className={styles.field} ref={reasonBoxRef}>
          <label className={styles.label} id={reasonLabelId} htmlFor={reasonId}>
            {SURVEY_METHOD_REASON_LABEL}<span className="required-mark" aria-hidden="true"> *</span>
          </label>
          <div className={`choice-chips ${styles.presets}`} role="group" aria-labelledby={reasonLabelId}>
            {SURVEY_METHOD_REASON_CHIPS.map((word) => {
              const on = reason.startsWith(word);
              return (
                <button
                  key={word}
                  type="button"
                  className="choice-chip"
                  aria-pressed={on}
                  data-on={on ? "1" : undefined}
                  disabled={locked}
                  onClick={() => fillReason(word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <Textarea
            id={reasonId}
            touch
            value={reason}
            maxLength={SURVEY_METHOD_REASON_MAX}
            disabled={locked}
            invalid={!!reasonError}
            aria-describedby={`${reasonId}-meta`}
            required
            autoComplete="off"
            onChange={(event) => setReason(event.target.value)}
          />
          {/* เหตุของขอบแดง (ซ้าย) + ตัวนับตัวอักษร (ขวา) — ตัวนับนับแบบเดียวกับแผน (ตัดช่องว่างหัวท้าย) */}
          <div className={styles.fieldMeta} id={`${reasonId}-meta`}>
            {reasonError ? <span className={styles.fieldError} role="alert">{reasonError}</span> : <span />}
            <span className={styles.count} data-over={reasonOver ? "" : undefined}>
              {fmtNumber(reason.trim().length)}/{fmtNumber(SURVEY_METHOD_REASON_MAX)}
            </span>
          </div>
        </div>

        {/* ── วันที่จะส่งผลประเมิน — เฉพาะตอนใบกลายเป็นงานประเมินจากแบบทั้งใบ (แผนเป็นคนบอก) · อยู่ใต้ตัวที่ทำให้มันโผล่ ── */}
        {plan.needs.resultDate ? (
          <div className={styles.field} ref={dateBoxRef}>
            <label className={styles.label} htmlFor={dateId}>
              {SURVEY_METHOD_RESULT_DATE_LABEL}<span className="required-mark" aria-hidden="true"> *</span>
            </label>
            <DateInput
              id={dateId}
              value={resultDate}
              onChange={setResultDate}
              required
              weekday
              disabled={locked}
              invalid={!!dateError}
              aria-describedby={dateError ? `${dateId}-error` : undefined}
            />
            {dateError ? <p className={styles.fieldError} id={`${dateId}-error`} role="alert">{dateError}</p> : null}
          </div>
        ) : null}

      </div>
    </Modal>
  );
}
