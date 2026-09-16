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
//
// ⭐ **พื้นที่พับได้** (PR4 · แบบที่อนุมัติ 2026-09-16) — ค่าเปิด/ปิดตั้งต้นมาจาก
//   `view.foldDefaults` ซึ่ง **คิดใหม่จากข้อมูลทุกครั้งที่โหลด** ไม่จำข้ามครั้งและ
//   ไม่ขึ้นกับขนาดจอ · สิ่งที่หน้าเก็บไว้คือ *สิ่งที่ผู้ใช้กดในรอบนี้* เท่านั้น
//   ⚠️ **ห้ามพับเองหลังบันทึกสำเร็จ** — ค่าตั้งต้นของพื้นที่ที่เพิ่งวัดครบจะพลิกเป็น
//   "พับ" ทันทีที่โหลดกลับมา ⇒ ถ้าไม่ปักธงว่าคนนี้เปิดไว้ การ์ดจะหุบใส่หน้าคนที่เพิ่ง
//   กดบันทึก ซึ่งเป็นพฤติกรรมที่แบบที่อนุมัติสั่งห้ามไว้ตรง ๆ (กติกาข้อ 3)
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronsDownUp, ChevronsUpDown, Flag, MapPin, MapPinPlus, Search } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyControlCard from "@/components/service/SurveyControlCard";
import SurveyResultTable from "@/components/service/SurveyResultTable";
import SurveyZoneCard from "@/components/service/SurveyZoneCard";
import { collapsibleBodyId, collapsibleHeadId } from "@/components/ui/CollapsibleCard";
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
import { surveyPendingDecisions } from "@/lib/service/surveyDecision";
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
  /* ── พื้นที่พับได้ ──────────────────────────────────────────────────────
     `openZones` = **สิ่งที่ผู้ใช้กดในรอบนี้เท่านั้น** (ไม่ใช่สถานะเต็ม) · ค่าที่ไม่มีใน
     ก้อนนี้อ่านจาก `view.foldDefaults` ซึ่งคิดใหม่จากข้อมูลทุกครั้งที่โหลด
     ⇒ พื้นที่ที่เพิ่งเพิ่มหน้างานได้ค่าตั้งต้นของมันเองทันที โดยไม่ต้องมีขั้นตอน seed */
  const [openZones, setOpenZones] = useState({});
  /* พื้นที่ที่มีค่าพิมพ์ค้าง — การ์ดรายงานขึ้นมา แล้วส่งต่อให้ตัวตัดสินบล็อกปุ่มส่งผล
     (ด่านที่ PR2 ต่อสายไว้แล้วแต่ยังไม่มีใครยิงธงให้) */
  const [dirtyZones, setDirtyZones] = useState({});
  /* พื้นที่ที่ "กำลังทำอยู่" — ใช้ตัดสินว่า Ctrl+V ลอย ๆ ตกที่พื้นที่ไหน */
  const [activeZone, setActiveZone] = useState(null);
  /* ร่างที่หัวหน้าเคาะไว้แต่ยังไม่กดบันทึก (แท็บสรุปส่งผล · PR5)
     ⭐ **ร่างอยู่ที่หน้า ไม่ได้อยู่ในตาราง** — 🐞 เดิมเก็บไว้ใน `SurveyResultTable`
       ซึ่งหน้านี้ unmount ทิ้งทุกครั้งที่สลับไปแท็บ "หน้างาน" ⇒ ของที่หัวหน้าเคาะไว้
       หายเงียบโดยไม่มีคำเตือน แล้วธง "ยังไม่บันทึก" ที่ยิงไว้ก่อนหน้าก็ค้างอยู่
       ⇒ ปุ่มส่งถูกบล็อกด้วยเหตุผลที่ไม่จริงแล้ว พร้อมปุ่มที่พากลับไปยังแท็บที่ว่างเปล่า
     ⚠️ คนละแกนกับ `dirtyZones` ซึ่งเป็นค่าที่ **ช่าง** พิมพ์ค้างบนแท็บหน้างาน —
        ด่านของปุ่มส่งผลถามทั้งสองตัว และขึ้นข้อความคนละอัน */
  const [decisionDrafts, setDecisionDrafts] = useState({});

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

  /* การตัดสินใจของหัวหน้า — คนละเมธอดกับของช่าง (PUT vs PATCH) เพราะคนละชุดช่อง
     ⭐ **ลงทีละพื้นที่ แต่กดครั้งเดียว** (PR5) — แท็บสรุปถือร่างไว้จนหัวหน้ากด
        "บันทึกการเคาะ" แล้วส่งมาทั้งชุด · API ยังเป็นเส้นรายพื้นที่เหมือนเดิม
     🔴 **ล้มที่ใบไหนให้หยุดตรงนั้น** — ไล่ยิงต่อทั้งที่รู้แล้วว่าพัง (สิทธิ์หมด · ใบถูก
        ล็อกระหว่างทาง) คือการเก็บ error ชุดเดียวกันมาให้อ่านห้ารอบ · คืนรายชื่อที่ลงจริง
        ให้ตารางล้างร่างเฉพาะตัวนั้น ของที่ยังไม่ลงต้องอยู่ในช่องต่อไป */
  const saveDecisions = async (items = []) => {
    const savedIds = [];
    let failure = null;
    for (const { zoneId, payload } of items) {
      setBusyZone(zoneId);
      try {
        await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
          method: "PUT", json: payload, fallbackError: "บันทึกไม่สำเร็จ",
        });
        savedIds.push(String(zoneId));
      } catch (e) {
        failure = { zoneId: String(zoneId), message: e.message };
        break;
      }
    }
    setBusyZone(null);
    await load({ background: true });
    if (failure) {
      setToast({ kind: "error", msg: failure.message });
    } else {
      setToast({ kind: "success", msg: `บันทึกการเคาะแล้ว ${savedIds.length} พื้นที่` });
    }
    return { savedIds, failure };
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
  /* 🔑 ธง dirty เป็น **ของที่ server มองไม่เห็น** — ค่ายังอยู่บนจอ ยังไม่เคยถูกส่งไป
     ⇒ ต้องเดินทางจากการ์ดขึ้นมาที่นี่ แล้วลงไปที่ตัวตัดสิน ไม่ใช่ให้แต่ละที่เดาเอง */
  const handleDirtyZone = useCallback((zoneId, isDirty) => {
    setDirtyZones((prev) => {
      if (!!prev[zoneId] === isDirty) return prev;
      const next = { ...prev };
      if (isDirty) next[zoneId] = true;
      else delete next[zoneId];
      return next;
    });
  }, []);
  const dirtyZoneIds = useMemo(() => Object.keys(dirtyZones), [dirtyZones]);
  /* 🔑 **ของค้างเป็นค่าที่คำนวณได้ ไม่ใช่ธงที่ต้องมีใครยิงมา** — ตัวตัดสินตัวเดียวกับ
     ที่ตารางใช้วาดแถบ "ยังไม่บันทึก" และที่ route `PUT` ใช้เป็นด่าน
     ⇒ ไม่มี effect ไม่มี state คู่ขนาน ⇒ ไม่มีสภาพ "ธงค้างหลังตาราง unmount" ให้เกิด */
  const pendingDecisionZoneIds = useMemo(
    () => surveyPendingDecisions(zones, decisionDrafts).ids,
    [zones, decisionDrafts],
  );
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
    dirtyZoneIds,
    pendingDecisionZoneIds,
    tab,
    today: businessDate(),
  }), [data, zones, filesByZone, dirtyZoneIds, pendingDecisionZoneIds, tab]);

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

  // ── เปิด/พับพื้นที่ ─────────────────────────────────────────────────────
  const foldDefaults = view.foldDefaults;
  const isZoneOpen = useCallback(
    (zoneId) => openZones[zoneId] ?? foldDefaults[zoneId] ?? false,
    [openZones, foldDefaults],
  );
  const setZoneOpen = useCallback((zoneId, next) => {
    setOpenZones((prev) => ({ ...prev, [zoneId]: next }));
  }, []);
  /* ⭐ **เปิดพร้อมกันได้หลายพื้นที่** — ไม่ใช่ accordion ที่เปิดได้ทีละอัน (ช่างวัดห้อง
     ที่ต่อกันแล้วเทียบตัวเลขข้ามพื้นที่) ⇒ ปุ่มเดียวของทั้งลิสต์คือ "ขยาย/ย่อทุกพื้นที่"
     และชื่อปุ่มบอกว่า **กดแล้วจะเกิดอะไร** ไม่ใช่บอกสถานะปัจจุบัน */
  const allZonesOpen = zones.length > 0 && zones.every((z) => isZoneOpen(z.id));
  const toggleAllZones = useCallback(() => {
    const next = !allZonesOpen;
    setOpenZones(Object.fromEntries(zones.map((z) => [z.id, next])));
  }, [allZonesOpen, zones]);

  /* เลื่อนไปที่การ์ด (และย้ายโฟกัสไปที่ *หัว* ของมันเมื่อสั่ง) — หัวคือปุ่มพับ ⇒ คนที่
     ใช้คีย์บอร์ดกด Enter ต่อได้ทันที และคนที่ใช้โปรแกรมอ่านหน้าจอได้ยินชื่อพื้นที่ใหม่
     ⚠️ `requestAnimationFrame` เพราะการ์ดอาจเพิ่งถูกกางในเฟรมเดียวกัน */
  const scrollToZone = useCallback((zoneId, { focus = false } = {}) => {
    requestAnimationFrame(() => {
      const anchor = zoneAnchor(zoneId);
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
      if (focus) document.getElementById(collapsibleHeadId(anchor))?.focus({ preventScroll: true });
    });
  }, []);

  /* ลิงก์ "เปิด <พื้นที่>" — กลับไปแท็บหน้างานก่อนเสมอ แล้วค่อยกางการ์ดของมัน
     ⚠️ ต้องรอให้แท็บสลับเสร็จก่อน ไม่งั้นเลื่อนไปหา element ที่ยังไม่ถูกวาด */
  const openZone = useCallback((zoneId) => {
    if (tab !== "field") goTab("field");
    setZoneOpen(zoneId, true);
    setActiveZone(zoneId);
    scrollToZone(zoneId);
  }, [tab, goTab, setZoneOpen, scrollToZone]);

  /* ⭐ **"ถัดไป: … (ยังไม่ครบ)" แทนการพับเองหลังบันทึก** (กติกาข้อ 3 ของแบบที่อนุมัติ)
     — พับพื้นที่ปัจจุบัน **เฉพาะเมื่อไม่มีค่าค้างและไม่มี error** แล้วเปิดพื้นที่ถัดไป
     พร้อมย้ายโฟกัสไปที่หัวของมัน */
  const goNextZone = useCallback((nextId, { from, keepOpen } = {}) => {
    setOpenZones((prev) => {
      const next = { ...prev, [nextId]: true };
      if (from && from !== nextId && !keepOpen) next[from] = false;
      return next;
    });
    setActiveZone(nextId);
    scrollToZone(nextId, { focus: true });
  }, [scrollToZone]);

  /* บันทึกสำเร็จ = **เปิดค้างไว้** · ตัดออกสำเร็จ = พับ (ไม่เหลืออะไรให้ทำต่อ) แล้วส่ง
     โฟกัสกลับไปที่หัว ไม่ให้โฟกัสหล่นหายไปกับปุ่มที่เพิ่งถูกถอดออกจากจอ */
  const handleZoneSaved = useCallback((zoneId, { cut } = {}) => {
    setZoneOpen(zoneId, !cut);
    if (cut) scrollToZone(zoneId, { focus: true });
  }, [setZoneOpen, scrollToZone]);
  const handleZoneSaveFailed = useCallback((zoneId) => setZoneOpen(zoneId, true), [setZoneOpen]);

  /* พื้นที่ถัดไปที่ **ฝั่งช่างยังขาดของ** — ถามตัวตัดสินตัวเดียวกับที่การ์ดควบคุมใช้
     (`zoneGaps.rows` เรียงตามลำดับในใบอยู่แล้ว) ไม่ใช่ไล่เงื่อนไขเองอีกชุด
     🐞 เดิม `find(r => r.crew.length && r.zoneId !== zoneId)` = **ใบแรกของลิสต์เสมอ**
        ไม่ใช่ใบถัดจากที่ยืนอยู่ ⇒ ใบ 5 พื้นที่ที่ขาดที่ 1 กับ 5: ยืนที่ 5 กด "ถัดไป"
        แล้วเด้งกลับขึ้นหัวใบพร้อมพับใบที่เพิ่งทำเสร็จ · เหลือสองพื้นที่เมื่อไรก็สลับ
        ไปมา 1↔5 ไม่จบ (ระเบียนทดสอบมี 2 พื้นที่จึงไม่เห็นอาการ)
     ⇒ หา **ตัวแรกที่อยู่หลังตำแหน่งปัจจุบัน** ก่อน แล้วค่อยวนกลับต้นลิสต์ · ตอนวนกลับ
       ติดธง `back` ไปให้การ์ดเปลี่ยนคำเป็น "กลับไปที่ …" เพราะมันไม่ใช่ "ถัดไป" แล้ว */
  const nextGapZone = useCallback((zoneId) => {
    const gaps = view.zoneGaps.rows.filter((r) => r.crew.length > 0 && r.zoneId !== zoneId);
    if (gaps.length === 0) return null;
    /* ⚠️ ลำดับต้องวัดจาก **ลิสต์ที่ตาเห็น** ไม่ใช่จากลิสต์ของด่าน — พื้นที่ที่วัดครบแล้ว
       ไม่มีชื่ออยู่ใน `zoneGaps.rows` เลย ⇒ ยืนอยู่บนใบที่ครบแล้วจะหาตำแหน่งตัวเองไม่เจอ */
    const order = new Map(zones.map((z, i) => [z.id, i]));
    const here = order.has(zoneId) ? order.get(zoneId) : -1;
    const ahead = gaps.find((r) => (order.get(r.zoneId) ?? Infinity) > here);
    const row = ahead || gaps[0];
    return { id: row.zoneId, name: row.zoneName, back: !ahead };
  }, [view.zoneGaps.rows, zones]);

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
     ไปแล้วแต่นัดยังไม่ถูกปิด ต้องบอกไว้บนหัว ไม่งั้นนัดค้างอยู่ในคิวโดยไม่มีใครเห็น
     🐞 เดิมเงื่อนไขไม่เคยถาม `sent` เลย — นัดที่เพิ่งตั้งไว้บนใบที่ยังไม่มีใครแตะ
       ก็ขึ้นคำเตือนสีอำพัน "นัดยังไม่ปิด" ทันทีที่เปิดจอ ⇒ สีเตือนที่ขึ้นตลอดเวลา
       คือสีที่คนเลิกอ่าน · ป้ายนี้มีความหมายก็ต่อเมื่อ **ส่งผลไปแล้ว** เท่านั้น */
  const visitBadge = visit && !isClosedVisit(visit)
    ? (view.flags.sent
      ? { label: "นัดยังไม่ปิด", tone: "warning" }
      : visit.status === "in_progress"
        ? { label: "กำลังเข้าพื้นที่", tone: "info" }
        : null)
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
        /* มติเจ้าของ 2026-09-16: จอนี้เลิกใช้แสงส้มที่มุมหัวใบ — พื้นหน้าจอนี้ไล่สีอยู่แล้ว */
        flat
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
            onSaveDecisions={saveDecisions}
            drafts={decisionDrafts}
            onDraftsChange={setDecisionDrafts}
            /* ⭐ **บรรทัดนี้คือของที่ฝ่ายขายจะได้ไปพร้อมกระดิ่ง** — TS ตัด/เพิ่มเองได้
               โดยไม่ต้องขออนุมัติ (มติข้อ 6) ⇒ ที่นี่คือจุดที่เขาเห็นก่อนกดส่งว่าตัวเอง
               เปลี่ยนอะไรไปบ้างจากที่ฝ่ายขายขอมา · ขึ้นเสมอ ไม่ใช่เฉพาะตอนมีการเปลี่ยน */
            caption={view.flags.sent ? `${changeText} · ส่งแล้ว แก้ไม่ได้ — ดึงกลับก่อน` : changeText}
          />
        ) : (
          <div className={styles.list}>
            {/* แถวเหนือลิสต์: ใบนี้มีกี่พื้นที่ · วัดไปแล้วกี่พื้นที่ · ปุ่มขยาย/ย่อทั้งหมด
                ⚠️ `aria-controls` ชี้ไปที่เนื้อของทุกการ์ด — ปุ่มที่คุมของหลายชิ้นต้องบอก
                ว่าคุมชิ้นไหนบ้าง ไม่งั้นโปรแกรมอ่านหน้าจอได้ยินแค่ "ปุ่ม" ลอย ๆ */}
            <div className={styles.listBar}>
              <p>
                <b>{zones.length}</b> พื้นที่ · วัดแล้ว <b>{view.progress.done}</b>
                {view.progress.cut ? <> · ตัดออก <b>{view.progress.cut}</b></> : null}
              </p>
              <button
                type="button"
                className="text-action"
                onClick={toggleAllZones}
                aria-controls={zones.map((z) => collapsibleBodyId(zoneAnchor(z.id))).join(" ")}
              >
                {allZonesOpen
                  ? <ChevronsDownUp size={14} aria-hidden="true" />
                  : <ChevronsUpDown size={14} aria-hidden="true" />}
                {allZonesOpen ? "ย่อทุกพื้นที่" : "ขยายทุกพื้นที่"}
              </button>
            </div>
            {zones.map((zone, i) => (
              <SurveyZoneCard
                key={zone.id}
                id={zoneAnchor(zone.id)}
                zone={zone}
                index={i + 1}
                files={filesByZone[zone.id] || []}
                canWrite={view.flags.canWrite}
                busy={busyZone === zone.id}
                open={isZoneOpen(zone.id)}
                onToggle={(next) => {
                  setZoneOpen(zone.id, next);
                  if (next) setActiveZone(zone.id);
                }}
                active={activeZone === zone.id}
                onActivate={setActiveZone}
                onDirtyChange={handleDirtyZone}
                onSaved={handleZoneSaved}
                onSaveFailed={handleZoneSaveFailed}
                nextZone={nextGapZone(zone.id)}
                onGoNext={goNextZone}
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
