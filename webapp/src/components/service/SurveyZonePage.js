"use client";
// ── หน้าพื้นที่หนึ่งพื้นที่ของจอหน้างาน (แผน §10.5 จอหน้างานแบบ A · ม็อก A-2 · A-3 · AT-2 · AT-3 · AW-1/2 · AO-1) ──
//
// ⭐ **ช่างยืนหน้างาน ถือมือถือ อีกมือถือตลับเมตร** ⇒ หน้าหนึ่งทำพื้นที่เดียว เรียงตามงานในห้อง:
//   ① ขนาด (ก × ย × ส รายส่วน) → ② ภาพกว้าง → ③ จุดที่ติดตั้งได้ (+ ภาพจุด ไม่บังคับ) → ④ หมายเหตุพื้นที่
//   แล้ว "บันทึกพื้นที่นี้" กับ "ถัดไป" อยู่ที่ท้ายหน้าที่ติดขอบล่าง (หลบเมื่อแป้นพิมพ์บนจอขึ้น — `data-osk-hide`)
//   🔄 เดิมคือ `SurveyZoneCard` (การ์ดพับได้ในลิสต์ยาว · 1.7 จอต่อพื้นที่ว่าง) — ย้ายชื่อเพราะไม่ใช่การ์ดแล้ว
//      โค้ดร่าง/ลายเซ็น/รับแถวใหม่/ชนกัน **ยกมาทั้งชุด** (พิสูจน์ในงานจริงแล้ว) · เหลือตัวตัดสินชนกันที่ `surveyDraftSync`
//
// ⭐ **สองผิว หนึ่งเนื้อ** (`layout`) — "page" = หน้าเต็มจอบนมือถือ/แท็บเล็ตแนวตั้ง (แถบกรมท่า + h1 ซ่อนตา) ·
//   "pane" = บานขวาของสองบาน (≥1000) · เปลี่ยนแค่หัว **เนื้อเหมือนกันทุกไบต์** ⇒ หมุนแท็บเล็ตแล้วหน้าไม่ถูกสร้างใหม่
//   (หน้าเป็นคนถือ key ของหน้านี้ — เปลี่ยนเฉพาะตอนย้ายพื้นที่หรือทิ้งร่าง)
//
// ⭐ **สองกฎการบันทึกต้องเห็นต่างกัน** (pain B3) — รูปขึ้นระบบทันที ("ขึ้นแล้ว n รูป" · ไม่มีปุ่มบันทึก) ·
//   ตัวเลข/จุด/หมายเหตุรอปุ่ม ("ยังไม่บันทึก" สีอำพันต่อหัวข้อ) · ติ๊กเขียวให้เฉพาะของที่ลงฐานแล้ว (`surveyZoneSections`)
// ⚠️ **ไม่มีร่างในเครื่อง** (มติเจ้าของ) — ออกจากพื้นที่ที่มีค่าค้าง = หน้าถามก่อนทิ้ง (ธงขึ้นไปทาง `onDirtyChange`)
// ⚠️ ทุกคำบนจอประกอบที่ `lib/service/surveyFieldView.js` — ที่นี่วาดอย่างเดียว
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban, Camera, Check, ChevronRight, CircleAlert, MessageSquarePlus, Pencil, Plus, RefreshCw, Save, Scissors,
  Trash2, Undo2,
} from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ReadableText from "@/components/ui/ReadableText";
import RowActionMenu from "@/components/ui/RowActionMenu";
import StatusBadge from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import SurveyZonePager from "@/components/service/SurveyZonePager";
import {
  SURVEY_DOC_SPOT, SURVEY_DOC_WIDE, surveyZoneLatestRow, surveyZoneNextBase, surveyZoneSavePayload, surveyZoneStaleReply,
} from "@/lib/service/survey";
import {
  SURVEY_UNKNOWN_TEXT, surveyDraftSync, surveyZoneChangedSections, surveyZoneDraftSignature,
} from "@/lib/service/surveyControl";
import {
  SURVEY_DIM_FIELDS, surveyDraftSummary, surveyNextDimField, surveyPartsView, surveyZoneActions,
  surveyZoneFooterView, surveyZoneSections, surveyZoneStateBadge, surveyZoneTitle,
} from "@/lib/service/surveyFieldView";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyZonePage.module.css";

const newId = () => `new-${Math.random().toString(36).slice(2, 9)}`;
const emptyPart = () => ({ id: newId(), label: "", widthM: "", lengthM: "", heightM: "" });
const emptySpot = () => ({ id: newId(), label: "", note: "" });
/* id ของช่องวัด — Enter ย้ายช่องด้วย id ตัวนี้ และลำดับ id ในหน้าทำให้ลูกศร ‹ › บนแป้น iOS เดินตามแถวเดียวกัน */
const dimInputId = (zoneId, partId, field) => `survey-dim-${zoneId}-${partId}-${field}`;
const spotNoteId = (zoneId, spotId) => `survey-spot-note-${zoneId}-${spotId}`;
const BADGE_ICONS = { error: CircleAlert, conflict: RefreshCw, dirty: Pencil, done: Check };

/* หัวข้อหนึ่งหัวข้อ — วงเลข (อำพันเมื่อค้าง · ติ๊กเขียวเมื่อบันทึกแล้ว/รูปขึ้นแล้ว) · ชื่อ · คำกำกับ · ป้ายขวา
   ⚠️ `h3` — h1 = รหัสคำร้อง · h2 = ชื่อพื้นที่ (ผังหัวข้อของหน้าต้องเรียงชั้น) */
