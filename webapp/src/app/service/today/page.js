"use client";
// ── หน้ามือถือของเจ้าหน้าที่: งานวันนี้ (S-3 · เดิมชื่อ "นัดของฉัน" — F-1 2026-08-27) ──
//
// ⭐ **จุดที่ข้อมูลจริงเข้าระบบ** — ถ้าหน้านี้ใช้ยาก ทั้งโมดูลตาย · ตารางสวยแค่ไหน
// ก็ไม่มีค่าถ้าไม่มีใครปิดงาน แล้วทุกแถวค้างเป็น "นัดไว้" ตลอดกาล
//
// ⚠️ ชื่อหน้าเป็น "งานวันนี้" ไม่ใช่ "งานของฉัน" — ชื่อหลังเป็นของระบบบริหารงานขาย
// (/sa/tasks = งานติดตามส่วนบุคคล) คนละเรื่องกันคนละระบบ · ชื่อซ้ำข้ามระบบทำให้คน
// จำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
//
// ⚠️ ไม่มีปุ่มสลับ "ทั้งทีม" บนหน้านี้ (มติ 2026-08-02 ข้อ 2) — มุมมองทั้งฝ่ายอยู่ที่
// หน้าจัดคิวเจ้าหน้าที่ · เคสไปแทนกันเข้าหน้านี้ด้วยลิงก์ ?user=<id> จากหน้าจัดคิวแทน
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import thaiText from "@/components/ThaiText";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, MapPin, Phone, Play, Ruler, Send, Wrench } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import CloseVisitSheet from "@/components/service/CloseVisitSheet";
import { canDoFieldWork } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { VISIT_KIND_LABELS, visitTimeText, visitWarnings } from "@/lib/service/rounds";
import { VISIT_STATUS_LABELS, isClosedVisit } from "@/lib/service/visitStatus";
import { closeVisitPayload, groupVisits, openCount, overdueDays } from "@/lib/service/myVisits";
import { accessWindowText } from "@/lib/service/sites";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtDayMonth, naText } from "@/lib/format";
import { SURVEY_VISIT_KIND } from "@/lib/service/surveyVisit";
import { apiFetch } from "@/lib/apiFetch";

const SECTIONS = [
  { key: "overdue", title: "ค้างอยู่", tone: "danger" },
  { key: "today", title: "วันนี้", tone: "accent" },
  { key: "tomorrow", title: "พรุ่งนี้", tone: "plain" },
  { key: "later", title: "ถัดไป", tone: "plain" },
];

/* ช่วงที่เข้าได้ = "วัน · เวลา" — ห่อทีละท่อน ให้ตัดบรรทัดได้แค่ที่ " · "
   🐞 เดิมต่อเป็นสตริงเดียว มือถือตัดเหลือ "09:00–" ท้ายบรรทัด แล้ว "12:00" ตกไปบรรทัดใหม่
   🐞 คำนำ "เข้าได้" ต้องอยู่ในท่อนแรกด้วย — เคยอยู่นอกท่อน จอ 768 ตัดกลางคำเป็น "เข้า" / "ได้ จ. อ. …" */
function accessPieces(text) {
  return text.split(" · ").map((part, idx) => (
    <Fragment key={idx}>{idx ? " · " : null}<span className={styles.keep}>{idx ? part : `เข้าได้ ${part}`}</span></Fragment>
  ));
}

