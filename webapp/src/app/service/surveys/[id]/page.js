"use client";
// ── ใบประเมินพื้นที่ฝั่ง TS — สองมุมมองของงานเดียวกัน (เฟส 3 · จอ 06+07) ──
//
// ⭐ **หน้างาน** (จอ 06) — ช่างรายงานข้อเท็จจริง · ออกแบบจากมือถือก่อน ผู้ใช้ยืนอยู่
//   หน้างาน ถือมือถือ อีกมือถือตลับเมตร · เข้าจากนัดใน `/service/today`
// ⭐ **สรุปส่งผล** (จอ 07) — หัวหน้า TS ตัดสินสองอย่างบนโต๊ะ: จะติดตั้งจุดไหน
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ แล้วกดส่งให้ฝ่ายขาย
//
// ⭐ **เปลือกเป็นทรงหน้ารายละเอียดของบ้าน** (PR3 ของการรื้อจอประเมิน · แบบที่อนุมัติ
//   2026-09-16) — `Workspace hideHeader` + `DetailOverview` (รหัส · ชื่อ + ไซต์/นัด/
//   กำหนดส่ง) + `DetailPageLayout` ที่มีรางขวา · **ปุ่มระดับใบทั้งชุดอยู่ในการ์ด
//   "จัดการผลประเมิน" บนรางที่เดียว** (`SurveyControlCard`) — ย้ายมาจากหัวจอ ไม่ใช่ก๊อป
//   ⚠️ ป้ายความคืบหน้าบนหัวจอ · แถบ "ส่งผลให้ฝ่ายขายแล้ว" · ปุ่มส่ง/ดึงกลับที่
//   `headerRight` **ถูกย้ายเข้าการ์ดทั้งหมด** — วางกลับมาที่นี่อีกเมื่อไร จะได้ของ
//   ชิ้นเดียวกันสองที่ที่เพี้ยนหากันเสมอ (บทเรียนรางขวารุ่นแรกของหน้าคำร้อง)
//
// ⚠️ **ด่านเขียนเป็นด่านรายใบ ไม่ใช่ cap ล้วน** — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย ⇒ server เป็นคนตอบว่าเขียนได้ไหม (`canWrite`)
//   จอไม่คำนวณเอง เพราะจอไม่รู้ user id ของตัวเอง
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Flag, MapPin, MapPinPlus, Search } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyControlCard from "@/components/service/SurveyControlCard";
import SurveyResultTable from "@/components/service/SurveyResultTable";
import SurveyZoneCard from "@/components/service/SurveyZoneCard";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import {
  surveyAddZoneError, surveyChangeCounts, surveyChangeText,
  surveySendBackError, surveyTotals,
} from "@/lib/service/survey";
import { surveyControlView } from "@/lib/service/surveyControl";
import { surveyRowNameClash } from "@/lib/service/surveyRequest";
import { isClosedVisit } from "@/lib/service/visitStatus";
import { floorLabel, normalizeFloor } from "@/lib/service/zoneCode";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { fmtDate, naText } from "@/lib/format";
import { toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";

/* จุดจอดของลิงก์ "เปิด <พื้นที่>" ในการ์ดควบคุม — id ตัวเดียวกันทั้งจอ
   ⚠️ ระยะหลบแถบเมนูอยู่ที่ `scroll-margin-top` ของการ์ดพื้นที่ (SurveyZoneCard) */
const zoneAnchor = (zoneId) => `survey-zone-${zoneId}`;

export default function SurveySheetPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const params$ = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyZone, setBusyZone] = useState(null);
  const [toast, setToast] = useState(null);
  /* ── สองมุมมองของงานเดียวกัน (มติผู้ใช้ 2026-08-29) ──────────────────────
     **หน้างาน** = ช่างรายงานข้อเท็จจริง (มือถือ) · **สรุปส่งผล** = หัวหน้าตัดสินใจ (โต๊ะ)
     ⚠️ ไม่แยกเป็นสองหน้าเพราะเป็น *ใบเดียวกัน* — แยก URL แล้วคนจะส่งลิงก์ผิดมุมมองให้กัน
     ⚠️ แท็บอยู่ใน URL (?tab=) ให้ลิงก์ตรงเข้ามุมมองที่ต้องการได้ (ท่าเดียวกับทะเบียนสัญญา) */
  const urlTab = params$.get("tab") === "result" ? "result" : "field";
  const [tab, setTab] = useState(urlTab);
  useEffect(() => { setTab(urlTab); }, [urlTab]);
  const [sending, setSending] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  /* ดึงผลกลับมาแก้ (§5E ④) — เหตุผลบังคับ เพราะ SA อาจเอาตัวเลขไปเสนอราคาแล้ว */
  const [recalling, setRecalling] = useState(false);
  const [recallReason, setRecallReason] = useState("");
  const [recallBusy, setRecallBusy] = useState(false);
  /* ช่างเพิ่มพื้นที่ที่เจอหน้างาน (มติข้อ 6) — ฟอร์มย่อของ "เพิ่มพื้นที่ใหม่" ฝั่ง SA
     ⚠️ ชั้นบังคับเหมือนกัน เพราะมันเป็นท่อน FF ของรหัส ZN (mig 0315) */
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", floor: "", note: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  /* หัวหน้าแจ้งช่างให้กลับไปเก็บงาน (แผน §5.4) — เหตุผลบังคับ เพราะช่างจะเห็นข้อความนี้
     ในกระดิ่งแล้วต้องรู้ว่าต้องไปทำอะไร โดยไม่ต้องโทรถามกลับ
     ⚠️ ปุ่มอยู่ในการ์ดควบคุม **ครั้งเดียวต่อใบ** — ไม่ใช่ปุ่มต่อข้อเหมือนเช็คลิสต์เดิม */
  const [sendingBack, setSendingBack] = useState(false);
  const [sendBackNote, setSendBackNote] = useState("");
  const [sendBackBusy, setSendBackBusy] = useState(false);

  /* ⚠️ กันคำตอบมาผิดลำดับ — ช่างกดบันทึกรัว ๆ ได้ ถ้าไม่กัน คำตอบของรอบที่ตกไปแล้ว
     จะเขียนทับเป็นตัวสุดท้าย โดยไม่มี error อะไรเลย */
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const body = await apiJson(`/api/service/surveys/${id}`, { fallbackError: "โหลดใบประเมินไม่สำเร็จ" });
      if (!isLatest()) return;
      setData(body);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีพื้นที่" — โหลดพังกับใบว่างหน้าตาเหมือนกัน
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดใบประเมินไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const saveZone = async (zoneId, payload) => {
    setBusyZone(zoneId);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
        method: "PATCH", json: payload, fallbackError: "บันทึกผลวัดไม่สำเร็จ",
      });
      setToast({ kind: "success", msg: "บันทึกแล้ว" });
      await load({ background: true });
    } finally {
      setBusyZone(null);
    }
  };

  /* การตัดสินใจของหัวหน้า — คนละเมธอดกับของช่าง (PUT vs PATCH) เพราะคนละชุดช่อง */
  const decideZone = async (zoneId, payload) => {
    setBusyZone(zoneId);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
        method: "PUT", json: payload, fallbackError: "บันทึกไม่สำเร็จ",
      });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusyZone(null);
    }
  };

  const send = async () => {
    setSendBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/send`, {
        method: "POST", fallbackError: "ส่งผลไม่สำเร็จ",
      });
      setSending(false);
      setToast({ kind: "success", msg: "ส่งผลให้ฝ่ายขายแล้ว" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setSending(false);
    } finally {
      setSendBusy(false);
    }
  };

  const recall = async () => {
    setRecallBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/recall`, {
        method: "POST", json: { reason: recallReason.trim() }, fallbackError: "ดึงผลกลับไม่สำเร็จ",
      });
      setRecalling(false);
      setRecallReason("");
      setToast({ kind: "success", msg: "ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setRecallBusy(false);
    }
  };

  const addZone = async () => {
    setAddBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/zones`, {
        method: "POST", json: draft, fallbackError: "เพิ่มพื้นที่ไม่สำเร็จ",
      });
      setAdding(false);
      setDraft({ name: "", floor: "", note: "" });
      setToast({ kind: "success", msg: "เพิ่มพื้นที่แล้ว — ได้รหัสในทะเบียนเรียบร้อย" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setAddBusy(false);
    }
  };

  /* ลบพื้นที่ที่เพิ่มผิด — ไม่ใช่ "ตัดออก" (ดูเหตุผลที่ route)
     ⚠️ ไม่ใส่ `retry` — ลบซ้ำรอบสองได้ 404 แล้วจอจะบอกคนละเรื่องกับความจริง */
  const removeZone = async () => {
    setRemoveBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${removing.id}`, {
        method: "DELETE", fallbackError: "ลบพื้นที่ไม่สำเร็จ",
      });
      setRemoving(null);
      setToast({ kind: "success", msg: "ลบพื้นที่ที่เพิ่มไว้แล้ว" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setRemoveBusy(false);
    }
  };

  const sendBack = async () => {
    setSendBackBusy(true);
    try {
      const res = await apiJson(`/api/service/surveys/${id}/send-back`, {
        method: "POST", json: { note: sendBackNote.trim() }, fallbackError: "แจ้งช่างไม่สำเร็จ",
      });
      setSendingBack(false);
      setSendBackNote("");
      setToast({ kind: "success", msg: `แจ้งช่างแล้ว ${res?.notified || 0} คน` });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setSendBackBusy(false);
    }
  };

  const zones = useMemo(() => data?.zones || [], [data]);
  const filesByZone = useMemo(() => data?.filesByZone || {}, [data]);
  const totals = surveyTotals(zones);
  /* "ที่ขอไป" เทียบ "ที่ได้กลับมา" (แผน §9 ข้อ 2) — บนจอของ TS เองใส่ชื่อพื้นที่ในวงเล็บ
     เพราะนี่คือบรรทัดที่เขาใช้ตรวจตัวเองก่อนกดส่ง ไม่ใช่บรรทัดรายงาน
     ⭐ **เป็นคำบรรยายของตาราง** ⇒ ไปอยู่ใต้ชื่อการ์ด "สรุปผลประเมินรายพื้นที่"
        (เดิมเป็น <p> ลอยบนพื้นหน้า แยกจากตารางที่มันอธิบาย) */
  const changeText = surveyChangeText(surveyChangeCounts(zones), { withNames: true });

  /* 🔑 **ทุกอย่างที่การ์ดควบคุมวาด มาจากตัวตัดสินตัวเดียว** (PR2) — สถานะ · โทน ·
     เหตุผลที่กดส่งไม่ได้ · ด่านต่อพื้นที่ · ขั้นของใบ · กล่องแจ้ง
     ⚠️ "วันนี้" มาจากนาฬิกาไทยของผู้เรียก ไม่ใช่ `new Date()` ในตัวตัดสิน (กติกา thai-time) */
  const view = useMemo(() => surveyControlView({
    request: data?.request || null,
    zones,
    filesByZone,
    visit: data?.visit || null,
    recall: data?.recall || null,
    unknown: data?.unknown || {},
    viewer: {
      canWrite: data?.canWrite === true,
      canDecide: data?.canDecide === true,
      /* สองตัวนี้มาจาก server ล้วน — จอไม่รู้ role ของตัวเอง ⇒ เดาไม่ได้ทั้งคู่
         (`canOpenRequest` = เปิดหน้าคำร้องได้ไหม · `writeBlockedReason` = เหตุที่เขียนไม่ได้
          ซึ่ง `visitWriteAccess` พิมพ์มาแล้วรายคน "นัดนี้ไม่ใช่งานของคุณ …") */
      canOpenRequest: data?.canOpenRequest === true,
      writeBlockedReason: data?.writeBlockedReason || null,
    },
    tab,
    today: businessDate(),
  }), [data, zones, filesByZone, tab]);

  const canDecide = data?.canDecide === true;
  /* 🔑 ด่านตัวเดียวกับ server — ปุ่มในโมดัลปิดตามนี้ และเหตุขึ้นเป็นตัวหนังสือ
     ⚠️ รายชื่อช่างมาจาก **นัด** ไม่ใช่จากใบ — ตัวตัดสินอ่านให้แล้ว (`zoneGaps.crewIds`) */
  const sendBackGate = surveySendBackError(data?.request, {
    canSend: canDecide,
    note: sendBackNote,
    gaps: view.gates.filter((g) => g.owner === "crew" && !g.ok),
    crewIds: view.zoneGaps.crewIds,
  });
  /* 🔑 ด่านตัวเดียวกับ server — ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · เหตุที่เขียนไม่ได้อยู่ในการ์ด */
  const addGate = surveyAddZoneError(data?.request, { canWrite: data?.canWrite === true });
  /* ตรวจด้วยตัวเดียวกับ server — ชั้นผิดต้องรู้ตั้งแต่ตอนพิมพ์ ไม่ใช่ตอนกดแล้วเด้งกลับ */
  const draftFloor = normalizeFloor(draft.floor);
  const draftClash = draft.name.trim() ? surveyRowNameClash(draft.name, zones) : null;
  const draftReady = !!draft.name.trim() && !draftClash && !draftFloor.error;

  /* ⭐ **ลิงก์ย้อนกลับเดินตามคนดู** — เดิมพาทุกคนไป "งานวันนี้" ซึ่งเป็นหน้าของช่าง
     คนเดียว · หัวหน้ามาจากคิวคำร้อง ส่วนฝ่ายขายมาจากใบคำร้องของตัวเอง ⇒ ปุ่มย้อนกลับ
     ที่พาไปหน้าที่เขาไม่ได้มาจาก คือปุ่มที่ทำให้ต้องกดย้อนอีกสองครั้ง
     🔴 **ระหว่างยังไม่รู้ว่าใครเปิด ต้องกลับไปที่เดิม** — `data` เป็น null ตอนโหลดและ
        ตอนโหลดไม่สำเร็จ (สองสถานะที่วาดปุ่มนี้ด้วย) ⇒ สาขาสุดท้ายเคยกลืนทุกคนไปที่
        `/requests/<id>` พร้อมป้ายเปล่า "คำร้อง" ทั้งที่ช่างเปิดหน้านั้นไม่ได้ (403)
        · ของที่ยังไม่รู้ = ใช้ทางเดิมของจอนี้ ไม่ใช่เดาทางใหม่
     ⚠️ ลิงก์ไปใบคำร้องต้องถาม `canOpenRequest` ของ server — ตัวเดียวกับที่การ์ดใช้ */
  const backToRequest = data?.canOpenRequest === true && !!data?.request;
  const back = canDecide
    ? { href: "/service/requests", label: "คิวคำร้อง" }
    /* คนที่ยัง **กรอกได้** คือคนที่ออกหน้างาน ⇒ กลับไปคิวงานของวันนี้เสมอ แม้เขาจะ
       เปิดหน้าคำร้องได้ด้วย (ช่างอาวุโส) — เขามาจากที่นั่น ไม่ได้มาจากใบคำร้อง */
    : data?.canWrite === true
      ? { href: "/service/today", label: "งานวันนี้" }
      : backToRequest
        ? { href: `/requests/${id}`, label: `คำร้อง ${data?.request?.docNo || ""}`.trim() }
        : { href: "/service/today", label: "งานวันนี้" };

  const goTab = useCallback((next) => {
    setTab(next);
    router.replace(next === "result" ? `/service/surveys/${id}?tab=result` : `/service/surveys/${id}`,
      { scroll: false });
  }, [id, router]);

  /* ลิงก์ "เปิด <พื้นที่>" — กลับไปแท็บหน้างานก่อนเสมอ แล้วค่อยเลื่อนไปหาการ์ดของมัน
     ⚠️ ต้องรอให้แท็บสลับเสร็จก่อน ไม่งั้นเลื่อนไปหา element ที่ยังไม่ถูกวาด */
  const openZone = useCallback((zoneId) => {
    if (tab !== "field") goTab("field");
    requestAnimationFrame(() => {
      const el = document.getElementById(zoneAnchor(zoneId));
      if (el) el.scrollIntoView({ block: "start" });
    });
  }, [tab, goTab]);

  if (loading) {
    return <Workspace hideHeader back={back}><SkeletonRows rows={4} /></Workspace>;
  }

  if (loadError) {
    return (
      <Workspace hideHeader back={back}>
        <p className="form-error" role="alert">{loadError}</p>
      </Workspace>
    );
  }

  const req = data?.request || {};
  const site = data?.site || null;
  const visit = data?.visit || null;
  /* ⭐ ป้ายนัดบนหัวใบ (มติเจ้าของ 2026-09-16: **กดส่งผลไม่ได้ปิดนัด**) — ใบที่ส่งผล
     ไปแล้วแต่นัดยังไม่ถูกปิด ต้องบอกไว้บนหัว ไม่งั้นนัดค้างอยู่ในคิวโดยไม่มีใครเห็น */
  const visitBadge = visit && !isClosedVisit(visit)
    ? (visit.status === "in_progress"
      ? { label: "กำลังเข้าพื้นที่", tone: "info" }
      : { label: "นัดยังไม่ปิด", tone: "warning" })
    : null;

  const dueSub = view.flags.cancelled ? "คำร้องถูกยกเลิก"
    : req.answeredAt ? `ส่งผลแล้ว ${fmtDate(req.answeredAt)}`
      : view.due.overdueDays ? `เลยกำหนด ${view.due.overdueDays} วัน`
        : null;

  const controlCard = (
    <SurveyControlCard
      view={view}
      busy={sendBusy || recallBusy || sendBackBusy}
      onSend={() => setSending(true)}
      onRecall={() => setRecalling(true)}
      onSendBack={() => { setSendingBack(true); setSendBackNote(""); }}
      onOpenZone={openZone}
      onGoTab={goTab}
      requestDocNo={req.docNo}
      requestHref={`/requests/${id}`}
      visitCode={visit?.code || null}
      visitHref={visit?.id ? `/service/visits/${visit.id}` : null}
    />
  );

  return (
    <Workspace hideHeader back={back}>
      {/* ⭐ หัวใบ "รหัส · ชื่อ" ตามกติกา entity display ของทั้งระบบ — ใต้หัวเป็น
          ข้อเท็จจริงที่ช่างต้องใช้ตอนยืนอยู่หน้างาน: ไซต์ · นัด · กำหนดส่ง
          ⚠️ **ไม่มีป้ายสถานะของใบและไม่มีปุ่มระดับใบบนหัว** — ทั้งสองอย่างอยู่การ์ด
          จัดการที่เดียว · ป้ายที่นี่เป็นเรื่องของ **นัด** ซึ่งไม่มีที่อยู่อื่น */}
      <DetailOverview
        eyebrow="ใบประเมินพื้นที่ · ส่งถึง TS"
        title={[req.docNo, req.title].filter(Boolean).join(" · ")}
        description={data?.customer?.name ? (
          <span>
            {"ให้ "}
            {data.customer.arCode ? <span className={styles.arCode}>{data.customer.arCode}</span> : null}
            <b>{data.customer.name}</b>
          </span>
        ) : null}
        /* ผู้ติดต่อของไซต์อยู่แถวนี้ — เบอร์ที่กดโทรได้คือของชิ้นเดียวที่ช่างต้องใช้
           ทันทีเมื่อไปถึงหน้าตึกแล้วหาทางเข้าไม่เจอ (ช่องข้อเท็จจริงตัดข้อความบรรทัดเดียว) */
        meta={site?.contactName || site?.contactPhone ? (
          <span className={styles.contact}>
            {`ผู้ติดต่อ ${naText(site?.contactName)}`}
            {site?.contactPhone ? <a className="linklike" href={`tel:${site.contactPhone}`}>{site.contactPhone}</a> : null}
          </span>
        ) : null}
        badges={visitBadge
          ? <DetailStateBadge label={visitBadge.label} color={toneColor(visitBadge.tone)} />
          : null}
        facts={[
          {
            key: "site",
            label: "ไซต์",
            icon: MapPin,
            value: site?.id
              ? <Link className="linklike" href={`/service/sites/${site.id}`}>{naText(site.code)}</Link>
              : naText(site?.code),
            sub: [site?.name, site?.address].filter(Boolean).join(" · ") || null,
            /* ⭐ ที่อยู่ **ห่อได้สองบรรทัด** — บรรทัดรองปกติตัดบรรทัดเดียวด้วย … ซึ่ง
               กลืนเขต/จังหวัด/รหัสไปรษณีย์ทุกจอ (วัดจริง: ข้อความ 425px ในช่อง
               402/263/302px) · ช่างที่ถือมือถืออยู่หน้างานเอาเมาส์ไปชี้ดูทูลทิปไม่ได้ */
            subWrap: true,
          },
          {
            key: "visit",
            label: "นัดสำรวจ",
            icon: CalendarClock,
            value: visit
              ? [visit.code, visit.scheduledDate ? fmtDate(visit.scheduledDate) : null, visit.startTime]
                .filter(Boolean).join(" · ")
              : null,
            sub: visit?.assigneeName || null,
          },
          {
            key: "due",
            label: "TS กำหนดส่ง",
            icon: Flag,
            value: view.due.date ? fmtDate(view.due.date) : null,
            sub: dueSub,
            tone: view.due.overdueDays ? "late" : (req.answeredAt ? "ok" : undefined),
            /* ⭐ มือถือเหลือ **ไซต์ + นัด** (แบบที่อนุมัติ) — ช่างที่ยืนอยู่หน้างานถามว่า
               "ที่ไหน กับใคร" ไม่ใช่ "กำหนดส่งวันไหน" · และกำหนดส่งยังอ่านได้ในการ์ด
               ควบคุม (บรรทัดขั้นตอน) ⇒ ไม่ใช่ข้อเท็จจริงที่หายไปจากจอเล็ก */
            narrow: "hide",
          },
        ]}
      />

      <DetailPageLayout
        asideLabel="จัดการผลประเมิน"
        /* ⭐ **ลำดับบนจอแคบเดินตามคนดู** (แบบที่อนุมัติ) — ช่างที่ยังกรอกได้ถามว่า
           "พื้นที่ไหนต้องวัด" ⇒ เนื้อมาก่อน · คนอื่นถามว่า "ใบนี้อยู่สถานะไหน และกด
           อะไรต่อ" ⇒ การ์ดมาก่อน · ตัวตัดสินคำนวณมาให้แล้ว ไม่ต้องเดาที่นี่ */
        controlFirst={view.flags.controlFirst}
        aside={controlCard}
      >
        {/* ⚠️ กติกา UI ของระบบ: สลับ "มุมมองคนละชุดข้อมูล" = Tabs · กรองในชุดเดิม = segmented */}
        <Tabs
          value={tab}
          onChange={goTab}
          ariaLabel="มุมมองของใบประเมิน"
          tabs={[
            { key: "field", label: "หน้างาน" },
            { key: "result", label: "สรุปส่งผล" },
          ]}
        />

        {zones.length === 0 ? (
          <EmptyState icon={Search}>
            ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน — ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ
          </EmptyState>
        ) : tab === "result" ? (
          <SurveyResultTable
            zones={zones}
            filesByZone={filesByZone}
            canDecide={canDecide && !view.flags.locked}
            busyZone={busyZone}
            onDecide={decideZone}
            /* ⭐ **บรรทัดนี้คือของที่ฝ่ายขายจะได้ไปพร้อมกระดิ่ง** — TS ตัด/เพิ่มเองได้
               โดยไม่ต้องขออนุมัติ (มติข้อ 6) ⇒ ที่นี่คือจุดที่เขาเห็นก่อนกดส่งว่าตัวเอง
               เปลี่ยนอะไรไปบ้างจากที่ฝ่ายขายขอมา · ขึ้นเสมอ ไม่ใช่เฉพาะตอนมีการเปลี่ยน */
            caption={view.flags.sent ? `${changeText} · ส่งแล้ว แก้ไม่ได้ — ดึงกลับก่อน` : changeText}
          />
        ) : (
          <div className={styles.list}>
            {zones.map((zone) => (
              <SurveyZoneCard
                key={zone.id}
                id={zoneAnchor(zone.id)}
                zone={zone}
                files={filesByZone[zone.id] || []}
                canWrite={view.flags.canWrite}
                busy={busyZone === zone.id}
                onSave={(payload) => saveZone(zone.id, payload)}
                onDelete={() => setRemoving(zone)}
              />
            ))}
            {/* ⭐ **ปุ่มอยู่ท้ายลิสต์ ไม่ใช่บนหัวจอ** (ม็อกจอ 06) — ช่างจะรู้ว่ามีพื้นที่เกินมา
                ก็ต่อเมื่อไล่วัดของที่มีในใบจนหมดแล้ว ⇒ ปุ่มควรรออยู่ตรงที่เขาไล่มาถึงพอดี */}
            {!addGate && (
              <div className={styles.listFoot}>
                <Button variant="outline" icon={<MapPinPlus size={15} aria-hidden="true" />}
                  onClick={() => setAdding(true)}>
                  เพิ่มพื้นที่ที่เจอหน้างาน
                </Button>
              </div>
            )}
          </div>
        )}
      </DetailPageLayout>

      {/* ── เพิ่มพื้นที่ที่เจอหน้างาน ─────────────────────────────────────
          ⚠️ **ไม่มีช่องเหตุผล** — แผน §9 เขียนไว้ตรง ๆ ว่า "ตัดต้องมีเหตุผลบังคับ ·
            เพิ่มไม่ต้อง" (ของที่หายไปจากสิ่งที่ SA จะเสนอราคาคือของที่ลูกค้าจะถาม
            ส่วนของที่เพิ่มมาคือยอดที่โตขึ้น ไม่มีใครเสียหาย) */}
      <ConfirmDialog
        open={adding}
        title="เพิ่มพื้นที่ที่เจอหน้างาน"
        message="พื้นที่นี้จะเข้าทะเบียนของลูกค้าทันทีพร้อมรหัส และเข้าไปอยู่ในผลที่ส่งให้ฝ่ายขาย"
        detail="ฝ่ายขายจะเห็นป้าย “เจ้าหน้าที่เพิ่มหน้างาน” บนแถวนี้ — ไม่ต้องขออนุมัติก่อน"
        confirmLabel="เพิ่มพื้นที่"
        busy={addBusy}
        onConfirm={draftReady ? addZone : undefined}
        onClose={() => !addBusy && setAdding(false)}
      >
        <Input
          value={draft.name} disabled={addBusy} maxLength={150} autoComplete="off" autoFocus
          invalid={!!draftClash}
          placeholder="ชื่อพื้นที่ เช่น โถงลิฟต์ชั้น 3"
          aria-label="ชื่อพื้นที่"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        {/* ⚠️ ชั้นบังคับ — เป็นท่อน FF ของรหัสโซน ไม่มีชั้นก็ออกรหัสไม่ได้ (mig 0315) */}
        <Input
          value={draft.floor} disabled={addBusy} maxLength={10} autoComplete="off"
          invalid={!!draft.floor && !!draftFloor.error}
          placeholder="ชั้น เช่น 4 หรือ G"
          aria-label="ชั้นของพื้นที่"
          onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
        />
        <Input
          value={draft.note} disabled={addBusy} maxLength={1000} autoComplete="off"
          placeholder="หมายเหตุ (ไม่บังคับ)"
          aria-label="หมายเหตุของพื้นที่"
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        />
        {/* ปุ่มจางต้องบอกเหตุเป็นตัวหนังสือเสมอ ไม่ใช่ทูลทิป */}
        <p className={styles.gate} role="status">
          {!draft.name.trim()
            ? "ต้องระบุชื่อพื้นที่"
            : draftClash || draftFloor.error
              || `จะได้รหัสพื้นที่ใหม่ในทะเบียนทันที · ${floorLabel(draftFloor.value)}`}
        </p>
      </ConfirmDialog>

      {/* 🔴 ลบทิ้งได้เฉพาะพื้นที่ที่ช่างเพิ่มเอง — ของที่ SA ขอมาใช้ "ตัดออก" พร้อมเหตุผล */}
      <ConfirmDialog
        open={!!removing}
        title="ลบพื้นที่ที่เพิ่มไว้"
        message={`ลบ "${removing?.zoneName || ""}" ออกจากใบนี้`}
        detail="ผลวัดและรูปของพื้นที่นี้จะถูกลบไปด้วย · ถ้ายังไม่มีใครใช้พื้นที่นี้ ระบบจะถอนออกจากทะเบียนของลูกค้าให้ด้วย"
        confirmLabel="ลบทิ้ง"
        tone="danger"
        busy={removeBusy}
        onConfirm={removeZone}
        onClose={() => !removeBusy && setRemoving(null)}
      />

      <ConfirmDialog
        open={sending}
        title="ส่งผลประเมินให้ฝ่ายขาย"
        /* 🔑 เหตุผลเต็มของด่าน server — ไม่ใช่บรรทัดย่อของราง (บรรทัดย่อมีไว้ให้ราง
           กว้าง 330px อ่านได้ ไม่ได้มีไว้แทนเหตุผล) */
        message={view.send.reason?.detail || view.send.reason?.text
          || `ส่งผล ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`}
        detail={view.send.allowed
          ? "ฝ่ายขายจะเห็นผลทันที และเอาไปตั้งราคาได้ · ใบจะปิดเมื่อฝ่ายขายกดรับผล"
          : undefined}
        confirmLabel="ส่งผล"
        busy={sendBusy}
        onConfirm={view.send.allowed ? send : undefined}
        onClose={() => !sendBusy && setSending(false)}
      />
      {/* ⭐ **โมดัลต้องบอกว่าใครจะได้รับ ไม่ใช่แค่ถามว่าจะส่งไหม** — กระดิ่งของใบคำร้อง
          ไปหาผู้ขอ (SA) เท่านั้น · ตัวที่ไปถึงช่างคือกระดิ่งอีกใบที่ยิงจากนัด
          ⚠️ ไม่มีช่างที่ถูกมอบหมาย = server ตีกลับพร้อมเหตุ (ด่านตัวเดียวกับที่นี่) */}
      <ConfirmDialog
        open={sendingBack}
        title="แจ้งช่างให้กลับไปเก็บงาน"
        message={sendBackGate
          || `ข้อที่ติด: ${view.zoneGaps.rows.filter((r) => r.crew.length)
            .map((r) => `${r.zoneName} (${r.crew.join(" · ")})`).join(" · ")}`}
        detail={sendBackGate ? undefined
          : "ช่างที่ถูกมอบหมายงานใบนี้จะได้กระดิ่งพร้อมข้อความนี้ · ใบยังอยู่ขั้นเดิม ไม่ต้องลงคิวใหม่"}
        confirmLabel="แจ้งช่าง"
        busy={sendBackBusy}
        onConfirm={!sendBackGate ? sendBack : undefined}
        onClose={() => !sendBackBusy && setSendingBack(false)}
      >
        <Input
          value={sendBackNote}
          disabled={sendBackBusy}
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder="ให้กลับไปทำอะไร เช่น ถ่ายภาพกว้างห้องประชุมใหญ่เพิ่ม"
          aria-label="สิ่งที่ให้ช่างกลับไปทำ"
          onChange={(e) => setSendBackNote(e.target.value)}
        />
        {/* ปุ่มจางต้องบอกเหตุเป็นตัวหนังสือ — และบอกว่าใครจะอ่านข้อความนี้ */}
        <p className={styles.gate} role="status">
          {sendBackGate || "ช่างจะเห็นข้อความนี้ในกระดิ่ง"}
        </p>
      </ConfirmDialog>

      {/* 🔴 SA อาจเอาตัวเลขไปเสนอราคาไปแล้ว ⇒ โมดัลต้องบอกผลลัพธ์ตรง ๆ ไม่ใช่ถามลอย ๆ */}
      <ConfirmDialog
        open={recalling}
        title="ดึงผลประเมินกลับมาแก้"
        message={`ตัวเลขที่ส่งไปแล้ว (${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ) จะถูกถอนออกจากมือฝ่ายขาย`}
        detail="ฝ่ายขายได้รับแจ้งทันทีพร้อมตัวเลขเดิม · ตอนส่งรอบใหม่ ระบบจะบอกส่วนต่างให้เขาเห็น"
        confirmLabel="ดึงกลับมาแก้"
        busy={recallBusy}
        onConfirm={recallReason.trim().length >= 10 ? recall : undefined}
        onClose={() => !recallBusy && setRecalling(false)}
      >
        <Input
          value={recallReason}
          disabled={recallBusy}
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder="แก้อะไร เพราะอะไร เช่น กรอกแพ็คเกจล็อบบี้ผิดจาก 2 เป็น 3"
          aria-label="เหตุผลที่ดึงผลกลับ"
          onChange={(e) => setRecallReason(e.target.value)}
        />
        {/* ปุ่มจางต้องบอกเหตุเป็นตัวหนังสือ — และบอกว่าใครจะอ่านข้อความนี้ */}
        <p className={styles.gate} role="status">
          {recallReason.trim().length >= 10
            ? "ฝ่ายขายจะเห็นเหตุผลนี้ในกระดิ่ง"
            : "ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้"}
        </p>
      </ConfirmDialog>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