function Section({ area, id, number, icon: Icon, title, hint, state, children }) {
  const chip = state?.chip || null;
  return (
    <section className={styles.card} data-area={area} aria-labelledby={id}>
      <header className={styles.cardHead}>
        <span className={styles.ring} data-mark={state?.mark || "todo"} aria-hidden="true">
          {state?.mark === "done" ? <Check size={15} /> : Icon ? <Icon size={14} /> : number}
        </span>
        <h3 id={id} className={styles.cardTitle}>
          {title}
          {hint ? <span className={styles.cardHint}> · {hint}</span> : null}
        </h3>
        {chip ? (
          <StatusBadge tone={chip.tone} size="sm" icon={chip.check ? Check : undefined} className={styles.chip}>
            {chip.text}
          </StatusBadge>
        ) : null}
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

/**
 * @param zone        แถว `service_survey_zones` (ค่าที่บันทึกแล้ว)
 * @param files       ไฟล์ชุดสดของพื้นที่นี้ (`useLiveZoneFiles`)
 * @param layout      "page" | "pane" — เปลี่ยนแค่หัว (ดูหัวไฟล์)
 * @param oneColumn   เนื้อคอลัมน์เดียวทุกความกว้าง — บานขวาที่ต้องแบ่งจอกับรางของหัวหน้า (≥1200 · §10.5 S9): บานเหลือ ~460px ที่ 1200
 *                    ⇒ สองคอลัมน์ได้ช่องวัดกว้าง 40px · JS ตัดสินจากโหมดราง (ไม่มีเส้นจอใหม่ ไม่มี container query · แผนลงมือ C6)
 * @param headingId   id ของ h2 — ตัวต่อสายประวัติย้ายโฟกัสมาที่นี่เมื่อเปิดพื้นที่ (โปรแกรมอ่านจอได้ยินชื่อพื้นที่ใหม่)
 * @param requestCode รหัสคำร้อง — h1 ซ่อนตาในแถบกรมท่า (หัวใบของหน้าถูกซ่อนตอนเต็มจอ แต่หน้ายังต้องมี h1)
 * @param neighbors   `surveyZoneNeighbors(...)` · @param titles `{ [zoneId]: ชื่อพื้นที่ }` สำหรับปุ่มเลื่อน
 * @param next        `surveyNextStep(...)` — "ถัดไป: …" (หน้าคิดให้ เพราะมันเห็นทั้งใบ)
 * @param viewerKind  `crew` | `senior` | `head` | `readonly` — บรรทัดท้ายหน้าเล่าตามคนอ่าน
 * @param onCut / onRestore / onRemove  ทางออกของพื้นที่ — กล่องยืนยัน/คำขออยู่ที่หน้า (ส่งแค่สถานะ ไม่พ่วงร่าง)
 * @param onDirtyChange `(zoneId, dirty, summary)` — ด่านถามก่อนทิ้ง + ด่านส่งงาน/ส่งผลอ่านธงนี้
 * @param onFilesChange `(zoneId, items, meta)` — รูปที่อัป/ลบขึ้นไปที่ก้อนรวมของหน้า
 * @param onUploadBusy  `(busy)` — ยิงจากลูปอัปของแผงเอง (ยังยิงแม้หน้านี้ถูกถอดกลางการอัป · หน้านับเอง)
 */
export default function SurveyZonePage({
  zone,
  files = [],
  canWrite = false,
  busy = false,
  layout = "page",
  oneColumn = false,
  headingId,
  requestCode = null,
  neighbors = null,
  titles = {},
  onGoZone,
  onList,
  next = null,
  onNext,
  viewerKind = "crew",
  onSave,
  onCut,
  onRestore,
  onRemove,
  onDirtyChange,
  onFilesChange,
  onUploadBusy,
}) {
  const [parts, setParts] = useState(() => (Array.isArray(zone.parts) && zone.parts.length ? zone.parts : [emptyPart()]));
  const [spots, setSpots] = useState(() => (Array.isArray(zone.spots) ? zone.spots : []));
  const [note, setNote] = useState(zone.note || "");
  const [error, setError] = useState("");
  /* ส่วนที่เปิดช่องตั้งชื่อไว้ (✎) · จุดที่เปิดช่องบันทึกไว้ (เมนู "เพิ่มบันทึก") — ของจอล้วน ไม่ใช่ร่าง */
  const [labelOpen, setLabelOpen] = useState(() => new Set());
  const [noteOpen, setNoteOpen] = useState(() => new Set());
  /* รูปที่กำลังส่งบนหน้านี้ — ท้ายหน้าบอก "กำลังส่ง n" (หน้าแม่นับของทั้งใบแยกอีกตัว) */
  const [uploading, setUploading] = useState(0);
  /* ลายเซ็นของสิ่งที่ **บันทึกสำเร็จไปแล้ว** จากหน้านี้ — server ปรับค่าให้เป็นเลขจริง ("8.00" → 8) ⇒ ถ้าเทียบกับ
     แถวที่โหลดกลับมาอย่างเดียว พื้นที่ที่บันทึกแล้วจะค้าง "ยังไม่บันทึก" ตลอดกาล แล้ว **ปุ่มส่งถูกบล็อกถาวร** */
  const [sentSig, setSentSig] = useState(null);
  const [conflict, setConflict] = useState(false);

  /* ไฟล์ที่เห็นจริงในตอนนี้ — `files` จาก GET เป็นค่าตั้งต้น แล้วให้แผงไฟล์แนบรายงานรายการสดกลับมา
     🐞 แผงเรียก `onItemsChange([])` ตั้งแต่ก่อนโหลดรายการเสร็จ ⇒ รับเฉพาะก้อนที่บอกว่าโหลดจบแล้ว
        (โหลดไม่สำเร็จ ≠ ไม่มีไฟล์ — ตกกลับไปใช้ค่าจาก GET) */
  const [liveFiles, setLiveFiles] = useState(null);
  const handleItems = useCallback((items, meta) => {
    if (!meta?.loaded) return;
    setLiveFiles(Array.isArray(items) ? items : []);
    onFilesChange?.(zone.id, items, meta);
  }, [onFilesChange, zone.id]);
  const shownFiles = liveFiles ?? files;

  /* ⚠️ ยิงคู่ true/false ต่อหนึ่งชุด และสองชุดวิ่งซ้อนได้ ⇒ นับ ไม่ใช่ธง (สัญญาของ `onBusyChange`) */
  const handleBusy = useCallback((isBusy) => {
    setUploading((n) => Math.max(0, n + (isBusy ? 1 : -1)));
    onUploadBusy?.(isBusy);
  }, [onUploadBusy]);

  const isCut = (zone.status || "ok") === "cut";
  const edit = canWrite && !isCut;

  // ── ค่าที่พิมพ์ค้าง ยังไม่ลงฐาน ──────────────────────────────────────────
  const savedSig = useMemo(() => surveyZoneDraftSignature(zone), [zone]);
  const draftSig = surveyZoneDraftSignature({ parts, spots, note });
  const dirty = !isCut && draftSig !== savedSig && draftSig !== sentSig;
  const draftSummary = dirty ? surveyDraftSummary({ parts, spots, note }, zone) : "";

  /* 🔴 **แถวถูกแก้จากที่อื่น ≠ ค่าที่ผู้ใช้พิมพ์ค้าง** — หน้าโหลดซ้ำเองเมื่อกลับมาที่แท็บ และนัดหนึ่งใบมีช่างได้หลายคน
     ⇒ แถวใหม่ไหลเข้ามาเป็น prop · ตัวตัดสิน (`surveyDraftSync`) แยก: ไม่มีของค้าง = รับแถวใหม่ ·
     มีของค้างจริง = เก็บร่างไว้ แล้วบอกว่าแถวถูกแก้จากที่อื่น พร้อมทางเลือก
     🐞 บทเรียนของการ์ดเดิม: ไม่อ่าน prop กลับเลย ⇒ ช่องโชว์เลขเก่า · ขึ้น "ยังไม่บันทึก" ทั้งที่ไม่ได้แตะ ·
        ธงนั้นล็อกปุ่มส่งผลถาวร · ทางออกเดียวบนจอคือกดบันทึก ซึ่งทับงานของอีกคนเงียบ ๆ */
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const draftSigRef = useRef(draftSig);
  draftSigRef.current = draftSig;
  const sentSigRef = useRef(sentSig);
  sentSigRef.current = sentSig;
  const savedSigRef = useRef(savedSig);
  /* 🐞 review 26/09 — **ร่างนี้ตั้งต้นจากแถวรุ่นไหน** (`{ at: updatedAt, sig }`) ส่งไปกับการบันทึก (`baseUpdatedAt`) ⇒
     อีกคนบันทึกพื้นที่นี้ไปก่อน = 409 แทนการทับขนาดที่เขาเพิ่งวัดเงียบ ๆ (ร่างเก่าที่มีแค่ส่วนว่าง = `parts: []`)
     ขยับเมื่อ: รับแถวลงช่อง (`adoptRow`) · แถวใหม่ที่ค่าของช่างเท่าเดิม/เท่าที่เราเพิ่งบันทึก (`surveyZoneNextBase`)
     `staleRowRef` = แถวล่าสุดที่ 409 พกกลับมา — หน้าแม่โหลดใหม่เฉพาะตอนบันทึกผ่าน ⇒ prop ยังเป็นรุ่นเก่าอยู่ */
  const baseRef = useRef(null);
  baseRef.current = surveyZoneNextBase(baseRef.current, { at: zone.updatedAt ?? null, sig: savedSig }, { sentSig });
  const staleRowRef = useRef(null);

  const adoptRow = useCallback((row) => {
    /* 🐞 review 26/09 — "ใช้ค่าล่าสุดจากฐาน" หลัง 409 ต้องได้แถวที่ 409 พกมา ไม่ใช่รุ่นที่ร่างตั้งต้น (prop ยังเก่า) */
    const latest = surveyZoneLatestRow(row, staleRowRef.current) || {};
    setParts(Array.isArray(latest.parts) && latest.parts.length ? latest.parts : [emptyPart()]);
    setSpots(Array.isArray(latest.spots) ? latest.spots : []);
    setNote(latest.note || "");
    setConflict(false);
    const sig = surveyZoneDraftSignature(latest);
    baseRef.current = { at: latest.updatedAt ?? null, sig };
    /* แถวนั้นลงฐานแล้วจริงแต่ prop ยังเก่า — นับเป็น "ตรงกับฐาน" แบบผลบันทึกของเราเอง
       ไม่งั้นขึ้น "ยังไม่บันทึก" ค้าง (และล็อกปุ่มส่ง) จนกว่าหน้าแม่จะโหลดใหม่ */
    if (row && latest !== row) setSentSig(sig);
  }, []);

  useEffect(() => {
    const prevSaved = savedSigRef.current;
    const verdict = surveyDraftSync({
      prevSavedSig: prevSaved, savedSig, draftSig: draftSigRef.current, sentSig: sentSigRef.current,
    });
    savedSigRef.current = savedSig;
    if (verdict === "adopt") adoptRow(zoneRef.current);
    else if (verdict === "conflict") setConflict(true);
    /* แถวใหม่คือผลการบันทึกของหน้านี้เอง (พิมพ์ต่อระหว่างรอคำตอบ) — ไม่ใช่การชน ⇒ ป้ายชนที่ค้างอยู่ต้องหาย */
    else if (savedSig !== prevSaved) setConflict(false);
  }, [savedSig, adoptRow]);

  /* หน้าต้องรู้ว่าพื้นที่นี้มีค่าค้างไหม (และค้างอะไร — คำในกล่อง "ทิ้งค่าที่ยังไม่บันทึก?")
     ⚠️ ต้องแจ้ง `false` ตอนถูกถอดด้วย ไม่งั้นพื้นที่ที่ย้ายออกไปแล้วล็อกปุ่มส่งค้าง */
  useEffect(() => { onDirtyChange?.(zone.id, dirty, draftSummary); }, [dirty, draftSummary, zone.id, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(zone.id, false, ""), [zone.id, onDirtyChange]);

  const patchPart = (pid, field, value) => setParts((rows) => rows.map((p) => (p.id === pid ? { ...p, [field]: value } : p)));
  const patchSpot = (sid, field, value) => setSpots((rows) => rows.map((s) => (s.id === sid ? { ...s, [field]: value } : s)));
  const toggleIn = (setter, key, on) => setter((prev) => {
    const nextSet = new Set(prev);
    if (on) nextSet.add(key);
    else nextSet.delete(key);
    return nextSet;
  });
  /* หลังวาดใหม่ค่อยโฟกัส — ช่องที่เพิ่งเปิดยังไม่อยู่ใน DOM ในจังหวะที่กด */
  const focusSoon = (id) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  /* 🔑 **ส่งเฉพาะของที่ผ่านตัวจัดแถวของ server แล้ว** (`surveyZoneSavePayload`) — แถวว่างไม่ถูกส่ง ·
     ร่างที่ server จะตีกลับไม่ยิงเลย แล้วบอกเหตุด้วยชื่อที่ตาเห็น ("ส่วน B ยังขาดความสูง") */
  const save = async () => {
    setError("");
    const draft = { parts, spots, note };
    const plan = surveyZoneSavePayload(draft);
    if (!plan.payload) {
      setError(plan.blocker || "บันทึกไม่สำเร็จ");
      return;
    }
    /* 🐞 review 26/09 รอบสอง — ส่งเฉพาะส่วนที่แก้จากแถวที่ร่างตั้งต้น (`surveyZoneChangedSections`) ⇒ ทับหลังป้ายชนได้แค่ของที่
       ตั้งใจทับ ไม่ใช่ `parts: []` ของส่วนว่างที่จอเติมให้ · ไม่รู้แถวตั้งต้น = ทั้งก้อนแบบเดิม
       · **ไม่มีส่วนไหนต่างจากที่ตั้งต้น = ไม่มีของเราให้บันทึก** (`null`) — ร่างกลับไปเท่าตอนตั้งต้นหลังอีกคนบันทึก ⇒ รับแถวล่าสุด
         ไม่ส่งทั้งก้อน (รอบสาม: ทั้งก้อน = ทับขนาด/หมายเหตุของอีกคนด้วยค่าตั้งต้นที่ว่าง) */
    const pick = (baseSig) => {
      const changed = surveyZoneChangedSections(baseSig, draft);
      if (!changed) return plan.payload;
      const keys = Object.keys(changed).filter((k) => changed[k]);
      return keys.length ? Object.fromEntries(keys.map((k) => [k, plan.payload[k]])) : null;
    };
    let payload = pick(baseRef.current?.sig);
    if (!payload) {
      adoptRow(zoneRef.current);
      return;
    }
    /* 🐞 review 26/09 — ส่งรุ่นของแถวที่ร่างตั้งต้นไปด้วย · ป้าย "ถูกแก้จากที่อื่น" ขึ้นอยู่ = ผู้ใช้อ่านแล้วว่า
       "กดบันทึกจะทับของเขา" ⇒ ใช้รุ่นล่าสุดที่หน้านี้รู้จัก (ทับอย่างรู้ตัว — ไม่งั้นป้ายโกหก และค่าที่พิมพ์ไว้ไม่มีทางลงฐาน) */
    let base = conflict
      ? surveyZoneLatestRow(zoneRef.current, staleRowRef.current)?.updatedAt ?? null
      : baseRef.current?.at ?? null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const saved = await onSave({ ...payload, baseUpdatedAt: base ?? undefined });
        /* ⚠️ ลายเซ็นของ **ร่าง** ไม่ใช่ของ payload — ตัวรับแถวใหม่เทียบกับร่าง */
        setSentSig(surveyZoneDraftSignature(draft));
        /* บันทึกผ่าน = ของบนจอคือของล่าสุด ⇒ ป้าย "ถูกแก้จากที่อื่น" จบหน้าที่ (ผู้ใช้เลือกทับอย่างรู้ตัวแล้ว) */
        setConflict(false);
        /* ฐานของร่าง = แถวที่ server ถืออยู่ตอนนี้ (ส่วนที่เราส่ง + ส่วนที่คนอื่นเขียนไว้) — 🐞 รอบสาม: โหลดใหม่เบื้องหลังพัง
           ⇒ ฐานค้างรุ่นเก่า แล้วบันทึกครั้งถัดไปเทียบส่วนที่แก้ผิดชุด (ส่วนที่ลบกลับเท่าฐานเก่าไม่ถูกส่ง ของเก่าค้างในฐาน) */
        if (saved?.updatedAt) baseRef.current = { at: saved.updatedAt, sig: surveyZoneDraftSignature(saved) };
        return;
      } catch (e) {
        const stale = surveyZoneStaleReply(e);
        if (!stale) {
          setError(e?.message || "บันทึกไม่สำเร็จ");
          return;
        }
        /* 409 ชนรุ่น — ค่าที่พิมพ์ไว้อยู่ครบ · เก็บแถวล่าสุดไว้ให้ปุ่ม "ใช้ค่าล่าสุดจากฐาน" และการกดทับรอบหน้า
           แถวที่ชนมีค่าของช่างเท่าเดิม (หัวหน้าเคาะแพ็คเกจ · ผลบันทึกของเราเองที่ยังโหลดไม่ถึง) = ไม่มีของใครให้ทับ
           ⇒ ลองซ้ำเองครั้งเดียวด้วยรุ่นนั้น · นอกนั้นขึ้นป้ายชนเดิม (ไม่ใช่ error — ป้ายบอกทางออกครบกว่า) */
        staleRowRef.current = surveyZoneLatestRow(staleRowRef.current, stale.zone);
        const next = stale.zone
          ? surveyZoneNextBase(baseRef.current, {
            at: stale.zone.updatedAt ?? null, sig: surveyZoneDraftSignature(stale.zone),
          }, { sentSig })
          : baseRef.current;
        if (attempt === 0 && next !== baseRef.current) {
          baseRef.current = next;
          base = next.at;
          /* ฐานขยับ = เทียบส่วนที่แก้ใหม่กับฐานนั้น (🐞 รอบสาม: ใช้ชุดเดิมที่เทียบกับฐานเก่า ⇒ ส่วนที่ผู้ใช้ย้อนกลับไม่ถูกส่ง) */
          payload = pick(next.sig);
          if (!payload) {
            adoptRow(stale.zone);
            return;
          }
          continue;
        }
        setConflict(true);
        return;
      }
    }
  };

  /* ── ของที่วาด — คำทุกคำมาจากตัวตัดสิน ─────────────────────────────── */
  const title = surveyZoneTitle(zone);
  const zoneCode = zone.zoneCodeUnknown ? SURVEY_UNKNOWN_TEXT : zone.zoneCode || null;
  const partsView = useMemo(() => surveyPartsView(parts), [parts]);
  const sections = surveyZoneSections({ zone, files: shownFiles, draft: { parts, spots, note }, dirty });
  const badge = surveyZoneStateBadge({ zone, files: shownFiles, dirty, error, conflict });
  const actions = surveyZoneActions({ zone, canWrite });
  /* ความสูงหัวที่ติดบน → `--survey-zone-head-h` ของ <html> ให้ `scroll-padding-top` กันช่องที่โฟกัสไม่ให้จมใต้หัว (WCAG 2.4.11)
     🐞 review 26/09: Shift+Tab ไปช่องที่อยู่ใต้หัว (~130–160px ห่อได้หลายบรรทัด) เบราว์เซอร์ไม่เลื่อนเพราะช่องยัง "อยู่ในจอ"
     ⚠️ วัดจริงด้วย ResizeObserver — หัวสูงไม่คงที่ (ชื่อยาวห่อ · ป้ายสถานะ) · ถอดค่าตอนหน้าพื้นที่ถูกถอด */
  const headRef = useRef(null);
  useEffect(() => {
    const node = headRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--survey-zone-head-h", `${Math.ceil(node.offsetHeight)}px`));
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--survey-zone-head-h");
    };
  }, []);
  const saveBlocker = dirty ? surveyZoneSavePayload({ parts, spots, note }).blocker : null;
  const footer = surveyZoneFooterView({
    zone, files: shownFiles, dirty, draftSummary, saveBlocker, busy, error, next, viewerKind, uploading,
  });
  const BadgeIcon = BADGE_ICONS[badge.key];

  /* เมนู ⋮ บนหัว — ทางออกอยู่ห่างไม่เกินสองแตะจากทุกจุดของหน้า (pain B9) · ใครทำอะไรได้มาจากตัวตัดสิน */
  const menuItems = [
    actions.cut ? { id: "cut", label: "ตัดพื้นที่นี้ออก", icon: Scissors, tone: "warning", onClick: () => onCut?.(zone) } : null,
    /* 🔴 พื้นที่ที่ช่างเพิ่มเองต้องลบได้ ไม่ใช่ตัดออก — ด่านส่งบล็อกทั้งใบ ⇒ แถวที่เพิ่มผิดแล้วกรอกไม่จบจะล็อกใบตลอดกาล
       และ "ตัดออก" จะเขียนทับป้าย "เพิ่มหน้างาน" (server ปฏิเสธไว้อีกชั้น) */
    actions.remove ? { id: "remove", label: "ลบพื้นที่นี้ทิ้ง", icon: Trash2, tone: "danger", onClick: () => onRemove?.(zone) } : null,
    actions.restore ? { id: "restore", label: "เอากลับเข้าใบ", icon: Undo2, onClick: () => onRestore?.(zone) } : null,
  ].filter(Boolean);

  /* Enter บนแป้นตัวเลข = ไปช่องถัดไป (ก → ย → ส → ก ของส่วนถัดไป) · ช่องสุดท้ายปล่อยให้แป้นปิดเอง */
  const onDimKeyDown = (event, partId, field) => {
    if (event.key !== "Enter" || event.nativeEvent?.isComposing) return;
    const to = surveyNextDimField(parts, partId, field);
    if (!to) return;
    event.preventDefault();
    document.getElementById(dimInputId(zone.id, to.partId, to.field))?.focus();
  };

  const sectionId = (key) => `${headingId}-${key}`;

  const photoPanel = (docType, label, weight) => (
    <div className={styles.photos}>
      {/* ⚠️ `intakeWeight` = ใครได้ Ctrl+V ตอนไม่มีอะไรโฟกัส (0 = ได้ก่อน) — ภาพกว้างเป็นของที่ต้องมี จึงได้ก่อน */}
      <AttachmentsPanel
        entityType="service_survey_zone" entityId={zone.id} canEdit={edit} showCount={false}
        title="" inlineUpload docTypes={[{ key: docType, label }]}
        photoCapture photoTiles
        onItemsChange={handleItems}
        onBusyChange={handleBusy}
        intakeWeight={weight}
      />
    </div>
  );

  return (
    <section className={styles.page} data-layout={layout} data-cols={oneColumn ? "1" : undefined} aria-labelledby={headingId}>
      <header ref={headRef} className={styles.head}>
        {layout === "page" ? (
          <div className={styles.bar}>
            {/* หัวใบของหน้าถูกซ่อนตอนเต็มจอ — h1 ยังต้องมีหนึ่งตัว (ชื่อคำร้อง) ให้ผังหัวข้อของหน้าไม่ขาด */}
            {requestCode ? <h1 className="sr-only">{requestCode}</h1> : null}
            <SurveyZonePager
              layout="page" neighbors={neighbors} titles={titles} onGo={onGoZone} onList={onList}
              menuItems={menuItems} menuLabel={`จัดการ ${title}`}
            />
          </div>
        ) : null}
        <div className={styles.titleBand}>
          <div className={styles.titleText}>
            {zoneCode ? <span className={styles.code}>{zoneCode}</span> : null}
            <h2 id={headingId} className={styles.title} tabIndex={-1}>{title}</h2>
          </div>
          <div className={styles.badges}>
            <StatusBadge tone={badge.tone} icon={BadgeIcon}>{badge.text}</StatusBadge>
            {/* ที่มาของพื้นที่ — คนละแกนกับสถานะ (SA ต้องรู้ว่าไม่ได้ขอเอง · มติข้อ 6) */}
            {badge.added ? <StatusBadge tone="accent">เพิ่มหน้างาน</StatusBadge> : null}
          </div>
          {layout === "pane" ? (
            <SurveyZonePager
              layout="pane" neighbors={neighbors} titles={titles} onGo={onGoZone}
              menuItems={menuItems} menuLabel={`จัดการ ${title}`}
            />
          ) : null}
        </div>
      </header>

      {/* 🔴 **มีคนแก้แถวนี้ระหว่างที่ค่าของเรายังไม่ได้บันทึก** — บอกตรง ๆ แล้วให้ทางออกสองทาง */}
      {conflict && !isCut ? (
        <p className={styles.conflict} role="status">
          <RefreshCw size={15} aria-hidden="true" />
          <span><b>แถวนี้ถูกแก้จากที่อื่น</b> ค่าที่คุณพิมพ์ไว้ยังอยู่ครบ — กดบันทึกจะทับของเขา</span>
          <Button variant="outline" className={styles.touchBtn} onClick={() => adoptRow(zoneRef.current)}>ใช้ค่าล่าสุดจากฐาน</Button>
        </p>
      ) : null}
      {/* 🔴 บันทึกไม่สำเร็จต้องพูดออกมาทันทีที่ตรงนั้น — ไม่ใช่ toast ที่หายไปใน 4 วินาที */}
      {error ? (
        <p className={styles.error} role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span><b>บันทึกไม่สำเร็จ</b> {error}</span>
        </p>
      ) : null}

      {isCut ? (
        <div className={styles.cutBody}>
          <p className={styles.cutNote}>
            <Scissors size={15} aria-hidden="true" />
            <span>ตัดออกจากใบนี้ — {naText(zone.cutReason)}</span>
          </p>
          {actions.restore ? (
            <Button variant="outline" className={styles.touchBtn} icon={<Undo2 size={15} aria-hidden="true" />}
              onClick={() => onRestore?.(zone)}>
              เอากลับเข้าใบ
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={styles.body}>
          {/* ── ① ขนาด ─────────────────────────────────────────────── */}
          <Section area="size" id={sectionId("size")} number={1} title="ขนาด"
            hint={edit ? "หน่วย ม. · ต้องมี" : "หน่วย ม."} state={sections.size}>
            {partsView.rows.map((row, i) => {
              const part = parts[i];
              const open = labelOpen.has(part.id);
              return (
                <div key={part.id} className={styles.part} data-state={row.state}>
                  <div className={styles.partHead}>
                    <span className={styles.partName}>
                      {row.name}
                      {row.label ? <span className={styles.partLabel}> · {row.label}</span> : null}
                    </span>
                    {edit ? (
                      <button type="button" className={styles.iconBtn} aria-expanded={open}
                        aria-label={`ตั้งชื่อ${row.name}`} onClick={() => {
                          toggleIn(setLabelOpen, part.id, !open);
                          if (!open) focusSoon(`${dimInputId(zone.id, part.id, "label")}`);
                        }}>
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className={styles.partResult} data-state={row.state}>{row.resultText || naText(null)}</span>
                    {edit && row.removable ? (
                      <button type="button" className={styles.iconBtn} data-tone="danger" aria-label={`ลบ${row.name}`}
                        onClick={() => setParts((rows) => rows.filter((p) => p.id !== part.id))}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  {edit && open ? (
                    <Input
                      id={dimInputId(zone.id, part.id, "label")}
                      touch
                      value={part.label || ""}
                      onChange={(e) => patchPart(part.id, "label", e.target.value)}
                      placeholder="ชื่อส่วน (ไม่บังคับ) — เช่น ปีกทิศเหนือ" maxLength={60} autoComplete="off"
                      aria-label={`ชื่อ${row.name}`}
                    />
                  ) : null}
                  <div className={styles.dims}>
                    {SURVEY_DIM_FIELDS.map((dim, k) => (
                      <Fragment key={dim.field}>
                        {k > 0 ? <span className={styles.times} aria-hidden="true">×</span> : null}
                        {edit ? (
                          <label className={styles.dim}>
                            <span className={styles.dimLetter} aria-hidden="true">{dim.letter}</span>
                            {/* ⚠️ ช่องข้อความ + แป้นทศนิยม ไม่ใช่ `type="number"` — "7,5" ต้องพิมพ์ได้ และตัวแยก
                                `parseSurveyMeters` ของกลางเป็นคนตัดสิน · 18px สูง 52px = ข้อยกเว้นเดียวของกติกาช่องกรอก
                                (iOS ซูมทั้งหน้าเมื่อช่องต่ำกว่า 16px — UI_DESIGN_SYSTEM.md §จอทำงานหน้างาน) */}
                            <Input
                              id={dimInputId(zone.id, part.id, dim.field)}
                              className={styles.dimInput}
                              type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off"
                              aria-label={`${dim.word} ${row.name} (เมตร)`}
                              value={part[dim.field] ?? ""}
                              onChange={(e) => patchPart(part.id, dim.field, e.target.value)}
                              onKeyDown={(e) => onDimKeyDown(e, part.id, dim.field)}
                            />
                          </label>
                        ) : (
                          <span className={styles.dimRead}>
                            <span className={styles.dimLetter} aria-hidden="true">{dim.letter}</span>
                            <span className="sr-only">{dim.word}</span>
                            <b>{Number(part[dim.field]) > 0 ? fmtNumber(Number(part[dim.field])) : naText(null)}</b>
                          </span>
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
            {edit ? (
              <button type="button" className={styles.addRow} onClick={() => setParts((rows) => [...rows, emptyPart()])}>
                <Plus size={16} aria-hidden="true" />
                เพิ่มส่วน
              </button>
            ) : null}
            {/* 🔴 ปัดเศษครั้งเดียวที่ระดับพื้นที่ ไม่ใช่รายส่วน · ⚠️ ระบบตรวจส่วนที่วัดทับกันไม่ได้ — คำเตือนขึ้นเมื่อมีสองส่วนขึ้นไป */}
            <div className={styles.total} data-complete={partsView.total.complete ? "1" : undefined}>
              <span className={styles.totalLabel}>
                <b>{partsView.total.label}</b>
                {partsView.total.hint ? <small>{partsView.total.hint}</small> : null}
              </span>
              <span className={styles.totalValue}>
                <b>{partsView.total.text}</b>
                {partsView.total.sub ? <small>{partsView.total.sub}</small> : null}
              </span>
            </div>
          </Section>

          {/* ── ② ภาพกว้าง ─────────────────────────────────────────── */}
          <Section area="wide" id={sectionId("wide")} number={2} title="ภาพกว้าง"
            hint="ต้องมีอย่างน้อย 1 รูป" state={sections.wide}>
            {photoPanel(SURVEY_DOC_WIDE, "ภาพกว้าง", 0)}
            {edit ? <p className={styles.hint}>รูปขึ้นระบบทันที ไม่ต้องกดบันทึก · แตะรูปเพื่อดูหรือลบ</p> : null}
          </Section>

          {/* ── ③ จุดที่ติดตั้งได้ ──────────────────────────────────── */}
          <Section area="spots" id={sectionId("spots")} number={3} title="จุดที่ติดตั้งได้"
            hint={edit ? "อย่างน้อย 1 จุด" : `${spots.length} จุด`} state={sections.spots}>
            {spots.length === 0 && !edit ? <p className={styles.empty}>ยังไม่ได้ระบุจุด</p> : null}
            {spots.map((spot, i) => {
              const noteShown = !!String(spot.note || "").trim() || noteOpen.has(spot.id);
              return (
                <div key={spot.id} className={styles.spot}>
                  <span className={styles.spotNo} aria-hidden="true">{i + 1}</span>
                  <div className={styles.spotMain}>
                    {edit ? (
                      <>
                        <Input
                          className={styles.spotInput}
                          value={spot.label || ""}
                          onChange={(e) => patchSpot(spot.id, "label", e.target.value)}
                          placeholder="ชื่อจุด — เช่น มุมเตียงที่ 1" maxLength={100} autoComplete="off"
                          aria-label={`ชื่อจุดที่ ${i + 1}`}
                        />
                        {noteShown ? (
                          <Input
                            id={spotNoteId(zone.id, spot.id)}
                            className={styles.spotInput}
                            value={spot.note || ""}
                            onChange={(e) => patchSpot(spot.id, "note", e.target.value)}
                            placeholder="บันทึก — เช่น ปลั๊กอยู่ใต้เสา" maxLength={300} autoComplete="off"
                            aria-label={`บันทึกของจุดที่ ${i + 1}`}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <b className={styles.readValue}>{naText(spot.label)}</b>
                        {spot.note ? <span className={styles.hint}>{spot.note}</span> : null}
                      </>
                    )}
                  </div>
                  {edit ? (
                    <RowActionMenu
                      className={styles.spotMenu}
                      label={`จัดการจุดที่ ${i + 1}`}
                      items={[
                        noteShown ? null : {
                          id: "note", label: "เพิ่มบันทึก", icon: MessageSquarePlus,
                          onClick: () => { toggleIn(setNoteOpen, spot.id, true); focusSoon(spotNoteId(zone.id, spot.id)); },
                        },
                        {
                          id: "remove", label: "ลบจุดนี้", icon: Trash2, tone: "danger",
                          onClick: () => setSpots((rows) => rows.filter((s) => s.id !== spot.id)),
                        },
                      ].filter(Boolean)}
                    />
                  ) : spot.selected ? (
                    <span className={styles.picked}><Check size={12} aria-hidden="true" /> เลือกติดตั้ง</span>
                  ) : null}
                </div>
              );
            })}
            {edit ? (
              <>
                <button type="button" className={styles.addRow} onClick={() => setSpots((rows) => [...rows, emptySpot()])}>
                  <Plus size={16} aria-hidden="true" />
                  เพิ่มจุดที่ติดตั้งได้
                </button>
                {/* 🔴 ช่างแจ้ง "ติดตั้งได้ตรงไหนบ้าง" ไม่ใช่ "จะติดตั้งตรงไหน" — คนเลือกจุดจริงคือหัวหน้า TS */}
                <p className={styles.hint}>ใส่ให้ครบทุกจุดที่ติดตั้งได้ หัวหน้าเป็นคนเลือกว่าจะติดตั้งจริงกี่จุด</p>
              </>
            ) : null}
          </Section>

          {/* ── ภาพจุดติดตั้ง (ไม่บังคับ) ─────────────────────────────── */}
          <Section area="spotphotos" id={sectionId("spotphotos")} icon={Camera} title="ภาพจุดติดตั้ง"
            hint="ไม่บังคับ" state={sections.spotPhotos}>
            {photoPanel(SURVEY_DOC_SPOT, "ภาพจุดติดตั้ง", 1)}
          </Section>

          {/* ── ④ หมายเหตุพื้นที่ ──────────────────────────────────── */}
          {/* 🔄 เดิมชื่อ "บันทึกหน้างาน" — ชนกับปุ่ม "บันทึกหน้างาน" บนงานวันนี้ (คำเดียวกันสองความหมาย · pain B8) */}
          <Section area="note" id={sectionId("note")} number={4} title="หมายเหตุพื้นที่"
            hint="ไม่บังคับ" state={sections.note}>
            {edit ? (
              <Textarea
                touch value={note} rows={3} maxLength={1000}
                aria-labelledby={sectionId("note")}
                placeholder="เช่น ลูกค้าขอให้เลี่ยงมุมเตียงที่ 2"
                onChange={(e) => setNote(e.target.value)}
              />
            ) : (
              <ReadableText text={note} className={styles.readText} />
            )}
          </Section>

          {/* ── ทางออกท้ายเนื้อ — ทุกขนาดจอ (คู่กับเมนู ⋮ บนหัว) ──────────────── */}
          {actions.cut || actions.remove ? (
            <p className={styles.cutRow} data-area="cut">
              <Ban size={15} aria-hidden="true" />
              {actions.remove ? (
                <>
                  <span>เพิ่มผิดพื้นที่?</span>
                  <button type="button" className={styles.cutBtn} onClick={() => onRemove?.(zone)}>ลบพื้นที่นี้ทิ้ง</button>
                </>
              ) : (
                <>
                  <span>เข้าห้องนี้ไม่ได้ / ไม่ต้องวัด</span>
                  <button type="button" className={styles.cutBtn} onClick={() => onCut?.(zone)}>ตัดพื้นที่นี้ออก</button>
                </>
              )}
            </p>
          ) : null}
        </div>
      )}

      {/* ── ท้ายหน้า (ติดขอบล่าง · หลบเมื่อแป้นพิมพ์บนจอขึ้น) ────────────────────────
          ⭐ ปุ่มที่กดไม่ได้บอกเหตุเป็นตัวหนังสือในปุ่มเอง ("ยังไม่ได้แก้อะไร" · "บันทึกก่อน") — เหตุทั้งสองแก้ได้บนจอเดียวกัน
          ⚠️ บรรทัดสถานะบนมือถือซ่อนจากตา (ยังอ่านได้ด้วยโปรแกรมอ่านจอ) — แถบติดขอบต้องไม่เกิน 72px (BRIEF §E-11)
             และทุกอย่างที่บรรทัดนี้พูดมีอยู่บนจออยู่แล้ว: ป้ายรายหัวข้อ · แผ่นรูปกำลังส่ง · เหตุในปุ่ม · กล่อง error */}
      {/* ไม่มีปุ่มสักปุ่ม (คนอ่านอย่างเดียว · พื้นที่สุดท้าย) = บรรทัดสถานะกลับมาให้ตาเห็นบนมือถือ — 🐞 review 26/09: แถบติดขอบว่างเปล่า */}
      <footer
        className={styles.foot} data-osk-hide="" data-toast-avoid="" data-tone={footer.tone}
        data-empty={footer.next || footer.save.show ? undefined : ""}
      >
        <div className={styles.footCopy}>
          <p className={styles.footHead}>{footer.head}</p>
          {footer.sub ? <p className={styles.footSub}>{footer.sub}</p> : null}
        </div>
        <div className={styles.footActs}>
          {footer.next ? (
            <button
              type="button"
              className={styles.nextBtn}
              disabled={!!footer.next.blocker}
              onClick={() => onNext?.(footer.next.target)}
            >
              <span className={styles.btnText}>
                <span>{footer.next.label}</span>
                {footer.next.blocker ? <small>{footer.next.blocker}</small> : null}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : null}
          {footer.save.show ? (
            <Button
              tone={footer.save.emphasis === "primary" ? "primary" : undefined}
              className={styles.saveBtn}
              disabled={!footer.save.enabled}
              icon={<Save size={16} aria-hidden="true" />}
              onClick={save}
            >
              <span className={styles.btnText}>
                <span>{busy ? "กำลังบันทึก…" : footer.save.label}</span>
                {!footer.save.enabled && footer.save.reason && !busy ? <small>{footer.save.reason}</small> : null}
              </span>
            </Button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
