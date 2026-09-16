"use client";
// ── การ์ดพื้นที่หนึ่งใบบนจอบันทึกหน้างาน (เฟส 3 · จอ 06) ─────────────────
//
// ⭐ **ช่างยืนหน้างาน ถือมือถือ อีกมือถือตลับเมตร** ⇒ ต่อพื้นที่จึงมีของแค่สองอย่าง:
//   **ตัวเลขสามช่อง** กับ **รูปสามหัวข้อ** · เรื่องแพ็คเกจไม่อยู่จอนี้ เพราะเป็นงาน
//   ที่ทำที่โต๊ะหลังกลับ (มติผู้ใช้ 2026-08-29)
//
// ⭐ **พับได้ (PR4 ของการรื้อจอประเมิน · แบบที่อนุมัติ 2026-09-16)** — เปลือกเป็น
//   `ui/CollapsibleCard` ของกลาง · **หัวที่พับต้องตอบได้โดยไม่ต้องเปิด**:
//   วัดครบโชว์ตัวเลข (ตร.ม. · ลบ.ม. · สูตร · จุด · รูป) ยังไม่ครบโชว์ "ขาด: …" สีอำพัน
//   ตัดออกโชว์เหตุผล ⇒ ตัวเลขทุกตัวมาจาก `surveyZoneFacts` ที่เดียว ไม่คำนวณเอง
//   🔑 **บรรทัดสรุปอ่านจากค่าที่บันทึกแล้ว ไม่ใช่ค่าที่กำลังพิมพ์** (เหตุผลเดียวกับ
//      เช็คลิสต์ข้างล่าง) ส่วนแถวตัวเลขสามช่อง **ในเนื้อ** เดินตามที่พิมพ์สด ๆ เพราะ
//      มันคือผลลัพธ์ของการวัดที่กำลังทำอยู่ · ค่าที่ยังไม่ลงฐานมีป้าย "ยังไม่บันทึก" กำกับ
//
// ⭐ **หนึ่งพื้นที่วัดได้หลายส่วน** — พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม รูปตัว L แบ่งสองก้อน
//   แล้วบวกกัน · และ **แต่ละส่วนมีความสูงของตัวเอง** (โถงกลาง 6.5 ม. ทางเดินข้าง 2.6 ม.
//   ต่างจากคิดสูงเดียวทั้งพื้นที่ถึง 11%)
//
// ⚠️ **เมตรอย่างเดียว ไม่มีดรอปดาวน์เลือกหน่วย** — หน่วยที่เลือกได้คือหน่วยที่กรอกผิดได้
//   (ชีตเก่ามีทั้ง "500 ML" กับ "2 KG" ปนกันมาแล้ว)
//
// ⭐ **ใบที่เขียนไม่ได้ = อ่านเป็นตัวหนังสือ ไม่ใช่ช่องจาง** — ใบที่ส่งแล้วคือของที่คนเปิดมาอ่าน
//   🐞 เดิมทุกค่าเป็นช่อง disabled จาง 55% · ชื่อจุดกับบันทึกกล่องเท่ากันหมด และคำใบ้
//   "บังคับ"/คำเตือนสีเหลืองยังขึ้นใต้แถบ "ส่งแล้ว" จนอ่านเหมือนใบมี error
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, CircleAlert, Minus, Pencil, Plus, RefreshCw, Save, Scissors, Trash2, Undo2 } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import Input from "@/components/ui/Input";
import ReadableText from "@/components/ui/ReadableText";
import StatusBadge from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import {
  SURVEY_DOC_PLAN, SURVEY_DOC_SPOT, SURVEY_DOC_WIDE,
  surveyZoneSize, suggestedPackages,
} from "@/lib/service/survey";
import { SURVEY_UNKNOWN_TEXT, surveyZoneDraftSignature, surveyZoneFacts } from "@/lib/service/surveyControl";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyZoneCard.module.css";

const emptyPart = () => ({ id: `new-${Math.random().toString(36).slice(2, 9)}`, label: "", widthM: "", lengthM: "", heightM: "" });
const emptySpot = () => ({ id: `new-${Math.random().toString(36).slice(2, 9)}`, label: "", note: "" });
/* หน่วยอยู่ในป้าย ไม่ใช่บรรทัดแยกใต้ช่อง — 🐞 เดิม "ม." ลอยชิดขวาใต้ช่องที่กว้าง 436px
   ห่างจากตัวเลขของมันเกือบ 400px บนเดสก์ท็อป (ท่าเดียวกับหัวตาราง "ขนาด (ม.)") */
const DIMS = [["widthM", "กว้าง (ม.)"], ["lengthM", "ยาว (ม.)"], ["heightM", "สูง (ม.)"]];

