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
// ⚠️ **ไม่มีอะไรถูกบันทึกจนกว่าจะกดปุ่มหลัก** (กฎจอตัดสินใจ: ไม่มี auto-save) · ปุ่มหลักเป็น `GatedAction` — ติดด่านข้อมูล = กดได้
//    แล้วบอกเหตุ + ช่องที่ติดขึ้นขอบแดง **พร้อมประโยคของเหตุใต้ช่อง** (toast หายไปเอง ขอบแดงที่ไม่มีคำอธิบายอยู่ไม่ได้) ไม่ใช่ปุ่มจาง
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
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PencilLine } from "lucide-react";
import Modal from "@/components/Modal";
import thaiText from "@/components/ThaiText";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import GatedAction from "@/components/ui/GatedAction";
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

const SAVE_FAILED = "บันทึกวิธีประเมินไม่สำเร็จ";

/* สองตัวเลือกของทุกแถว — ค่าเป็นค่าคงที่ของโมดูลใบ · คำเป็นของโมดูลสลับวิธี */
const TARGET_OPTIONS = [
  { value: SURVEY_METHOD_ONSITE, label: SURVEY_METHOD_LABEL.onsite },
  { value: SURVEY_METHOD_DRAWING, label: SURVEY_METHOD_LABEL.drawing },
];
const LOCKED_OPTIONS = TARGET_OPTIONS.map((option) => ({ ...option, disabled: true }));

const isCutRow = (zone) => (zone?.status || "ok") === "cut";
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
  /* นับครั้งที่กดปุ่มหลักตอนยังติดด่าน — แต่ละครั้งพาช่องที่ติดขึ้นจอ (ดู effect ข้างล่าง) */
  const [blockedPress, setBlockedPress] = useState(0);
  const reasonId = useId();
  const reasonLabelId = useId();
  const dateId = useId();

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
     — หัวหน้ากด "ทั้งใบ: ประเมินจากแบบ" แล้วบันทึกวันที่ระบบเติมให้ได้โดยไม่เคยเห็นช่อง ⇒ ช่องโผล่เมื่อไร เลื่อนเนื้อให้เห็นทั้งช่อง
     (`nearest` = เลื่อนเท่าที่ต้องเลื่อน · ไม่ย้ายโฟกัส: หัวหน้ายังอยู่ที่ปุ่มที่เพิ่งกด) */
  useEffect(() => {
    if (!open || !needsDate) return;
    dateBoxRef.current?.scrollIntoView({ block: "nearest" });
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
    firstTarget.current = node ? node.querySelector('button[role="radio"]:not([disabled])[tabindex="0"]') : null;
  }, []);

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

  const close = () => { if (!busy) onClose?.(); };

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

  /* เหตุที่ปุ่มหลักยังไม่ไป = ของแผน (ยังไม่ได้เปลี่ยนพื้นที่ไหน · เหตุผลสั้น/ยาวเกิน · ยังไม่ระบุวัน) — กดแล้วบอกเป็น toast
     ช่องไหนติดก็ถามจากลิสต์เดียวกัน (ค่าคงที่ตัวเดียวกับที่แผนใส่) ไม่เขียนกติกาซ้ำที่นี่ */
  const blocker = plan.disabledReason || plan.errors.join(" · ");
  const fieldErrors = surveyMethodErrorTexts(plan.errors);
  /* กดปุ่มหลักตอนติดด่าน → นับ (ตัวฟังของปุ่มเอง — `GatedAction` ไม่เรียก `onClick` ตอนติดด่าน และ `onClickCapture` ของมันมีงานเดียว) */
  const blockerRef = useRef("");
  useEffect(() => { blockerRef.current = blocker; });
  useEffect(() => {
    const button = primaryRef.current;
    if (!open || !button) return undefined;
    const count = () => { if (blockerRef.current) setBlockedPress((n) => n + 1); };
    button.addEventListener("click", count);
    return () => button.removeEventListener("click", count);
  }, [open, dead]);
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
              {plan.lines.map((line) => <li key={line}>{thaiText(line)}</li>)}
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
            <Button variant="quiet" onClick={close} disabled={busy}>ยกเลิก</Button>
            <GatedAction
              ref={primaryRef}
              tone="primary"
              blocker={blocker}
              /* กดทุกครั้ง (ผ่านหรือติดด่าน) = เริ่มโชว์ช่องที่ติด — `GatedAction` ไม่เรียก `onClick` ตอนติดด่าน */
              onClickCapture={() => setTried(true)}
              onClick={submit}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? "กำลังบันทึก…" : plan.confirmLabel}
            </GatedAction>
          </>
        )}
      </div>
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
        <section className={styles.zones} aria-label={SURVEY_METHOD_MODAL_TITLE}>
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