/* โซนเส้นทาง · ชื่อลูกค้า — ขึ้นบรรทัดใหม่ได้แค่ที่ช่องว่างที่คนพิมพ์ไว้ ไม่ใช่กลางคำ
   🐞 เดิมต่อเป็นสตริงเดียว จอ 320 ตัดชื่อทับศัพท์กลางคำเป็น "แลบอรา" / "ทอรี่ จำกัด"
      (ICU แบ่งพยางค์ · thaiText กันสตริงข้อมูลไม่ได้ · `word-break: keep-all` ของ Chrome ก็ยังตัดคำไทย)
   ⚠️ ห่อ **รายคำ** ไม่ใช่ทั้งชื่อเป็นก้อนเดียว — ก้อนเดียวดันชื่อลงบรรทัดใหม่ทั้งชื่อ (การ์ดสูงขึ้น
      หนึ่งบรรทัด) และชื่อที่ยาวกว่าการ์ดกลายเป็นสามบรรทัดมี "(มหาชน)" ค้างโดด ๆ
   ⚠️ คำเป็น inline-block กว้างไม่เกินการ์ด ไม่ใช่ nowrap — คำเดียวที่ยาวกว่าการ์ดยังพับในตัวได้ ไม่ล้นจอ
   ⚠️ **ห่อเฉพาะคำไม่เกิน WORD_BOX_MAX ตัวอักษร** — คำยาวกว่านั้นปล่อยเป็นข้อความธรรมดาให้ ICU ตัดตามพจนานุกรม
      🐞 เคยห่อทุกคำ ⇒ คำยาวไม่มีช่องว่าง (มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ 42 ตัว) เริ่มกลางบรรทัดไม่ได้
         ตกลงบรรทัดใหม่ทั้งก้อน ทิ้งโซนค้างเดี่ยวบรรทัดแรก การ์ดสูงขึ้น 19px และคำที่ยาวกว่าการ์ดก็ยังพับในตัวอยู่ดี
      วัดจากชื่อลูกค้าจริง 522 ราย ฟอนต์ .meta จอ 320 (บรรทัดกว้าง 258px):
      · ≤ 24 ตัว กว้างไม่เกิน 131px (ครึ่งบรรทัด) และส่วนใหญ่เป็นคำทับศัพท์ที่ ICU แบ่งผิดพยางค์
        ("เอ็น|เต|อร์|เท|น|เม้น|ท์" · "ยู|รี|แล็กซ์|แอนด์|เมดิ|คอล") ⇒ ห่อไว้คุ้ม เสียที่อย่างมากเท่าตัดคำปกติ
      · ≥ 25 ตัว เป็นคำประสมไทยที่ ICU ตัดตรงคำจริง ("คณะ|กรรมการ|โครงการ|สวนดุสิต") ⇒ ไม่ต้องห่อ */
const WORD_BOX_MAX = 24;

function wherePieces(parts) {
  return parts.map((part, idx) => (
    <Fragment key={idx}>
      {idx ? " · " : null}
      {String(part).split(/(\s+)/).map((word, w) => (
        /^\s*$/.test(word) || word.length > WORD_BOX_MAX ? word : <span key={w} className={styles.word}>{word}</span>
      ))}
    </Fragment>
  ));
}