const PHOTO_GROUPS = [
  { key: "wide", docType: SURVEY_DOC_WIDE, label: "ภาพกว้าง", required: true, hint: null },
  /* ⭐ ผังไม่บล็อกที่นี่ — ช่างไม่ได้ถือผังไปด้วย · ผังมาจากฝ่ายอาคารหรือไฟล์ที่ SA แนบมา
     ขอแล้วอาจได้วันรุ่งขึ้น ⇒ ด่านผังอยู่ที่ปุ่มส่งผลของหัวหน้า และต้องเป็น
     **ผังที่มาร์กจุดแล้ว** ไม่ใช่ผังเปล่าที่ฝ่ายขายแนบมา */
  { key: "plan", docType: SURVEY_DOC_PLAN, label: "ภาพผัง", required: false, hint: "หัวหน้ามาร์กจุดก่อนส่ง — ไม่มีติดตัวก็ข้ามได้" },
  { key: "spot", docType: SURVEY_DOC_SPOT, label: "ภาพจุดติดตั้ง", required: false, hint: null },
];

/* `id` = จุดจอดของลิงก์ "เปิด <พื้นที่>" บนการ์ดควบคุม — คนที่กดปุ่มนั้นต้องมาโผล่ที่
   หัวการ์ดพอดี ไม่ใช่กลางการ์ด (ระยะหลบแถบเมนูอยู่ที่ `scroll-margin-top` ของ `.card`
   ใน CollapsibleCard.module.css) */
