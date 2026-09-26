"use client";
// ── ใบประเมินพื้นที่ฝั่ง TS — สองมุมมองของงานเดียวกัน (เฟส 3 · จอ 06+07) ──
//
// ⭐ **หน้างาน** (จอ 06) — ช่างรายงานข้อเท็จจริง · ออกแบบจากมือถือก่อน ผู้ใช้ยืนอยู่
//   หน้างาน ถือมือถือ อีกมือถือตลับเมตร · เข้าจากนัดใน `/service/today`
// ⭐ **สรุปส่งผล** (จอ 07) — หัวหน้า TS ตัดสินสองอย่างบนโต๊ะ: จะติดตั้งจุดไหน
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ แล้วกดส่งให้ฝ่ายขาย
//
// ⭐ **เปลือกเป็นหัวงานของแบบ A** (แผน §10.5 S9 · ม็อก A-1 · AT-1 · AW-1 · AW-2) — แถวย้อน = รหัสคำร้อง (h1) + ป้ายนัด ·
//   หัวงาน `SurveyJobHeader` (ไซต์ · โทร/นำทาง · นัด · ทีม · ช่วงเข้าไซต์ · ฝากมา) · `SurveySheetLayout` เปลือกเดียวทั้งสองแท็บ
//   🔄 แทน `DetailOverview` (หัวใบ 470px บนมือถือ) + `DetailPageLayout` (รางปักที่ 1051 — คนละเส้นกับสองบาน)
//   ⭐ **ปุ่มระดับใบทั้งชุดยังอยู่ในการ์ด "จัดการผลประเมิน" ที่เดียว** (`SurveyControlCard`) — ของหัวหน้าเท่านั้น:
//     ≥1200 เป็นรางขวา · ต่ำกว่านั้นอยู่ในบานรายการ (แท็บหน้างาน) หรือไหลตามหน้า (แท็บสรุป) ตามลำดับ `controlFirst`
//   ⭐ **ช่างไม่มีแท็บ ไม่มีการ์ด** (ม็อกไม่มีให้ช่างสักบอร์ด · แผนลงมือ C15) — ของที่การ์ดเคยบอกเขา (ใบล็อก · ดึงกลับ · อ่านอย่างเดียว)
//     เป็นกล่องแจ้งบนสุดของรายการ (`surveySheetNotices`) · ไปสรุปส่งผลจากแถวใน "เกี่ยวกับคำร้อง" แล้วกลับด้วย "← หน้างาน"
//   ⚠️ ปุ่มส่ง/ดึงกลับ · แถบ "ส่งผลให้ฝ่ายขายแล้ว" ต้องไม่กลับมาบนหัวจอ — ของชิ้นเดียวกันสองที่เพี้ยนหากันเสมอ
//     (บทเรียนรางขวารุ่นแรกของหน้าคำร้อง)
//
// ⚠️ **ด่านเขียนเป็นด่านรายใบ ไม่ใช่ cap ล้วน** — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย ⇒ server เป็นคนตอบว่าเขียนได้ไหม (`canWrite`)
//   จอไม่คำนวณเอง เพราะจอไม่รู้ user id ของตัวเอง
//
// ⭐ **แท็บหน้างานเป็นแบบ A: รายการพื้นที่ → หน้าวัดทีละพื้นที่** (มติเจ้าของ 25/09 · แผน §10.5 S7)
//   — แทนลิสต์การ์ดพับได้ (ค่าพับตั้งต้น · ย่อ/ขยายทุกพื้นที่ · "ถัดไป" ที่พับใบเดิม) ทั้งชุด
//   <1000px สองหน้า (รายการ ↔ หน้าพื้นที่เต็มจอ) · ≥1000px สองบาน · ≥1200px หัวหน้าได้รางการ์ดจัดการผล
//   ⚠️ **หน้าพื้นที่เปิดได้ทีละหน้า และไม่มีร่างในเครื่อง** (มติเจ้าของ) — ทุกทางออกจากพื้นที่ที่มีค่าค้าง (แถว · ‹ › ·
//      ถัดไป · ปุ่มย้อนของเครื่อง · สลับแท็บ · ลิงก์ · รีเฟรช) ถามก่อนทิ้งด้วยกล่องเดียว · กติกาการย้าย/ย้อนอยู่ที่
//      `surveyZoneRouteStep` (ของล้วน · เทสต์ทุกแถว) ต่อสายโดย `useSurveyZoneRoute`
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MapPinPlus, Search } from "lucide-react";
import thaiText from "@/components/ThaiText";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyAboutRequest from "@/components/service/SurveyAboutRequest";
import SurveyControlCard from "@/components/service/SurveyControlCard";
import SurveyFieldBar from "@/components/service/SurveyFieldBar";
import SurveyFieldWorkspace, { SurveyBarColumn } from "@/components/service/SurveyFieldWorkspace";
import SurveyJobHeader from "@/components/service/SurveyJobHeader";
import SurveyResultTable from "@/components/service/SurveyResultTable";
import SurveySendBackCard from "@/components/service/SurveySendBackCard";
import SurveySheetLayout from "@/components/service/SurveySheetLayout";
import SurveySubmitDialog from "@/components/service/SurveySubmitDialog";
import SurveyZoneList from "@/components/service/SurveyZoneList";
import SurveyZonePage from "@/components/service/SurveyZonePage";
import useLiveZoneFiles from "@/components/service/useLiveZoneFiles";
import useSurveyClock from "@/components/service/useSurveyClock";
import useSurveyZoneRoute, { surveyZoneHeadingId } from "@/components/service/useSurveyZoneRoute";
import ConfirmDialog, { confirmAction } from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ReasonDialog from "@/components/ui/ReasonDialog";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import useLatestRun from "@/lib/ui/useLatestRun";
import useMediaQuery from "@/lib/ui/useMediaQuery";
import useOnScreenKeyboard from "@/lib/ui/useOnScreenKeyboard";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { allowNextLeave, useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  surveyAddZoneError, surveyChangeCounts, surveyChangeText, surveyCrewGaps,
  surveySendBackDoneError, surveySendBackError, surveySendBackItems, surveyTotals,
} from "@/lib/service/survey";
import { surveyControlView } from "@/lib/service/surveyControl";
import {
  SURVEY_RAIL_QUERY, SURVEY_SPLIT_QUERY, surveyAboutView, surveyDefaultZoneId, surveyDiscardConfirm, surveyDueLine,
  surveyEscapeView, surveyFieldBarView, surveyJobHeaderView, surveyLeaveConfirm, surveyNextStep, surveySendBackItemsView,
  surveySheetHref, surveySheetNotices, surveySheetTotalsText, surveyVisitBadge, surveyZoneListView, surveyZoneNeighbors,
  surveyZoneTitle,
} from "@/lib/service/surveyFieldView";
import { surveySendConfirm, surveySendDoneText } from "@/lib/service/surveySendClose";
import { surveyPendingDecisions } from "@/lib/service/surveyDecision";
import { surveyRowNameClash } from "@/lib/service/surveyRequest";
import { floorLabel, normalizeFloor } from "@/lib/service/zoneCode";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import styles from "./page.module.css";