export default function TodayPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  /* 🐞 **ต้องเป็น `canDoFieldWork` ไม่ใช่ `canEditService`** — ตำแหน่งเจ้าหน้าที่บริการ
     (Operation) ถือ `service:work` ไม่ใช่ `service:edit` (มติ 2026-08-30) · เช็คด้วย
     ตัวเก่า เขาจะเห็นหน้านี้ (เมนูเปิดด้วย canDoFieldWork) แต่ **ไม่มีปุ่มเริ่มงาน/ปิดงาน
     สักปุ่ม** ⇒ ตำแหน่งที่ตั้งใจให้ปิดงานของตัวเองได้ กลับทำงานไม่ได้ทั้งตำแหน่ง
     ⚠️ ด่านจริงยังอยู่ที่ server รายใบ (`canWorkOwnVisit`) — หน้านี้แสดงเฉพาะงานของคนคนนั้น */
  const canEdit = useMemo(
    () => canDoFieldWork({ role, team, teams, department }),
    [role, team, teams, department],
  );

  // ไปแทนกัน: หน้าจัดคิวลิงก์มาพร้อม ?user=<id> — หน้านี้กลายเป็น "งานวันนี้ของ <เจ้าหน้าที่>"
  // ไม่มี UI สลับคนบนหน้านี้เอง (มุมมองข้ามคนเป็นเรื่องของหน้าจัดคิว) · server เป็นคน
  // เทียบว่า id นี้คือตัวเองหรือคนอื่น — ฝั่ง client ไม่มีทางรู้ id ตัวเอง (roleContext ไม่พก id)
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewUserId = searchParams.get("user") || "";
  const viewingOther = !!viewUserId;

  const [visits, setVisits] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [closing, setClosing] = useState(null);
  const [toast, setToast] = useState(null);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const assignee = viewingOther ? `&assignee=${encodeURIComponent(viewUserId)}` : "";
      const res = await apiFetch(`/api/service/my-visits?scope=mine${assignee}`);
      const data = await res.json().catch(() => null);
      if (!isLatest()) return; // เปลี่ยนคนดูระหว่างรอ — คิวต้องตรงกับลิงก์ล่าสุด
      if (!res.ok) throw new Error(data?.error || "โหลดคิวงานไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "วันนี้ไม่มีงาน" หน้าตาเหมือนกัน
      // จนแยกไม่ออก แล้วเจ้าหน้าที่จะเชื่อว่าตัวเองว่างทั้งที่มีนัดรออยู่
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดคิวงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun, viewingOther, viewUserId]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const todayIso = businessDate();
  const groups = useMemo(() => groupVisits(visits, todayIso), [visits, todayIso]);
  const counts = useMemo(() => openCount(groups), [groups]);

  /* ⭐ ในแต่ละกลุ่ม งานที่ยังไม่ปิดขึ้นก่อน · ใบที่ปิดแล้วต่อท้าย (ลำดับเวลาเดิมในแต่ละฝั่ง)
     🐞 เดิมเรียงตามเวลาล้วน ⇒ ใบที่ปิดไปตอนเช้า (การ์ดจาง) ยึดช่องแรกของ "วันนี้" ก่อนงานที่ต้องทำ
     🐞 เลขหัวกลุ่มเคยนับรวมใบปิด ("วันนี้ 4") ขัดกับป้ายหัวจอที่นับเฉพาะงานที่ยังไม่ปิด ("วันนี้ 3")
        ⇒ หัวกลุ่มใช้เลขเดียวกับป้าย (ตัวตัดสิน isClosedVisit ตัวเดียวกับ openCount) แล้วบอกใบปิดแยกเป็นคำ
     เรียงตอนแสดงผลเท่านั้น — groupVisits ยังเป็นลำดับเวลาให้ตัวนับป้ายเมนูใช้เหมือนเดิม */
  const sectionRows = useMemo(() => Object.fromEntries(SECTIONS.map(({ key }) => {
    const rows = groups[key];
    const open = rows.filter((visit) => !isClosedVisit(visit));
    const closed = rows.filter((visit) => isClosedVisit(visit));
    return [key, { rows: [...open, ...closed], open: open.length, closed: closed.length }];
  })), [groups]);

  /* ⭐ **งานที่กำลังทำอยู่ ปักไว้บนสุด** (มติผู้ใช้ 2026-09-21) — 🐞 เดิมมีนัดค้างเมื่อไร
     การ์ดของงานที่ช่างยืนทำอยู่ตรงหน้าถูกดันลงไปใต้กลุ่ม "ค้างอยู่" ต้องเลื่อนหาทุกครั้ง
     ⚠️ เป็น **แถบทางลัด** ไม่ใช่กลุ่มใหม่ — การ์ดยังอยู่ในกลุ่มเดิม เลขหัวกลุ่มจึงยังตรงกับ
        ป้ายหัวจอ (ดู sectionRows) · ปุ่มในแถบเรียกตัวเดียวกับปุ่มบนการ์ด */
  const runningVisits = useMemo(
    () => SECTIONS.flatMap(({ key }) => groups[key]).filter((visit) => visit.status === "in_progress"),
    [groups],
  );

  // ชื่อเจ้าหน้าที่ที่กำลังดูแทน — เอาจากนัดใบแรกที่มีชื่อ (API กรองด้วย assignee อยู่แล้ว)
  const viewedName = useMemo(() => {
    if (!viewingOther) return "";
    return visits.find((v) => v.assigneeName)?.assigneeName || "เจ้าหน้าที่คนอื่น";
  }, [viewingOther, visits]);

  /* ⭐ ปุ่ม "เริ่มงาน" — ส่ง `stamp: 'start'` ให้ server ประทับเวลาไทยเอง
     เจ้าหน้าที่ไม่พิมพ์เวลา และค่าที่ได้ไม่ขึ้นกับนาฬิกาในมือถือที่ตั้งผิดได้ (มติข้อ 5) */
  const [starting, setStarting] = useState(null);
  const startVisit = async (visit) => {
    setStarting(visit.id);
    try {
      const res = await apiFetch(`/api/service/visits/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", stamp: "start" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "เริ่มงานไม่สำเร็จ");
      /* ⭐ **นัดประเมิน: เริ่มงานแล้วพาเข้าจอกรอกทันที** (มติผู้ใช้ 2026-09-21 — รับงาน =
         เริ่มงาน) · ช่างมาหน้านี้เพื่อไปต่อที่จอประเมินอยู่แล้ว ไม่ต้องกดอีกปุ่ม
         ⚠️ เว้นตอนดูงานแทนคนอื่น — ผู้จัดคิวที่กดเริ่มให้ยังอยู่ที่คิวของคนนั้นต่อ */
      if (visit.kind === SURVEY_VISIT_KIND && visit.requestId && !viewingOther) {
        router.push(`/service/surveys/${visit.requestId}`);
        return;
      }
      setToast({ kind: "success", msg: `เริ่มงานแล้ว · ${data?.visit?.actualStartTime || ""} น.` });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setStarting(null);
    }
  };

  const closeVisit = async (form) => {
    const res = await apiFetch(`/api/service/visits/${closing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      /* stamp:'end' = ให้ server ประทับเวลาจบด้วยนาฬิกาไทย · ฟอร์มไม่ส่งเวลามาเอง
         ⚠️ **ใบที่ปิดไปแล้วต้องไม่ส่ง `stamp`** — ปุ่มเดียวกันนี้เป็นทั้ง "ปิดงาน" และ
           "แก้ผลการเข้า" · ส่งไปกับใบที่ปิดแล้ว = 409 ทุกครั้ง (ตัวตัดสินอยู่ที่
           `closeVisitPayload` เพื่อให้เทสต์ได้โดยไม่ต้องมี DOM) */
      body: JSON.stringify(closeVisitPayload(closing, form)),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "ปิดงานไม่สำเร็จ");

    // ⭐ server เสนอนัดรอบถัดไปมา — บอกวันให้เห็น แต่ไม่สร้างให้เอง
    const suggestion = data?.nextVisitSuggestion;
    const closedAs = VISIT_STATUS_LABELS[data?.visit?.status] || "ปิดงาน";
    /* ⭐ **บอกผลที่เกิดกับ *ใบ* ด้วย ไม่ใช่แค่ผลของนัด** (§5E ②) — ช่างที่ปิดว่าเข้าไม่ได้
       ต้องรู้ว่าเรื่องไปต่อยังไง ไม่ใช่เห็นแค่ "ทำไม่ได้แล้ว" แล้วเดาเองว่าต้องทำอะไรอีก */
    /* ⭐ นัดถอนเครื่อง: บอกผลที่เกิดกับ **ทะเบียน** ด้วย — เครื่องที่ถอนไม่สำเร็จยังค้างอยู่
       ที่ไซต์ ต้องบอกชื่อและบอกทางแก้ (บันทึกนัดซ้ำ = ระบบลองถอนให้อีกรอบ) ไม่ใช่ขึ้นเขียวเฉย ๆ
       ⚠️ ทางแก้ต้องไปถึงได้จริง — นัดที่เลยวันแล้วหายจากหน้านี้ทันทีที่ปิด (ปุ่ม "แก้ผลการเข้า"
          หายไปด้วย) ⇒ ชี้ไปที่ผู้จัดคิว ซึ่งเห็นรายการเดียวกันในเธรดของนัด */
    const retrieval = data?.retrieval;
    const retrievalFailed = retrieval?.failed || [];
    if (retrievalFailed.length) {
      setToast({
        kind: "error",
        msg: `${closedAs} · แต่ถอนออกจากไซต์ไม่สำเร็จ ${retrievalFailed.length} เครื่อง (${retrievalFailed.map((f) => f.label).join(" · ")}) — แจ้งผู้จัดคิวให้เปิดนัดนี้แล้วบันทึกอีกครั้ง ระบบจะลองถอนให้ใหม่`,
      });
      setClosing(null);
      await load();
      return;
    }
    const retrievalText = retrieval?.moved ? ` · ถอนเครื่องออกจากไซต์ ${retrieval.moved} เครื่อง — ทะเบียนเป็น “ว่าง” แล้ว` : "";
    /* 🐞 ข้อความสำรองเคยเป็น `${closedAs}แล้ว` ⇒ ปิดเป็น "เข้าแล้ว" ได้ toast "เข้าแล้วแล้ว"
       (นัดที่ไม่มีรอบ เช่นนัดถอนเครื่อง ตกทางนี้ทุกใบ) */
    setToast(data?.steppedBackRequest
      ? { kind: "success", msg: `${closedAs} · ใบประเมินกลับไปขั้นลงคิวแล้ว — TS จะลงวันใหม่ และฝ่ายขายได้รับแจ้งพร้อมเหตุผล` }
      : suggestion
      ? { kind: "success", msg: `${closedAs} · รอบถัดไปควรเข้า ${suggestion.scheduledDate} — สร้างนัดได้ที่หน้าจัดคิวเจ้าหน้าที่` }
      : { kind: "success", msg: `ปิดงานแล้ว · ${closedAs}${retrievalText}` });
    setClosing(null);
    await load();
  };

  const subtitle = viewingOther
    ? `กำลังดูงานของ ${viewedName} (ไปแทนกัน) · ปิดงานแทนได้จากหน้านี้`
    : "นัดเข้าไซต์ที่มอบหมายให้คุณ · ปิดงานได้จากหน้านี้";

  return (
    <Workspace
      icon={<Wrench size={20} aria-hidden="true" />}
      title="งานวันนี้"
      subtitle={subtitle}
      /* ตัวเลขสรุปอยู่ขวาของหัวจอเป็นป้าย · ศูนย์ทั้งหมด = ไม่โชว์ (สถานะว่างบอกอยู่แล้ว)
         🐞 เดิมเป็นแถบ toolbar ลอยชิดซ้ายตัวเล็กเท่าคำบรรยาย ซ้ำกับหัวกลุ่มที่อยู่ถัดลงไป
         ⚠️ นับเฉพาะงานที่ยังไม่ปิด — เลขหัวกลุ่มข้างล่างต้องเป็นเลขเดียวกัน (ดู sectionRows) */
      headerRight={(counts.overdue + counts.today + counts.tomorrow) > 0 ? (
        <>
          {counts.overdue > 0 && <span className="ui-badge danger">ค้าง {counts.overdue}</span>}
          <span className="ui-badge">วันนี้ {counts.today}</span>
          <span className="ui-badge">พรุ่งนี้ {counts.tomorrow}</span>
        </>
      ) : null}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {!loading && !loadError && runningVisits.length > 0 && (
        <section className={styles.liveStrip} aria-label="งานที่กำลังทำอยู่">
          {runningVisits.map((visit) => {
            const site = sitesById.get(visit.siteId);
            const survey = visit.kind === SURVEY_VISIT_KIND && visit.requestId;
            return (
              <div key={visit.id} className={styles.liveRow}>
                <span className={styles.pulse} aria-hidden="true" />
                <span className={styles.liveCopy}>
                  <b>{site?.name || visit.siteId}</b>
                  <small>กำลังทำอยู่ · {VISIT_KIND_LABELS[visit.kind] || visit.kind} · เริ่ม {String(visit.actualStartTime || "").slice(0, 5)} น.</small>
                </span>
                {survey ? (
                  <Button as="a" href={`/service/surveys/${visit.requestId}`} tone="primary" size="sm"
                    icon={<Ruler size={14} aria-hidden="true" />}>
                    ไปต่อ
                  </Button>
                ) : canEdit ? (
                  <Button tone="primary" size="sm" onClick={() => setClosing(visit)}>ปิดงาน</Button>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        SECTIONS.every((section) => groups[section.key].length === 0) ? (
          viewingOther ? (
            <EmptyState icon={CheckCircle2}>{`${viewedName} ไม่มีนัดค้างและไม่มีนัดในช่วงนี้`}</EmptyState>
          ) : (
            <EmptyState icon={CheckCircle2}>
              {thaiText("ไม่มีนัดค้างและไม่มีนัดในช่วงนี้")}
              <small>นัดที่ผู้จัดคิวมอบหมายให้คุณจะขึ้นที่นี่</small>
            </EmptyState>
          )
        ) : SECTIONS.map((section) => {
          const { rows, open, closed } = sectionRows[section.key];
          if (!rows.length) return null;
          return (
            <section key={section.key} className={styles.section}>
              <h2 className={`${styles.sectionTitle} ${section.tone === "danger" ? styles.danger : ""}`}>
                {section.tone === "danger" && <AlertTriangle size={15} aria-hidden="true" />}
                {section.title}
                <span className={styles.sectionCount}>{/* ไม่ขึ้นต้นด้วยศูนย์ — กลุ่มที่ปิดครบทุกใบบอกแค่จำนวนที่ปิด */}
                  {closed ? (open ? `${open} · ปิดแล้ว ${closed}` : `ปิดแล้ว ${closed}`) : open}</span>
              </h2>

              {rows.map((visit) => {
                const site = sitesById.get(visit.siteId);
                const warnings = visitWarnings(visit, { site });
                const done = isClosedVisit(visit);
                const running = visit.status === "in_progress";
                const late = overdueDays(visit, todayIso);
                const access = accessWindowText(site);
                const where = [site?.routeZone, site?.customerName].filter(Boolean);
                const surveyLink = visit.kind === SURVEY_VISIT_KIND && visit.requestId;
                return (
                  <article key={visit.id} className={`${styles.card} ${done ? styles.cardDone : ""} ${running ? styles.cardLive : ""} ${late && !done && !running ? styles.cardLate : ""}`}>
                    <div className={styles.cardHead}>
                      {/* ⚠️ **วันที่ต้องอยู่บนการ์ด** — กลุ่ม "ค้างอยู่" กับ "ถัดไป" รวมหลายวัน
                          ไว้ด้วยกัน ถ้ามีแต่เวลา นัดที่ค้างมาสองเดือนจะหน้าตาเหมือนนัดเมื่อวาน */}
                      <span className={styles.date}>{fmtDayMonth(visit.scheduledDate)}</span>
                      <span className={styles.time}>{visitTimeText(visit)}</span>
                      <span className={styles.kind}>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</span>
                      {late && !done && !running && <span className="ui-badge danger">ค้าง {late} วัน</span>}
                      {done && <span className={`ui-badge ${visit.status === "done" ? "success" : "warning"}`}>{VISIT_STATUS_LABELS[visit.status]}</span>}
                    </div>

                    <p className={styles.siteName}>{site?.name || visit.siteId}</p>
                    <p className={styles.meta}>
                      {where.length ? wherePieces(where) : (access ? null : naText(null))}
                      {access && <>{where.length ? " · " : null}{accessPieces(access)}</>}
                    </p>
                    {site?.accessNote && <p className={styles.meta}>{site.accessNote}</p>}

                    {/* 🐞 หมายเหตุที่คนจัดคิวพิมพ์ไว้ **ไม่เคยถูกแสดงบนการ์ดเลย** ทั้งที่
                        เก็บลง service_visits.note และ API ส่งมาครบ (select '*') ⇒ ข้อความที่
                        ตั้งใจสั่งงานเจ้าหน้าที่หายทั้งหมด · แยกทรงจาก .meta เพราะเป็นคำสั่ง ไม่ใช่คำขยาย */}
                    {visit.note && (
                      <p className={styles.note}>
                        <FileText size={13} aria-hidden="true" />
                        <span>{visit.note}</span>
                      </p>
                    )}

                    {running && (
                      <p className={styles.running}>
                        <span className={styles.pulse} aria-hidden="true" />
                        กำลังทำอยู่ · เริ่ม {String(visit.actualStartTime || "").slice(0, 5)} น.
                      </p>
                    )}

                    {warnings.map((warning) => (
                      <p key={warning.kind} className={styles.warn}>
                        <AlertTriangle size={13} aria-hidden="true" />{warning.message}
                      </p>
                    ))}

                    <div className={styles.actions}>
                      {/* ⭐ สองปุ่มคนละจังหวะ: ยังไม่เริ่ม = "เริ่มงาน" (ประทับเวลาเริ่มที่ server)
                          · กำลังทำอยู่ = "ปิดงาน" · ปิดแล้ว = "แก้ผลการเข้า"
                          ไม่มีปุ่มไหนให้พิมพ์เวลาเอง — นั่นคือทั้งเหตุผลของการมีปุ่มเริ่มงาน
                          ⚠️ ลำดับตามจังหวะงาน เริ่มงาน → บันทึกหน้างาน → ปิดงาน · ปุ่ม primary ใบละปุ่ม
                          🐞 เดิมนัดประเมินมี primary สองปุ่มเท่ากัน และ "ปิดงาน" มาก่อน "บันทึกหน้างาน" */}
                      {canEdit && !done && !running && (
                        <Button tone="primary" size="sm" disabled={starting === visit.id}
                          icon={<Play size={14} aria-hidden="true" />}
                          onClick={() => startVisit(visit)}>
                          {starting === visit.id ? "กำลังเริ่ม…" : "เริ่มงาน"}
                        </Button>
                      )}
                      {/* ⭐ **นัดประเมินพื้นที่ไม่ปิดงานด้วยฟอร์มเดียวกับนัดบริการ** — ของที่ต้อง
                          กรอกคือขนาด·รูป·จุดติดตั้ง ซึ่งเป็นตารางลูกของใบคำร้อง ไม่ใช่ผลรายเครื่อง
                          ⇒ ปุ่มพาไปจอของตัวเอง · โผล่เฉพาะนัดที่ผูกใบคำร้องจริง */}
                      {/* ⭐ **นัดประเมิน: กรอกและส่งงานที่จอประเมินที่เดียว** (มติผู้ใช้ 2026-09-21)
                          🐞 เดิม "ปิดงาน" ของนัดประเมินเปิดแผ่นปิดงานของงานบริการ (ของที่ใช้ ·
                          ลายเซ็น · รูปอีกชุด) และปิดเป็น "เสร็จ" ได้ทั้งที่ยังไม่ได้วัด
                          ⇒ กำลังทำ = "บันทึกหน้างาน" เป็นปุ่มหลัก + "ส่งงาน" พาไปโมดัลบนจอนั้น */}
                      {surveyLink && (
                        <Button as="a" href={`/service/surveys/${visit.requestId}`}
                          tone={running ? "primary" : "neutral"} variant={done ? "quiet" : undefined} size="sm"
                          icon={<Ruler size={14} aria-hidden="true" />}>
                          {done ? "เปิดใบประเมิน" : "บันทึกหน้างาน"}
                        </Button>
                      )}
                      {surveyLink && running && canEdit && (
                        <Button as="a" href={`/service/surveys/${visit.requestId}?submit=1`} tone="neutral" size="sm"
                          icon={<Send size={14} aria-hidden="true" />}>
                          ส่งงาน
                        </Button>
                      )}
                      {canEdit && !surveyLink && (running || done) && (
                        <Button tone={done ? "neutral" : "primary"} variant={done ? "quiet" : undefined} size="sm"
                          onClick={() => setClosing(visit)}>
                          {done ? "แก้ผลการเข้า" : "ปิดงาน"}
                        </Button>
                      )}
                      {done && (
                        <Button as="a" href={`/service/visits/${visit.id}`} tone="neutral" variant="quiet" size="sm"
                          icon={<ClipboardList size={14} aria-hidden="true" />}>
                          ใบส่งงาน
                        </Button>
                      )}
                      {/* ปุ่มเสริมอยู่ท้ายและพับลงบรรทัดใหม่เป็นคู่ — จอแคบปุ่มงานขึ้นต้นแถวเสมอ */}
                      {(site?.mapUrl || site?.contactPhone) && (
                        <span className={styles.aux}>
                          {site?.mapUrl && (
                            <Button as="a" href={site.mapUrl} target="_blank" rel="noreferrer noopener"
                              tone="neutral" variant="quiet" size="sm" icon={<MapPin size={14} aria-hidden="true" />}>
                              นำทาง
                            </Button>
                          )}
                          {site?.contactPhone && (
                            <Button as="a" href={`tel:${site.contactPhone}`}
                              tone="neutral" variant="quiet" size="sm" icon={<Phone size={14} aria-hidden="true" />}>
                              โทร
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })
      )}

      <CloseVisitSheet
        open={!!closing}
        visit={closing}
        site={closing ? sitesById.get(closing.siteId) : null}
        onClose={() => setClosing(null)}
        onSubmit={closeVisit}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