export default function SurveyZoneCard({
  id,
  zone,
  files = [],
  canWrite = false,
  busy = false,
  index = 1,
  open = false,
  onToggle,
  onSave,
  onDelete,
  onDirtyChange,
  onSaved,
  onSaveFailed,
  onActivate,
  /* พื้นที่ถัดไปที่ยังไม่ครบ — หน้าเป็นคนหาให้ (มันเห็นทั้งใบ การ์ดเห็นแค่ตัวเอง) */
  nextZone = null,
  onGoNext,
  /* กล่องนี้เป็นเจ้าของ Ctrl+V ตอนไม่มีอะไรโฟกัสอยู่ไหม (พื้นที่ที่เปิดล่าสุด) */
  active = false,
}) {
  const [parts, setParts] = useState(() => (Array.isArray(zone.parts) && zone.parts.length ? zone.parts : [emptyPart()]));
  const [spots, setSpots] = useState(() => (Array.isArray(zone.spots) ? zone.spots : []));
  const [note, setNote] = useState(zone.note || "");
  const [cutting, setCutting] = useState(false);
  const [cutReason, setCutReason] = useState(zone.cutReason || "");
  const [error, setError] = useState("");
  /* ลายเซ็นของสิ่งที่ **บันทึกสำเร็จไปแล้ว** จากการ์ดใบนี้ — ไม่ใช่ของฟุ่มเฟือย:
     server ปรับค่าให้เป็นเลขจริง ("8.00" → 8) ⇒ ถ้าเทียบกับแถวที่โหลดกลับมาอย่างเดียว
     พื้นที่ที่บันทึกสำเร็จแล้วจะค้างป้าย "ยังไม่บันทึก" ตลอดกาล แล้ว **ปุ่มส่งผลถูกบล็อก
     ถาวร** โดยไม่มีใครรู้ว่าเพราะอะไร (ด่าน dirty ของการ์ดควบคุมอ่านธงตัวนี้) */
  const [sentSig, setSentSig] = useState(null);

  /* ไฟล์ที่เห็นจริงในตอนนี้ — `files` จาก GET เป็นค่าตั้งต้น แล้วให้แผงไฟล์แนบรายงาน
     รายการสดกลับมา ⇒ **ตัวนับรูปบนหัวขยับทันทีที่แนบเสร็จ** ไม่ต้องรอโหลดหน้าใหม่
     🐞 แผงเรียก `onItemsChange([])` ตั้งแต่ก่อนโหลดรายการเสร็จ ⇒ รับดิบ ๆ แล้วหัวจะ
        กะพริบเป็น "ขาด: ภาพกว้าง" ทุกครั้งที่เปิดหน้า · ค่าว่างก้อนแรกจึงไม่นับ */
  const [liveFiles, setLiveFiles] = useState(null);
  /* 🐞 เดิมใช้ "ก้อนแรกที่ไม่ว่าง" เป็นสัญญาณว่าโหลดจบ ⇒ พื้นที่ที่ไฟล์ถูกลบหมดจากที่อื่น
     จะ emit `[]` ซึ่งถูกทิ้งตลอดกาล แล้วหัวยังเขียน "รูป 3" กับป้ายเขียวค้างไว้ทั้งที่
     ไม่มีรูปแล้ว ⇒ ให้แผงบอกตรง ๆ ว่า **โหลดรายการจบและสำเร็จแล้วหรือยัง** แล้วค่อยเชื่อ
     ก้อนว่าง · โหลดไม่สำเร็จ = ไม่ใช่ "ไม่มีไฟล์" เหมือนกัน (ตกกลับไปใช้ค่าจาก GET) */
  const handleItems = useCallback((items, meta) => {
    if (!meta?.loaded) return;
    setLiveFiles(Array.isArray(items) ? items : []);
  }, []);
  const shownFiles = liveFiles ?? files;

  /* 🔑 ข้อเท็จจริงของหัวมาจากตัวตัดสินกลาง — การ์ดสองใบที่คำนวณเองจะได้เลขไม่เท่ากัน */
  const facts = useMemo(() => surveyZoneFacts(zone, shownFiles), [zone, shownFiles]);
  const isCut = facts.cut;
  /* พื้นที่ที่ช่างเจอเองหน้างาน — ป้ายต้องขึ้นทุกจอ ไม่งั้น SA อ่านผลแล้วนึกว่าตัวเองขอไป
     (มติข้อ 6: "ตัดสินเองได้ แต่ต้องมีป้ายบอก") */
  const isAdded = zone.status === "added";
  const edit = canWrite && !isCut;
  /* แถวตัวเลขสามช่องเดินตามที่พิมพ์สด ๆ — มันคือผลของการวัดที่กำลังทำอยู่ */
  const size = useMemo(() => surveyZoneSize(parts), [parts]);
  const packages = suggestedPackages(size.volumeCbm);

  // ── ค่าที่พิมพ์ค้าง ยังไม่ลงฐาน ──────────────────────────────────────────
  const savedSig = useMemo(() => surveyZoneDraftSignature(zone), [zone]);
  const draftSig = surveyZoneDraftSignature({ parts, spots, note });
  const dirty = !isCut && draftSig !== savedSig && draftSig !== sentSig;

  /* 🔴 **แถวถูกแก้จากที่อื่น ≠ ค่าที่ผู้ใช้พิมพ์ค้าง** — หน้านี้โหลดซ้ำเองเมื่อสลับกลับ
     มาที่แท็บ (`useRevalidateOnFocus`) และนัดหนึ่งใบมีช่างได้หลายคน ⇒ ช่างอีกคนกด
     บันทึกพื้นที่เดียวกันเมื่อไร แถวใหม่จะไหลเข้ามาเป็น prop
     🐞 เดิม `parts/spots/note` เป็น `useState` ที่มี initialiser อย่างเดียว ไม่มีใคร
        อ่าน prop กลับเข้ามาเลย ⇒ (1) ช่องยังโชว์เลขเก่า (2) ลายเซ็นต่างกันเลยขึ้นป้าย
        "ยังไม่บันทึก" ทั้งที่ผู้ใช้ไม่ได้แตะอะไร (3) ธงนั้นวิ่งต่อไปที่ `dirtyZoneIds`
        แล้ว **ล็อกปุ่มส่งผลถาวร** พร้อมเหตุผลที่โทษผู้ใช้ · ทางออกเดียวที่เห็นบนจอคือ
        กดบันทึก ซึ่งส่งค่าเก่าไปทับงานของอีกคนเงียบ ๆ (วัดสดแล้ว: กว้าง 12 ในฐาน
        แต่ช่องยังเป็น 4 · ปุ่มส่ง aria-disabled=true)
     ⇒ แยกสองกรณีออกจากกัน: **ผู้ใช้ไม่มีของค้าง = รับแถวใหม่มาเลย** ·
       **มีของค้างจริง = เก็บร่างไว้ แล้วบอกว่าแถวถูกแก้จากที่อื่น พร้อมทางเลือก** */
  const [conflict, setConflict] = useState(false);
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const draftSigRef = useRef(draftSig);
  draftSigRef.current = draftSig;
  const sentSigRef = useRef(sentSig);
  sentSigRef.current = sentSig;
  const savedSigRef = useRef(savedSig);

  const adoptRow = useCallback((row) => {
    setParts(Array.isArray(row?.parts) && row.parts.length ? row.parts : [emptyPart()]);
    setSpots(Array.isArray(row?.spots) ? row.spots : []);
    setNote(row?.note || "");
    /* ⚠️ ไม่แตะ `cutReason` — มันคือช่องที่ผู้ใช้กำลังพิมพ์อยู่ในกล่องยืนยันตัดออก
       ส่วนเหตุผลที่โชว์บนใบที่ตัดไปแล้วอ่านจาก prop ตรง ๆ ไม่ได้ผ่าน state ตัวนี้ */
    setConflict(false);
  }, []);

  useEffect(() => {
    const prevSaved = savedSigRef.current;
    if (savedSig === prevSaved) return;   // แถวเดิม (โหลดซ้ำแล้วได้ของเท่าเดิม) = ไม่มีอะไรต้องทำ
    savedSigRef.current = savedSig;
    const draft = draftSigRef.current;
    /* ผู้ใช้ไม่มีของค้าง: ร่างตรงกับแถวเดิม · ตรงกับแถวใหม่ · หรือเป็นของที่การ์ดนี้
       เพิ่งบันทึกสำเร็จไป (server ปรับรูปเลขแล้วส่งกลับมา) ⇒ รับแถวใหม่ได้เลย */
    if (draft === prevSaved || draft === savedSig || draft === sentSigRef.current) {
      adoptRow(zoneRef.current);
      return;
    }
    /* มีของค้างจริง — ถ้าแถวใหม่คือผลการบันทึกของการ์ดใบนี้เอง (ผู้ใช้พิมพ์ต่อระหว่าง
       รอคำตอบ) ไม่ใช่การชนกับใคร · นอกนั้นคือมีคนอื่นแก้แถวนี้ */
    setConflict(savedSig !== sentSigRef.current);
  }, [savedSig, adoptRow]);
  /* หน้าต้องรู้ว่าพื้นที่ไหนมีค่าค้าง — เป็นด่านที่บล็อกปุ่มส่งผล (PR2 ต่อสายไว้แล้ว)
     ⚠️ ต้องแจ้ง `false` ตอนถูกถอดออกจากจอด้วย ไม่งั้นพื้นที่ที่ถูกลบทิ้งจะล็อกปุ่มส่งค้าง */
  useEffect(() => { onDirtyChange?.(zone.id, dirty); }, [dirty, zone.id, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(zone.id, false), [zone.id, onDirtyChange]);

  const patchPart = (pid, field, value) => setParts((rows) => rows.map((p) => (p.id === pid ? { ...p, [field]: value } : p)));
  const patchSpot = (sid, field, value) => setSpots((rows) => rows.map((s) => (s.id === sid ? { ...s, [field]: value } : s)));

  const save = async (extra = {}) => {
    setError("");
    try {
      await onSave({ parts, spots, note, ...extra });
      setSentSig(surveyZoneDraftSignature({ parts, spots, note }));
      setCutting(false);
      /* บันทึกผ่านแล้ว = ของบนจอคือของล่าสุด ⇒ ป้าย "ถูกแก้จากที่อื่น" จบหน้าที่
         (ผู้ใช้เลือกทับของเขาไปแล้วอย่างรู้ตัว — ป้ายที่ค้างอยู่จะกลายเป็นคำโกหก) */
      setConflict(false);
      /* ⭐ **ไม่พับเองหลังบันทึกสำเร็จ** (กติกาข้อ 3 ของแบบที่อนุมัติ) — หน้าเป็นคนตัดสิน
         ว่าจะเปิดค้างไว้หรือพับ (ตัดออกคือกรณีเดียวที่พับ เพราะไม่มีอะไรให้ทำต่อ) */
      onSaved?.(zone.id, { cut: extra.status === "cut" });
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
      /* 🔴 บันทึกไม่สำเร็จ = **บังคับเปิดพื้นที่นั้น** — ข้อความ error ที่อยู่ในกล่องที่พับ
         อยู่คือ error ที่ไม่มีใครเห็น แล้วคนกดซ้ำอีกรอบโดยไม่รู้ว่าติดอะไร */
      onSaveFailed?.(zone.id);
    }
  };

  // ── หัวที่พับอยู่ ────────────────────────────────────────────────────────
  const summary = isCut
    ? <span className={styles.cutFact}>{naText(facts.cutReason)}</span>
    : facts.missingText
      ? <span className={styles.miss}>{facts.missingText}</span>
      : (
        <>
          <span className={styles.fact}><b>{fmtNumber(facts.areaSqm)}</b> ตร.ม. · <b>{fmtNumber(facts.volumeCbm)}</b> ลบ.ม.</span>
          {/* ⭐ **จอเล็กตัดสูตรแพ็คเกจ ไม่ใช่ตัดจำนวนรูป** — รูปคือของที่เปลี่ยนตอนช่าง
              ยืนอยู่ในห้อง ส่วนจำนวนแพ็คเกจเป็นงานที่ทำที่โต๊ะหลังกลับ (หัวหน้าเป็น
              คนเคาะที่แท็บสรุปส่งผล) ⇒ หัวที่พับบนมือถือต้องเหลือของที่ตอบว่า
              "ยังต้องถ่ายอีกไหม" ไม่ใช่ตัวเลขที่ยังไม่มีใครใช้ */}
          <span className={`${styles.fact} ${styles.pkgFact}`}>สูตร <b>{fmtNumber(facts.suggestedPackages)}</b> แพ็คเกจ</span>
          <span className={styles.fact}>จุด <b>{fmtNumber(facts.spotsTotal)}</b></span>
          <span className={styles.fact}>รูป <b>{fmtNumber(facts.photos.total)}</b></span>
        </>
      );

  /* ⭐ **เรียงตามความเร่งด่วน ไม่ใช่ตามลำดับที่เขียนโค้ด** — ที่ ≤680px ป้ายซ้อนกันเป็น
     คอลัมน์ (ท่าที่วัดแล้วประหยัดความสูงที่สุด · เหตุผลและตัวเลขอยู่ใน
     CollapsibleCard.module.css) ⇒ ตัวที่อยู่บนสุดคือตัวที่ถูกอ่านก่อน · ของเดิมดัน
     ป้ายความคืบหน้า ("ยังไม่ครบ" = ตัวเดียวที่บอกว่าต้องทำอะไรต่อ) ไปอยู่ล่างสุด
     ลำดับ: บันทึกไม่ผ่าน → ถูกแก้จากที่อื่น → ความคืบหน้า → ยังไม่บันทึก → ที่มาของแถว */
  const badges = (
    <>
      {error ? <StatusBadge tone="danger" icon={CircleAlert}>บันทึกไม่สำเร็จ</StatusBadge> : null}
      {conflict ? <StatusBadge tone="warning" icon={RefreshCw}>ถูกแก้จากที่อื่น</StatusBadge> : null}
      {/* ป้ายบอกสภาพของพื้นที่นี้ — ไม่ใช่ของทั้งใบ */}
      {isCut
        ? <StatusBadge tone="neutral">ตัดออก</StatusBadge>
        : facts.crewComplete
          ? <StatusBadge tone="success" icon={Check}>วัดแล้ว</StatusBadge>
          : <StatusBadge tone="warning">ยังไม่ครบ</StatusBadge>}
      {dirty ? <StatusBadge tone="info" icon={Pencil}>ยังไม่บันทึก</StatusBadge> : null}
      {/* ป้ายบอกที่มาของพื้นที่ — คนละแกนกับป้ายความคืบหน้า จึงอยู่คู่กันได้ */}
      {isAdded ? <StatusBadge tone="accent">เพิ่มหน้างาน</StatusBadge> : null}
    </>
  );

  const mark = error ? <CircleAlert size={16} aria-hidden="true" />
    : isCut ? <Minus size={16} aria-hidden="true" />
      : facts.crewComplete ? <Check size={16} aria-hidden="true" />
        : index;

  const zoneCode = facts.zoneCodeUnknown ? SURVEY_UNKNOWN_TEXT : facts.zoneCode;

  return (
    <CollapsibleCard
      id={id}
      open={open}
      onToggle={(next) => onToggle?.(next)}
      tone={isCut ? "neutral" : facts.crewComplete ? "success" : "warning"}
      alert={!!error}
      lead={mark}
      eyebrow={zoneCode || null}
      /* ⚠️ ต้องมีช่องว่างจริงคั่นก่อน <small> — ที่ตาเห็นห่างกันคือ `margin` ของ CSS
         ซึ่งไม่มีอยู่ในตัวหนังสือ ⇒ โปรแกรมอ่านหน้าจออ่านชื่อปุ่มว่า "Studio 01ชั้น 02"
         และคนที่ก๊อปข้อความจากจอก็ได้คำติดกันแบบเดียวกัน (วัดจาก accessibility tree จริง) */
      title={<>{zone.zoneName}{zone.floor ? <>{" "}<small>ชั้น {zone.floor}</small></> : null}</>}
      summary={summary}
      badges={badges}
    >
      {/* ⭐ **โฟกัสที่ตกลงในกล่องนี้ = กล่องนี้เป็นเจ้าของ Ctrl+V** — หน้าจำไว้ให้ ไฟล์ที่
          วางลอย ๆ จะได้ไม่ไปโผล่ที่พื้นที่แรกของใบ (แผงไฟล์แนบอัปขึ้นระบบทันที ของที่
          ไปผิดที่คือของที่ต้องตามลบ) */}
      <div className={styles.body} onFocusCapture={() => onActivate?.(zone.id)}>
        {isCut ? (
          <>
            <p className={styles.cutNote}><Scissors size={14} aria-hidden="true" /> ตัดออกจากใบนี้ — {naText(zone.cutReason)}</p>
            {canWrite && (
              <div className={styles.foot}>
                <span className={styles.hint}>กดแล้วกลับมาเป็นพื้นที่ที่ต้องวัด</span>
                <div className={styles.footActs}>
                  <Button size="sm" variant="outline" icon={<Undo2 size={14} aria-hidden="true" />} disabled={busy}
                    onClick={() => save({ status: "ok" })}>
                    เอากลับเข้าใบ
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ⭐ **สองคอลัมน์บนจอกว้าง** (แบบที่อนุมัติ) — ซ้าย "ของที่วัดด้วยตลับเมตร"
                ขวา "ของที่ถ่ายด้วยกล้อง" · ที่ ≤900px ยุบเหลือคอลัมน์เดียวตามลำดับอ่าน */}
            <div className={styles.grid}>
              <div className={styles.col}>
                {/* ── ขนาด ─────────────────────────────────────────────── */}
                <div className={styles.block}>
                  <div className={styles.blockHead}>
                    <h4>ขนาด</h4>
                    {/* คำใบ้ของคนกรอก — ใบที่ล็อกแล้วไม่มีใครต้องทำตาม */}
                    <span>{edit ? "ต้องมี · หน่วยเมตร" : `${facts.parts} ส่วน`}</span>
                  </div>
                  {parts.map((part, i) => (
                    <div key={part.id} className={styles.part} data-read={edit ? undefined : "1"}>
                      <div className={styles.partNo}>{i + 1}</div>
                      <div className={styles.partBody}>
                        {edit ? (
                          <>
                            <div className={styles.partRow}>
                              <Input
                                value={part.label || ""}
                                onChange={(e) => patchPart(part.id, "label", e.target.value)}
                                placeholder="ชื่อส่วน (ไม่บังคับ) — เช่น ปีกทิศเหนือ" maxLength={60} autoComplete="off"
                                aria-label={`ชื่อส่วนที่ ${i + 1}`}
                              />
                              {parts.length > 1 && (
                                <button type="button" className={styles.iconBtn} aria-label={`ลบส่วนที่ ${i + 1}`}
                                  onClick={() => setParts((rows) => rows.filter((p) => p.id !== part.id))}>
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            <div className={styles.dims}>
                              {DIMS.map(([field, label]) => (
                                <label key={field} className={styles.dim}>
                                  <span>{label}</span>
                                  <Input
                                    type="number" inputMode="decimal" min="0" step="0.01"
                                    value={part[field] ?? ""} onChange={(e) => patchPart(part.id, field, e.target.value)}
                                  />
                                </label>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <b className={styles.readValue}>{naText(part.label)}</b>
                            <div className={styles.dims}>
                              {DIMS.map(([field, label]) => (
                                <div key={field} className={styles.dim}>
                                  <span>{label}</span>
                                  <b className={styles.readValue}>{fmtNumber(part[field])}</b>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {edit && (
                    <Button size="sm" variant="quiet" className={styles.addRow} icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => setParts((rows) => [...rows, emptyPart()])}>
                      เพิ่มส่วน
                    </Button>
                  )}
                  {/* 🔴 ปัดเศษครั้งเดียวที่ระดับพื้นที่ ไม่ใช่รายส่วน — สองส่วนส่วนละ 100 ลบ.ม.
                      = 1 แพ็คเกจ ไม่ใช่ 2 (`suggestedPackages` รับปริมาตรรวมมาแล้ว)
                      ⭐ แถวตัวเลขสามช่องแทนแถบรวมสีเบจเดิม (แบบที่อนุมัติ) — ป้ายอยู่บนค่า
                         ไม่ใช่ข้าง ๆ ⇒ อ่านได้ว่าเลขไหนคืออะไรโดยไม่ต้องเดาจากหน่วย */}
                  <dl className={styles.metrics}>
                    <div>
                      <dt>พื้นที่</dt>
                      <dd data-empty={size.areaSqm > 0 ? undefined : "1"}>
                        {size.areaSqm > 0 ? <>{fmtNumber(size.areaSqm)}<small>ตร.ม.</small></> : naText(null)}
                      </dd>
                    </div>
                    <div>
                      <dt>ปริมาตร</dt>
                      <dd data-empty={size.volumeCbm > 0 ? undefined : "1"}>
                        {size.volumeCbm > 0 ? <>{fmtNumber(size.volumeCbm)}<small>ลบ.ม.</small></> : naText(null)}
                      </dd>
                    </div>
                    <div>
                      <dt>สูตรแนะนำ</dt>
                      <dd data-empty={packages ? undefined : "1"}>
                        {packages ? <>{fmtNumber(packages)}<small>แพ็คเกจ</small></> : naText(null)}
                      </dd>
                    </div>
                  </dl>
                  {/* ⚠️ ระบบตรวจส่วนที่วัดทับกันไม่ได้ — คนวัดต้องแบ่งให้ไม่ทับ
                      ⭐ **โผล่เฉพาะตอนมีมากกว่าหนึ่งส่วน** (แบบที่อนุมัติไม่มีบรรทัดนี้เลย)
                      — พื้นที่ส่วนเดียวไม่มีอะไรให้ทับ ⇒ บรรทัดอำพันที่ขึ้นทุกใบตลอดเวลา
                      คือบรรทัดที่กินความสูงของการ์ดทุกใบ และทำให้สีอำพัน (ซึ่งที่อื่นแปลว่า
                      "ต้องทำอะไรสักอย่าง") จางความหมายลง */}
                  {edit && parts.length > 1 && (
                    <p className={styles.hint}>แบ่งให้ไม่ทับกัน — มุมที่สองส่วนชนกันนับครั้งเดียว ระบบตรวจให้ไม่ได้</p>
                  )}
                </div>

                {/* ── จุดที่ติดตั้งได้ ──────────────────────────────────── */}
                <div className={styles.block}>
                  <div className={styles.blockHead}>
                    <h4>จุดที่ติดตั้งได้</h4>
                    <span>{edit ? "อย่างน้อย 1 จุด" : `${facts.spotsTotal} จุด${facts.spotsSelected ? ` · หัวหน้าเลือก ${facts.spotsSelected}` : ""}`}</span>
                  </div>
                  {spots.length === 0 && !edit ? <p className={styles.empty}>ยังไม่ได้ระบุจุด</p> : null}
                  {spots.map((spot, i) => (
                    <div key={spot.id} className={styles.spot} data-read={edit ? undefined : "1"}>
                      <div className={styles.partNo}>{i + 1}</div>
                      <div className={styles.partBody}>
                        {edit ? (
                          <div className={styles.spotIn}>
                            <Input
                              value={spot.label || ""}
                              onChange={(e) => patchSpot(spot.id, "label", e.target.value)}
                              placeholder="ชื่อจุด — เช่น เสาต้นที่ 3 ฝั่งลิฟต์" maxLength={100} autoComplete="off"
                              aria-label={`ชื่อจุดที่ ${i + 1}`}
                            />
                            <Input
                              value={spot.note || ""}
                              onChange={(e) => patchSpot(spot.id, "note", e.target.value)}
                              placeholder="บันทึก (ไม่บังคับ) — เช่น ปลั๊กอยู่ใต้เสา" maxLength={300} autoComplete="off"
                              aria-label={`บันทึกของจุดที่ ${i + 1}`}
                            />
                          </div>
                        ) : (
                          <>
                            <b className={styles.readValue}>{naText(spot.label)}</b>
                            {spot.note ? <span className={styles.hint}>{spot.note}</span> : null}
                          </>
                        )}
                      </div>
                      {edit ? (
                        <button type="button" className={styles.iconBtn} aria-label={`ลบจุดที่ ${i + 1}`}
                          onClick={() => setSpots((rows) => rows.filter((s) => s.id !== spot.id))}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : spot.selected ? (
                        <span className={styles.picked}><Check size={12} aria-hidden="true" /> เลือกติดตั้ง</span>
                      ) : null}
                    </div>
                  ))}
                  {edit && (
                    <Button size="sm" variant="quiet" className={styles.addRow} icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => setSpots((rows) => [...rows, emptySpot()])}>
                      เพิ่มจุดที่ติดตั้งได้
                    </Button>
                  )}
                  {/* 🔴 ช่างแจ้ง "ติดตั้งได้ตรงไหนบ้าง" ไม่ใช่ "จะติดตั้งตรงไหน" — คนเลือกจุดจริง
                      คือหัวหน้า TS ที่จอส่งผล โครงเดียวกับจำนวนแพ็คเกจเป๊ะ
                      ⭐ เหลือบรรทัดเดียว: ท่อน "อย่างน้อย 1 จุด" อยู่บนหัวบล็อกแล้ว และตอนที่
                      *ขาดจริง* มีบรรทัด "ยังขาด n ข้อ" สีอำพันข้างล่างพูดให้แล้ว ⇒ ไม่ต้องมี
                      คำเตือนตัวหนายืนค้างบนการ์ดที่ไม่มีอะไรผิด */}
                  {edit && (
                    <p className={styles.hint}>
                      หัวหน้าเป็นคนเลือกว่าจะติดตั้งจริงกี่จุด — แจ้งมาให้ครบทุกจุดที่ทำได้
                    </p>
                  )}
                </div>
              </div>

              <div className={styles.col}>
                {/* ── รูปสามหัวข้อ ─────────────────────────────────────── */}
                <div className={styles.block}>
                  <div className={styles.blockHead}>
                    <h4>รูปถ่าย</h4>
                    <span>{edit ? "แนบแล้วขึ้นระบบทันที" : `${facts.photos.total} รูป`}</span>
                  </div>
                  <div className={styles.photos}>
                    {PHOTO_GROUPS.map((group) => {
                      const n = facts.photos[group.key];
                      return (
                        <div key={group.key} className={styles.photoGroup}>
                          <p className={styles.photoLabel}>
                            {group.label}
                            <em data-miss={group.required && !n ? "1" : undefined}>
                              {n ? `${n} รูป` : group.required ? "ต้องมี" : "ยังไม่มี"}
                            </em>
                          </p>
                          {/* จำนวนรูปอยู่บนหัวข้อแล้ว — ไม่ต้องให้พาเนลนับซ้ำอีกแถว
                              ⚠️ `intakeWeight` = ใครได้ Ctrl+V ตอนไม่มีอะไรโฟกัส (0 = ได้ก่อน) */}
                          <AttachmentsPanel
                            entityType="service_survey_zone" entityId={zone.id} canEdit={edit} showCount={false}
                            title="" inlineUpload docTypes={[{ key: group.docType, label: group.label }]}
                            onItemsChange={handleItems}
                            intakeWeight={active ? 0 : 1}
                          />
                          {group.hint && edit ? <small className={styles.photoHint}>{group.hint}</small> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ทรงเดียวกับบล็อกอื่นของการ์ด — 🐞 เดิมเป็น form-field ไม่มีเส้นคั่น
                    อ่านเหมือนส่วนหนึ่งของบล็อกจุดติดตั้ง */}
                <div className={styles.block}>
                  {edit ? (
                    <>
                      <label className={styles.blockHead} htmlFor={`note-${zone.id}`}>
                        <h4>บันทึกหน้างาน</h4>
                        <span>ไม่บังคับ</span>
                      </label>
                      <Textarea id={`note-${zone.id}`} value={note} rows={3} maxLength={1000}
                        onChange={(e) => setNote(e.target.value)} />
                    </>
                  ) : (
                    <>
                      <div className={styles.blockHead}><h4>บันทึกหน้างาน</h4></div>
                      <ReadableText text={note} className={styles.readText} />
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 🔴 **มีคนแก้แถวนี้ระหว่างที่ค่าของเรายังไม่ได้บันทึก** — ถ้าไม่บอก คนกด
            "บันทึกพื้นที่นี้" จะทับงานของอีกคนโดยไม่รู้ตัว (ค่าที่ส่งไปคือค่าที่พิมพ์
            ไว้ก่อนเขาแก้) ⇒ บอกตรง ๆ แล้วให้ทางออกสองทาง: ทิ้งร่างไปใช้ของล่าสุด
            หรือกดบันทึกทับอย่างรู้ตัว */}
        {conflict && !isCut && (
          <p className={styles.conflict} role="status">
            <RefreshCw size={15} aria-hidden="true" />
            <span>
              <b>แถวนี้ถูกแก้จากที่อื่น</b> ค่าที่คุณพิมพ์ไว้ยังอยู่ครบ — กดบันทึกจะทับของเขา
            </span>
            <Button size="sm" variant="outline" onClick={() => adoptRow(zoneRef.current)}>
              ใช้ค่าล่าสุดจากฐาน
            </Button>
          </p>
        )}

        {/* 🔴 บันทึกไม่สำเร็จต้องพูดออกมาทันทีที่ตรงนั้น — ไม่ใช่ toast ที่หายไปใน 4 วินาที */}
        {error && (
          <p className={styles.error} role="alert">
            <CircleAlert size={15} aria-hidden="true" />
            <span><b>บันทึกไม่สำเร็จ</b> {error}</span>
          </p>
        )}

        {/* เช็คลิสต์ของพื้นที่นี้ — เหตุผลเป็นตัวหนังสือ ไม่ใช่ปุ่มจางเงียบ
            🔑 อ่านจาก **ค่าที่บันทึกแล้ว** ไม่ใช่ค่าที่กำลังพิมพ์ — ไม่งั้นมันจะเขียวตั้งแต่
            ยังไม่กดบันทึก แล้วช่างเดินออกจากหน้างานโดยเชื่อว่าเสร็จแล้ว */}
        {!isCut && facts.missingCrew.length > 0 && (
          <p className={styles.missing} role="status">
            <b>ยังขาด {facts.missingCrew.length} ข้อ</b> {facts.missingCrew.map((m) => m.text).join(" · ")}
          </p>
        )}

        {edit && cutting && (
          <div className={styles.cutBox}>
            {/* ⚠️ ตัดพื้นที่ออกต้องบอกเหตุผลเสมอ — ของที่หายไปจากสิ่งที่ SA จะเสนอราคา
                คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */}
            <label htmlFor={`cut-${zone.id}`}>
              เหตุผลที่ตัด {zone.zoneName} ออกจากใบนี้ <em>อย่างน้อย 5 ตัวอักษร</em>
            </label>
            <Input id={`cut-${zone.id}`} value={cutReason} onChange={(e) => setCutReason(e.target.value)}
              placeholder="เช่น ห้องยังรีโนเวทไม่เสร็จ" maxLength={500} autoComplete="off" />
            <div className={styles.cutActs}>
              <Button size="sm" variant="quiet" onClick={() => setCutting(false)}>ยกเลิก</Button>
              <Button size="sm" tone="warning" variant="outline" disabled={busy || cutReason.trim().length < 5}
                icon={<Scissors size={14} aria-hidden="true" />}
                onClick={() => save({ status: "cut", cutReason })}>
                ยืนยันตัดออก
              </Button>
            </div>
          </div>
        )}

        {edit && (
          <div className={styles.foot}>
            <div className={styles.footInfo}>
              <span className={styles.hint}>
                {dirty ? "มีค่าที่ยังไม่บันทึก" : facts.crewComplete ? "ส่วนของช่างครบแล้ว" : "ยังไม่ครบ"}
              </span>
              {/* ⭐ **แทนที่การพับเองหลังบันทึก** (กติกาข้อ 3) — ลิงก์นี้พาไปพื้นที่ที่ยังขาด
                  แล้วย้ายโฟกัสไปที่หัวของมัน · พับพื้นที่ปัจจุบัน **เฉพาะเมื่อไม่มีค่าค้าง**
                  ⚠️ คำบนลิงก์ต้องตรงกับทิศที่มันพาไป — `back` = วนกลับไปข้างบนของลิสต์
                  (หน้าเป็นคนบอก เพราะมันเห็นลำดับของทั้งใบ) · เขียน "ถัดไป" ทุกกรณีเมื่อไร
                  คนบนใบหลายพื้นที่จะถูกเด้งกลับขึ้นหัวใบโดยไม่รู้ว่าทำไม */}
              {nextZone && (
                <button type="button" className="text-action"
                  onClick={() => onGoNext?.(nextZone.id, { from: zone.id, keepOpen: dirty || !!error })}>
                  {nextZone.back ? "กลับไปที่" : "ถัดไป:"} {nextZone.name} (ยังไม่ครบ)
                  {nextZone.back
                    ? <ArrowUp size={13} aria-hidden="true" />
                    : <ArrowRight size={13} aria-hidden="true" />}
                </button>
              )}
            </div>
            <div className={styles.footActs}>
              {/* 🔴 **พื้นที่ที่เพิ่มเองต้องลบได้ ไม่ใช่ตัดออก** — ด่านส่งผลบล็อกทั้งใบ ⇒ แถวที่
                  กดเพิ่มผิดแล้วกรอกไม่จบจะล็อกใบตลอดกาล · และ "ตัดออก" จะเขียนทับป้าย
                  "เพิ่มหน้างาน" หายไปเลย (server ปฏิเสธไว้อีกชั้น) */}
              {isAdded ? (
                <Button size="sm" tone="danger" variant="outline" disabled={busy}
                  icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => onDelete?.()}>
                  ลบพื้นที่นี้ทิ้ง
                </Button>
              ) : cutting ? null : (
                /* ⭐ ปุ่มตัดออกเป็น **สีกลาง** (แบบที่อนุมัติ) — มันไม่ใช่การลบข้อมูล และ
                   ย้อนได้ด้วยปุ่มเดียว · สีแดงข้างปุ่มบันทึกทำให้คนไม่กล้าแตะทั้งแถว */
                <Button size="sm" variant="outline" icon={<Scissors size={14} aria-hidden="true" />}
                  onClick={() => setCutting(true)}>
                  ตัดพื้นที่นี้ออก
                </Button>
              )}
              <Button tone="primary" disabled={busy} icon={<Save size={15} aria-hidden="true" />}
                onClick={() => save()}>
                {busy ? "กำลังบันทึก…" : "บันทึกพื้นที่นี้"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