/* เหตุผลที่ตัดพื้นที่ออก — ขั้นต่ำเดียวกับ server (ฝ่ายขายจะเห็นข้อความนี้ · ไม่ได้ไปหน้างานเอง) */
const CUT_REASON_MIN = 5;
const CUT_REASON_MAX = 500;

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
  /* ลิงก์ตรงเข้าพื้นที่ (`?zone=` จากกระดิ่ง/งานวันนี้) — อ่านครั้งเดียวตอนเปิดหน้า หลังจากนั้นตัวต่อสายประวัติถือความจริง */
  const [initialZone] = useState(() => params$.get("zone"));
  const [sending, setSending] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  /* ดึงผลกลับมาแก้ (§5E ④) — เหตุผลบังคับ เพราะ SA อาจเอาตัวเลขไปเสนอราคาแล้ว */
  const [recalling, setRecalling] = useState(false);
  const [recallReason, setRecallReason] = useState("");
  const [recallBusy, setRecallBusy] = useState(false);
  /* ช่างเพิ่มพื้นที่ที่เจอหน้างาน (มติข้อ 6) — ฟอร์มย่อของ "เพิ่มพื้นที่ใหม่" ฝั่ง SA
     ⚠️ ชั้นบังคับเหมือนกัน (ช่างใช้หาโซน · ไม่อยู่ในรหัส ZN แล้วตั้งแต่ mig 0384) */
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", floor: "", note: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  /* ตัดพื้นที่ออก — กล่องเหตุผลของหน้า (เปิดได้จากเมนู ⋮ บนหัวพื้นที่ และแถวท้ายเนื้อ)
     🐞 เดิมกล่องเหตุผลอยู่ในการ์ดแล้วยิงร่างขนาดไปด้วย ⇒ พื้นที่ที่ยังไม่เคยวัดตัดออกไม่ได้ (§10.5 S1) */
  const [cutting, setCutting] = useState(null);
  const [cutReason, setCutReason] = useState("");
  const [cutBusy, setCutBusy] = useState(false);
  const [cutError, setCutError] = useState("");
  /* หัวหน้าแจ้งช่างให้กลับไปเก็บงาน (แผน §5.4) — เหตุผลบังคับ เพราะช่างจะเห็นข้อความนี้
     ในกระดิ่งแล้วต้องรู้ว่าต้องไปทำอะไร โดยไม่ต้องโทรถามกลับ
     ⚠️ ปุ่มอยู่ในการ์ดควบคุม **ครั้งเดียวต่อใบ** — ไม่ใช่ปุ่มต่อข้อเหมือนเช็คลิสต์เดิม */
  const [sendingBack, setSendingBack] = useState(false);
  /* ช่างแจ้งหัวหน้าว่าแก้ตามที่ส่งกลับแล้ว (มติผู้ใช้ 2026-09-22) — ปิดวงของ "แจ้งช่างให้กลับไป"
     ⭐ **ยิงตรงจากปุ่มบนแถบ ไม่มีกล่องยืนยันแล้ว** (§10.5 S8 · ม็อก A-5) — ข้อที่ติ๊ก + "แก้อะไรไป" อยู่บนการ์ดส่งกลับ
       ที่หัวรายการ (ช่างเห็นก่อนกดว่าจะส่งอะไร) · 🐞 กล่องเดิมถามซ้ำเรื่องเดียวกับที่การ์ดบอก และช่อง "แก้อะไรไป" ซ่อนอยู่ในกล่อง
     ⚠️ ข้อความถึงหัวหน้าไม่บังคับ — ของที่หัวหน้าต้องใช้คือผลวัดในใบ ไม่ใช่คำบรรยาย
     ⚠️ **ติ๊กผูกกับรอบที่ส่งกลับ** (`sentBack.id`) — หัวหน้าส่งกลับรอบใหม่ = ติ๊กของรอบเก่าไม่ติดมา (เลขข้อคนละชุด) */
  const [fixedNote, setFixedNote] = useState("");
  const [fixedTicks, setFixedTicks] = useState({ id: null, items: [] });
  const [reportBusy, setReportBusy] = useState(false);
  const [sendBackNote, setSendBackNote] = useState("");
  const [sendBackBusy, setSendBackBusy] = useState(false);
  /* พื้นที่ที่มีค่าพิมพ์ค้าง → สรุปว่าค้างอะไร ("ขนาด 2 ส่วน · จุด 2 จุด") — หน้าพื้นที่รายงานขึ้นมา
     แล้วส่งต่อให้ตัวตัดสินบล็อกปุ่มส่ง/ส่งผล และให้กล่อง "ทิ้งค่าที่ยังไม่บันทึก?" บอกว่าจะทิ้งอะไร
     ⚠️ หน้าพื้นที่เปิดได้ทีละหน้า ⇒ มีค่าค้างได้ทีละพื้นที่ — ชื่อ `dirtyZoneIds` คงไว้ (ตัวตัดสิน/เทสต์อ่านชื่อนี้) */
  const [dirtyZones, setDirtyZones] = useState({});
  /* ทิ้งร่างของหน้าพื้นที่ = เปลี่ยน key (ตอบ "ทิ้งแล้วไปต่อ") — ร่างอยู่ใน state ของหน้าพื้นที่ ไม่มีที่เก็บอื่น */
  const [draftEpoch, setDraftEpoch] = useState(0);
  /* ชุดรูปที่กำลังส่ง (ทุกพื้นที่) — แผงไฟล์แนบยิงคู่ true/false จากลูปอัปเอง แม้หน้าพื้นที่ถูกถอดกลางการอัป */
  const [uploadsBusy, setUploadsBusy] = useState(0);
  /* ร่างที่หัวหน้าเคาะไว้แต่ยังไม่กดบันทึก (แท็บสรุปส่งผล · PR5)
     ⭐ **ร่างอยู่ที่หน้า ไม่ได้อยู่ในตาราง** — 🐞 เดิมเก็บไว้ใน `SurveyResultTable`
       ซึ่งหน้านี้ unmount ทิ้งทุกครั้งที่สลับไปแท็บ "หน้างาน" ⇒ ของที่หัวหน้าเคาะไว้
       หายเงียบโดยไม่มีคำเตือน แล้วธง "ยังไม่บันทึก" ที่ยิงไว้ก่อนหน้าก็ค้างอยู่
       ⇒ ปุ่มส่งถูกบล็อกด้วยเหตุผลที่ไม่จริงแล้ว พร้อมปุ่มที่พากลับไปยังแท็บที่ว่างเปล่า
     ⚠️ คนละแกนกับ `dirtyZones` ซึ่งเป็นค่าที่ **ช่าง** พิมพ์ค้างบนแท็บหน้างาน —
        ด่านของปุ่มส่งผลถามทั้งสองตัว และขึ้นข้อความคนละอัน */
  const [decisionDrafts, setDecisionDrafts] = useState({});
  /* ── ช่าง: รับงาน (= เริ่มงาน) → … → ส่งงาน อยู่จบในจอนี้ (มติผู้ใช้ 2026-09-21) ──
     🐞 เดิมจอนี้ไม่มีปุ่มส่งงาน ช่างต้องย้อนไป "งานวันนี้" แล้วเจอแผ่นปิดงานของงานบริการ
     ⚠️ `?submit=1` = มาจากปุ่ม "ส่งงาน" บนการ์ดงานวันนี้ ⇒ เปิดโมดัลให้ทันทีครั้งเดียว */
  const [startingVisit, setStartingVisit] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  /* ค่าเริ่มของผลการเข้าในกล่องส่งงาน — มาจากแถว "ไปแล้วเข้าไม่ได้" เท่านั้น (`'unable'`) · ทางอื่นทุกทาง = ไม่มีค่าตั้งต้น */
  const [submitInitial, setSubmitInitial] = useState(null);
  const wantsSubmit = params$.get("submit") === "1";

  /* ── ขนาดจอ (JS ตัดสินโหมด · CSS อ่านตาม) + แป้นพิมพ์บนจอ ──────────────────────
     ⚠️ เส้นเดียวกับ CSS ของจอนี้ (1000 · 1200) · server ตอบ false ทั้งคู่ — หน้าโชว์โครงรอข้อมูลก่อน ไม่มีจังหวะกะพริบ
     ⚠️ ธงแป้นพิมพ์อยู่ที่ `<html>` — เรียกที่นี่ที่เดียวของหน้า (ท้ายหน้าพื้นที่กับแถบของช่างประกาศ `data-osk-hide` เอง) */
  const split = useMediaQuery(SURVEY_SPLIT_QUERY);
  const railWide = useMediaQuery(SURVEY_RAIL_QUERY);
  useOnScreenKeyboard();
  /* "ตอนนี้" เวลาไทย เดินทีละนาที — นับถอยหลังของแถบ + ช่วงเวลาที่กล่องส่งงานบอกว่าจะปิด */
  const nowKey = useSurveyClock();

  /* ⚠️ กันคำตอบมาผิดลำดับ — ช่างกดบันทึกรัว ๆ ได้ ถ้าไม่กัน คำตอบของรอบที่ตกไปแล้ว
     จะเขียนทับเป็นตัวสุดท้าย โดยไม่มี error อะไรเลย */
  const startRun = useLatestRun();
  /* นับรอบโหลดที่จบ (ได้ใบหรือพังก็นับ) — ตัวต่อสายประวัติใช้ทิ้งพื้นที่ที่จองเปิดไว้แต่ไม่มาถึง
     🐞 UAT 25/09: ใช้ตัว `data` เป็นสัญญาณแล้วโหลดเบื้องหลังที่พังไม่เปลี่ยน `data` ⇒ คำขอค้าง แล้วรอบหน้าที่โหลดผ่าน
        (กลับมาที่แท็บ · รูปขึ้นเสร็จ) พาไปพื้นที่นั้นกลางงาน */
  const [loadSettled, setLoadSettled] = useState(0);
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
      if (isLatest()) {
        setLoading(false);
        setLoadSettled((n) => n + 1);
      }
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  /* รูปชุดสุดท้ายขึ้นเสร็จ = อ่านใบใหม่ (§3.7) — พื้นที่ที่ช่างออกไปแล้วระหว่างรูปยังส่ง ตัวนับต้องขยับด้วย
     (แผงของพื้นที่นั้นถูกถอดไปแล้ว ไม่มีใครรายงานรายการสดของมันขึ้นมา) */
  const uploadsBefore = useRef(0);
  useEffect(() => {
    const was = uploadsBefore.current;
    uploadsBefore.current = uploadsBusy;
    if (was > 0 && uploadsBusy === 0) load({ background: true });
  }, [uploadsBusy, load]);
  const handleUploadBusy = useCallback((busy) => {
    setUploadsBusy((n) => Math.max(0, n + (busy ? 1 : -1)));
  }, []);

  const saveZone = async (zoneId, payload) => {
    setBusyZone(zoneId);
    try {
      // คืนแถวที่บันทึกแล้ว — หน้าพื้นที่ใช้เป็นฐานของร่างรอบถัดไป (ไม่ต้องรอโหลดใหม่ซึ่งพังเงียบได้)
      const saved = await apiJson(`/api/service/surveys/${id}/zones/${zoneId}`, {
        method: "PATCH", json: payload, fallbackError: "บันทึกผลวัดไม่สำเร็จ",
      });
      setToast({ kind: "success", msg: "บันทึกแล้ว" });
      await load({ background: true });
      return saved;
    } finally {
      setBusyZone(null);
    }
  };

  /* ⭐ **ตัดออก = ส่งแค่สถานะกับเหตุผล ไม่พ่วงร่างขนาด** (§10.5 S1) — การตัดไม่ใช่การบันทึกผลวัด ·
     ร่างที่ค้างอยู่ในหน้าพื้นที่ยังอยู่ (ไม่หาย ไม่ถูกส่ง) · เอากลับเข้าใบแล้วได้ร่างเดิมคืนพร้อมป้าย "ยังไม่บันทึก"
     ⚠️ ล้ม = บอกในกล่อง (ไม่ใช่ toast ที่หายไป) · กล่องยังเปิดให้แก้แล้วกดซ้ำ */
  const cutZone = async () => {
    if (!cutting) return;
    setCutBusy(true);
    setCutError("");
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${cutting.id}`, {
        method: "PATCH", json: { status: "cut", cutReason: cutReason.trim() }, fallbackError: "ตัดพื้นที่ออกไม่สำเร็จ",
      });
      setCutting(null);
      setCutReason("");
      setToast({ kind: "success", msg: "ตัดพื้นที่ออกแล้ว — เอากลับเข้าใบได้จากเมนูบนหัวพื้นที่" });
      await load({ background: true });
    } catch (e) {
      setCutError(e.message || "ตัดพื้นที่ออกไม่สำเร็จ");
    } finally {
      setCutBusy(false);
    }
  };

  const restoreZone = async (zone) => {
    if (!zone?.id) return;
    setBusyZone(zone.id);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${zone.id}`, {
        method: "PATCH", json: { status: "ok" }, fallbackError: "เอาพื้นที่กลับเข้าใบไม่สำเร็จ",
      });
      setToast({ kind: "success", msg: "เอากลับเข้าใบแล้ว — พื้นที่นี้ต้องวัดเหมือนเดิม" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
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

  /* เริ่มงาน — server ประทับเวลาไทยเอง (ตัวเดียวกับปุ่มบนงานวันนี้) */
  const startVisit = async () => {
    if (!data?.visit?.id) return;
    setStartingVisit(true);
    try {
      const res = await apiJson(`/api/service/visits/${data.visit.id}`, {
        method: "PATCH", json: { status: "in_progress", stamp: "start" }, fallbackError: "เริ่มงานไม่สำเร็จ",
      });
      const at = String(res?.visit?.actualStartTime || "").slice(0, 5);
      setToast({ kind: "success", msg: at ? `เริ่มงานแล้ว · ${at} น.` : "เริ่มงานแล้ว" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setStartingVisit(false);
    }
  };

  /* ส่งงาน = ปิดนัดประเมิน (`stamp: 'end'` ให้ server ประทับเวลาจบ) · ด่าน "ของช่างครบ"
     อยู่ที่ route ปิดนัด — โยน error กลับไปให้โมดัลบอกตรงนั้น ไม่ใช่ toast ที่หายไป */
  const submitField = async ({ status, unableReason, summary }) => {
    const res = await apiJson(`/api/service/visits/${data.visit.id}`, {
      method: "PATCH",
      json: { status, stamp: "end", summary, ...(status === "unable" ? { unableReason } : {}) },
      fallbackError: "ส่งงานไม่สำเร็จ",
    });
    setSubmitOpen(false);
    setToast(res?.steppedBackRequest
      ? { kind: "success", msg: "ปิดว่าไปแล้วเข้าไม่ได้ · ใบกลับไปขั้นลงคิวแล้ว — TS จะลงวันใหม่ และฝ่ายขายได้รับแจ้งพร้อมเหตุผล" }
      : data?.canDecide === true
        /* Senior ที่ออกหน้างานเองคือคนเคาะต่อ — "หัวหน้าได้แจ้งเตือน" คือการแจ้งตัวเอง */
        ? { kind: "success", msg: "ส่งงานแล้ว — เคาะจุดติดตั้งและแพ็คเกจต่อได้ที่แท็บสรุปส่งผล" }
        : { kind: "success", msg: "ส่งงานแล้ว — หัวหน้าได้แจ้งเตือนให้เคาะจุดติดตั้งและแพ็คเกจ" });
    await load({ background: true });
  };

  /* ⭐ **ส่งผล = ตอบใบ + ปิดนัดที่ยังเปิด** (มติเจ้าของ 24/09 ข้อ 2) — ส่ง `closeVisitId` = นัดที่โมดัลบอก
     ผู้ใช้ว่าจะปิด (`view.send.closesVisit`) ให้ route ยืนยันว่าเป็นนัดตัวเดียวกัน · ไม่ตรง = 409 "โหลดหน้าใหม่"
     🔑 ล้ม = **โยน error กลับให้โมดัลบอกตรงนั้น** แล้วอ่านใบใหม่ทันที ⇒ โมดัลที่ยังเปิดอยู่เปลี่ยนเป็นนัด/ด่าน
        ล่าสุดให้อ่านก่อนกดซ้ำ (🐞 เดิมเป็น toast 3.6 วิ แล้วปิดโมดัล — ข้อความ 409 ยาว ๆ หายก่อนอ่านจบ) */
  const send = async () => {
    setSendBusy(true);
    try {
      const res = await apiJson(`/api/service/surveys/${id}/send`, {
        method: "POST",
        json: { closeVisitId: view.send.closesVisit?.id ?? null },
        fallbackError: "ส่งผลไม่สำเร็จ",
      });
      setSending(false);
      setToast({ kind: "success", msg: surveySendDoneText(res?.closedVisit) });
      await load({ background: true });
    } catch (e) {
      await load({ background: true });
      throw e;
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

  /* เพิ่มแล้ว **เปิดพื้นที่ใหม่ให้ทันที** (แผน §10.5 S7) — คนที่เพิ่งเพิ่มพื้นที่คือคนที่กำลังจะวัดมัน
     ⚠️ พื้นที่ใหม่ยังไม่อยู่ในรายการจนกว่าใบจะโหลดใหม่ ⇒ ตัวต่อสายจองไว้แล้วเปิดเมื่อมันมาถึง */
  const addZone = async () => {
    setAddBusy(true);
    try {
      const row = await apiJson(`/api/service/surveys/${id}/zones`, {
        method: "POST", json: draft, fallbackError: "เพิ่มพื้นที่ไม่สำเร็จ",
      });
      setAdding(false);
      setDraft({ name: "", floor: "", note: "" });
      setToast({ kind: "success", msg: "เพิ่มพื้นที่แล้ว — ได้รหัสในทะเบียนเรียบร้อย" });
      if (row?.id) openZone(row.id);
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setAddBusy(false);
    }
  };

  /* ลบพื้นที่ที่เพิ่มผิด — ไม่ใช่ "ตัดออก" (ดูเหตุผลที่ route)
     ⚠️ ไม่ใส่ `retry` — ลบซ้ำรอบสองได้ 404 แล้วจอจะบอกคนละเรื่องกับความจริง
     ⭐ พื้นที่ที่เปิดอยู่หายไป = ตัวต่อสายพากลับรายการ (หน้าเดียว) หรือไปพื้นที่ตั้งต้น (สองบาน) เอง — ไม่ถาม
        เพราะร่างของพื้นที่ที่ถูกลบไม่มีที่ให้บันทึกแล้ว */
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

  /* ⭐ แจ้งหัวหน้าว่าแก้แล้ว = ข้อที่ติ๊ก (`doneItems` นับจาก 0 ตามรอบที่ส่งกลับ) + "แก้อะไรไป" จากการ์ดส่งกลับ
     · สำเร็จ = ล้างทั้งสองแล้วโหลดใหม่ ⇒ แถบกลับเป็น "ส่งงานแล้ว" และการ์ดของหัวหน้าขึ้น "ช่างแจ้งว่าแก้แล้ว 1 / 2 ข้อ"
     ⚠️ ล้ม = ของที่ติ๊ก/พิมพ์ไว้ยังอยู่ (กดซ้ำได้) · เหตุขึ้น toast ข้างแถบที่เพิ่งกด (ด่านตัวเดียวกับ route บอกเหตุบนแถบ
        ตั้งแต่ก่อนกดอยู่แล้ว ⇒ ที่ตกมาถึงตรงนี้คือใบเปลี่ยนระหว่างทาง) */
  const reportFixed = async (doneItems) => {
    setReportBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/send-back-done`, {
        // 🐞 UAT 25/09 — บอกรอบที่ติ๊กไว้ (ติ๊กผูกกับ `sentBackId` บนจอ) ⇒ หัวหน้าส่งรอบใหม่ระหว่างทาง = route ตอบชน ไม่ใช่ไปปิดรอบใหม่
        method: "POST", json: { note: fixedNote.trim(), doneItems, sendBackId: sentBackId }, fallbackError: "แจ้งหัวหน้าไม่สำเร็จ",
      });
      setFixedNote("");
      setFixedTicks({ id: null, items: [] });
      setToast({ kind: "success", msg: "แจ้งหัวหน้าแล้ว — หัวหน้าจะได้แจ้งเตือนให้ตรวจแล้วเคาะแพ็คเกจต่อ" });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "แจ้งหัวหน้าไม่สำเร็จ" });
      // หัวหน้าส่งกลับรอบใหม่ระหว่างทาง (409) — ดึงใบใหม่ให้การ์ดขึ้นข้อของรอบใหม่เลย ไม่ต้องให้ช่างรีเฟรชเอง
      if (e.status === 409) await load({ background: true });
    } finally {
      setReportBusy(false);
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
  /* ⭐ **ไฟล์รายพื้นที่ชุดสด** (แผน §10.5 S2) — ก้อนจาก GET + รายการที่แผงไฟล์แนบรายงานขึ้นมา
     หลังอัป/ลบ ⇒ อัปผังที่ตารางสรุปแล้ว ด่าน "ภาพผัง" บนการ์ดจัดการผลและปุ่มส่งผลขยับทันที
     ไม่ต้องรอโหลดหน้าใหม่ · 🔑 **ทุกที่ในหน้าอ่านก้อนนี้ก้อนเดียว** — ก้อน GET ดิบอีกก้อนคือ
     ตัวนับสองชุดที่บอกไม่ตรงกันบนจอเดียว (กติกาของตัวรวมอยู่ใน `useLiveZoneFiles`) */
  const [filesByZone, reportFiles] = useLiveZoneFiles(data?.filesByZone);
  /* 🔑 ธง dirty เป็น **ของที่ server มองไม่เห็น** — ค่ายังอยู่บนจอ ยังไม่เคยถูกส่งไป
     ⇒ ต้องเดินทางจากหน้าพื้นที่ขึ้นมาที่นี่ แล้วลงไปที่ตัวตัดสิน ไม่ใช่ให้แต่ละที่เดาเอง */
  const handleDirtyZone = useCallback((zoneId, isDirty, summary = "") => {
    setDirtyZones((prev) => {
      const key = String(zoneId);
      if (!isDirty) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev[key] === summary ? prev : { ...prev, [key]: summary };
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
    sendBack: data?.sendBack || null,
    unknown: data?.unknown || {},
    viewer: {
      canWrite: data?.canWrite === true,
      canDecide: data?.canDecide === true,
      /* สองตัวนี้มาจาก server ล้วน — จอไม่รู้ role ของตัวเอง ⇒ เดาไม่ได้ทั้งคู่
         (`canOpenRequest` = เปิดหน้าคำร้องได้ไหม · `writeBlockedReason` = เหตุที่เขียนไม่ได้
          ซึ่ง `visitWriteAccess` พิมพ์มาแล้วรายคน "นัดนี้ไม่ใช่งานของคุณ …") */
      canOpenRequest: data?.canOpenRequest === true,
      writeBlockedReason: data?.writeBlockedReason || null,
      onVisit: data?.onVisit === true,
    },
    dirtyZoneIds,
    pendingDecisionZoneIds,
    tab,
    today: businessDate(),
  }), [data, zones, filesByZone, dirtyZoneIds, pendingDecisionZoneIds, tab]);

  const canDecide = data?.canDecide === true;

  /* ── หน้าพื้นที่ ↔ ประวัติของเบราว์เซอร์ (แผนลงมือ §3.3) ──────────────────────────────
     ⚠️ สลับแท็บเขียน URL ด้วย `history.replaceState` (ท่าเดียวกับตัวต่อสาย) ไม่ใช่ `router.replace` — ตัวหลัง commit
        ทีหลังแบบ async ⇒ "เปิด X" จากแท็บสรุป (สลับแท็บแล้วเปิดพื้นที่ทันที) โดนมันเขียนทับ `?zone=` ที่เพิ่งเขียน
        (Next หุ้ม replaceState ไว้ให้ `useSearchParams` เห็น URL ใหม่ — แท็บยังเดินตาม URL เหมือนเดิม) */
  /* 🐞 UAT 25/09 `zoneId` = ชั้นพื้นที่ที่รายการนี้เป็นอยู่ (ตัวต่อสายส่งมา) — เดิมแท็บหน้างานเขียน URL ใบเปล่าทับ
     `?zone=` ทั้งที่บานขวายังโชว์พื้นที่เดิม ⇒ รีเฟรชแล้วได้พื้นที่ตั้งต้นแทน · แท็บสรุปไม่พกพื้นที่ใน URL แต่คงกุญแจ
     `surveyZone` ไว้ (รีเฟรชบนแท็บสรุปแล้วกลับหน้างาน ตัวต่อสายรู้ว่าชั้นใบอยู่ข้างล่างแล้ว ไม่ดันซ้อน) */
  const applyTab = useCallback((next, zoneId = null, layer = false) => {
    setTab(next);
    // ชั้นเปล่าของสองบานคงกุญแจ `surveyLayer` (รีเฟรชแล้วตัวต่อสายรู้ว่าชั้นใบอยู่ข้างล่าง ไม่ดันซ้อน · review 26/09)
    const data = zoneId ? { surveyZone: String(zoneId) } : layer ? { surveyLayer: true } : { surveySheet: true };
    window.history.replaceState(data, "", surveySheetHref(id, { tab: next, zoneId }));
  }, [id]);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const dirtyZonesRef = useRef(dirtyZones);
  dirtyZonesRef.current = dirtyZones;
  /* ของค้างระดับหน้า (ไม่ใช่ค่าในพื้นที่) — การเคาะของหัวหน้า · ข้อความถึงหัวหน้า · รูปที่ยังส่งไม่เสร็จ
     🐞 UAT 25/09 ตัวต่อสายเคยรู้แค่ค่าในพื้นที่ ⇒ สองบานกดย้อนออกจากหน้า (ตัวต่อสายสั่งย้อนเอง) ของพวกนี้หายไม่ถาม */
  const pageDirty = pendingDecisionZoneIds.length > 0 || fixedNote.trim() !== "" || uploadsBusy > 0;
  const leaveRef = useRef(null);
  leaveRef.current = { uploads: uploadsBusy, decisions: pendingDecisionZoneIds.length, fixedNote };
  /* ⭐ **กล่องเดียวทุกทางออก** — "ทิ้งค่าที่ยังไม่บันทึก?" บอกว่าพื้นที่ไหน ค้างอะไร และรูปไม่หาย ·
     ปุ่มที่ไม่เสียอะไร ("กลับไปบันทึก") เป็นโฟกัสตั้งต้นของกล่องยืนยันอยู่แล้ว
     ⭐ ออกจากหน้า (`via:'leave'` — สองบานย้อนลงชั้นใบ) = กล่องเดียวกับลิงก์/รีเฟรช (`surveyLeaveConfirm`) ⇒ บอกของค้าง
       ทุกชนิด ลำดับเดียวกัน (รูปที่ยังส่ง → ค่าในพื้นที่ → การเคาะ → ข้อความถึงหัวหน้า) · ไม่เหลืออะไรค้างแล้ว = ออกเลย */
  const askDiscard = useCallback(({ from, via }) => {
    const zone = zonesRef.current.find((z) => String(z.id) === String(from)) || {};
    if (via === "leave") {
      const zoneDirty = from != null && String(from) in dirtyZonesRef.current;
      const box = surveyLeaveConfirm({
        ...leaveRef.current, zoneDirty, zone, summary: zoneDirty ? dirtyZonesRef.current[String(from)] : "",
      });
      if (!box) return Promise.resolve(true);
      // ตอบ "ทิ้งแล้วออก" = ตัวต่อสายย้อนออกเอง ⇒ เบราว์เซอร์ต้องไม่ถาม "Leave site?" ซ้ำ (หน้าก่อนหน้าเป็นคนละเอกสาร)
      return confirmAction(box).then((ok) => {
        if (ok) allowNextLeave();
        return ok;
      });
    }
    const text = surveyDiscardConfirm({ zone, summary: dirtyZonesRef.current[String(from)] || "" });
    return confirmAction({
      title: text.title, description: text.message, cancelLabel: text.cancelLabel, confirmLabel: text.confirmLabel,
      tone: "danger",
    });
  }, []);
  const resetDraft = useCallback(() => setDraftEpoch((n) => n + 1), []);
  const zoneIds = useMemo(() => zones.map((z) => String(z.id)), [zones]);
  const defaultZoneId = useMemo(
    () => surveyDefaultZoneId(zones, filesByZone, { editable: view.flags.canWrite }),
    [zones, filesByZone, view.flags.canWrite],
  );
  const route = useSurveyZoneRoute({
    requestId: id,
    // 🐞 review 26/09 เริ่มทั้งสองแท็บ (เดิม `&& tab === "field"` ⇒ เปิดจากกระดิ่งที่แท็บสรุปแล้วย้อน = การเคาะหายไม่ถาม)
    ready: !loading && !!data,
    initialZoneId: initialZone,
    zoneIds,
    defaultZoneId,
    split,
    dirtyZoneIds,
    pageDirty,
    tab,
    snapshot: loadSettled,
    onAsk: askDiscard,
    onResetDraft: resetDraft,
    onTab: applyTab,
  });
  const goTab = route.goTab;
  /* "เปิด X" จากการ์ดจัดการผล / "ไปแก้" ในกล่องส่งงาน — กลับแท็บหน้างานก่อนเสมอ แล้วค่อยเปิดพื้นที่
     (ตัวต่อสายจองพื้นที่ไว้จนแท็บสลับเสร็จ) */
  const openZone = useCallback((zoneId) => {
    if (tab !== "field") goTab("field");
    route.open(zoneId);
  }, [tab, goTab, route]);

  /* ⭐ **ออกจากหน้าตอนมีของค้าง = ถามก่อนทิ้ง** (แผนลงมือ §3.4) — ค่าที่ช่างพิมพ์ค้างในพื้นที่ · การเคาะของหัวหน้า
     (ร่างอยู่ที่หน้า รอดการสลับแท็บแต่ไม่รอดการออกจากหน้า — ตารางสรุปสัญญาว่า "กดลิงก์ออก รีเฟรช หรือปิดแท็บ… ระบบจะถามก่อนทิ้ง"
     · ปุ่มย้อนของเครื่องถามเฉพาะสองบาน (`pageDirty` ของตัวต่อสาย) ⇒ ตารางไม่สัญญาเรื่องปุ่มย้อน) ·
     ข้อความถึงหัวหน้าที่ยังไม่ส่ง · รูปที่ยังส่งไม่เสร็จ · คำถามพูดถึงของที่จะหายจริง (`surveyLeaveConfirm`) */
  // ⚠️ ใช้ `pageDirty` ตัวเดียวกับตัวต่อสาย — 🐞 review 26/09: เขียนเงื่อนไขซ้ำสองที่แล้วยามตรึงได้แค่ครึ่งเดียว
  const anyUnsaved = dirtyZoneIds.length > 0 || pageDirty;
  const dirtyZoneId = dirtyZoneIds[0] || null;
  useUnsavedChanges(anyUnsaved, {
    // กล่องเดียวกับการย้ายพื้นที่ — หัวเป็นคำถาม · ปุ่มทิ้งโทนอันตราย (ไม่ใช่ "ยืนยัน" น้ำเงินของกล่องกลาง)
    confirm: surveyLeaveConfirm({
      uploads: uploadsBusy,
      zoneDirty: !!dirtyZoneId,
      zone: dirtyZoneId ? zones.find((z) => String(z.id) === dirtyZoneId) : null,
      summary: dirtyZoneId ? dirtyZones[dirtyZoneId] : "",
      decisions: pendingDecisionZoneIds.length,
      fixedNote,
    }),
  });

  /* ⭐ ข้อความโมดัลส่งผล — ผลทุกข้อของการกด รวม "ปิดนัด SV-… ไปพร้อมกัน" (มติเจ้าของ 24/09 ข้อ 2) */
  const sendConfirm = surveySendConfirm({
    docNo: data?.request?.docNo, closesVisit: view.send.closesVisit,
    // ส่งกลับให้ช่างแก้ค้างอยู่ = บอกก่อนกดว่าส่งแล้วช่างแก้ต่อไม่ได้ (review 26/09 · เตือน ไม่บล็อก)
    sendBackPending: view.send.sendBackPending,
  });
  /* 🔑 ด่านตัวเดียวกับ server — ปุ่มในโมดัลปิดตามนี้ และเหตุขึ้นเป็นตัวหนังสือ
     ⚠️ รายชื่อช่างมาจาก **นัด** ไม่ใช่จากใบ — ตัวตัดสินอ่านให้แล้ว (`zoneGaps.crewIds`)
     🔄 ไม่ส่งของขาดเข้าด่านแล้ว (§10.5 S4) — ฝั่งช่างครบก็ส่งกลับได้ ของขาดเป็นแค่เรื่องเล่าในกล่อง */
  const sendBackGate = surveySendBackError(data?.request, {
    canSend: canDecide,
    note: sendBackNote,
    crewIds: view.zoneGaps.crewIds,
  });
  /* ⭐ ตัวนับ "n ข้อ" ระหว่างพิมพ์ — ตัวแยกบรรทัดตัวเดียวกับ server (แผน §10.5 S3) ⇒ ตาเห็นกี่ข้อ ช่างได้กี่ข้อ */
  const sendBackItems = surveySendBackItems(sendBackNote);
  /* 🔑 ด่านตัวเดียวกับ server — ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · เหตุที่เขียนไม่ได้อยู่ในการ์ด */
  const addGate = surveyAddZoneError(data?.request, { canWrite: data?.canWrite === true });
  /* 🔑 ด่านตัวเดียวกับ route แจ้งว่าแก้แล้ว + ค่าที่ยังพิมพ์ค้าง (server มองไม่เห็น จอต้องกันเอง) */
  const fixedGate = surveySendBackDoneError(data?.request, {
    canWrite: view.flags.canWrite,
    pending: data?.sendBack?.pending === true,
    rows: zones,
    filesByZone,
  }) || (dirtyZoneIds.length ? "มีค่าที่ยังไม่บันทึก — กด “บันทึกพื้นที่นี้” ก่อนแจ้งหัวหน้า" : null);
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
      /* ป้ายไม่พ่วงรหัส — รหัสคำร้องเป็น h1 ติดกันบนแถวเดียวกันแล้ว (§10.5 S9) · 🐞 พ่วงแล้วที่ 390 ป้ายหักสองบรรทัด + รหัสซ้ำสองครั้ง */
      : backToRequest
        ? { href: `/requests/${id}`, label: "คำร้อง" }
        : { href: "/service/today", label: "งานวันนี้" };

  /* แถบงานของช่าง — คนที่ **เขียนผลวัดได้** และใบยังไม่ล็อก (ส่งผลแล้ว = งานของช่างจบ)
     ⚠️ ไม่มีนัด = ไม่มีอะไรให้เริ่ม/ส่ง */
  const fieldVisit = data?.visit || null;
  /* ⚠️ หัวหน้าที่ไม่ได้อยู่บนนัด (เปิดมาเคาะแพ็คเกจ) ไม่ใช่คนส่งงาน — ปุ่มของเขาอยู่การ์ด
     จัดการผลประเมิน · Senior ที่ออกหน้างานเองยังได้แถบ (`onVisit` มาจาก server) */
  const actsAsCrew = !canDecide || data?.onVisit === true;
  /* ⭐ มติเจ้าของ 26/09 "ช่างเห็นแค่งานตัวเอง" — ช่าง (เขียนผลวัดได้ · ไม่ได้เคาะ) ไม่มีจอสรุปส่งผลแล้ว
     ลิงก์เก่า `?tab=result` พากลับหน้างาน (ชั้นใบใต้พื้นที่ต้องเป็น URL แท็บหน้างานอยู่แล้ว — กับดักประวัติ) */
  const crewOnly = !!data && view.flags.canWrite && !canDecide;
  useEffect(() => {
    if (crewOnly && tab === "result") applyTab("field");
  }, [crewOnly, tab, applyTab]);
  const showFieldBar = view.flags.canWrite && !!fieldVisit && actsAsCrew;
  /* ⭐ **แถว "ไปแล้วเข้าไม่ได้" ใต้รายการ** (§10.5 S8 · pain B9) — คนที่ทำหน้าที่ช่าง · เขียนได้ · นัดยังเปิด · ใบไม่ล็อก
     (ตัวตัดสิน `surveyEscapeView`) · ก่อนเริ่มงานก็กดได้: route ปิดนัดประทับเวลาเริ่ม = จบเอง (`visitStamp`) */
  const escape = surveyEscapeView({
    visit: fieldVisit, canWrite: view.flags.canWrite, locked: view.flags.locked, actsAsCrew,
  });
  const canReportUnable = escape.show;
  /* กล่องส่งงานเปิดได้จากสี่ทาง (แถบ · "ถัดไป: ส่งงาน" · `?submit=1` · แถว "ไปแล้วเข้าไม่ได้") — มีแค่ทางสุดท้ายที่เลือกผลไว้ให้ */
  const openSubmit = (initial) => {
    setSubmitInitial(initial === "unable" && canReportUnable ? "unable" : null);
    setSubmitOpen(true);
  };

  /* ── การ์ดส่งกลับของช่าง (A-5 · §10.5 S8) — ติ๊กของรอบที่ค้างอยู่ (รอบอื่น = ไม่มีติ๊ก) ── */
  const sentBackId = data?.sendBack?.sentBack?.id || null;
  const sendBackTicks = fixedTicks.id === sentBackId ? fixedTicks.items : [];
  const sendBackView = surveySendBackItemsView({
    sendBack: data?.sendBack || null, zones, filesByZone, ticks: sendBackTicks, visit: fieldVisit,
  });
  const toggleTick = (index) => setFixedTicks((prev) => {
    const items = prev.id === sentBackId ? prev.items : [];
    return { id: sentBackId, items: items.includes(index) ? items.filter((n) => n !== index) : [...items, index] };
  });
  /* ⚠️ **ส่งงานผ่าน `?submit=1` ไม่ผูกกับแถบ** — หัวหน้าที่ "ไปแทนกัน" จากงานวันนี้ของช่าง
     (`/service/today?user=…`) กดปุ่มส่งงานมาแล้ว แถบซ่อนสำหรับเขา (ไม่ได้อยู่บนนัด) ⇒ ถ้าผูก
     กับแถบ ปุ่มที่เขาเพิ่งกดจะพามาหน้าที่ไม่มีอะไรเกิดขึ้น · ใช้สิทธิ์เขียนตัวเดียวกับ server */
  const canSubmitField = view.flags.canWrite && fieldVisit?.status === "in_progress";

  /* ⭐ **ลำดับบนจอแคบ (เนื้อก่อน/การ์ดก่อน) ตรึงไว้ตลอดการเปิดหน้านี้** — ค่าคิดจากสถานะ
     ตอนโหลดครั้งแรกของนัดนี้ แล้วไม่พลิกระหว่างใช้งาน · 🐞 Senior ที่ออกหน้างานเองกด "ส่งงาน"
     แล้วตัวตัดสินพลิกเป็นการ์ดก่อนทันที ⇒ รางย้ายขึ้นไปอยู่หน้าเนื้อ หน้ากระโดด 245–335px
     ใต้นิ้ว · เปิดหน้าใหม่ครั้งหน้าค่อยได้ลำดับใหม่ */
  const orderKey = `${id}:${data?.visit?.id || ""}`;
  const [stableOrder, setStableOrder] = useState(null);
  useEffect(() => {
    if (!data) return;
    setStableOrder((prev) => (prev?.key === orderKey ? prev : { key: orderKey, controlFirst: view.flags.controlFirst }));
  }, [data, orderKey, view.flags.controlFirst]);
  const controlFirst = stableOrder?.key === orderKey ? stableOrder.controlFirst : view.flags.controlFirst;

  /* มาจากปุ่ม "ส่งงาน" บนการ์ดงานวันนี้ — เปิดโมดัลครั้งเดียว แล้วถอดพารามิเตอร์ทิ้ง
     (รีเฟรชหน้าแล้วโมดัลต้องไม่เด้งซ้ำ) · ⚠️ แท็บหน้างาน: ตัวต่อสายประวัติเขียน URL ของใบทับตอนเริ่ม (ถอด
     `?submit=1` ไปด้วย) — สั่งถอดซ้ำตรงนี้ = คำสั่งนำทางที่ commit ทีหลังมาเขียนทับ `?zone=` ที่ตัวต่อสายเพิ่งดัน */
  useEffect(() => {
    if (!wantsSubmit || loading) return;
    if (canSubmitField) { setSubmitInitial(null); setSubmitOpen(true); }
    if (tab === "result" && !crewOnly) router.replace(surveySheetHref(id, { tab: "result" }), { scroll: false });
  }, [wantsSubmit, loading, canSubmitField, router, id, tab, crewOnly]);

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
  /* ⭐ ป้ายนัดข้างรหัสคำร้อง (แถวย้อน) — สถานะนัดคำเดียวกับหน้าคำร้อง (นัดไว้ · กำลังทำ · เข้าแล้ว · ทำไม่ได้)
     · ใบที่ส่งผลไปแล้วแต่นัดยังไม่ถูกปิด = "นัดยังไม่ปิด" สีอำพัน (ใบก่อนมติ 24/09 ข้อ 2 ที่นัดค้างมา — ถอดเมื่อไร
       นัดพวกนั้นค้างในคิวโดยไม่มีใครเห็น) · 🐞 ป้ายนี้ต้องถาม `sent` ก่อนเสมอ — กติกาอยู่ใน `surveyVisitBadge` (เทสต์ด้วยข้อมูล) */
  const visitBadge = surveyVisitBadge(visit, { sent: view.flags.sent });
  /* หัวงาน + "เกี่ยวกับคำร้อง" — คำชุดเดียวกัน (รหัส · ชื่อเรื่อง · ลูกค้า) จากตัวตัดสินตัวเดียว */
  const headerView = surveyJobHeaderView({
    request: data?.request || null, customer: data?.customer || null, site, visit, crew: data?.crew || [],
    unknown: data?.unknown || {},
  });
  const aboutView = surveyAboutView({
    header: headerView.request, requestId: id, canDecide, canWrite: view.flags.canWrite, canOpenRequest: view.flags.canOpenRequest,
  });
  /* ⭐ กล่องแจ้งของคนที่ไม่มีการ์ด (ช่าง · คนอ่านอย่างเดียว · แผนลงมือ C15) — ใบล็อก · ดึงกลับ · อ่านอย่างเดียว · อ่านไม่สำเร็จ
     ⚠️ หัวหน้าเห็นเรื่องเดียวกันในการ์ดจัดการผลแล้ว ⇒ ไม่วาดซ้ำ */
  const sheetNotices = canDecide ? [] : surveySheetNotices(view);
  const noticeStack = sheetNotices.length ? (
    <div className={styles.notices}>
      {sheetNotices.map((notice) => (
        <StatusNotice key={notice.key} tone={notice.tone} title={notice.title || undefined}>
          {notice.text}
          {notice.meta ? <small className={styles.noticeMeta}>{notice.meta}</small> : null}
        </StatusNotice>
      ))}
    </div>
  ) : null;

  /* ── แท็บหน้างาน: รายการ ↔ หน้าพื้นที่ ─────────────────────────────────────────── */
  const shownZone = route.shown ? zones.find((z) => String(z.id) === route.shown) || null : null;
  const zoneOpen = tab === "field" && !!shownZone;
  /* หน้าเต็มจอ (โหมดหน้า + เปิดพื้นที่อยู่) — หัวงาน · แท็บ · การ์ดจัดการผล หลบให้หน้าพื้นที่ทั้งจอ
     (แถบบน · เมนูล่าง · แถวย้อนของเปลือก หลบเองด้วย `data-immersive-page` ของบานพื้นที่) */
  const immersive = !split && zoneOpen;
  /* ⭐ **การ์ดจัดการผลอยู่ที่ไหน** (แผนลงมือ C5 · หัวหน้าเท่านั้น) — ≥1200 รางขวาทั้งสองแท็บ (`SurveySheetLayout`) · ต่ำกว่านั้น
     แท็บหน้างาน = ในบานรายการ (สองบาน 1000–1199 และหน้ารายการ <1000 — หน้าพื้นที่เต็มจอหลบไปพร้อมบาน) · แท็บสรุป = ไหลตามหน้า
     · ก่อน/หลังเนื้อตาม `controlFirst` ที่ตรึงไว้ตอนเปิดหน้า
     🔄 เดิมรางของ `DetailPageLayout` ปักที่ 1051 — ที่ 1000–1199 กินบานพื้นที่จนเหลือไม่ถึงสองคอลัมน์ */
  const rail = railWide && canDecide;
  const cardInList = tab === "field" && canDecide && !railWide;
  const cardInFlow = tab === "result" && canDecide && !railWide;
  const viewerKind = !view.flags.canWrite ? "readonly" : !canDecide ? "crew" : data?.onVisit === true ? "senior" : "head";
  const listView = surveyZoneListView({
    zones, filesByZone, selectedZoneId: split ? route.shown : null, dirtyZoneId,
    sendBack: data?.sendBack || null, canDecide, split, visit,
  });
  const zoneTitles = Object.fromEntries(zones.map((z) => [String(z.id), surveyZoneTitle(z)]));
  const nextStep = shownZone ? surveyNextStep({
    zones, filesByZone, zoneId: shownZone.id, dirty: dirtyZoneIds.includes(String(shownZone.id)),
    // "ถัดไป: ส่งงาน" เฉพาะคนที่ทำหน้าที่ช่าง — 🐞 review 26/09: หัวหน้าที่ไม่ได้ไปหน้างานไล่ตรวจถึงพื้นที่สุดท้ายแล้วได้ปุ่มส่งงานแทนช่าง
    // (ทาง `?submit=1` ที่หัวหน้าตั้งใจส่งแทนยังใช้ `canSubmitField` เต็มตามเดิม)
    canSubmit: canSubmitField && actsAsCrew,
  }) : null;
  /* "ถัดไป" ของท้ายหน้าพื้นที่ — พื้นที่ที่ยังขาด (ตัวต่อสายถามก่อนทิ้งเอง) หรือกล่องส่งงาน */
  const goNext = (target) => {
    if (target?.kind === "zone") route.open(target.id);
    else if (target?.kind === "submit") openSubmit(null);
  };

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
      /* กำหนดส่งผล — เดิมเป็นช่อง "TS จะส่งผล" ของหัวใบที่ถอดไป (ม็อก AW-2 วางไว้ใต้สถานะของการ์ด) */
      dueLine={surveyDueLine({ due: view.due, locked: view.flags.locked, today: businessDate() })}
      /* บานรายการ 320px (สองบาน 1000–1199) — การ์ดไม่แบ่งสองคอลัมน์ตามเส้นจอ 1050 ของการ์ดกลาง */
      inPane={split}
    />
  );

  /* ⭐ **แถบวาดจากตัวตัดสินตัวเดียว** (`surveyFieldBarView`) — เริ่มงาน → ส่งงาน → (ถูกส่งกลับ) แจ้งหัวหน้าว่าแก้แล้ว ·
     เหตุที่ยังกดไม่ได้อยู่บนแถบตั้งแต่ก่อนกด · ปุ่มกรมท่าปุ่มเดียวต่อจอ: สองบานที่ "บันทึกพื้นที่นี้" ของบานขวากดได้อยู่
     = แถบถอยเป็นปุ่มเงียบ · ⚠️ `zoneSaveEnabled` ประมาณจากธงค่าค้างของพื้นที่ที่เปิดอยู่ (หน้าพื้นที่ไม่ส่งเหตุของปุ่มบันทึก
     ขึ้นมา) — ค้างแต่ติดด่านบันทึก ("ส่วน B ยังขาดความสูง") ปุ่มทั้งสองเงียบพร้อมกัน ซึ่งถูกแล้ว: งานถัดไปคือกรอกให้ครบ */
  const fieldBarView = showFieldBar ? surveyFieldBarView({
    visit: fieldVisit,
    progress: view.progress,
    leftNames: listView.leftNames,
    crewGaps: surveyCrewGaps(zones, filesByZone),
    dirtyZoneIds,
    sendBack: data?.sendBack || null,
    ticks: sendBackTicks,
    doneBlocker: fixedGate,
    split,
    zoneSaveEnabled: split && zoneOpen && dirtyZoneIds.includes(String(shownZone.id)),
    // หัวหน้าที่ไปหน้างานเองเห็นการ์ดจัดการผลบนจอเดียวกัน (ในรายการหรือราง) — ส่งผลกดได้ = ปุ่มนั้นเป็นกรมท่าปุ่มเดียว
    cardPrimary: canDecide && view.send.show && view.send.allowed,
    nowKey,
  }) : null;
  const fieldBar = fieldBarView ? (
    <SurveyFieldBar
      view={fieldBarView}
      layout={split ? "pane" : "page"}
      busy={startingVisit || reportBusy}
      onAction={(key) => {
        if (key === "start") startVisit();
        else if (key === "submit") openSubmit(null);
        else if (key === "report-fixed") reportFixed(sendBackView?.doneItems ?? []);
      }}
    />
  ) : null;
  /* การ์ดส่งกลับของช่าง (A-5) — หัวรายการของแท็บหน้างาน เฉพาะคนที่ทำหน้าที่ช่างและเขียนได้ (หัวหน้าเห็นเรื่องเดียวกันในการ์ดจัดการผล) */
  const sendBackCard = showFieldBar && sendBackView?.mode ? (
    <SurveySendBackCard
      view={sendBackView}
      note={fixedNote}
      onNoteChange={setFixedNote}
      onToggle={toggleTick}
      onGoZone={route.open}
      busy={reportBusy}
    />
  ) : null;

  /* "เกี่ยวกับคำร้อง" ท้ายรายการ — แถว "สรุปส่งผล" ของคนที่ไม่มีแท็บสลับผ่านตัวต่อสาย (ถามก่อนทิ้งค่าค้าง) */
  const aboutBlock = (
    <SurveyAboutRequest view={aboutView} split={split} onResult={canDecide ? undefined : () => goTab("result")} />
  );

  /* ── แท็บสรุปส่งผล ─────────────────────────────────────────────────────────────── */
  const resultMain = (
    <SurveyBarColumn>
      {/* ⭐ ไม่มีแท็บ = ต้องมีทางกลับ (แผนลงมือ §3.8) — ปุ่ม ไม่ใช่ลิงก์: สลับแท็บผ่านตัวต่อสายประวัติ */}
      {!canDecide ? (
        <div className={styles.resultBack}>
          <Button variant="quiet" className={styles.resultBackBtn} icon={<ArrowLeft size={16} aria-hidden="true" />}
            onClick={() => goTab("field")}>
            หน้างาน
          </Button>
          <p className={styles.resultBackText}>สรุปส่งผล · ดูอย่างเดียว</p>
        </div>
      ) : null}
      {noticeStack}
      {cardInFlow && controlFirst ? controlCard : null}
      {zones.length === 0 ? (
        <>
          <EmptyState icon={Search}>
            ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน — ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ
          </EmptyState>
          {/* 🐞 ใบว่างก็ต้องมีปุ่มเพิ่มพื้นที่ — โมดัลส่งงานชี้มาที่ปุ่มนี้ (แถบส่งงานขึ้นทั้งสองแท็บ) */}
          {!addGate && (
            <div className={styles.listFoot}>
              <Button variant="outline" icon={<MapPinPlus size={15} aria-hidden="true" />}
                onClick={() => setAdding(true)}>
                เพิ่มพื้นที่ที่เจอหน้างาน
              </Button>
            </div>
          )}
        </>
      ) : (
        <SurveyResultTable
          zones={zones}
          filesByZone={filesByZone}
          canDecide={canDecide && !view.flags.locked}
          /* ⭐ ภาพผังย้ายมาอยู่คอลัมน์ของตารางนี้ (มติเจ้าของ 25/09) — อัปได้เฉพาะคนเคาะที่เขียนผลวัด
             ของใบนี้ได้ (ด่านเดียวกับ server · ตัวตัดสินคิดให้) · รูปขึ้นระบบทันทีแล้วรายงานขึ้นมา
             ให้ด่านทั้งหน้าเห็นพร้อมกัน */
          canUploadPlan={view.flags.canUploadPlan}
          onFiles={reportFiles}
          showFormula={canDecide}
          busyZone={busyZone}
          onSaveDecisions={saveDecisions}
          drafts={decisionDrafts}
          onDraftsChange={setDecisionDrafts}
          /* ⭐ **บรรทัดนี้คือของที่ฝ่ายขายจะได้ไปพร้อมกระดิ่ง** — TS ตัด/เพิ่มเองได้
             โดยไม่ต้องขออนุมัติ (มติข้อ 6) ⇒ ที่นี่คือจุดที่เขาเห็นก่อนกดส่งว่าตัวเอง
             เปลี่ยนอะไรไปบ้างจากที่ฝ่ายขายขอมา · ขึ้นเสมอ ไม่ใช่เฉพาะตอนมีการเปลี่ยน */
          caption={view.flags.sent ? `${changeText} · ส่งแล้ว แก้ไม่ได้ — ดึงกลับก่อน` : changeText}
        />
      )}
      {cardInFlow && !controlFirst ? controlCard : null}
      {/* แถบงานของช่างบนแท็บสรุปส่งผล — ⚠️ **ไม่ผูกกับแท็บหน้างาน** 🐞 เดิมอยู่ในลิสต์ของแท็บหน้างาน ⇒ ช่างที่เปิด
          แท็บสรุปส่งผลไม่มีปุ่มส่งงานเลย ทั้งที่ส่งงานยังเป็นก้าวที่เขายังไม่ได้ทำ */}
      {fieldBar}
    </SurveyBarColumn>
  );

  /* ── แท็บหน้างาน ─────────────────────────────────────────────────────────────── */
  /* ⭐ **นัดปิดแล้วถูกส่งกลับ (หน้าเดียว) = หัวงานลงไปท้ายเนื้อ** ⇒ การ์ดส่งกลับที่หัวรายการขึ้นเป็นของแรกของใบ
     (ม็อก A-5 "งานตอนนี้") — ไซต์ · นัด · ทีมเป็นเรื่องรองเมื่องานหน้างานจบแล้ว
     🐞 UAT 25/09 จอ 360×640: หัวงานเต็มจอแรก ช่างเห็นปุ่ม "แจ้งหัวหน้าว่าแก้แล้ว" แต่ไม่เห็นข้อที่หัวหน้าขอสักข้อ
     ⚠️ การ์ดยังอยู่ **ในคอลัมน์รายการ** ไม่ยกไปเหนือเปลือก — แถบของช่าง sticky ได้ไม่สูงกว่าขอบบนของคอลัมน์ ถ้าคอลัมน์
        เริ่มใต้การ์ดสูง ~390px แถบจะค้างกลางจอทับเมนูล่าง (ลองแล้ว 25/09 ที่ 360×640)
     ⚠️ นัดยังเปิด (`submit`) = หัวงานอยู่บนตามเดิม — ช่างยังต้องใช้หัวงาน (โทร · นำทาง · เวลาเข้า) · สองบาน = หัวงานเป็นแถบบาง อยู่บนเสมอ */
  const headerLast = tab === "field" && !split && sendBackView?.mode === "report" && !!sendBackCard;
  /* บนสุดของรายการ: กล่องแจ้ง (คนที่ไม่มีการ์ด) → การ์ดส่งกลับของช่าง (A-5: งานตอนนี้ของเขา) → การ์ดจัดการผล (หัวหน้า · controlFirst) */
  const listBefore = noticeStack || sendBackCard || (cardInList && controlFirst) ? (
    <>
      {noticeStack}
      {sendBackCard}
      {cardInList && controlFirst ? controlCard : null}
    </>
  ) : null;
  const fieldMain = (
    <SurveyFieldWorkspace
      mode={split ? "split" : "pages"}
      zoneOpen={zoneOpen}
      list={(
        <SurveyZoneList
          view={listView}
          split={split}
          onOpen={route.open}
          /* ⭐ ปุ่มท้ายรายการ ไม่ใช่บนหัวจอ (ม็อกจอ 06) · 🔑 ด่านตัวเดียวกับ server — ไม่มีสิทธิ์ = ไม่มีแถว */
          onAdd={addGate ? undefined : () => setAdding(true)}
          /* ทางออกทั้งงาน — เปิดกล่องส่งงานที่เลือก "ไปแล้วเข้าไม่ได้" ไว้ให้ (กล่องยังถามเหตุผลก่อนปิดนัด) */
          escape={escape}
          onEscape={canReportUnable ? () => openSubmit("unable") : undefined}
          before={listBefore}
        >
          {cardInList && !controlFirst ? controlCard : null}
          {aboutBlock}
        </SurveyZoneList>
      )}
      /* แถบงานของช่าง — ท้ายบานรายการ: หน้าเต็มจอของพื้นที่มีท้ายหน้าของตัวเอง (บันทึก · ถัดไป) ⇒ แถบนี้ไม่ซ้อน */
      bar={fieldBar}
      zone={shownZone ? (
        <SurveyZonePage
          /* ⚠️ key = พื้นที่ + รอบทิ้งร่าง — หมุนจอ/สลับบานไม่เปลี่ยน key (ร่างอยู่รอด) · ตอบ "ทิ้งแล้วไปต่อ" = ร่างใหม่ */
          key={`${shownZone.id}:${draftEpoch}`}
          zone={shownZone}
          files={filesByZone[shownZone.id] || []}
          canWrite={view.flags.canWrite}
          busy={busyZone === shownZone.id}
          layout={split ? "pane" : "page"}
          /* บานขวาแคบเกินสองคอลัมน์ = คอลัมน์เดียวเหมือนมือถือ: ข้างรางของหัวหน้า (ที่ 1200 เหลือ ~460px) และสองบาน
             ที่ยังไม่ถึง 1200 (🐞 review 26/09: iPad 1024 แนวนอน บานเหลือ ~630px ⇒ ช่อง ก/ย/ส เหลือที่พิมพ์ 31px
             "12.5" ถูกตัด — แคบกว่ามือถือ 360 เสียอีก) · ≥1200 ไม่มีราง (ช่าง) บานกว้าง ≥860px สองคอลัมน์ได้
             ⚠️ หน้าเดียว 681–999 ยังสองคอลัมน์ (ม็อก AT-2 — หน้าเต็มจอกว้างเท่าจอ) */
          oneColumn={rail || (split && !railWide)}
          headingId={surveyZoneHeadingId(shownZone.id)}
          requestCode={req.docNo || null}
          neighbors={surveyZoneNeighbors(zones, shownZone.id, filesByZone)}
          titles={zoneTitles}
          onGoZone={route.open}
          onList={split ? undefined : route.toList}
          next={nextStep}
          onNext={goNext}
          viewerKind={viewerKind}
          onSave={(payload) => saveZone(shownZone.id, payload)}
          onCut={(zone) => { setCutting(zone); setCutReason(""); setCutError(""); }}
          onRestore={restoreZone}
          onRemove={(zone) => setRemoving(zone)}
          onDirtyChange={handleDirtyZone}
          /* รูปที่อัป/ลบในหน้าพื้นที่รายงานขึ้นมาที่ก้อนรวม — รายการ การ์ดจัดการผล และกล่องส่งงานเห็นทันที */
          onFilesChange={reportFiles}
          onUploadBusy={handleUploadBusy}
        />
      ) : split ? (
        <EmptyState icon={Search}>
          {zones.length ? "ไม่มีพื้นที่ที่ต้องวัดแล้ว — พื้นที่ที่ตัดออกเปิดดูได้จากรายการ" : "ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน"}
        </EmptyState>
      ) : null}
    />
  );

  return (
    <Workspace
      hideHeader
      back={back}
      className={styles.shell}
      /* ⭐ **h1 = รหัสคำร้อง อยู่บนแถวย้อน** (แผนลงมือ C17 · ม็อก A-1 · AT-1 · AW-1) — แถวนี้หลบไปตอนหน้าพื้นที่เต็มจอ
         (`data-immersive-page`) แล้ว h1 ย้ายไปซ่อนตาในแถบกรมท่าของหน้าพื้นที่ · สองบานต่อชื่อเรื่อง · ลูกค้าท้ายรหัส
         (ของซ้ำกับ "รายละเอียดคำร้อง" ที่มีทุกขนาดจอ — ไม่มีอะไรหายตามขนาดจอ)
         ⚠️ ป้ายเป็นเรื่องของ **นัด** — สถานะของใบอยู่การ์ดจัดการผล (หัวหน้า) หรือกล่องแจ้งบนรายการ (ช่าง) ที่เดียว */
      backActions={(
        <div className={styles.ident}>
          <h1 className={styles.docNo}>{req.docNo || "ใบประเมินพื้นที่"}</h1>
          {split && (aboutView.line.title || aboutView.line.customer) ? (
            <p className={styles.docLine}>
              {aboutView.line.title}
              {aboutView.line.title && aboutView.line.customer ? " · " : null}
              {aboutView.line.customer ? <b>{aboutView.line.customer}</b> : null}
            </p>
          ) : null}
          {visitBadge ? (
            <StatusBadge tone={visitBadge.tone} dot className={styles.visitBadge}>{visitBadge.label}</StatusBadge>
          ) : null}
        </div>
      )}
    >
      <SurveySheetLayout
        immersive={immersive}
        headerLast={headerLast}
        header={<SurveyJobHeader view={headerView} layout={split ? "band" : "card"} />}
        /* ⚠️ กติกา UI ของระบบ: สลับ "มุมมองคนละชุดข้อมูล" = Tabs · กรองในชุดเดิม = segmented
           ⭐ แท็บเป็นของคนเคาะเท่านั้น (ม็อก AW-2/AW-3) — ช่างไม่มีแท็บ ไปสรุปส่งผลจากแถวใน "เกี่ยวกับคำร้อง" */
        tabs={canDecide ? (
          <Tabs
            value={tab}
            onChange={goTab}
            ariaLabel="มุมมองของใบประเมิน"
            tabs={[
              { key: "field", label: "หน้างาน" },
              { key: "result", label: "สรุปส่งผล" },
            ]}
          />
        ) : null}
        tabsNote={canDecide ? surveySheetTotalsText({ zones, filesByZone }) : null}
        rail={rail ? controlCard : null}
        railLabel="จัดการผลประเมิน"
      >
        {tab === "result" && !crewOnly ? resultMain : fieldMain}
      </SurveySheetLayout>

      <SurveySubmitDialog
        open={submitOpen}
        visit={fieldVisit}
        site={site}
        nowKey={nowKey}
        /* ⭐ ผลของการเข้าไม่มีค่าตั้งต้น — เว้นแต่เปิดจากแถว "ไปแล้วเข้าไม่ได้" (§10.5 S8) */
        initialOutcome={submitInitial}
        zones={zones}
        filesByZone={filesByZone}
        dirtyZoneIds={dirtyZoneIds}
        /* หัวหน้าที่อยู่บนนัดเอง (Senior) ส่งงานของตัวเอง ไม่ใช่ "ส่งแทนช่าง" และเป็นคนเคาะต่อเอง */
        viewerKind={!canDecide ? "crew" : data?.onVisit === true ? "senior" : "head"}
        /* ⚠️ โฟกัสไปที่หัวของพื้นที่ **หลัง** โมดัลคืนโฟกัสให้ปุ่มส่งงานแล้ว — ตัวต่อสายย้ายโฟกัสในเฟรมถัดไป
           (หลัง cleanup ของโมดัล) · 🐞 เดิมหน้าเลื่อนไปถูกพื้นที่ แต่วงโฟกัสค้างที่ "ส่งงาน" */
        onGoZone={(zoneId) => { setSubmitOpen(false); openZone(zoneId); }}
        onAddZone={addGate ? undefined : () => { setSubmitOpen(false); setAdding(true); }}
        onClose={() => setSubmitOpen(false)}
        onSubmit={submitField}
      />

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
          touch value={draft.name} disabled={addBusy} maxLength={150} autoComplete="off" autoFocus
          invalid={!!draftClash}
          placeholder="ชื่อพื้นที่ เช่น โถงลิฟต์ชั้น 3"
          aria-label="ชื่อพื้นที่"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        {/* ⚠️ ชั้นบังคับ (mig 0315) — ไม่อยู่ในรหัสโซนแล้ว (mig 0384) แต่ยังเป็นช่องบังคับของโซน */}
        <Input
          touch value={draft.floor} disabled={addBusy} maxLength={10} autoComplete="off"
          invalid={!!draft.floor && !!draftFloor.error}
          /* ชั้นที่ไม่อยู่ในชุดมาตรฐานพิมพ์เองได้ (LG · P1 · 12A — มติผู้ใช้ 2026-09-24 · mig 0384) */
          placeholder="ชั้น เช่น 4 · G · LG · P1"
          aria-label="ชั้นของพื้นที่"
          onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
        />
        <Input
          touch value={draft.note} disabled={addBusy} maxLength={1000} autoComplete="off"
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

      {/* ── ตัดพื้นที่ออก ─────────────────────────────────────────────────────
          ⚠️ ตัดต้องบอกเหตุผลเสมอ — ของที่หายไปจากสิ่งที่ SA จะเสนอราคาคือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน
          ⭐ บอกผลก่อนกด: ฝ่ายขายเห็นเหตุผล · ย้อนได้ (เอากลับเข้าใบ) — โทนเตือน ไม่ใช่ลบ (ไม่มีข้อมูลหาย) */}
      <ReasonDialog
        open={!!cutting}
        title={cutting ? `ตัด ${surveyZoneTitle(cutting)} ออกจากใบนี้` : "ตัดพื้นที่ออก"}
        description="เข้าห้องนี้ไม่ได้ หรือไม่ต้องวัด — ตัดได้โดยไม่ต้องมีขนาดหรือรูป"
        detail="ฝ่ายขายจะเห็นเหตุผลนี้ · เอากลับเข้าใบได้"
        label="เหตุผลที่ตัดออก"
        value={cutReason}
        onChange={(value) => { setCutReason(value); setCutError(""); }}
        minLength={CUT_REASON_MIN}
        maxLength={CUT_REASON_MAX}
        placeholder="เช่น ห้องยังรีโนเวทไม่เสร็จ"
        helpText={cutReason.trim().length < CUT_REASON_MIN
          ? `อย่างน้อย ${CUT_REASON_MIN} ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้` : undefined}
        submitError={cutError}
        confirmLabel="ตัดพื้นที่นี้ออก"
        tone="warning"
        touch
        busy={cutBusy}
        onConfirm={cutZone}
        onClose={() => !cutBusy && setCutting(null)}
      />

      {/* 🔴 ลบทิ้งได้เฉพาะพื้นที่ที่ช่างเพิ่มเอง — ของที่ SA ขอมาใช้ "ตัดออก" พร้อมเหตุผล */}
      <ConfirmDialog
        open={!!removing}
        title="ลบพื้นที่ที่เพิ่มไว้"
        message={removing ? `ลบ "${surveyZoneTitle(removing)}" ออกจากใบนี้` : ""}
        detail="ผลวัดและรูปของพื้นที่นี้จะถูกลบไปด้วย · ถ้ายังไม่มีใครใช้พื้นที่นี้ ระบบจะถอนออกจากทะเบียนของลูกค้าให้ด้วย"
        confirmLabel="ลบทิ้ง"
        tone="danger"
        busy={removeBusy}
        onConfirm={removeZone}
        onClose={() => !removeBusy && setRemoving(null)}
      />

      {/* ⭐ **โมดัลบอกผลทุกข้อของการกดครั้งเดียว** (กติกาโมดัลบอกผลลัพธ์ · มติเจ้าของ 24/09 ข้อ 2) —
          ใบเป็น "ตอบแล้ว" · ผลล็อก · **ปิดนัด SV-… ไปพร้อมกัน** (เวลาไหนเหลือ/ไม่มี) · ใบจบเมื่อฝ่ายขายปิดเรื่อง
          ⚠️ รายการข้อมาจาก `surveySendConfirm` ซึ่งอ่าน `view.send.closesVisit` — ตัวตัดสินเดียวกับที่ route
             ใช้ปิดนัดจริง ⇒ โมดัลสัญญาอย่างหนึ่งแล้ว server ทำอีกอย่างไม่ได้
          ⚠️ ส่งไม่ผ่าน (ด่าน/นัดเปลี่ยน) = error ขึ้นในกล่องนี้ และกล่องวาดใหม่จากใบที่เพิ่งอ่าน (`send()`) */}
      <ConfirmDialog
        open={sending}
        title="ส่งผลประเมินให้ฝ่ายขาย"
        /* 🔑 เหตุผลเต็มของด่าน server — ไม่ใช่บรรทัดย่อของราง (บรรทัดย่อมีไว้ให้ราง
           กว้าง 330px อ่านได้ ไม่ได้มีไว้แทนเหตุผล) */
        /* ⚠️ ใบถูกล็อกระหว่างที่กล่องเปิด (หัวหน้าอีกคนส่งไปก่อน) = บอกสถานะล่าสุด ไม่ใช่ตัวเลขชวนส่ง */
        message={!view.send.show ? `${view.status.headline} — ${view.status.sub}`
          : view.send.reason?.detail || view.send.reason?.text
          || `ส่งผล ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`}
        /* ส่งไม่ได้แล้ว = ปุ่มเดียว "ปิด" — ปุ่มที่เขียนว่า "ส่งผล" แต่กดแล้วแค่ปิดกล่อง คือปุ่มที่โกหก */
        confirmLabel={view.send.allowed ? sendConfirm.confirmLabel : "ปิด"}
        hideCancel={!view.send.allowed}
        busy={sendBusy}
        onConfirm={view.send.allowed ? send : undefined}
        onClose={() => !sendBusy && setSending(false)}
      >
        {view.send.allowed ? (
          <div className={styles.effects}>
            <p className={styles.effectsTitle}>กดแล้วเกิดขึ้นทันที</p>
            <ul className={styles.effectList}>
              {sendConfirm.effects.map((line) => <li key={line}>{thaiText(line)}</li>)}
            </ul>
          </div>
        ) : null}
      </ConfirmDialog>
      {/* ⭐ **โมดัลต้องบอกว่าใครจะได้รับ ไม่ใช่แค่ถามว่าจะส่งไหม** — กระดิ่งของใบคำร้อง
          ไปหาผู้ขอ (SA) เท่านั้น · ตัวที่ไปถึงช่างคือกระดิ่งอีกใบที่ยิงจากนัด
          ⚠️ ไม่มีช่างที่ถูกมอบหมาย = server ตีกลับพร้อมเหตุ (ด่านตัวเดียวกับที่นี่) */}
      <ConfirmDialog
        open={sendingBack}
        title="แจ้งช่างให้กลับไปเก็บงาน"
        /* ข้อที่ติด หรือ "ฝั่งช่างครบแล้ว" มาจากตัวตัดสิน — 🐞 ประกอบเองในหน้า ฝั่งช่างครบแล้วขึ้น "ข้อที่ติด: " ว่าง ๆ */
        message={sendBackGate || view.sendBackAction.message}
        detail={sendBackGate ? undefined
          : "ช่างที่ถูกมอบหมายงานใบนี้จะได้กระดิ่งพร้อมข้อความนี้ · ใบยังอยู่ขั้นเดิม ไม่ต้องลงคิวใหม่"}
        confirmLabel="แจ้งช่าง"
        busy={sendBackBusy}
        onConfirm={!sendBackGate ? sendBack : undefined}
        onClose={() => !sendBackBusy && setSendingBack(false)}
      >
        {/* ⭐ **หนึ่งบรรทัด = หนึ่งข้อ** (แผน §10.5 S3 · ม็อก A-5) — 🐞 ช่องบรรทัดเดียวเดิมกด Enter ขึ้นบรรทัด
            ไม่ได้ หัวหน้าขอสองเรื่องได้แค่เขียนรวมเป็นประโยคเดียว แล้วเรื่องที่สองไม่มีใครตามว่าทำหรือยัง
            ⚠️ ไม่ใส่ `maxLength` — เพดานจริงเป็นรายข้อ (`surveySendBackItems`) · เพดานทั้งก้อนตัดของที่วางมา
              กลางประโยคเงียบ ๆ แล้วข้อที่ขาดครึ่งผ่านด่านไปถึงช่าง · เกินเพดานรายข้อ = ด่านบอกว่าข้อไหน */}
        <Textarea
          touch
          value={sendBackNote}
          disabled={sendBackBusy}
          autoComplete="off"
          autoFocus
          placeholder="หนึ่งบรรทัดต่อหนึ่งเรื่อง เช่น ถ่ายภาพกว้างห้องประชุมใหญ่เพิ่ม"
          aria-label="สิ่งที่ให้ช่างกลับไปทำ หนึ่งบรรทัดต่อหนึ่งเรื่อง"
          onChange={(e) => setSendBackNote(e.target.value)}
        />
        {/* ปุ่มจางต้องบอกเหตุเป็นตัวหนังสือ — และบอกว่าใครจะอ่านข้อความนี้ · ผ่านด่านแล้วบอกจำนวนข้อ */}
        <p className={styles.gate} role="status">
          {sendBackGate || `${sendBackItems.items.length} ข้อ · ช่างจะเห็นข้อความนี้ในกระดิ่ง`}
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
          touch
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
