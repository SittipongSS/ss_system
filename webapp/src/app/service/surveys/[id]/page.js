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
import { ArrowLeft, MapPinPlus, PencilRuler, Search } from "lucide-react";
import thaiText, { keepPhrases } from "@/components/ThaiText";
import { surveyCardUnits } from "@/components/service/surveyControlCardUnits";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import SurveyAboutRequest from "@/components/service/SurveyAboutRequest";
import SurveyControlCard from "@/components/service/SurveyControlCard";
import SurveyFieldBar from "@/components/service/SurveyFieldBar";
import SurveyFieldWorkspace, { SurveyBarColumn } from "@/components/service/SurveyFieldWorkspace";
import SurveyJobHeader from "@/components/service/SurveyJobHeader";
import SurveyMethodDialog, { newSurveyActionId, surveyFlipBasis, surveyFlipLinesAt } from "@/components/service/SurveyMethodDialog";
import SurveyResultTable from "@/components/service/SurveyResultTable";
import SurveySalesDrawings from "@/components/service/SurveySalesDrawings";
import SurveySendBackCard from "@/components/service/SurveySendBackCard";
import SurveySheetLayout from "@/components/service/SurveySheetLayout";
import SurveySubmitDialog from "@/components/service/SurveySubmitDialog";
import SurveyZoneList from "@/components/service/SurveyZoneList";
import SurveyZonePage from "@/components/service/SurveyZonePage";
import useLiveZoneFiles from "@/components/service/useLiveZoneFiles";
import useSurveyClock from "@/components/service/useSurveyClock";
import useSurveyZoneRoute, { surveyZoneHeadingId } from "@/components/service/useSurveyZoneRoute";
import CommitDueDialog from "@/components/requests/CommitDueDialog";
import ConfirmDialog, { confirmAction } from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
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
  SURVEY_ZONE_STALE_CODE, surveyAddZoneError, surveyChangeCounts, surveyChangeText, surveyCrewGaps, surveyEditLockError,
  surveySendBackDoneError, surveySendBackError, surveySendBackItems, surveyTotals,
} from "@/lib/service/survey";
import { surveyControlView, surveyPackagesLabel } from "@/lib/service/surveyControl";
import {
  SURVEY_RAIL_QUERY, SURVEY_SPLIT_QUERY, surveyAboutView, surveyDefaultZoneId, surveyDiscardConfirm, surveyDrawingZoneView,
  surveyDueLine, surveyEscapeView, surveyFieldBarView, surveyJobHeaderView, surveyLeaveConfirm, surveyMethodVisitFact,
  surveyNextStep, surveySalesDrawingsView, surveySendBackItemsView, surveySheetHref, surveySheetNotices, surveySheetTotalsText,
  surveyVisitBadge, surveyVisitBadgeShown, surveyZoneListView, surveyZoneNeighbors, surveyZoneResaveText, surveyZoneTitle,
} from "@/lib/service/surveyFieldView";
import { isDrawingZone } from "@/lib/service/surveyMethod";
import {
  SURVEY_DESK_ADD_HEAD_ONLY, SURVEY_METHOD_ERRORS, SURVEY_METHOD_RESULT_DATE_LABEL,
} from "@/lib/service/surveyMethodSwitch";
import { reuseSalesFileAsPlan } from "@/lib/service/surveyPlanReuse";
import { commitDueLabels, deskDueAction } from "@/lib/requests/commitDue";
import {
  surveyFilesSignature, surveyIssueDoneToast, surveyIssueErrorSticky, surveyRecallDoneText, surveyRecheckToast,
} from "@/lib/service/surveyDocumentView";
import {
  surveySendConfirm, surveySendDoneToast, surveySendRefusalKeeps, surveySendUnseenWarnings,
} from "@/lib/service/surveySendClose";
import { surveySpotSubmitReason } from "@/lib/service/surveySpotPhotos";
import { surveyPendingDecisions } from "@/lib/service/surveyDecision";
import { surveyRowNameClash } from "@/lib/service/surveyRequest";
import { floorLabel, normalizeFloor } from "@/lib/service/zoneCode";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import styles from "./page.module.css";

/* เหตุผลที่ตัดพื้นที่ออก — ขั้นต่ำเดียวกับ server (ฝ่ายขายจะเห็นข้อความนี้ · ไม่ได้ไปหน้างานเอง) */
const CUT_REASON_MIN = 5;
const CUT_REASON_MAX = 500;

/* ── ประเมินจากแบบ (งวด S2b) — ของที่หน้านี้ต้องรู้เอง ──────────────────────────────────────
   `FLIP_*`            รหัสคำตอบของเส้นตัดพื้นที่ เมื่อหัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด (สวิตช์ปิด = server ไม่ส่งรหัสนี้เลย)
                       · หน้าแยกด้วยรหัส ไม่เทียบประโยค
   `OPEN_VISIT_STATES` นัดที่ยัง "เปิดอยู่" — โมดัลส่งผลของใบจากแบบพูดว่า "ไม่มีนัดที่เปิดอยู่" ได้ต่อเมื่อไม่มีจริง
   `ADD_HEAD_ONLY`     ด่านเพิ่มพื้นที่ของใบงานโต๊ะสำหรับคนที่ไม่ใช่หัวหน้า — ถูกถามแค่ "มีหรือไม่มี" ไม่เคยถูกพิมพ์
                       (ประโยคที่ผู้วางคิวเห็นคือ `SURVEY_DESK_ADD_HEAD_ONLY` ตัวเดียวกับที่ server ตอบ) */
const FLIP_CONFIRM_CODE = "survey_flip_confirm";
const FLIP_RETRY_CODE = "survey_flip_retry";
const OPEN_VISIT_STATES = ["draft", "scheduled", "in_progress"];
const ADD_HEAD_ONLY = "head-only";

/* ── เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU · PR-3) — ของที่จอจำไว้เอง เพราะไม่มี GET ไหนคืน ──────────────
   `round`       เวลาตอบ (`answeredAt`) ของรอบที่สี่คีย์ถัดไปเป็นของมัน — ตัวตัดสินไม่ใช้ของรอบอื่น (`surveyDocumentView`)
   `sendFailed`  การส่งผลรอบนี้ออกเอกสารไม่สำเร็จ (`report.state: 'failed'`) · `issueError` กด "ออกเอกสาร" แล้วถูกตีกลับ
   `paper`       ขั้นจัดทำไฟล์ PDF ที่ตามหลังการออกเลข (`{ busy, reason }`) · `printed` ข้อที่พิมพ์ลงเอกสารแต่ยังไม่ได้อ่านก่อนออก
   `sendRefused` การส่งผลที่ถูกตีกลับด้วยเหตุที่ GET มองไม่เห็น (รูปเปิดไม่ได้) — ของใบที่ยังไม่ส่ง ไม่ผูกกับรอบ
   ⚠️ โหลดหน้าใหม่ = ของชุดนี้หายทั้งหมด (ความเสี่ยงที่ยอมรับ · สเปก PR-3 §13) */
const DOC_LOCAL_ROUND = Object.freeze({ sendFailed: null, issueError: null, paper: null, printed: [] });
/* สถานะที่ใบมี "เอกสารฉบับที่ใช้อยู่ของผลรอบนี้" — ชุดเดียวกับ `ISSUED_STATES` ของ `surveyDocumentView` */
const DOC_ISSUED_STATES = ["issued", "frozen", "ready"];
/* อ่านใบพังติดกันกี่รอบแล้วเลิกตรวจซ้ำของสถานะ "กำลังออก" (8 รอบ ≈ 2 นาที) — เพดานเดียวกับหน้าคำร้อง
   (`SURVEY_DOCUMENT_POLL_MAX_FAILS` ใน app/requests/[id]/page.js) · นับ **รอบที่พังติดกัน** ไม่ใช่เวลาที่ผ่านไป:
   เครื่องที่พับจอแล้วเปิดใหม่ต้องยังได้ลองจนเน็ตกลับมา */
const DOC_POLL_MAX_FAILS = 8;
/* ชื่อที่คำกำกับไทล์ "ต้องเข้ายืนยันหน้างานภายหลังไหม" เอ่ยถึง — เป็นชิ้นเดียว ไม่ตัดกลาง (ป้ายในคำพูดกับ "ฝ่ายขาย" มาจาก `surveyCardUnits` เอง) */
const SEND_TILE_UNITS = ["ใบยืนยันหน้างาน", "ขอยืนยันหน้างาน"];
/* ไอคอนของบานขวาว่าง ตามเหตุที่รายการว่าง (`listView.emptyReason` ของตัวตัดสิน) — เหตุ "ที่เหลือเป็นจากแบบทั้งหมด" ได้ไอคอนเดียวกับ
   บรรทัดเดียวกันบนรายการ (`SurveyZoneList`) · เหตุอื่น/ไม่มีเหตุ = แว่นขยายเดิม (ตรวจจอ crew 26/10) */
const EMPTY_PANE_ICON = Object.freeze({ drawing: PencilRuler });
/* เวลาสองค่าเป็นจุดเดียวกันไหม — เทียบเป็นมิลลิวินาที ไม่เทียบสตริง (PostgREST คืน `+00:00` · `toISOString()` ลงท้าย `Z`) */
const sameInstant = (a, b) => {
  if (!a || !b) return false;
  const at = Date.parse(a);
  return Number.isFinite(at) && at === Date.parse(b);
};
const textLines = (value) => (Array.isArray(value) ? value.filter((line) => typeof line === "string") : []);

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
  /* ── เอกสารประเมินพื้นที่ (PR-3) ──
     `docLocal`    ของที่จอจำไว้เอง (ดู `DOC_LOCAL_ROUND` บนหัวไฟล์) — ส่งให้ตัวตัดสินทั้งก้อน จอไม่อ่านเองสักคีย์
     `issueDialog` เนื้อของกล่องยืนยัน "ออกเอกสาร" **ที่คัดลอกไว้ตอนเปิด** — `view.document.issue` กลายเป็น null ทันทีที่สถานะเปลี่ยน
                   (ถูกดึงผลกลับ · อีกคนออกไปก่อน) ซึ่งเป็นจังหวะเดียวกับที่กล่องต้องยังอยู่เพื่อบอกเหตุที่ถูกตีกลับ */
  const [docLocal, setDocLocal] = useState(null);
  const [issueDialog, setIssueDialog] = useState(null);
  /* POST ออกเอกสารกำลังวิ่ง (10–60 วิ · นานสุด ~270 วิ) — ระหว่างนี้กล่องยืนยันคงเนื้อเดิมไว้ แม้ใบที่อ่านใหม่เบื้องหลัง
     (กลับมาที่แท็บ) จะเปลี่ยนสถานะไปแล้ว: กล่องที่เปลี่ยนเนื้อใต้ปุ่ม "กำลังออกเอกสาร…" อ่านเหมือนการกดถูกยกเลิก */
  const [issueBusy, setIssueBusy] = useState(false);
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
  /* ── ประเมินจากแบบ (งวด S2b) — ทุกชิ้นข้างล่างเกิดได้เฉพาะเมื่อสวิตช์เปิดหรือใบมีพื้นที่จากแบบ (ใบเดิม = ค่าตั้งต้นตลอด) ──
     `flipBox`      กล่องยืนยัน "ตัดพื้นที่และยกเลิกนัด" — **เนื้อที่คัดลอกจากคำตอบ 409 ของเส้นตัดตอนเปิด** + วันส่งผลที่พิมพ์ + เลขการกด
                    (`actionId`) · กล่องต้องไม่วาดใหม่จากใบที่อ่านเบื้องหลัง: รอบที่ตัดติดแล้วแต่ผลที่ตามมาไม่ครบ แถวถูกตัดไปแล้ว
                    ใบสดไม่มีเนื้อกล่องให้อีก (ท่าเดียวกับ `issueDialog`) · `dead` = ใบถูกแก้จากที่อื่น เหลือปุ่ม "ปิด"
     `methodOpen`   โมดัล "วิธีประเมินรายพื้นที่" (ตัวโมดัลถือฟอร์มเอง — หน้ารู้แค่เปิด/ปิด)
     `sendChoice`   คำตอบ "ต้องยืนยันหน้างานไหม" ในโมดัลส่งผล — ไม่เลือกให้ล่วงหน้า · ไม่บันทึกแยก · ล้างทุกครั้งที่โมดัลเปิด/ปิด
     `planReloadKey` นับรอบที่ช่องภาพแบบต้องอ่านรายการใหม่ (หลัง "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้") · `reuseBusyKey` ไฟล์ที่กำลังคัดลอก
     `deskDueDialog` โมดัลวันส่งผลของงานโต๊ะ — จำว่าเปิดเป็น "รับปาก" หรือ "เลื่อน" (ใบที่อ่านใหม่ระหว่างกล่องเปิดต้องไม่สลับทรงของกล่อง)
     `zoneDrawingsOpen` แผงแบบจากฝ่ายขายในหน้าพื้นที่ (<1000) ผู้ใช้กางหรือพับไว้ — `null` = ยังไม่เคยกด ใช้ค่าตั้งต้นของหน้า ·
                     หน้าพื้นที่ถูกถอดใส่ใหม่ทุกครั้งที่เปลี่ยนพื้นที่ (key) ⇒ จำไว้ที่หน้า ไม่งั้นพับเองทุกพื้นที่ (head-r3-31 · S2b แก้หลังตรวจจอ) */
  const [flipBox, setFlipBox] = useState(null);
  const [zoneDrawingsOpen, setZoneDrawingsOpen] = useState(null);
  const [flipBusy, setFlipBusy] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [sendChoice, setSendChoice] = useState(null);
  const [sendChoiceMissing, setSendChoiceMissing] = useState(false);
  const [planReloadKey, setPlanReloadKey] = useState(0);
  const [reuseBusyKey, setReuseBusyKey] = useState(null);
  const [deskDueDialog, setDeskDueDialog] = useState(null);
  const [deskDueBusy, setDeskDueBusy] = useState(false);
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
  /* รอบโหลดที่พัง **ติดกัน** (รอบที่ได้ใบล้างเป็นศูนย์ · รอบที่ถูกแซงไม่นับทั้งสองทาง) — เพดานของนาฬิกา "กำลังออก" อ่านจากตัวนี้ */
  const failedRuns = useRef(0);
  /* ⭐ คืนใบที่เพิ่งอ่านได้ (หรือ `null` เมื่ออ่านไม่สำเร็จ) — "ออกเอกสาร" ที่คำตอบหายกลางทางอ่านค่านี้ตัดสินว่าเลขออกไปแล้วหรือยัง
     โดยไม่ต้องรอให้จอวาดรอบใหม่ (PR-3 §4.4) · ถูกรอบที่ใหม่กว่าแซง = ยังคืนใบที่อ่านได้ (จอไม่วาดจากรอบนี้ แต่ใบนั้นอ่านหลังคำขอ
     ของผู้เรียกแล้ว ใช้ตัดสินได้) · ผู้เรียกเดิมไม่อ่านค่าที่คืน */
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const body = await apiJson(`/api/service/surveys/${id}`, { fallbackError: "โหลดใบประเมินไม่สำเร็จ" });
      if (!isLatest()) return body;
      failedRuns.current = 0;
      setData(body);
      return body;
    } catch (e) {
      if (isLatest()) failedRuns.current += 1;
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีพื้นที่" — โหลดพังกับใบว่างหน้าตาเหมือนกัน
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดใบประเมินไม่สำเร็จ");
      return null;
    } finally {
      if (isLatest()) {
        setLoading(false);
        setLoadSettled((n) => n + 1);
      }
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);
  /* อ่านใบใหม่เบื้องหลังตามที่คนกด (ปุ่ม "โหลดใหม่" ตอนทะเบียนขนาดแพ็คเกจอ่านไม่ขึ้น) — ไม่ล้างจอ ไม่ทิ้งร่างการเคาะ */
  const reloadSheet = useCallback(() => load({ background: true }), [load]);

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
      /* ⭐ หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด (งวด S2b) — server ยังไม่ได้เขียนอะไร และส่งเนื้อของกล่องยืนยันมากับ 409
         ⇒ ไม่ใช่ข้อผิดพลาด: กล่องเหตุผลหลบ (พื้นที่กับเหตุผลยังถืออยู่) แล้วกล่องยืนยันบอกผลทุกข้อก่อนกด
         ⚠️ แยกด้วย `code` ไม่เทียบประโยค · สวิตช์ปิด = server ไม่ส่งรหัสนี้ ⇒ กิ่งนี้ไม่มีวันเดิน */
      if (e.data?.code === FLIP_CONFIRM_CODE && e.data?.flip) {
        openFlipBox(cutting, cutReason.trim(), e.data.flip);
        return;
      }
      setCutError(e.message || "ตัดพื้นที่ออกไม่สำเร็จ");
    } finally {
      setCutBusy(false);
    }
  };

  /* ── กล่องยืนยัน "ตัดพื้นที่และยกเลิกนัด" (งวด S2b · แผน §3.3) ─────────────────────────────────────
     เนื้อกล่อง = สิ่งที่ server คิดจากแผนตัวเดียวกับที่มันจะเขียน (`flip.lines` · ช่องที่ต้องกรอก · ป้ายปุ่ม · นัดที่จะยกเลิก)
     — หน้าคัดลอกไว้ตอนเปิด ไม่คิดเอง · เลขการกด (`actionId`) ใหม่ทุกครั้งที่เปิดกล่อง
     ⭐ `basis` = ชุดอินพุตของแผนที่ให้บรรทัดตรงกับของ server ทุกตัวอักษร (`surveyFlipBasis` ของไฟล์โมดัล — แผนอยู่ที่นั่นที่เดียว)
        ใช้คิดบรรทัดใหม่เมื่อหัวหน้าแก้วันส่งผลในช่อง (UAT S2b S08: บรรทัดเคยพูดวันของตอนเปิดกล่องค้างไว้) · ไม่ตรง = null = บรรทัดของ server */
  const openFlipBox = (zone, reason, flip) => setFlipBox({
    zoneId: zone.id,
    title: `ตัด ${surveyZoneTitle(zone)} ออกจากใบนี้`,
    message: `พื้นที่สุดท้ายที่ต้องวัด และนัด ${flip.visit?.code || flip.visit?.id} ยังเปิดอยู่ — ตัดออกได้ โดยนัดจะถูกยกเลิกไปด้วย`,
    lines: textLines(flip.lines),
    basis: surveyFlipBasis({
      rows: data?.zones || [], cut: { zoneId: zone.id, to: "cut" }, visit: data?.visit || null,
      request: data?.request || null, sendBack: data?.sendBack, reason,
    }, flip),
    needsDate: flip.needs?.resultDate === true,
    confirmLabel: flip.confirmLabel,
    visitId: flip.visit?.id ?? null,
    reason,
    resultDate: flip.defaults?.resultDate || "",
    dateMissing: false,
    actionId: newSurveyActionId(),
    dead: false,
    pinned: false,
  });
  /* แก้วันส่งผล = body เปลี่ยน ⇒ เลขการกดใหม่ (สัญญาของ `surveyMethodActionId`: ส่ง body เดิมซ้ำเท่านั้นจึงใช้เลขเดิม)
     🔴 **รอบที่ตัดติดแล้วแต่ผลที่ตามมาไม่ครบ (`pinned`) แก้วันไม่ได้** — server พิสูจน์ว่า "การกดนี้เป็นคนยกเลิกนัด" ด้วยเลขการกดเดิม
        เลขใหม่ = นัดที่เพิ่งยกเลิกถูกมองเป็นเรื่องเก่า บรรทัดในเธรดกับกระดิ่งของช่างหาย ⇒ ช่องวันถูกปิด และตัวนี้ไม่รับค่า */
  const setFlipDate = (value) => setFlipBox((prev) => (prev && !prev.pinned
    ? { ...prev, resultDate: value, dateMissing: false, actionId: newSurveyActionId(), lines: prev.basis ? surveyFlipLinesAt(prev.basis, value) : prev.lines }
    : prev));
  /* ปิดกล่องยืนยัน = เลิกตัด (กล่องเหตุผลที่หลบอยู่ปิดไปด้วย) — ยังไม่ได้ยืนยัน ไม่มีอะไรถูกเขียน */
  const closeFlipBox = () => {
    setFlipBox(null);
    setCutting(null);
    setCutReason("");
  };
  /* ⭐ กด "ตัดพื้นที่และยกเลิกนัด" — ยิงเส้นตัดเดิมพร้อมคำยืนยัน (`flip`) · ล้ม = โยนให้กล่องบอกตรงนั้น (ไม่ใช่ toast ที่หายไป)
     · ตัดติดแล้วแต่ผลที่ตามมาไม่ครบ (`survey_flip_retry`) = กล่องคงเนื้อเดิมและ **เลขการกดเดิม** — กดซ้ำด้วย body เดิมคือทางทำต่อให้จบ
       (server กันซ้ำด้วยเลขนี้) · ใบอ่านใหม่เบื้องหลัง แต่กล่องไม่วาดจากใบนั้น (แถวถูกตัดไปแล้ว)
     · 400 (วันส่งผล) = ฟอร์มอยู่ครบ แก้วันแล้วได้เลขการกดใหม่ (ที่ช่องวัน)
     · 409 อื่น (ใบถูกแก้จากที่อื่น) = อ่านใบใหม่ กล่องเหลือปุ่ม "ปิด" */
  const confirmFlipCut = async () => {
    const box = flipBox;
    if (!box) return;
    // ช่องวันว่าง = บอกในกล่องด้วยประโยคเดียวกับ server โดยไม่ต้องยิงไปให้ถูกตีกลับ (ช่องขึ้นขอบแดง + ประโยคใต้ช่อง)
    // ⚠️ **คืน false ไม่โยน** — ข้อผิดพลาดที่โยนเข้ากล่องค้างอยู่จนกดรอบถัดไป (UAT S2b S08: พิมพ์วันแล้ว ขอบแดงหาย แต่ประโยคแดงยังอยู่)
    //    ประโยคของช่องนี้ผูกกับ `dateMissing` ซึ่ง `setFlipDate` ล้างทันทีที่พิมพ์
    if (box.needsDate && !box.resultDate) {
      setFlipBox((prev) => (prev ? { ...prev, dateMissing: true } : prev));
      return false;
    }
    setFlipBusy(true);
    try {
      await apiJson(`/api/service/surveys/${id}/zones/${box.zoneId}`, {
        method: "PATCH",
        json: {
          status: "cut",
          cutReason: box.reason,
          flip: { actionId: box.actionId, committedResultDate: box.resultDate, cancelVisitId: box.visitId },
        },
        fallbackError: "ตัดพื้นที่ออกไม่สำเร็จ",
      });
    } catch (e) {
      if (e.data?.code === FLIP_RETRY_CODE) {
        // ตรึงกล่องไว้ที่ body เดิม: วันส่งผลกับเลขการกดห้ามเปลี่ยนจนกว่ารอบนี้จะจบ (ดู `setFlipDate`)
        setFlipBox((prev) => (prev ? { ...prev, pinned: true } : prev));
        void load({ background: true });
      } else if (e.status === 409) {
        setFlipBox((prev) => (prev ? { ...prev, dead: true } : prev));
        void load({ background: true });
      }
      throw e;
    } finally {
      setFlipBusy(false);
    }
    closeFlipBox();
    setToast({ kind: "success", msg: "ตัดพื้นที่ออกแล้ว — เอากลับเข้าใบได้จากเมนูบนหัวพื้นที่" });
    await load({ background: true });
    return true;
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
        // `code` ไปกับคำตอบถึงตาราง — ตารางแยก "พื้นที่ถูกแก้จากที่อื่น" ด้วยรหัส ไม่เทียบประโยค (งวด S2b)
        failure = { zoneId: String(zoneId), message: e.message, code: e.data?.code ?? null };
        break;
      }
    }
    setBusyZone(null);
    await load({ background: true });
    if (failure) {
      /* ชนรุ่นของแถว = ตารางพิมพ์ประโยคนี้บนแถวที่ชนเอง (ใบถูกอ่านใหม่แล้ว กดบันทึกซ้ำได้) — toast ซ้ำอีกที = ประโยคเดียวสองที่
         ⚠️ เฉพาะใบที่มีพื้นที่จากแบบ (เงื่อนไขเดียวกับตาราง: `mix.drawing`) — ใบลงหน้างานล้วนต้องเหมือนเดิมทุกจุด: toast + บรรทัดรวมเหนือตาราง */
      const staleOnRow = failure.code === SURVEY_ZONE_STALE_CODE && view.mix.drawing > 0;
      if (!staleOnRow) setToast({ kind: "error", msg: failure.message });
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
      /* ⭐ ไม่ผ่านแล้วอ่านใบใหม่เบื้องหลัง — นัดอาจเพิ่งถูกยกเลิก (เช่น หัวหน้าเปลี่ยนทุกพื้นที่เป็นประเมินจากแบบ · 409 ของ
         route) ถ้าไม่อ่านใหม่ จอยังขึ้นปุ่ม "เริ่มงาน" ของนัดที่ไม่มีแล้ว */
      load({ background: true });
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
      /* เข้าไม่ได้แต่ใบไม่ถอยขั้น (วันบนใบเป็นของการนัดรอบใหม่ · มีนัดอื่นเปิดอยู่) — ห้ามตกไปข้อความ "ส่งงานแล้ว … เคาะจุดติดตั้ง" */
      : status === "unable"
        ? { kind: "success", msg: res?.unableNotice ? "ปิดว่าไปแล้วเข้าไม่ได้ · ฝ่ายขายได้รับแจ้งพร้อมเหตุผล" : "ปิดว่าไปแล้วเข้าไม่ได้แล้ว" }
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
  /* ⭐ **ส่งผลอาจออกเอกสารประเมิน (เลข SU) ไปด้วย** (PR-3 · สวิตช์ `SURVEY_REPORT_ISSUE_AT_SEND`)
     🔑 `seenWarnings` ไปกับคำขอ **เฉพาะเมื่อโมดัลบอกเรื่องเอกสารไว้แล้ว** (`issuesDocument` หรือ `documentUnknown`) — ด่านของ route
        มีไว้ไม่ให้หน้าที่ไม่ได้ประกาศว่าจะออกเอกสาร ออกเอกสารได้ · ส่งคีย์นี้เสมอ = แท็บที่โหลดไว้ตอนสวิตช์ปิดผ่านด่านนั้นไปเงียบ ๆ
        ⇒ แท็บแบบนั้นไม่ส่งคีย์ · route ตอบ "หน้านี้เป็นรุ่นเก่า" · `catch` ข้างล่างอ่านใบใหม่ แล้วโมดัลวาดบรรทัดเอกสารกับคำเตือนให้อ่านก่อนกดซ้ำ
     🔑 ลิสต์ที่ส่งคือ `view.send.seenWarnings` **ดิบ** (ชุดเดียวกับที่โมดัลกาง) — route เทียบตรงตัว ห้ามตัด/ขัดเกลา
     ⚠️ toast พูดแค่เลขกับนัด (ช่องเดียว หายเร็ว) — เหตุที่เอกสารไม่ออก · ข้อที่ยังไม่ได้อ่าน ไปอยู่ที่ส่วนเอกสารบนการ์ด (`afterSend`) */
  /* ⭐ **ใบที่มีพื้นที่จากแบบส่งอีกสองคีย์** (งวด S2b) — `methodMix` = สัดส่วนวิธีที่โมดัลเห็น (route เทียบกับแถวจริง: มีคนสลับวิธีหลังเปิด
     หน้า = 409 "วิธีประเมินของใบเปลี่ยนไปแล้ว") · `surveyConfirm` = คำตอบ "ต้องยืนยันหน้างานไหม" ที่หัวหน้าเลือกในโมดัล
     ⚠️ สองคีย์นี้อยู่ใต้ `view.send.confirm.required` เท่านั้น — ใบลงหน้างานล้วนส่งคำขอเท่าเดิมทุกคีย์ */
  const send = async () => {
    const says = view.send.issuesDocument || view.send.documentUnknown;
    const seen = view.send.seenWarnings;
    setSendBusy(true);
    try {
      const res = await apiJson(`/api/service/surveys/${id}/send`, {
        method: "POST",
        json: { closeVisitId: view.send.closesVisit?.id ?? null, ...(says ? { seenWarnings: seen } : {}), ...(view.send.confirm.required ? { methodMix: view.send.confirm.mix, surveyConfirm: sendChoice } : {}) },
        fallbackError: "ส่งผลไม่สำเร็จ",
      });
      setSending(false);
      setToast(surveySendDoneToast(res, { expectedDocument: view.send.issuesDocument }));
      afterSend(res, seen);
      await load({ background: true });
    } catch (e) {
      await load({ background: true });
      throw e;
    } finally {
      setSendBusy(false);
    }
  };

  /* ปุ่มยืนยันของโมดัลส่งผล — ใบที่มีพื้นที่จากแบบต้องตอบ "ต้องยืนยันหน้างานไหม" ก่อน (ไม่มีค่าตั้งต้น · กฎฟอร์ม "ไม่เลือกแทนคน")
     ⚠️ ยังไม่เลือก = **คืน `false` ไม่โยน** — ของที่โยนออกจากปุ่มนี้ถูกนับเป็นการตีกลับของ server (`rememberSendRefusal`)
        เหตุขึ้นใต้ไทล์ (`role="alert"`) และไทล์ขึ้นขอบแดง · กล่องยังเปิด ยังไม่มีคำขอไหนถูกยิง */
  const confirmSend = () => {
    if (view.send.confirm.required && !sendChoice) {
      setSendChoiceMissing(true);
      return false;
    }
    return send();
  };

  /* ดึงผลกลับ = เอกสารฉบับที่ใช้อยู่ถูกแทนที่ทันที — toast เอ่ยเลขที่เพิ่งใช้ไม่ได้ (`supersededReport` ของ route · ไม่มี = ประโยคเดิม)
     ⚠️ 409 = ใบเปลี่ยนไประหว่างทาง (อีกคนดึงกลับ/ปิดเรื่องไปก่อน) ⇒ อ่านใบใหม่ให้การ์ดขึ้นสถานะจริง ไม่ค้างปุ่มที่กดแล้วชนซ้ำ */
  const recall = async () => {
    setRecallBusy(true);
    try {
      const res = await apiJson(`/api/service/surveys/${id}/recall`, {
        method: "POST", json: { reason: recallReason.trim() }, fallbackError: "ดึงผลกลับไม่สำเร็จ",
      });
      setRecalling(false);
      setRecallReason("");
      setToast({ kind: "success", msg: surveyRecallDoneText(res?.supersededReport) });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      if (e.status === 409) await load({ background: true });
    } finally {
      setRecallBusy(false);
    }
  };

  /* ── เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU · PR-3) — หลังส่งผล และปุ่ม "ออกเอกสาร" ──────────────────────
     ⚠️ ฟังก์ชันชุดนี้ประกาศ **หลัง `recall`** โดยเจตนา — ช่วง `send` → `recall` ถูกเทสต์ตรึงว่าไม่มี toast โทน error
        (ส่งผลล้ม = โยนกลับให้โมดัลบอก) */

  /* เขียนของรอบนี้ลง `docLocal` — ของรอบก่อน (คนละ `answeredAt`) ทิ้งก่อนเขียน · `sendRefused` ไม่ผูกกับรอบ จึงอยู่ต่อ
     ⚠️ **คำตอบที่มาช้าของรอบเก่าต้องไม่ทับรอบใหม่** — POST เอกสารวิ่งได้หลายนาที ระหว่างนั้นใบถูกดึงกลับแล้วส่งใหม่ได้
        ⇒ ก้อนที่ถืออยู่เป็นของรอบที่ใหม่กว่า = ทิ้งการเขียนนี้ */
  const patchDocLocal = (round, patch) => setDocLocal((prev) => {
    if (prev?.round && round && Date.parse(round) < Date.parse(prev.round)) return prev;
    return {
      ...(prev && sameInstant(prev.round, round) ? prev : DOC_LOCAL_ROUND),
      sendRefused: prev?.sendRefused ?? null,
      round,
      ...patch,
    };
  });

  /* POST เส้นเดียวของเอกสาร: ออกเลข (ถ้ายังไม่มี) แล้วจัดทำไฟล์ PDF สองฉบับ
     🔴 **ห้ามใส่ `retry: true`** — "ไม่ได้คำตอบ" ไม่ได้แปลว่า server ไม่ได้ทำ: ยิงซ้ำเองคือเสี่ยงออกเลขถาวรโดยไม่มีใครกดยืนยัน
        (กติกา apiFetch ของ AGENTS.md) · คำตอบหาย = อ่านใบใหม่แล้วให้ใบเป็นคนบอก (`issueDocument`) */
  const postDocument = () => apiJson(`/api/service/surveys/${id}/document`, {
    method: "POST", json: {}, fallbackError: "ออกเอกสารไม่สำเร็จ",
  });

  /* ⭐ หัวหน้าที่เพิ่งส่งผลยังอยู่หน้าจอ ⇒ ให้เห็นปัญหาของกระดาษทันที ไม่ใช่ให้ฝ่ายขายไปเจอตอนกดดาวน์โหลด
     ⚠️ ไม่ await จากผู้เรียก — POST นี้วิ่งได้นานถึง ~270 วิ และ `sendBusy` ล็อกทั้งการ์ด
     ⚠️ ล้มทางไหนก็แค่บอก (กล่องสถานะ + toast) — ปุ่ม "ดาวน์โหลด PDF" ยังใช้ได้ เพราะ GET จัดทำไฟล์ที่ขาดเอง */
  const finishPaper = async (round, docNo) => {
    patchDocLocal(round, { paper: { busy: true, reason: null } });
    let reason = null;
    try {
      const out = await postDocument();
      reason = out?.report?.reason ?? null;
    } catch (e) {
      reason = e.message || "จัดทำไฟล์ PDF ไม่สำเร็จ";
    }
    patchDocLocal(round, { paper: { busy: false, reason } });
    if (reason) setToast(surveyIssueDoneToast({ docNo, reason }));
    void load({ background: true });
  };

  /* ผลของเอกสารจากคำตอบส่งผล (`report`) → ของที่ส่วนเอกสารบนการ์ดต้องรู้
     · `failed` = ส่งผลสำเร็จแต่เลขไม่ออก ⇒ เก็บเหตุไว้ให้กล่องสถานะ · 🔴 **ไม่ยิง POST ตาม** — POST จะออกเลขใหม่และแจ้งผู้ขอ
       โดยไม่ผ่านกล่องยืนยัน (หัวหน้าต้องกด "ออกเอกสาร" เอง)
     · `issued` = เก็บข้อที่ระบบพิมพ์ลงเอกสารแต่โมดัลไม่ได้กางให้อ่าน (`report.warnings` ลบชุดที่อ่านแล้ว) แล้วไปจัดทำไฟล์ต่อ
     · สวิตช์ปิด (`off`) = ไม่มีอะไรต้องจำ
     ⚠️ ส่งผลสำเร็จ = การตีกลับรอบก่อน (`sendRefused`) หมดความหมาย ⇒ เริ่มก้อนใหม่ทั้งก้อน */
  const afterSend = (res, seen) => {
    const report = res?.report;
    const round = res?.request?.answeredAt ?? null;
    if (report?.state === "failed") {
      setDocLocal({
        ...DOC_LOCAL_ROUND, sendRefused: null, round,
        sendFailed: { code: report.code ?? null, reason: report.reason ?? null, retry: report.retry ?? null },
      });
      return;
    }
    if (report?.state === "issued") {
      setDocLocal({
        ...DOC_LOCAL_ROUND, sendRefused: null, round,
        printed: surveySendUnseenWarnings(report.warnings, seen),
      });
      void finishPaper(round, report.docNo);
      return;
    }
    setDocLocal(null);
  };

  /* การตีกลับของการส่งผลที่ **ไม่มี GET ไหนวาดให้ได้** (รูปเปิดไม่ได้ — พกรายชื่อไฟล์ที่ต้องอัปใหม่) — โมดัลล้างข้อความตอนปิด
     ⇒ เก็บไว้ให้กล่องแจ้งบนการ์ด คู่กับลายเซ็นของชุดไฟล์ตอนกด: ชุดไฟล์เปลี่ยน (หัวหน้าแก้แล้ว) = ตัวตัดสินเลิกวาดเอง */
  const rememberSendRefusal = (e) => {
    if (!surveySendRefusalKeeps(e?.message)) return;
    setDocLocal((prev) => ({
      ...DOC_LOCAL_ROUND, round: null, ...(prev || {}), sendRefused: { message: e.message, sig: liveSig },
    }));
  };

  /* เปิดกล่องยืนยัน "ออกเอกสาร" — **คัดลอกเนื้อกล่องไว้ตอนเปิด** (ดู `issueDialog`) + คำเตือนชุดที่กล่องกางให้อ่าน
     (ใช้หักออกจากข้อที่พิมพ์จริงหลังออก ⇒ ส่วนเอกสารบอกเฉพาะข้อที่ยังไม่เคยเห็น) */
  const openIssueDialog = () => {
    const confirm = view.document.issue?.confirm;
    if (!confirm) return;
    setIssueDialog({ ...confirm, warnings: textLines(data?.document?.issue?.warnings) });
  };

  /* ⭐ กด "ออกเอกสาร" ในกล่องยืนยัน — ออกเลข SU ถาวรจากผลที่ส่งไปแล้ว + แจ้งผู้ขอ
     · สำเร็จ = ปิดกล่อง · เก็บเหตุของกระดาษ (ถ้ามี) กับข้อที่ยังไม่ได้อ่าน · toast · อ่านใบใหม่
     · ล้ม = **อ่านใบใหม่ก่อน** แล้วให้ใบเป็นคนบอก: มีฉบับที่ใช้อยู่แล้ว = เลขออกไปแล้ว (คำตอบหายกลางทาง หรืออีกคนกดไปก่อน
       — จอแยกไม่ออก จึงใช้ประโยคกลาง) · ยังไม่มี = เก็บเหตุไว้ให้ส่วนเอกสาร แล้วโยนกลับให้กล่องบอกตรงนั้น
       (ปุ่มของกล่องเดินตามใบที่เพิ่งอ่าน — เหตุที่กดซ้ำไม่ผ่านกลายเป็นปุ่ม "ปิด") */
  const issueDocument = async () => {
    const round = data?.request?.answeredAt ?? null;
    const acknowledged = issueDialog?.warnings || [];
    setIssueBusy(true);
    try {
      let out;
      try {
        out = await postDocument();
      } catch (e) {
        const fresh = await load({ background: true });
        const current = fresh?.document?.current;
        if (current?.docNo && DOC_ISSUED_STATES.includes(fresh.document.state)) {
          setIssueDialog(null);
          patchDocLocal(round, { issueError: null });
          setToast(surveyIssueDoneToast({ docNo: current.docNo }));
          return;
        }
        patchDocLocal(round, {
          issueError: { code: e.data?.code ?? null, message: e.message, retry: e.data?.retry ?? null },
        });
        throw e;
      }
      const report = out?.report || {};
      setIssueDialog(null);
      patchDocLocal(round, {
        issueError: null,
        sendFailed: null,
        paper: { busy: false, reason: report.reason ?? null },
        printed: surveySendUnseenWarnings(report.warnings, acknowledged),
      });
      setToast(surveyIssueDoneToast(report));
      await load({ background: true });
    } finally {
      setIssueBusy(false);
    }
  };

  /* ⭐ "ตรวจอีกครั้ง" / "โหลดใหม่" ของเอกสารประเมิน (กล่องสถานะของส่วนเอกสาร · เหตุ "ติดเฉพาะเอกสาร" ใต้ปุ่มส่งผล) — ปุ่มที่มีงานเดียวคือ
     ให้ server ตรวจซ้ำ **ต้องบอกผลของการกดเสมอ**
     🐞 เดิมใช้ `reloadSheet` ซึ่งเงียบทั้งสองทาง: อ่านใบไม่สำเร็จ = จอไม่ขยับ · ตรวจแล้วเหตุเดิม = จอไม่ขยับ ⇒ หัวหน้าแยกไม่ออกว่า
        "ตรวจแล้วยังติด" หรือ "ยังไม่ได้ตรวจ"
     · อ่านใบไม่สำเร็จ = toast แดง (คำเดียวกับปุ่มที่กด) · อ่านได้และคำตอบเรื่องเอกสารของ server เหมือนเดิมทุกตัวอักษร = toast "ตรวจแล้ว"
       พร้อมจำนวนข้อที่ยังติด (อ่านสถานะเอกสารยังไม่สำเร็จ = บอกตรง ๆ ด้วยคำของปุ่ม) · คำตอบเปลี่ยน = จอเปลี่ยนให้เห็นเอง (รายการข้อ ·
       ปุ่มส่งผล) ไม่ต้องมี toast
     ⚠️ เทียบ **ก้อน `document` ดิบของ GET** ก่อน/หลัง (ไม่มีช่องไหนในก้อนเดินตามนาฬิกา) — หน้าไม่ตีความเองว่าข้อไหนขวาง ·
        ถ้อยคำของ toast มาจากตัวตัดสิน (`surveyRecheckToast` อ่านส่วนเอกสาร **ก่อนกด**: คำบนปุ่ม · จำนวนข้อ · อ่านสถานะไม่สำเร็จ)
     ⚠️ กดรัว = รอบที่วิ่งอยู่รอบเดียว (GET นี้วิ่งตัวตรวจเอกสารฝั่ง server — ช้ากว่าการอ่านใบธรรมดา) */
  const recheckBusy = useRef(false);
  const recheckDocument = async () => {
    if (recheckBusy.current) return;
    recheckBusy.current = true;
    const before = JSON.stringify(data?.document ?? null);
    const section = view.document;
    try {
      const fresh = await load({ background: true });
      if (!fresh) {
        setToast(surveyRecheckToast(section, "failed"));
      } else if (JSON.stringify(fresh.document ?? null) === before) {
        setToast(surveyRecheckToast(section, "same"));
      }
    } finally {
      recheckBusy.current = false;
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

  /* ── ประเมินจากแบบ (งวด S2b): ปุ่มเปลี่ยนวิธี · ใช้ไฟล์ฝ่ายขายเป็นภาพแบบ · วันส่งผลของงานโต๊ะ ─────────────────────
     ⚠️ ประกาศ **หลัง `recall`** เหมือนชุดเอกสาร — ช่วง `send` → `recall` ถูกตรึงว่าไม่มี toast โทน error */

  /* เปิดโมดัล "วิธีประเมินรายพื้นที่" **แล้วอ่านใบใหม่เสมอ** — โมดัลคิดผลจากแถวพื้นที่ · นัด · เรื่องส่งกลับ ชุดล่าสุด (ท่าเดียวกับโมดัลส่งผล) */
  const openMethodDialog = () => {
    setMethodOpen(true);
    load({ background: true });
  };
  /* ปุ่ม "เปลี่ยนวิธีประเมิน" บนการ์ด — กดได้เสมอ: ติดด่าน (ยังไม่รับเรื่อง · ส่งผลไปแล้ว) = บอกเหตุของตัวตัดสินตอนกด
     (`view.method.reason` — หน้าไม่พิมพ์ประโยคเอง) · ไม่มีสิทธิ์/สวิตช์ปิด = การ์ดไม่วาดปุ่มนี้เลย (`view.method.show`) */
  const switchMethod = () => (view.method.allowed
    ? openMethodDialog()
    : setToast({
      kind: "warning", msg: view.method.reason,
      /* ยังไม่รับเรื่อง = ปุ่ม "รับเรื่อง" อยู่ที่หน้าคำร้อง ⇒ toast พาไปได้ในกดเดียว — เฉพาะคนที่ server บอกว่าเปิดหน้าคำร้องได้
         (S2b แก้หลังตรวจจอ head-r3-8 · ป้ายเป็นคำเดิมของระบบ) */
      ...(view.method.reason === SURVEY_METHOD_ERRORS.notAcknowledged && view.flags.canOpenRequest
        ? { action: { label: "เปิดหน้าคำร้อง", onClick: () => router.push(`/requests/${id}`) } } : {}),
    }));
  /* ปิดโมดัลโดยไม่ได้บันทึก = **อ่านใบใหม่เสมอ** — รอบที่ตอบ `partial` (แถวพื้นที่ลงแล้ว เธรด/กระดิ่งยังไม่ครบ) หรือคำตอบหายกลางทาง
     เขียนฐานไปแล้วทั้งที่โมดัลยังให้กดซ้ำ ⇒ ปิดแล้วใบข้างหลังต้องไม่ค้างเป็นของเก่า (ท่าเดียวกับ `openMethodDialog`) */
  const closeMethodDialog = () => {
    setMethodOpen(false);
    load({ background: true });
  };
  /* โมดัลบันทึกสำเร็จ — หน้าไม่วาดจากคำตอบ (แถวที่ route คืนอาจว่าง) ⇒ อ่านใบใหม่เสมอ */
  const methodDone = ({ plan } = {}) => {
    setMethodOpen(false);
    setToast({ kind: "success", msg: plan?.kind === "cancel-only" ? "ยกเลิกนัดแล้ว" : "บันทึกวิธีประเมินแล้ว" });
    load({ background: true });
  };

  /* ⭐ "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" (มติเจ้าของ §10 ข้อ 6) — server คัดลอกไฟล์ของฝ่ายขายเป็นไฟล์ใหม่ของพื้นที่ แล้วแนบผ่านเส้นไฟล์แนบ
     เส้นเดียวของระบบ (`reuseSalesFileAsPlan` — ด่านทุกข้ออยู่ฝั่ง server) · สำเร็จ = ช่องภาพแบบอ่านรายการใหม่ (`planReloadKey`) + อ่านใบใหม่
     ⚠️ ล้ม = toast ด้วยประโยคที่ได้กลับมา (ไฟล์เธรดก่อนมีใบรับ · ใบล็อก · พื้นที่ถูกสลับกลับ) — ไม่แปลซ้ำ · กดได้ทีละไฟล์ */
  const reusePlan = async (zoneId, file) => {
    if (reuseBusyKey || !file?.ref) return;
    setReuseBusyKey(file.key);
    try {
      const out = await reuseSalesFileAsPlan({ requestId: id, zoneId, ref: file.ref });
      if (!out.ok) {
        /* ล้ม ≠ ไม่มีอะไรถูกเขียน: คำตอบของเส้นแนบอาจหายกลางทางทั้งที่แถวลงแล้ว และ 409 แปลว่าใบที่ถืออยู่เก่า
           ⇒ ช่องภาพแบบกับใบอ่านใหม่ทุกครั้ง — ปุ่มที่เหลือเดินตามของจริง ไม่ชวนให้กดซ้ำจนได้ภาพแบบสองใบ */
        setToast({ kind: "error", msg: out.error });
        setPlanReloadKey((n) => n + 1);
        await load({ background: true });
        return;
      }
      setPlanReloadKey((n) => n + 1);
      setToast({ kind: "success", msg: "ใช้รูปนี้เป็นภาพแบบแล้ว" });
      await load({ background: true });
    } finally {
      setReuseBusyKey(null);
    }
  };

  /* ⭐ "รับปากวันส่งผล" / "เลื่อนวันส่งผล" ของใบงานโต๊ะ — โมดัลตัวเดียวกับหน้าคำร้อง (`CommitDueDialog`) · เส้นเดียวกัน (`PATCH` ใบคำร้อง)
     ⚠️ โมดัลไม่บอก error เอง ⇒ ล้ม = toast · โมดัลยังเปิดพร้อมของที่พิมพ์ไว้ (ท่าเดียวกับหน้าคำร้อง) */
  const submitDeskDue = async (payload) => {
    const mode = deskDueDialog?.mode;
    setDeskDueBusy(true);
    try {
      await apiJson(`/api/sa/requests/${id}`, {
        method: "PATCH", json: payload, fallbackError: "บันทึกวันส่งผลไม่สำเร็จ",
      });
      setDeskDueDialog(null);
      setToast({
        kind: "success",
        msg: mode === "reschedule" ? "เลื่อนวันแล้ว" : commitDueLabels({ ...data?.request, surveyNeedsVisit: false }).okMsg,
      });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setDeskDueBusy(false);
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
  /* ค่าของแต่ละพื้นที่ = `{ summary, unlinkPhotos }` — `unlinkPhotos` = รูปบนแถวจุดที่ยังไม่บันทึก (ทิ้งร่างแล้วย้ายไปถาด
     "ยังไม่ได้ผูกจุด" · กล่องถามก่อนทิ้งต้องบอก — review 30/09) */
  const handleDirtyZone = useCallback((zoneId, isDirty, summary = "", unlinkPhotos = 0) => {
    setDirtyZones((prev) => {
      const key = String(zoneId);
      if (!isDirty) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      const n = Math.max(0, Number(unlinkPhotos) || 0);
      const cur = prev[key];
      return cur && cur.summary === summary && cur.unlinkPhotos === n
        ? prev
        : { ...prev, [key]: { summary, unlinkPhotos: n } };
    });
  }, []);
  const dirtyZoneIds = useMemo(() => Object.keys(dirtyZones), [dirtyZones]);
  /* 🔑 **ของค้างเป็นค่าที่คำนวณได้ ไม่ใช่ธงที่ต้องมีใครยิงมา** — ตัวตัดสินตัวเดียวกับ
     ที่ตารางใช้วาดแถบ "ยังไม่บันทึก" และที่ route `PUT` ใช้เป็นด่าน
     ⇒ ไม่มี effect ไม่มี state คู่ขนาน ⇒ ไม่มีสภาพ "ธงค้างหลังตาราง unmount" ให้เกิด */
  /* ทะเบียนขนาดแพ็คเกจ (mig 0398) — `null` = server อ่านไม่สำเร็จ · ส่งให้ทั้งตารางเคาะ ตัวตัดสินร่าง และการ์ดควบคุม
     (ทุกตัว fail-closed: ไม่มีทะเบียน = เคาะขนาดไม่ได้ · ใบที่เคาะขนาดแล้วส่งผลไม่ได้) */
  const packageSizes = data?.packageSizes ?? null;
  const pendingDecisionZoneIds = useMemo(
    () => surveyPendingDecisions(zones, decisionDrafts, { sizes: packageSizes }).ids,
    [zones, decisionDrafts, packageSizes],
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
    /* ⭐ เอกสารประเมินพื้นที่ (PR-3) — สรุปของ server ตามสิทธิ์คนดู (`document` ของ GET) + ของที่จอจำไว้เอง (`docLocal`)
       ⇒ ส่วนเอกสารบนการ์ด · แถวด่าน "เอกสารประเมินออกได้" · บรรทัดเอกสารในโมดัลส่งผล/ดึงกลับ มาจากตัวตัดสินตัวเดียวกันนี้ */
    document: data?.document ?? null,
    documentLocal: docLocal,
    /* ⭐ ประเมินจากแบบ (งวด S2b) — สองคีย์จาก GET ล้วน (server เป็นคนอ่านสวิตช์และนัด · จอไม่เดา)
       `drawingMethodEnabled` เปิด = ตัวตัดสินให้ปุ่ม "เปลี่ยนวิธีประเมิน" (`view.method`) · `siteVisitReached` = ใบมีนัดที่เข้าพื้นที่แล้วไหม
       (`null` = ไม่ได้อ่าน/อ่านไม่สำเร็จ ⇒ ไม่มีบรรทัดเหตุของเรื่องนี้) — เหตุ "ยังไม่มีใครเข้าพื้นที่" มาอยู่ใน `view.send.reason` เอง */
    drawingMethodEnabled: data?.drawingMethodEnabled === true,
    siteVisitReached: data?.siteVisitReached ?? null,
    dirtyZoneIds,
    pendingDecisionZoneIds,
    tab,
    today: businessDate(),
    /* ทะเบียนขนาดแพ็คเกจ (mig 0398) — `null` = server อ่านไม่สำเร็จ ⇒ การ์ดบล็อกส่งผลด้วยเหตุเดียวกับ route */
    packageSizes,
  }), [data, zones, filesByZone, dirtyZoneIds, pendingDecisionZoneIds, tab, docLocal, packageSizes]);

  const canDecide = data?.canDecide === true;
  /* ⭐ มติเจ้าของ 26/09 "ช่างเห็นแค่งานตัวเอง" — ช่าง (เขียนผลวัดได้ · ไม่ได้เคาะ) ไม่มีจอสรุปส่งผลแล้ว
     ลิงก์เก่า `?tab=result` พากลับหน้างาน (ชั้นใบใต้พื้นที่ต้องเป็น URL แท็บหน้างานอยู่แล้ว — กับดักประวัติ)
     🐞 UAT 01/10: ถาม `canWrite` **ดิบของ server** (ช่างของนัดใบนี้ — ไม่ดูการล็อก) ไม่ใช่ `view.flags.canWrite` (หักล็อกแล้ว)
        ⇒ เดิมใบที่ส่งผลแล้ว ธงเป็น false ช่างเปิด `?tab=result` ได้ (และได้แถว "สรุปส่งผล · ดูอย่างเดียว")
     🔄 งวด S2b: บรรทัดนี้ย้ายขึ้นมาจากข้างล่าง (ตัวอักษรเดิม) — `hideDrawing` ต้องรู้ก่อนพื้นที่ตั้งต้นของบานขวาถูกคิด */
  const crewOnly = !!data && data.canWrite === true && !canDecide;
  /* ⭐ **ใครเห็นพื้นที่จากแบบ** (งวด S2b · มติเจ้าของ O4 09/10) — ผู้วางคิวกับช่างมาถึงหน้านี้ด้วยธงคู่เดียวกัน (`canWrite` · ไม่ได้เคาะ)
     ตัวแยกคือ `canEditService` ของ GET (ถือสิทธิ์แก้งานบริการ — server ตัดสินจากความสามารถ ไม่ใช่ชื่อตำแหน่ง · จอไม่รู้ role ของตัวเอง)
       หัวหน้า    เห็นทุกพื้นที่ กรอกพื้นที่จากแบบได้
       ผู้วางคิว   เห็นทุกพื้นที่ **อ่านอย่างเดียว** บนพื้นที่จากแบบ (`planReader`) — พื้นที่ลงหน้างานยังทำได้เท่าเดิม
       ช่าง       พื้นที่จากแบบไม่ใช่งานของเขา ⇒ ไม่อยู่ในรายการ/ตัวเลื่อน/พื้นที่ตั้งต้น (`hideDrawing`) มีบรรทัดบอกจำนวนแทน
     ⚠️ `hideDrawing` ไปที่ **สี่ตัวเท่านั้น**: รายการพื้นที่ · พื้นที่ตั้งต้น · ตัวเลื่อน ‹ › · "ถัดไป" ของท้ายหน้าพื้นที่ (ทางเดินตามลำดับ —
        UAT 12/10) — แถบของช่าง · ด่านแจ้งหัวหน้า ได้ทั้งใบเหมือนเดิม (ตัวตัดสินพวกนั้นตัดพื้นที่จากแบบออกเองอยู่แล้ว) · ใบที่ไม่มีพื้นที่จากแบบ = สองธงนี้ไม่เปลี่ยนอะไรเลย */
  const planReader = crewOnly && data?.canEditService === true;
  const hideDrawing = crewOnly && !planReader;

  /* ── เอกสารประเมินพื้นที่ (PR-3): ลายเซ็นของชุดไฟล์ + การอ่านใบซ้ำ ─────────────────────────────────
     `liveSig` = ชุดไฟล์ที่จอถืออยู่ตอนนี้ (**ก้อนเดียวกับที่ส่งให้ตัวตัดสิน** — กล่อง "ส่งผลรอบล่าสุดถูกตีกลับ" เทียบกับตัวนี้)
     `baseSig` = ชุดไฟล์ของ GET รอบล่าสุด · ต่างกัน = หัวหน้าเพิ่ง แนบ/ลบ/ผูกจุด บนจอ ที่ผลตรวจเอกสารของ server ยังไม่เห็น */
  const liveSig = useMemo(() => surveyFilesSignature(filesByZone), [filesByZone]);
  const baseSig = useMemo(() => surveyFilesSignature(data?.filesByZone), [data]);

  /* ของรอบก่อนไม่ตามมารอบใหม่ — `answeredAt` เปลี่ยน (ดึงผลกลับ · ส่งรอบใหม่) = ล้างของที่ผูกกับรอบ (`sendRefused` ไม่ผูก จึงอยู่ต่อ)
     ⚠️ ก้อนที่เขียนไว้ **ล่วงหน้า** ของรอบที่ใบยังโหลดมาไม่ถึง (`afterSend` เขียนก่อน GET ตามมา) ไม่โดนล้าง: effect นี้เดินเฉพาะตอน
        `answeredAt` ของใบเปลี่ยน ซึ่งตอนนั้นค่าตรงกับรอบของก้อนแล้ว */
  const answeredAt = data?.request?.answeredAt ?? null;
  useEffect(() => {
    setDocLocal((prev) => {
      if (!prev?.round || sameInstant(prev.round, answeredAt)) return prev;
      return prev.sendRefused ? { ...DOC_LOCAL_ROUND, round: null, sendRefused: prev.sendRefused } : null;
    });
  }, [answeredAt]);

  /* ชุดไฟล์เปลี่ยน = หัวหน้าแก้อะไรไปแล้ว ⇒ ข้อผิดพลาดที่กดซ้ำได้ (ของ "ออกเอกสาร" และของการส่งรอบนี้) เลิกค้างบนกล่องสถานะ
     · ข้อที่กดซ้ำไปก็ไม่ผ่านและไม่มี GET ไหนมองเห็น (`surveyIssueErrorSticky`) อยู่ต่อจนจบรอบ — ปุ่มต้องจางต่อ
     🔴 **`sendFailed` ล้างได้เฉพาะตอน server ตอบ "ยังไม่มีเอกสาร" เอง** (`document.state: 'missing'` — มาพร้อมเหตุชุดสดของ
        `document.issue.blockers` ซึ่งชนะเหตุที่จอจำไว้อยู่แล้ว) · ตราบที่ server ยังตอบ "กำลังออก" (`issuing` = นาฬิกา 180 วิหลังส่งผล
        ไม่ใช่งานที่วิ่งอยู่จริง) `sendFailed` เป็นของชิ้นเดียวที่บอกจอว่าการส่งรอบนี้ออกเลขไม่สำเร็จไปแล้ว (`surveyDocumentView` แปลงเป็น
        "ยังไม่ออก" + ปุ่มกดได้)
        🐞 เดิมล้างทุกครั้งที่ชุดไฟล์เปลี่ยน ⇒ หัวหน้าผูกรูปตามที่บรรทัดบนหัวข้อจุดบอก ("ผูกรูปให้ครบก่อนกด ออกเอกสาร") ภายใน 180 วิ
           แล้วส่วนเอกสารกลับเป็นป้าย "กำลังออก" · ปุ่ม "ออกเอกสาร" จาง · หน้าอ่านใบซ้ำทุก 15 วิ ทั้งที่ไม่มีอะไรกำลังออก
        · สถานะอื่น (ใบของ GET ยังตามมาไม่ถึง · อ่านสถานะเอกสารไม่สำเร็จ) = ยังไม่รู้ว่า server จะตอบ "กำลังออก" ไหม ⇒ เก็บไว้ก่อนเช่นกัน
          (ตัวตัดสินอ่าน `sendFailed` เฉพาะสถานะ `issuing` กับ `missing` — ค้างไว้ในสถานะอื่นไม่มีผลบนจอ · ของรอบอื่นถูกทิ้งตอน
          `answeredAt` เปลี่ยนอยู่แล้ว)
        · `issueError` ไม่เกี่ยวกับนาฬิกานี้ — ล้างเหมือนเดิม */
  const docServerState = data?.document?.state ?? null;
  const sigSeen = useRef(liveSig);
  useEffect(() => {
    if (sigSeen.current === liveSig) return;
    sigSeen.current = liveSig;
    setDocLocal((prev) => {
      if (!prev) return prev;
      const issueError = prev.issueError && surveyIssueErrorSticky(prev.issueError) ? prev.issueError : null;
      const sendFailed = prev.sendFailed && (docServerState !== "missing" || surveyIssueErrorSticky(prev.sendFailed))
        ? prev.sendFailed : null;
      return issueError === prev.issueError && sendFailed === prev.sendFailed ? prev : { ...prev, issueError, sendFailed };
    });
  }, [liveSig, docServerState]);

  /* สถานะ "กำลังออก" เป็นการเดาจากนาฬิกาของ server (180 วิหลังส่งผล) — ไม่มีเหตุการณ์ไหนบนจอจบมันได้ ⇒ อ่านใบใหม่ทุก 15 วิ
     ⚠️ ผูกกับ `loadSettled` (นับทุกรอบที่จบ รวมรอบที่พัง) ⇒ ตั้งนาฬิกาใหม่หลังทุกรอบ ไม่หยุดเองเมื่อโหลดเบื้องหลังพังครั้งเดียว
     🐞 **แต่ลองได้ไม่ตลอดไป** — รอบที่พังคงใบเดิมไว้ ⇒ `poll` ยังจริงและ `loadSettled` ก็ยังขยับ ⇒ GET ที่พังทุกครั้ง (เซสชันหมด ·
        ใบถูกลบ · 500 ค้าง) วนยิงทุก 15 วิตลอดที่แท็บเปิดอยู่ · พังติดกันครบ `DOC_POLL_MAX_FAILS` รอบ = ไม่ตั้งรอบใหม่ ·
        รอบไหนได้ใบ (กลับมาที่แท็บ · กด "ตรวจอีกครั้ง" · ทำอะไรบนใบ) ตัวนับกลับเป็นศูนย์แล้วเดินต่อเอง — อาการเดียวกับหน้าคำร้อง */
  useEffect(() => {
    if (!view.document.poll) return undefined;
    if (failedRuns.current >= DOC_POLL_MAX_FAILS) return undefined;
    const t = setTimeout(() => load({ background: true }), 15000);
    return () => clearTimeout(t);
  }, [view.document.poll, loadSettled, load]);

  /* แนบ/ลบ/ผูกจุดบนจอแล้ว ผลตรวจเอกสารของ server (`document.send` / `document.issue`) ยังเป็นของชุดไฟล์เดิม ⇒ อ่านใบใหม่หนึ่งรอบ
     หลังนิ่ง 1.5 วิ · **หนึ่งรอบต่อหนึ่งลายเซ็น** (`rechecked`) — อ่านแล้วยังต่าง (รอบนั้นพัง) ก็ไม่วนยิงซ้ำ
     ⚠️ รูปที่ยังส่งไม่เสร็จ = รอก่อน (ส่งเสร็จแล้วมีรอบอ่านใหม่ของมันเองอยู่ข้างบน) */
  const rechecked = useRef(null);
  useEffect(() => {
    if (!view.document.recheckOnFiles || uploadsBusy !== 0 || liveSig === baseSig || rechecked.current === liveSig) {
      return undefined;
    }
    const t = setTimeout(() => {
      rechecked.current = liveSig;
      load({ background: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [view.document.recheckOnFiles, uploadsBusy, liveSig, baseSig, load]);

  /* ออกเอกสารสำเร็จ = ปุ่มที่เพิ่งกดหายไปพร้อมสถานะ "ยังไม่ออก" ⇒ โฟกัสตกไปที่ body · ย้ายมาที่ส่วนเอกสาร (เลขที่เพิ่งออกอยู่ตรงนั้น)
     ⚠️ เฉพาะตอนโฟกัสหลุดจริง — คนที่ไปทำอย่างอื่นต่อแล้วไม่โดนดึงกลับ
     ⚠️ กล่องยืนยันยังเปิดอยู่ = รอให้ปิดก่อน (โฟกัสยังอยู่ในกล่อง · กล่องคืนโฟกัสให้ปุ่มเดิมตอนปิด ซึ่งอาจถูกถอดไปแล้ว) */
  const docSectionRef = useRef(null);
  const docStateSeen = useRef(null);
  const docFocusDue = useRef(false);
  useEffect(() => {
    const was = docStateSeen.current;
    docStateSeen.current = view.document.state;
    if (was === "missing" && DOC_ISSUED_STATES.includes(view.document.state)) docFocusDue.current = true;
    if (!docFocusDue.current || issueDialog) return;
    docFocusDue.current = false;
    if (document.activeElement === document.body) docSectionRef.current?.focus();
  }, [view.document.state, issueDialog]);

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
      const held = zoneDirty ? dirtyZonesRef.current[String(from)] : null;
      const box = surveyLeaveConfirm({
        ...leaveRef.current, zoneDirty, zone, summary: held?.summary || "", unlinkPhotos: held?.unlinkPhotos || 0,
      });
      if (!box) return Promise.resolve(true);
      // ตอบ "ทิ้งแล้วออก" = ตัวต่อสายย้อนออกเอง ⇒ เบราว์เซอร์ต้องไม่ถาม "Leave site?" ซ้ำ (หน้าก่อนหน้าเป็นคนละเอกสาร)
      return confirmAction(box).then((ok) => {
        if (ok) allowNextLeave();
        return ok;
      });
    }
    const held = dirtyZonesRef.current[String(from)];
    const text = surveyDiscardConfirm({ zone, summary: held?.summary || "", unlinkPhotos: held?.unlinkPhotos || 0 });
    return confirmAction({
      title: text.title, description: text.message, cancelLabel: text.cancelLabel, confirmLabel: text.confirmLabel,
      tone: "danger",
    });
  }, []);
  const resetDraft = useCallback(() => setDraftEpoch((n) => n + 1), []);
  const zoneIds = useMemo(() => zones.map((z) => String(z.id)), [zones]);
  /* พื้นที่ที่บานขวาเปิดเอง = "งานถัดไป" ของคนดู (งวด S2b)
     · `editable` — หัวหน้าที่เคาะได้แต่เขียนผลวัดไม่ได้ (CD / CM) ก็มีงานบนพื้นที่จากแบบ ⇒ ได้พื้นที่แรกที่ยังขาดเหมือนกัน
       (ใบที่ไม่มีพื้นที่จากแบบ: ท่อนหลังเป็นเท็จ = ค่าเดิม)
     · `drawingEditable` — ผู้วางคิวเห็นพื้นที่จากแบบแต่กรอกไม่ได้ ⇒ พื้นที่จากแบบไม่ถูกเลือกเป็นงานถัดไปของเขา */
  const defaultEditable = view.flags.canWrite || (canDecide && !view.flags.locked && view.mix.drawing > 0);
  /* ⚠️ ใบที่ไม่มีพื้นที่จากแบบ = **คำสั่งเดิมทุกตัวอักษร** (สามตัวเลือกใหม่ไม่เปลี่ยนผลบนใบแบบนั้นอยู่แล้ว — แยกกิ่งไว้ให้เห็นกับตา
     และเทสต์เดิมของตัวตัดสินยังตรึงบรรทัดนี้: หน้าต้องส่งธงที่หักล็อกแล้ว ไม่ใช่ `canWrite` ดิบของ server) */
  const defaultZoneId = useMemo(
    () => (view.mix.drawing > 0
      ? surveyDefaultZoneId(zones, filesByZone, { editable: defaultEditable, hideDrawing, drawingEditable: canDecide })
      : surveyDefaultZoneId(zones, filesByZone, { editable: view.flags.canWrite })),
    [zones, filesByZone, view.flags.canWrite, view.mix.drawing, defaultEditable, hideDrawing, canDecide],
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
  /* "ไปผูกจุด" บนบรรทัด "ยังไม่ได้ผูกจุด n รูป" ของแท็บสรุป (🐞 UAT 01/10 — เดิมเป็นตัวหนังสือ ต้องสลับแท็บ/เปิดพื้นที่/เลื่อนหาเอง)
     = "เปิด X" ตัวเดิม + จองให้หน้าพื้นที่นั้นเลื่อนถึงถาดเอง (ถาดเกิดหลังแผงไฟล์โหลดเสร็จ — ตัวต่อสายไม่รู้จักถาด)
     ⚠️ กลับมาแท็บสรุปก่อนถาดขึ้น = คำขอตกไป (ไม่ไปเลื่อนตอนเปิดพื้นที่นั้นเองทีหลัง) */
  const [trayJump, setTrayJump] = useState(null);
  const openSpotTray = useCallback((zoneId) => {
    setTrayJump(String(zoneId));
    openZone(zoneId);
  }, [openZone]);
  const trayShown = useCallback(() => setTrayJump(null), []);
  useEffect(() => {
    if (tab === "result") setTrayJump(null);
  }, [tab]);

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
      summary: dirtyZoneId ? dirtyZones[dirtyZoneId]?.summary || "" : "",
      unlinkPhotos: dirtyZoneId ? dirtyZones[dirtyZoneId]?.unlinkPhotos || 0 : 0,
      decisions: pendingDecisionZoneIds.length,
      fixedNote,
    }),
  });

  /* ⭐ **ใบที่มีพื้นที่จากแบบ: โมดัลส่งผลถามว่า "ต้องยืนยันหน้างานไหม"** (งวด S2b · แผน §3.2) — ตัวตัดสินได้ `method` เฉพาะเมื่อการ์ดบอกว่า
     ต้องถาม (`view.send.confirm.required`) · ไม่ต้อง = `null` ⇒ ผลของ `surveySendConfirm` เท่าเดิมทุกคีย์ (ไม่มีหัวใหม่ ไม่มีไทล์)
     · `view.mix` (มี `mode`) ไม่ใช่ `view.send.confirm.mix` — ตัวหลังเป็นก้อนที่ส่งกลับ route ไม่มีโหมดของใบ
     · `openVisit` = นัดที่ยังเปิดจริง — ข้อ "ไม่มีนัดที่เปิดอยู่" พูดได้ต่อเมื่อไม่มี
     · `sendChoice` ล้างทุกครั้งที่โมดัลเปิด/ปิด — ไม่มีคำตอบค้างจากรอบก่อน ไม่มีค่าตั้งต้น */
  useEffect(() => {
    setSendChoice(null);
    setSendChoiceMissing(false);
  }, [sending]);
  const sendOpenVisit = data?.visit && OPEN_VISIT_STATES.includes(data.visit.status)
    ? { code: data.visit.code, status: data.visit.status } : null;
  const sendMethod = view.send.confirm.required
    ? { mix: view.mix, confirm: sendChoice, openVisit: sendOpenVisit } : null;
  /* ⭐ ข้อความโมดัลส่งผล — ผลทุกข้อของการกด รวม "ปิดนัด SV-… ไปพร้อมกัน" (มติเจ้าของ 24/09 ข้อ 2) */
  const sendConfirm = surveySendConfirm({
    docNo: data?.request?.docNo, closesVisit: view.send.closesVisit,
    /* เอกสารประเมิน (PR-3) — การส่งครั้งนี้ออกเลข SU ด้วยไหม · แทนฉบับไหน · ข้อความที่จะพิมพ์ตามที่กรอก (ชุดเดียวกับที่ส่งกลับเป็น
       `seenWarnings`) · อ่านสถานะเอกสารไม่สำเร็จ = บอกผลแบบมีเงื่อนไข (กติกาโมดัลบอกผลลัพธ์ #1223) */
    issuesDocument: view.send.issuesDocument, replacesDocNo: view.send.replacesDocNo,
    warnings: view.send.seenWarnings, documentUnknown: view.send.documentUnknown,
    // ลายเซ็นจริง (PR-SIG) — ผู้ลงนามที่เอกสารของการส่งครั้งนี้จะพิมพ์ลายเซ็น: โมดัลเอ่ยชื่อก่อนกด · ไม่มีคีย์ (กติกาปิด) = ไม่มีข้อนี้
    signers: view.send.signers,
    method: sendMethod,
    // ส่งกลับให้ช่างแก้ค้างอยู่ = บอกก่อนกดว่าส่งแล้วช่างแก้ต่อไม่ได้ (review 26/09 · เตือน ไม่บล็อก)
    sendBackPending: view.send.sendBackPending,
    // ขนาดที่ตั้งไว้ก่อนมีข้อเสนอของระบบ (back-fill ST) = บอกก่อนกดว่าพื้นที่ไหนยังไม่ได้เทียบ (UAT PR-P 01/10 · เตือน ไม่บล็อก)
    sizeReview: view.send.sizeReview,
  });
  /* ของโมดัลส่งผลบนใบที่มีพื้นที่จากแบบ — หัวกล่อง (ไม่มี = ไม่ทับหัวตั้งต้นบนแท็ก) · ไทล์สองใบ (คำบนไทล์และคำกำกับเป็นของตัวตัดสิน)
     · เลือกแล้วเหตุ "ยังไม่ได้เลือก…" หายทันที */
  const sendTitle = sendConfirm.title ? { title: sendConfirm.title } : null;
  const sendChoiceOptions = sendConfirm.choice
    /* คำกำกับใต้ไทล์ห้ามขาดกลางป้าย/ชื่อ (UAT S2b รอบสอง S05 · 375: "“รอ" / "ยืนยันหน้างาน”" · "ฝ่าย" / "ขาย" · "ใบยืนยันหน้า" / "งาน") — ชิ้นชุดเดียวกับการ์ด */
    ? sendConfirm.choice.options.map(({ value, label, hint }) => ({ value, label, description: keepPhrases(hint, surveyCardUnits(hint, SEND_TILE_UNITS)) }))
    : [];
  const pickSendChoice = (value) => {
    setSendChoice(value);
    setSendChoiceMissing(false);
  };
  /* เหตุหลายข้อที่ขวางการส่งผล (ติดเฉพาะเอกสารประเมิน) — โมดัลที่เหลือปุ่ม "ปิด" วาดเป็นรายการ · ใบที่ล็อกไปแล้วไม่มีเหตุให้วาด */
  const sendBlockedItems = view.send.show && !view.send.allowed ? view.send.reason?.items || [] : [];
  /* กล่องยืนยัน "ออกเอกสาร" — ปุ่มเดินตามใบสด (`view.document.issue.allowed`) · ระหว่างที่คำขอยังวิ่ง = คงเนื้อเดิม (ดู `issueBusy`)
     ออกไม่ได้แล้ว = สถานะล่าสุดของส่วนเอกสารสองบรรทัด: **ป้ายของส่วนนำเสมอ** ("สถานะเอกสารตอนนี้: ออกแล้ว") แล้วตามด้วยข้อความของ
     กล่องสถานะบนการ์ด (ถ้ามี)
     🐞 เดิมข้อความ = ข้อความของกล่องสถานะอย่างเดียว:
        · ถูกตีกลับด้วยเหตุที่กดซ้ำไม่ผ่าน (กระดาษล้น · รูปเปิดไม่ได้) = กล่องสถานะคือประโยคของ server ประโยคเดียวกับที่กล่องแดงของ
          กล่องยืนยันพิมพ์อยู่ ⇒ ประโยคเดียวกันสองครั้งติดกัน
        · อีกคนออกไปก่อน = กล่องบอกแค่ "ไฟล์ฉบับนี้จัดทำตอนเปิดครั้งแรก…" ไม่มีคำไหนบอกว่าเอกสารออกแล้ว
     ⚠️ บรรทัดรองไม่ขึ้นเมื่อมันคือประโยคที่เพิ่งถูกโยนกลับมา (`docLocal.issueError.message` — `issueDocument` เขียนในจังหวะเดียวกับที่โยนให้กล่อง)
        ⇒ ประโยคของ server อยู่ในกล่องแดงที่เดียว
     ⭐ **บรรทัดทางออกของกล่องสถานะ (`status.foot`) ตามมาเสมอ** — 🐞 UAT PR-3 (S23 · S37): กล่องที่เหลือปุ่ม "ปิด" บอกแค่สถานะกับประโยคของ
        server ("กระดาษยังพิมพ์ไม่ได้ …") ไม่บอกว่าต้องทำอะไรต่อ · ทางออกเป็นของตัวตัดสิน (ดึงผลกลับมาแก้แล้วส่งใหม่ / แจ้งผู้ดูแลระบบ)
        หน้าแค่ต่อเป็นบรรทัดใหม่ (`.confirm-dialog-detail` เป็น `pre-line`) */
  const issueAllowed = issueBusy || view.document.issue?.allowed === true;
  const issueBlockedLead = view.document.badge.label
    ? `สถานะเอกสารตอนนี้: ${view.document.badge.label}` : "ออกเอกสารไม่ได้ตอนนี้";
  const issueThrownText = typeof docLocal?.issueError?.message === "string" ? docLocal.issueError.message.trim() : "";
  const issueStatusText = view.document.status?.text || "";
  const issueBlockedDetail = [
    issueStatusText && issueStatusText !== issueThrownText ? issueStatusText : null,
    view.document.status?.foot || null,
  ].filter(Boolean).join("\n") || undefined;
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
  /* 🔑 ด่านตัวเดียวกับ server — ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · เหตุที่เขียนไม่ได้อยู่ในการ์ด
     ⭐ **ใบงานโต๊ะ** (ไม่เหลือพื้นที่ที่ต้องลงหน้างาน · งวด S2b · แผน §2 แถว 14) — server ให้เพิ่มพื้นที่ได้เฉพาะหัวหน้าฝ่าย และไม่ถามเรื่องนัด
        ⇒ หัวหน้าที่เขียนผลวัดไม่ได้ (CD / CM) ก็เพิ่มได้ · คนอื่นไม่มีปุ่ม (ผู้วางคิวได้บรรทัดเหตุแทน — `addBlockedNote` ข้างล่าง)
        ใบที่ยังต้องมีนัด = ด่านเดิมทุกตัวอักษร
     ⚠️ ค่านี้ถูกถามแค่ "มีหรือไม่มี" — ไม่มีที่ไหนพิมพ์มัน */
  const deskSheet = view.needsVisit === false;
  const addGate = deskSheet
    ? (canDecide ? surveyEditLockError(data?.request) : ADD_HEAD_ONLY)
    : surveyAddZoneError(data?.request, { canWrite: data?.canWrite === true });
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
  /* ช่างไม่มีจอสรุปส่งผล (`crewOnly` — ประกาศไว้ข้างบนคู่กับ `canDecide`) ⇒ ลิงก์เก่า `?tab=result` พากลับหน้างาน */
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
  /* คำของ "เพิ่มพื้นที่" (ปุ่มท้ายรายการ · ปุ่มใต้สถานะว่าง · หัวกล่อง · บรรทัดรองของกล่อง) — ใบงานโต๊ะ: หัวหน้าเพิ่มที่โต๊ะ ไม่มีใครอยู่หน้างาน
     ⇒ ไม่ใช่ "ที่เจอหน้างาน" และป้ายที่ฝ่ายขายเห็นบนแถวเป็น "เพิ่มโดย {ฝ่าย}" (งวด S2b) · ใบที่ยังต้องมีนัด = คำเดิมทั้งสามที่ */
  const addWords = deskSheet
    ? {
      label: "เพิ่มพื้นที่",
      detail: `ฝ่ายขายจะเห็นป้าย “เพิ่มโดย ${req.dept || "TS"}” บนแถวนี้ — ไม่ต้องขออนุมัติก่อน`,
    }
    : {
      label: "เพิ่มพื้นที่ที่เจอหน้างาน",
      detail: "ฝ่ายขายจะเห็นป้าย “เจ้าหน้าที่เพิ่มหน้างาน” บนแถวนี้ — ไม่ต้องขออนุมัติก่อน",
    };
  /* ⭐ ป้ายนัดข้างรหัสคำร้อง (แถวย้อน) — สถานะนัดคำเดียวกับหน้าคำร้อง (นัดไว้ · กำลังทำ · เข้าแล้ว · ทำไม่ได้)
     · ใบที่ส่งผลไปแล้วแต่นัดยังไม่ถูกปิด = "นัดยังไม่ปิด" สีอำพัน (ใบก่อนมติ 24/09 ข้อ 2 ที่นัดค้างมา — ถอดเมื่อไร
       นัดพวกนั้นค้างในคิวโดยไม่มีใครเห็น) · 🐞 ป้ายนี้ต้องถาม `sent` ก่อนเสมอ — กติกาอยู่ใน `surveyVisitBadge` (เทสต์ด้วยข้อมูล) */
  const visitBadge = surveyVisitBadge(visit, { sent: view.flags.sent });
  /* หัวงาน + "เกี่ยวกับคำร้อง" — คำชุดเดียวกัน (รหัส · ชื่อเรื่อง · ลูกค้า) จากตัวตัดสินตัวเดียว */
  const headerView = surveyJobHeaderView({
    request: data?.request || null, customer: data?.customer || null, site, visit, crew: data?.crew || [],
    unknown: data?.unknown || {},
    /* ใบที่มีพื้นที่จากแบบ: ข้อแรกของหัวงานเป็น "วิธีประเมิน" (งวด S2b) — ใบลงหน้างานล้วน = หัวงานเดิมทุกข้อ (ตัวตัดสินดู `mix.drawing`) */
    method: { mix: view.mix, needsVisit: view.needsVisit },
  });
  /* แผง "แบบจากฝ่ายขาย" ขึ้นไหม (รายละเอียดที่หัวข้อแผงข้างล่าง) — คิดก่อน "เกี่ยวกับคำร้อง": หน้าที่มีแผงไม่มีแถวไฟล์แนบของคำร้องซ้ำ */
  const showDrawings = (canDecide || planReader) && view.mix.drawing > 0;
  const aboutView = surveyAboutView({
    /* ⚠️ `canWrite` ดิบ (ไม่หักล็อก) — ตัวนี้ถามว่า "เป็นช่างของใบนี้ไหม" (แถว "สรุปส่งผล" เฉพาะคนดูอย่างเดียว) ตัวเดียวกับ `crewOnly` */
    header: headerView.request, requestId: id, canDecide, canWrite: data?.canWrite === true, canOpenRequest: view.flags.canOpenRequest,
    /* ไฟล์แนบของคำร้อง — อ่านอย่างเดียว ทุกคนที่เปิดใบนี้ได้ (PR-S · ช่างเปิดหน้าคำร้องไม่ได้)
       · หน้าที่มีแผงแบบจากฝ่ายขาย = ไม่มีแถวนี้ (แผงลิสต์ชุดเดียวกันครบกว่า · S2b แก้หลังตรวจจอ planner-q11) — ช่างไม่มีแผง จึงยังเห็นแถว */
    requestFiles: data?.requestFiles || [], filesUnknown: data?.unknown?.requestFiles === true, salesPanel: showDrawings,
  });
  /* ⭐ ผูกรูปจุดติดตั้งกับจุดได้ไหม (PR-S · Q1a) — server ตอบ (ด่านเดียวกับ PATCH): ใบเปิด = คนเขียนได้ · ส่งผลแล้ว = หัวหน้าฝ่าย */
  const canLinkSpots = data?.canLinkSpotPhotos === true;
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
  /* ⭐ **พื้นที่จากแบบที่เปิดอยู่** (งวด S2b) — คิดครั้งเดียว ใช้ทั้งชนิดคนดูของหน้าพื้นที่และปุ่มของแผงแบบจากฝ่ายขาย
     · พื้นที่ลงหน้างาน = `null` ⇒ ทุกอย่างข้างล่างตกทางเดิม
     · `editable` = หัวหน้า + ใบยังไม่ล็อก + พื้นที่ยังไม่ถูกตัด (ตัวตัดสิน) — หัวหน้าที่เขียนผลวัดไม่ได้ (CD / CM) ก็กรอกพื้นที่จากแบบได้
       ⇒ ชนิดคนดูของพื้นที่จากแบบมาจากตัวนี้ ไม่ใช่จาก `canWrite` (ไม่งั้นได้ช่องกรอกแต่ไม่มีปุ่มบันทึก)
     · ผู้วางคิว / ช่างที่ตามลิงก์มา = อ่านอย่างเดียว พร้อมบรรทัดเหตุของตัวตัดสิน (หน้าพื้นที่วาดเอง) */
  const shownDrawing = shownZone ? surveyDrawingZoneView({
    zone: shownZone, files: filesByZone[shownZone.id] || [], canDecide, locked: view.flags.locked, dept: req.dept,
  }) : null;
  const drawingZoneEditable = shownDrawing?.editable === true;
  const listView = surveyZoneListView({
    zones, filesByZone, selectedZoneId: split ? route.shown : null, dirtyZoneId,
    sendBack: data?.sendBack || null, canDecide, split, visit, locked: view.flags.locked,
    hideDrawing, dept: req.dept,
  });
  const zoneTitles = Object.fromEntries(zones.map((z) => [String(z.id), surveyZoneTitle(z)]));
  const nextStep = shownZone ? surveyNextStep({
    zones, filesByZone, zoneId: shownZone.id, dirty: dirtyZoneIds.includes(String(shownZone.id)),
    // หัวหน้าที่กรอกพื้นที่จากแบบได้ (ใบยังไม่ล็อก) ถูกพาไปพื้นที่จากแบบที่ยังขาดขนาด/ภาพแบบด้วย (S2b แก้หลังตรวจจอ head-rc-r2-3)
    drawingEditable: canDecide && !view.flags.locked,
    // "ถัดไป: ส่งงาน" เฉพาะคนที่ทำหน้าที่ช่าง — 🐞 review 26/09: หัวหน้าที่ไม่ได้ไปหน้างานไล่ตรวจถึงพื้นที่สุดท้ายแล้วได้ปุ่มส่งงานแทนช่าง
    // (ทาง `?submit=1` ที่หัวหน้าตั้งใจส่งแทนยังใช้ `canSubmitField` เต็มตามเดิม)
    canSubmit: canSubmitField && actsAsCrew,
    // ช่างไม่มีพื้นที่จากแบบในรายการ ⇒ "ถัดไป" ตามลำดับต้องไม่พาเข้าไป (UAT S22/S13 · 12/10)
    hideDrawing,
  }) : null;
  /* "ถัดไป" ของท้ายหน้าพื้นที่ — พื้นที่ที่ยังขาด (ตัวต่อสายถามก่อนทิ้งเอง) หรือกล่องส่งงาน */
  const goNext = (target) => {
    if (target?.kind === "zone") route.open(target.id);
    else if (target?.kind === "submit") openSubmit(null);
  };

  /* ── แผง "แบบจากฝ่ายขาย" (งวด S2b · แผน §3.2 ข้อ 3) ─────────────────────────────────────────────
     ⭐ ขึ้นเฉพาะใบที่มีพื้นที่จากแบบ และเฉพาะคนที่เห็นพื้นที่พวกนั้น (หัวหน้า · ผู้วางคิว) — ช่างไม่มีแผงนี้ · ใบลงหน้างานล้วนไม่มีแผงนี้
     ⭐ **ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" เป็นของหัวหน้าที่เปิดพื้นที่จากแบบที่ยังแก้ได้เท่านั้น** (`reuseZone`) —
        ผู้วางคิว · หน้ารายการ (ไม่มีพื้นที่เปิดอยู่) · พื้นที่ลงหน้างาน · ใบที่ล็อกแล้ว = แกลเลอรีอ่านอย่างเดียว: ไม่ส่ง `onReuse` / `busyKey`
        และ `zoneTitle` เป็น `null` (ไม่พึ่งแค่ `reuse: null` ของตัวตัดสิน)
     · สองบาน (≥1000) = เต็มกว้างเหนือสองบาน · หน้าเดียว (<1000) = เหนือรายการพื้นที่ (ย่อ) และในหัวข้อภาพแบบของหน้าพื้นที่เต็มจอ
     · ธง `showDrawings` คิดไว้ข้างบน (ก่อน "เกี่ยวกับคำร้อง") */
  const drawingsView = showDrawings ? surveySalesDrawingsView({
    requestFiles: data?.requestFiles, threadFiles: data?.threadFiles, zone: shownZone, unknown: data?.unknown,
    editable: drawingZoneEditable,
  }) : null;
  const reuseZone = canDecide && drawingZoneEditable ? shownZone : null;
  const reuseProps = reuseZone ? {
    zoneTitle: surveyZoneTitle(reuseZone),
    busyKey: reuseBusyKey,
    onReuse: (file) => reusePlan(reuseZone.id, file),
  } : null;
  /* สามที่วาง ของชิ้นเดียวกัน: เหนือสองบาน · ในหัวข้อภาพแบบของหน้าพื้นที่เต็มจอ (สองที่นี้ได้ปุ่มเมื่อ `reuseProps` มี) ·
     เหนือรายการพื้นที่ของหน้าเดียว — **ไม่มีปุ่มเสมอ** (ไม่มีพื้นที่ไหนเปิดอยู่ให้รูปไปลง)
     ⭐ **พับไว้หรือกางไว้ตอนเปิดหน้า** (`defaultOpen` · มติเจ้าของ head-r3-31 · ใช้ครั้งแรกเท่านั้น หลังจากนั้นผู้ใช้พับ/กางเอง):
       ผู้วางคิว (`planReader` · ไม่มีปุ่มใช้รูป) = พับทุกจอ · หัวหน้าบนจอไม่แยกบาน (<1000 — เหนือรายการ และในหน้าพื้นที่) = พับ ·
       หัวหน้าบนจอแยกบาน (≥1000) = กางเมื่อไม่เกิน 3 ไฟล์ (🐞 ใบ 5 ไฟล์ จอคอมจอแรกไม่เห็นพื้นที่สักพื้นที่)
       · ในหน้าพื้นที่ (<1000) ที่กางหรือพับเองแล้ว = ใช้ค่าที่ผู้ใช้เลือกต่อในพื้นที่ถัดไป (`zoneDrawingsOpen` — หน้าพื้นที่เกิดใหม่ทุกพื้นที่)
       🔴 **อ่านรายชื่อไฟล์ไม่สำเร็จ (`drawingsView.unknown`) = กางทุกที่ทุกบทบาท** — กล่องเตือนอยู่ในตัวแผง และหน้านี้ไม่มีแถว
          "ไฟล์แนบของคำร้อง" ให้บอกแทนแล้ว (planner-q11) · พับไว้ = หัวการ์ดเหลือแค่ "แบบจากฝ่ายขาย" ไม่มีตัวนับ ดูเหมือนแผงปกติ
          (S2b แก้หลังตรวจจอ head-r3-31 × planner-q11 · อ่านไม่สำเร็จ ≠ ไม่มีไฟล์) */
  const drawingsAbovePanes = showDrawings && split
    ? <SurveySalesDrawings view={drawingsView} defaultOpen={(canDecide && drawingsView.files.length <= 3) || drawingsView.unknown} {...reuseProps} /> : null;
  const drawingsInZone = showDrawings && !split && shownDrawing
    ? <SurveySalesDrawings view={drawingsView} compact defaultOpen={zoneDrawingsOpen ?? drawingsView.unknown} onOpenChange={setZoneDrawingsOpen} {...reuseProps} /> : null;
  const drawingsAboveList = showDrawings && !split
    ? <SurveySalesDrawings view={drawingsView} compact defaultOpen={drawingsView.unknown} /> : null;

  /* ── วันส่งผลของใบงานโต๊ะ (งวด S2b) — ใบที่ประเมินจากแบบทั้งใบไม่มีการลงคิว: หัวหน้า "รับปากวันส่งผล" แล้ว "เลื่อนวันส่งผล" ได้จากการ์ด
     ปุ่มมีหรือไม่ · เป็นปุ่มไหน มาจาก `deskDueAction` (ฐานเดียวกับ route) · ใบที่ยังต้องมีนัด / คนที่ไม่ใช่หัวหน้า = `null` (การ์ดไม่วาดแถว) */
  const deskRequest = { ...req, surveyNeedsVisit: view.needsVisit };
  const deskAction = deskDueAction(deskRequest, { canCommit: canDecide });
  const deskDue = deskAction ? {
    wish: commitDueLabels(deskRequest).wish,
    label: deskAction.label,
    onClick: () => setDeskDueDialog({ mode: deskAction.kind }),
  } : null;

  /* บรรทัดบริบทใต้ชื่อโมดัลเปลี่ยนวิธี — "RQ-… · ไซต์ · นัด SV-… วัน เวลา" จากหัวงานตัวเดียวกับที่จออยู่ (ไม่มีนัด = ไม่มีท่อนนัด)
     ⚠️ ท่อนนัดเป็นก้อนเดียว ไม่มีจุดคั่นระหว่างเลขนัดกับวัน (สเปก A-2 · ม็อก B2) — หัวงานคั่นสองชิ้นนั้นด้วย " · " ซึ่งที่นี่เป็นตัวคั่นของท่อน
     · นัดที่ไม่เปิดแล้วต่อสถานะท้ายท่อน "(ทำไม่ได้)" (ตัวตัดสิน · S2b แก้หลังตรวจจอ head-r3-9 — เดิมอ่านเหมือนนัดที่ยังรออยู่) */
  const visitFact = surveyMethodVisitFact(headerView, visit);
  const methodSubtitle = [
    headerView.request.docNo, headerView.site.name, visitFact?.value ? `นัด\u00a0${visitFact.value.split(" · ").join(" ")}` : null,
  ].filter(Boolean).join(" · ");

  const controlCard = (
    <SurveyControlCard
      view={view}
      busy={sendBusy || recallBusy || sendBackBusy}
      /* ประเมินจากแบบ (งวด S2b) — ปุ่ม "เปลี่ยนวิธีประเมิน" (การ์ดวาดเมื่อ `view.method.show`) · แถววันส่งผลของงานโต๊ะ (`null` = ไม่มีแถว) */
      onSwitchMethod={switchMethod}
      deskDue={deskDue}
      /* เปิดโมดัล **แล้วอ่านใบใหม่เสมอ** (PR-3) — โมดัลต้องวาดจากสวิตช์ออกเอกสาร · ด่าน · คำเตือน ชุดล่าสุด
         (แท็บที่เปิดค้างไว้ข้ามการเปิดสวิตช์ ไม่มีเหตุการณ์โฟกัสให้ตัวอ่านซ้ำอัตโนมัติทำงาน) */
      onSend={() => { setSending(true); load({ background: true }); }}
      onRecall={() => setRecalling(true)}
      onSendBack={() => { setSendingBack(true); setSendBackNote(""); }}
      /* "ออกเอกสาร" ของส่วนเอกสารประเมิน = เปิดกล่องยืนยันที่บอกผลก่อนกด (ออกเลขถาวร · แจ้งผู้ขอ) */
      onIssueDocument={openIssueDialog}
      documentRef={docSectionRef}
      onOpenZone={openZone}
      onGoTab={goTab}
      /* "โหลดใหม่" ข้างเหตุ "อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ" — ทะเบียนมากับ GET ใบประเมิน ⇒ อ่านใบใหม่เบื้องหลัง (ร่างการเคาะไม่หาย) */
      onReload={reloadSheet}
      /* "ตรวจอีกครั้ง" / "โหลดใหม่" ของเอกสารประเมิน — อ่านใบใหม่แล้ว **บอกผล** (อ่านไม่สำเร็จ · ตรวจแล้วยังติดเท่าเดิม) ไม่เงียบเหมือนตัวบน */
      onRecheckDocument={recheckDocument}
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
    /* ด่านรูปจุดของช่าง (G1 · มติ 01/10) — ตัวเดียวกับ route ปิดนัด · ไฟล์ชุดสด (ถ่าย/ผูกแล้วแถบเปลี่ยนทันที) */
    spotReason: surveySpotSubmitReason(zones, filesByZone),
    dirtyZoneIds,
    sendBack: data?.sendBack || null,
    ticks: sendBackTicks,
    doneBlocker: fixedGate,
    split,
    zoneSaveEnabled: split && zoneOpen && (dirtyZoneIds.includes(String(shownZone.id))
      // เพิ่งสลับกลับมาเป็นลงหน้างาน: ปุ่มบันทึกของบานขวาเปิด (กรมท่า) ทั้งที่ไม่มีค่าค้าง — แถบถอยเหมือนกัน
      || (view.flags.canWrite && !!surveyZoneResaveText(shownZone, filesByZone[shownZone.id] || []))),
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
            {/* ชื่อเดียวกับแท็บแรก — ใบที่มีพื้นที่จากแบบไม่ใช่ "หน้างาน" ทั้งใบ (ตัวตัดสิน · ใบเดิม = "หน้างาน") */}
            {view.fieldTabLabel}
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
                {addWords.label}
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
          canLinkSpots={canLinkSpots}
          onOpenSpotTray={openSpotTray}
          showFormula={canDecide}
          /* แถบ "ขนาด" ของช่องแพ็คเกจ + ที่ระบบเสนอ + ด่านร่าง ใช้ทะเบียนเดียวกับการ์ดควบคุม */
          packageSizes={packageSizes}
          onReload={reloadSheet}
          busyZone={busyZone}
          onSaveDecisions={saveDecisions}
          drafts={decisionDrafts}
          onDraftsChange={setDecisionDrafts}
          /* ประเมินจากแบบ (งวด S2b) — ตารางวาดแถว/หัวคอลัมน์ของพื้นที่จากแบบจากสามตัวนี้ (ใบลงหน้างานล้วน = ตารางเดิม)
             ⚠️ การบันทึกที่ชนรุ่นของแถวไม่มี prop แยก — เดินทางกลับในค่าที่ `onSaveDecisions` คืน (`failure.code`) */
          mix={view.mix}
          request={req}
          locked={view.flags.locked}
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
  const listBefore = noticeStack || sendBackCard || (cardInList && controlFirst) || drawingsAboveList ? (
    <>
      {noticeStack}
      {sendBackCard}
      {cardInList && controlFirst ? controlCard : null}
      {/* หน้าเดียว: แบบจากฝ่ายขายอยู่ติดเหนือรายการพื้นที่ (แกลเลอรีอ่านอย่างเดียว — ปุ่มใช้รูปอยู่ในหน้าพื้นที่) */}
      {drawingsAboveList}
    </>
  ) : null;
  const fieldWorkspace = (
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
          /* ใบงานโต๊ะ (งวด S2b): ปุ่มเขียนว่า "เพิ่มพื้นที่" (ไม่ส่ง = คำเดิมของรายการ) · ผู้วางคิวไม่มีปุ่ม ได้บรรทัดเหตุตรงที่ปุ่มเคยอยู่
             (ประโยคเดียวกับที่ server ตอบ) — ช่างไม่มีบรรทัดนี้ · ใบล็อกแล้วไม่มีใครเพิ่มได้ จึงไม่มีเหตุให้บอก */
          addLabel={deskSheet ? addWords.label : null}
          /* ชื่อตำแหน่ง "หัวหน้าฝ่ายบริการ" ห้ามขาดกลางบรรทัด (ที่ 375 เคยเหลือ "บริการ" บรรทัดเดียว · UAT S14 รอบสอง) */
          addBlockedNote={planReader && view.needsVisit === false && !view.flags.locked ? keepPhrases(SURVEY_DESK_ADD_HEAD_ONLY, ["หัวหน้าฝ่ายบริการ"]) : null}
          /* ทางออกทั้งงาน — เปิดกล่องส่งงานที่เลือก "ไปแล้วเข้าไม่ได้" ไว้ให้ (กล่องยังถามเหตุผลก่อนปิดนัด) */
          escape={escape}
          onEscape={canReportUnable ? () => openSubmit("unable") : undefined}
          before={listBefore}
          /* สองบานที่ไม่ได้เปิดพื้นที่ไหน = บานขวาเป็นสถานะว่าง ซึ่งพูดบรรทัดของช่างที่ไม่เหลือพื้นที่ให้วัดเอง ⇒ รายการไม่พิมพ์ซ้ำ
             (S2b แก้หลังตรวจจอ crew-q6) */
          paneEmpty={split && !shownZone}
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
          neighbors={surveyZoneNeighbors(zones, shownZone.id, filesByZone, { hideDrawing })}
          titles={zoneTitles}
          onGoZone={route.open}
          onList={split ? undefined : route.toList}
          next={nextStep}
          onNext={goNext}
          /* พื้นที่จากแบบ: ชนิดคนดูมาจากตัวตัดสินของพื้นที่นั้น (หัวหน้าที่แก้ได้ = มีปุ่มบันทึก · นอกนั้นอ่านอย่างเดียว) —
             พื้นที่ลงหน้างาน = ค่าเดิม (งวด S2b) */
          viewerKind={shownDrawing ? (drawingZoneEditable ? "head" : "readonly") : viewerKind}
          /* ของที่หน้าพื้นที่ใช้วาดพื้นที่จากแบบ (งวด S2b) — พื้นที่ลงหน้างานไม่อ่านสักตัว:
             สิทธิ์เคาะ · ใบล็อกไหม · ฝ่ายของใบ (ป้าย "เพิ่มโดย …") · แผงแบบจากฝ่ายขายของหน้าเต็มจอ · ตัวนับให้ช่องภาพแบบอ่านรายการใหม่ */
          canDecide={canDecide}
          locked={view.flags.locked}
          dept={req.dept}
          drawings={drawingsInZone}
          salesReuseOffered={!!reuseProps && drawingsView?.files.some((file) => file.reuse?.enabled === true) === true}
          planReloadKey={planReloadKey}
          onSave={(payload) => saveZone(shownZone.id, payload)}
          onCut={(zone) => { setCutting(zone); setCutReason(""); setCutError(""); }}
          onRestore={restoreZone}
          onRemove={(zone) => setRemoving(zone)}
          onDirtyChange={handleDirtyZone}
          /* รูปที่อัป/ลบในหน้าพื้นที่รายงานขึ้นมาที่ก้อนรวม — รายการ การ์ดจัดการผล และกล่องส่งงานเห็นทันที */
          onFilesChange={reportFiles}
          onUploadBusy={handleUploadBusy}
          /* ถาด "ยังไม่ได้ผูกจุด" — หัวหน้าผูกได้แม้ใบส่งผลแล้ว (metadata อย่างเดียว · แนบ/ลบยังล็อก) */
          canLinkSpots={canLinkSpots}
          /* ใบที่ส่งผลแล้ว หัวหน้ายังผูก/ย้ายรูปจุดได้ ⇒ บอกตรงหัวข้อจุดว่าทำแล้วเอกสารเปลี่ยนไหม (ออกแล้ว = ไม่เปลี่ยน ·
             ยังไม่ออก = ผูกให้ครบก่อนกดออก) · ประโยคมาจากตัวตัดสิน · คนที่ผูกไม่ได้และใบที่ยังไม่ส่งไม่มีบรรทัดนี้ */
          spotsNote={canLinkSpots && view.flags.sent ? view.document.relinkNote : null}
          jumpToTray={trayJump === String(shownZone.id)}
          onTrayShown={trayShown}
        />
      ) : split ? (
        /* ไอคอนตามเหตุ (`EMPTY_PANE_ICON`) — บรรทัด "หัวหน้าประเมินจากแบบ" ได้ไม้บรรทัด+ดินสอตัวเดียวกับบรรทัดเดียวกันในรายการ (จอแคบ)
           · แว่นขยายเหลือเฉพาะ "ไม่มีพื้นที่ให้วัด" (แว่นบนบรรทัดจากแบบเคยชวนให้คิดว่ามีอะไรให้ค้น — ตรวจจอ crew 26/10) */
        <EmptyState icon={EMPTY_PANE_ICON[listView.emptyReason] || Search}>
          {/* ช่างไม่เหลือพื้นที่ให้วัดเพราะที่เหลือเป็นจากแบบทั้งหมด = บรรทัดของตัวตัดสิน — สองประโยคเดิมเป็นเท็จทั้งคู่ในกรณีนี้
              · ขึ้นที่นี่ที่เดียว: รายการได้ `paneEmpty` แล้วไม่พิมพ์ซ้ำ (crew-q6) */}
          {listView.emptyReason === "drawing" ? listView.drawingNote
            : zones.length ? "ไม่มีพื้นที่ที่ต้องวัดแล้ว — พื้นที่ที่ตัดออกเปิดดูได้จากรายการ" : "ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน"}
        </EmptyState>
      ) : null}
    />
  );
  /* สองบาน: แผงแบบจากฝ่ายขายเต็มกว้างเหนือสองบาน (เปิดไว้ตั้งต้น · ปุ่มใช้รูปชี้ไปพื้นที่ที่บานขวาเปิดอยู่)
     ⚠️ **ห่อด้วย fragment เสมอ แม้ไม่มีแผง** — สองบานต้องอยู่ตำแหน่งเดิมของต้นไม้ทุกสภาพ: แผงโผล่/หาย (หมุนจอข้ามเส้น 1000 ·
        เพิ่งสลับพื้นที่แรกเป็นจากแบบ) แล้วสองบานถูกถอด-ใส่ใหม่ = ร่างที่พิมพ์ค้างในหน้าพื้นที่หายโดยไม่ถาม
        (fragment ไม่มี DOM ของตัวเอง ⇒ ใบที่ไม่มีแผงได้ DOM เดิมทุกจุด) */
  const fieldMain = (
    <>
      {drawingsAbovePanes}
      {fieldWorkspace}
    </>
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
          {/* ใบงานโต๊ะ: ไม่มีป้ายสถานะนัดเก่า เหลือเฉพาะ "นัดยังไม่ปิด" สีอำพัน (ตัวตัดสิน · มติเจ้าของ head-r3-33) */}
          {surveyVisitBadgeShown(visitBadge, { deskOnly: headerView.deskOnly }) ? (
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
              /* ชื่อแท็บแรกมาจากตัวตัดสิน — "หน้างาน" (ใบลงหน้างานล้วน) / "ข้อมูลพื้นที่" (ใบที่มีพื้นที่จากแบบ · งวด S2b) */
              { key: "field", label: view.fieldTabLabel },
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
        /* หัวกล่องกับป้ายที่ฝ่ายขายจะเห็นเดินตามใบ (`addWords`) — ใบงานโต๊ะไม่มีใคร "เจอหน้างาน" */
        title={addWords.label}
        message="พื้นที่นี้จะเข้าทะเบียนของลูกค้าทันทีพร้อมรหัส และเข้าไปอยู่ในผลที่ส่งให้ฝ่ายขาย"
        detail={addWords.detail}
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
        /* กล่องยืนยัน "ตัดพื้นที่และยกเลิกนัด" ขึ้นแทน = กล่องนี้หลบ (พื้นที่กับเหตุผลยังถืออยู่ — คำยืนยันใช้ทั้งคู่) */
        open={!!cutting && !flipBox}
        title={cutting ? `ตัด ${surveyZoneTitle(cutting)} ออกจากใบนี้` : "ตัดพื้นที่ออก"}
        /* พื้นที่จากแบบไม่มีใครไปถึงห้อง ⇒ ไม่เล่าเรื่องหน้างาน เหลือบรรทัดผล (`detail`) · พื้นที่ลงหน้างานคำเดิมทุกตัวอักษร */
        description={cutting && isDrawingZone(cutting)
          ? undefined : "เข้าห้องนี้ไม่ได้ หรือไม่ต้องวัด — ตัดได้โดยไม่ต้องมีขนาดหรือรูป"}
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

      {/* ── หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด (งวด S2b · แผน §3.3) ────────────────────────────
          ⭐ **บอกผลทุกข้อก่อนกด** (กติกาโมดัลบอกผลลัพธ์ #1223) — ใบกลายเป็นงานประเมินจากแบบ · นัดถูกยกเลิก · ช่างได้รับแจ้ง ·
             วันส่งผลที่หัวหน้ารับปาก · บรรทัดถึงฝ่ายขาย: รายการมาจากแผนของ server ตัวเดียวกับที่มันจะเขียน (หน้าไม่แต่งประโยคผลเอง)
          🔑 เกิดได้ทางเดียว: เส้นตัดตอบรหัส `survey_flip_confirm` (สวิตช์เปิด + หัวหน้า) — ไม่มีรหัสนี้ กล่องนี้ไม่มีวันเปิด
          ⚠️ เนื้อกล่องคือชุดที่คัดลอกไว้ตอนเปิด (`flipBox`) · ล้ม = error ขึ้นในกล่องนี้ · ใบถูกแก้จากที่อื่น = ปุ่มเดียว "ปิด" */}
      <ConfirmDialog
        open={!!flipBox}
        tone="warning"
        title={flipBox?.title}
        message={flipBox?.message}
        confirmLabel={flipBox?.dead ? "ปิด" : flipBox?.confirmLabel}
        /* ปุ่มเงียบ = "ปิด" เหมือนกล่องวิธีประเมิน — "ยกเลิก" ติดกับ "ตัดพื้นที่และยกเลิกนัด" กดผิดปุ่มเดียวนัดหาย
           (มติเจ้าของ head-r3-1 · S2b แก้หลังตรวจจอ) */
        cancelLabel="ปิด"
        hideCancel={flipBox?.dead === true}
        busy={flipBusy}
        onConfirm={flipBox && !flipBox.dead ? confirmFlipCut : undefined}
        onClose={() => !flipBusy && closeFlipBox()}
      >
        {flipBox && !flipBox.dead ? (
          <>
            {flipBox.lines.length ? (
              <div className={styles.effects}>
                <p className={styles.effectsTitle}>กดแล้วเกิดขึ้นทันที</p>
                <ul className={styles.effectList}>
                  {flipBox.lines.map((line) => <li key={line}>{thaiText(line)}</li>)}
                </ul>
              </div>
            ) : null}
            {flipBox.needsDate ? (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="survey-flip-result-date">
                  {SURVEY_METHOD_RESULT_DATE_LABEL}<span className="required-mark" aria-hidden="true"> *</span>
                </label>
                <DateInput
                  id="survey-flip-result-date"
                  value={flipBox.resultDate}
                  onChange={setFlipDate}
                  required
                  weekday
                  disabled={flipBusy || flipBox.pinned}
                  invalid={flipBox.dateMissing}
                  aria-describedby={flipBox.dateMissing ? "survey-flip-result-date-error" : undefined}
                />
                {flipBox.dateMissing ? (
                  <p className={styles.fieldError} id="survey-flip-result-date-error" role="alert">{SURVEY_METHOD_ERRORS.resultDate}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </ConfirmDialog>

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
      {/* ⭐ **ใบที่มีพื้นที่จากแบบ** (งวด S2b · แผน §3.2 · ม็อก B3) — หัวกล่องเป็นของตัวตัดสิน (`sendConfirm.title`) · กล่องกว้างขึ้นหนึ่งขั้น ·
          คำถามบังคับ "ต้องเข้ายืนยันหน้างานภายหลังไหม" เป็นไทล์สองใบ **เหนือ** รายการผล (ไม่มีใบที่ถูกเลือกไว้ · เลือกแล้วรายการผลเปลี่ยนตาม)
          ⚠️ ใบลงหน้างานล้วน: `sendConfirm` ไม่มี `title` / `choice` ⇒ หัวเดิม · ขนาดเดิม · เนื้อเดิมทุกจุด
          ⚠️ หัวตั้งต้นคงเป็นตัวหนังสือบนแท็กนี้ (เทสต์สามไฟล์หากล่องนี้จากบรรทัดนั้น) — หัวของใบจากแบบทับด้วย `sendTitle` ที่ตามหลัง */}
      <ConfirmDialog
        open={sending}
        title="ส่งผลประเมินให้ฝ่ายขาย"
        {...sendTitle}
        size={sendConfirm.choice ? "md" : "sm"}
        /* 🔑 เหตุผลเต็มของด่าน server — ไม่ใช่บรรทัดย่อของราง (บรรทัดย่อมีไว้ให้ราง
           กว้าง 330px อ่านได้ ไม่ได้มีไว้แทนเหตุผล) */
        /* ⚠️ ใบถูกล็อกระหว่างที่กล่องเปิด (หัวหน้าอีกคนส่งไปก่อน) = บอกสถานะล่าสุด ไม่ใช่ตัวเลขชวนส่ง */
        /* เหตุหลายข้อของเอกสารประเมิน = บรรทัดนำของตัวตัดสิน แล้วรายการข้อละบรรทัดข้างล่าง (🐞 UAT PR-3: ประโยคเต็มต่อเหตุด้วย " | ") */
        message={!view.send.show ? `${view.status.headline} — ${view.status.sub}`
          : sendBlockedItems.length ? view.send.reason.lead
          : view.send.reason?.detail || view.send.reason?.text
          || `ส่งผล ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${surveyPackagesLabel(totals, packageSizes)}`}
        /* ส่งไม่ได้แล้ว = ปุ่มเดียว "ปิด" — ปุ่มที่เขียนว่า "ส่งผล" แต่กดแล้วแค่ปิดกล่อง คือปุ่มที่โกหก */
        confirmLabel={view.send.allowed ? sendConfirm.confirmLabel : "ปิด"}
        hideCancel={!view.send.allowed}
        busy={sendBusy}
        /* `confirmSend` = ยังไม่ตอบคำถามของใบจากแบบ → บอกใต้ไทล์ ไม่ยิง · ตอบแล้ว/ไม่ต้องถาม → `send()` ตัวเดิม */
        onConfirm={view.send.allowed ? confirmSend : undefined}
        /* การตีกลับที่พกรายชื่อไฟล์ (รูปเปิดไม่ได้) ต้องอยู่ต่อหลังปิดกล่อง — เก็บไว้ให้กล่องแจ้งบนการ์ด (PR-3) */
        onError={rememberSendRefusal}
        onClose={() => !sendBusy && setSending(false)}
      >
        {view.send.allowed ? (
          <>
            {sendConfirm.choice ? (
              <div className={styles.field}>
                <p className={styles.fieldLabel}>
                  {sendConfirm.choice.question}<span className="required-mark" aria-hidden="true"> *</span>
                </p>
                <OptionTiles
                  options={sendChoiceOptions}
                  value={sendChoice}
                  onChange={pickSendChoice}
                  invalid={sendChoiceMissing}
                  disabled={sendBusy}
                  ariaLabel={sendConfirm.choice.question}
                />
                {sendChoiceMissing ? (
                  <p className={styles.fieldError} role="alert">{sendConfirm.choice.missing}</p>
                ) : null}
                {/* ไทล์เอ่ยถึงปุ่ม "ขอยืนยันหน้างาน" ของฝ่ายขายที่ยังไม่เปิดใช้ — บรรทัดนี้กันหัวหน้าไปรับปากแทน (หายเองเมื่อปุ่มมีจริง) */}
                {sendConfirm.choice.pendingNote ? (
                  <p className={styles.fieldNote}>{thaiText(sendConfirm.choice.pendingNote)}</p>
                ) : null}
              </div>
            ) : null}
            <div className={styles.effects}>
              <p className={styles.effectsTitle}>กดแล้วเกิดขึ้นทันที</p>
              <ul className={styles.effectList}>
                {sendConfirm.effects.map((line) => <li key={line}>{thaiText(line)}</li>)}
              </ul>
            </div>
          </>
        ) : sendBlockedItems.length ? (
          <ul className={styles.effectList}>
            {sendBlockedItems.map((line) => <li key={line}>{thaiText(line)}</li>)}
          </ul>
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
        message={`ตัวเลขที่ส่งไปแล้ว (${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${surveyPackagesLabel(totals, packageSizes)}) จะถูกถอนออกจากมือฝ่ายขาย`}
        /* บรรทัดรองมาจากตัวตัดสิน (PR-3) — ประโยคเดิม + เอกสาร SU ที่จะถูกแทนที่ทันที (หรือ "อ่านสถานะเอกสารไม่สำเร็จ")
           ⚠️ บรรทัดใต้ปุ่มบนการ์ดถูกซ่อนที่จอ ≤1050 ⇒ กล่องนี้ต้องพกเรื่องเอกสารเองทุกขนาดจอ */
        detail={view.recallAction.detail}
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

      {/* ── ออกเอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU · PR-3) ─────────────────────────────
          ⭐ **บอกผลทุกข้อก่อนกด** (กติกาโมดัลบอกผลลัพธ์ #1223) — ออกเลขถาวร · ตรึงสองฉบับ · ผู้ขอได้รับแจ้ง · ข้อความที่จะพิมพ์ตามที่กรอก
          🔑 **เนื้อกล่องคือชุดที่คัดลอกไว้ตอนเปิด** (`issueDialog`) ไม่อ่านจากใบสด — ใบสดไม่มีเนื้อกล่องให้แล้วในจังหวะที่กล่องต้องบอกเหตุ
             ที่ถูกตีกลับ (ผลถูกดึงกลับ · คำตอบเปลี่ยน) · **ปุ่มเท่านั้นที่เดินตามใบสด**: ออกไม่ได้แล้ว = ปุ่มเดียว "ปิด" พร้อมสถานะล่าสุดของ
             ส่วนเอกสาร — ป้ายนำ แล้วตามด้วยข้อความของกล่องสถานะ (ปุ่มที่เขียนว่า "ออกเอกสาร" แต่กดแล้วไม่ออก คือปุ่มที่โกหก — ท่าเดียวกับโมดัลส่งผล)
          ⚠️ ล้ม = error ขึ้นในกล่องนี้ (ประโยคของ server บอกทางออกในตัว) — ประโยคนั้นอยู่ในกล่องแดงที่เดียว ไม่ซ้ำเป็นข้อความของกล่อง
             · กดรัว = ด่านกำลังทำงานของกล่องเอง */}
      <ConfirmDialog
        open={!!issueDialog}
        title={issueDialog?.title}
        message={issueAllowed ? issueDialog?.message : issueBlockedLead}
        detail={issueAllowed ? issueDialog?.detail : issueBlockedDetail}
        confirmLabel={issueAllowed ? issueDialog?.confirmLabel : "ปิด"}
        busyLabel={issueDialog?.busyLabel}
        hideCancel={!issueAllowed}
        busy={issueBusy}
        onConfirm={issueAllowed ? issueDocument : undefined}
        onClose={() => !issueBusy && setIssueDialog(null)}
      >
        {issueAllowed && issueDialog ? (
          <div className={styles.effects}>
            <p className={styles.effectsTitle}>กดแล้วเกิดขึ้นทันที</p>
            <ul className={styles.effectList}>
              {issueDialog.effects.map((line) => <li key={line}>{thaiText(line)}</li>)}
            </ul>
          </div>
        ) : null}
      </ConfirmDialog>

      {/* ── เปลี่ยนวิธีประเมินรายพื้นที่ (งวด S2b · แผน §3.3 · ม็อก B2) ────────────────────────────────────
          🔑 เมานต์เฉพาะคนที่มีปุ่ม (`view.method.show` — สวิตช์เปิด + หัวหน้า + ใบยังไม่จบ) ⇒ ใบของวันนี้ไม่มีโมดัลนี้ในต้นไม้เลย
             (`methodOpen` พ่วงไว้ให้กล่องที่กำลังบอกว่า "ใบถูกแก้จากที่อื่น" ไม่หายไปพร้อมปุ่ม ตอนใบที่อ่านใหม่ทำให้ปุ่มหมดสิทธิ์)
          ⚠️ ตัวโมดัลคิดผลจากแถวพื้นที่ · นัด · เรื่องส่งกลับ ชุดเดียวกับที่ server จะใช้ และยิงเส้นสลับวิธีเอง — หน้าแค่เปิด/ปิด · toast · อ่านใบใหม่ */}
      {view.method.show || methodOpen ? (
        <SurveyMethodDialog
          open={methodOpen}
          requestId={id}
          request={req}
          zones={zones}
          visit={visit}
          siteReached={data?.siteVisitReached ?? null}
          sendBack={data?.sendBack || null}
          subtitle={methodSubtitle}
          onClose={closeMethodDialog}
          onDone={methodDone}
          /* ใบถูกแก้จากที่อื่นระหว่างกล่องเปิด = อ่านใบใหม่เบื้องหลัง กล่องยังอยู่บอกเหตุ (เหลือปุ่ม "ปิด") */
          onStale={reloadSheet}
        />
      ) : null}

      {/* ── วันส่งผลของใบงานโต๊ะ (งวด S2b) — โมดัลตัวเดียวกับหน้าคำร้อง ทรง "รับปาก" / "เลื่อน" ตามที่เปิดมา ──
          ⚠️ `surveyNeedsVisit: false` ตรงตัว = ทรงงานโต๊ะของโมดัล (วันส่งผลอย่างเดียว · ไม่มีช่าง ไม่มีด่านนัด) — ปุ่มที่เปิดกล่องนี้มีเฉพาะใบงานโต๊ะ
          ⚠️ ไม่ส่งรายชื่อเจ้าหน้าที่ — ทรงนี้ไม่มีตัวเลือกคน */}
      <CommitDueDialog
        open={!!deskDueDialog}
        request={{ ...req, surveyNeedsVisit: false }}
        mode={deskDueDialog?.mode}
        today={businessDate()}
        busy={deskDueBusy}
        onClose={() => !deskDueBusy && setDeskDueDialog(null)}
        onSubmit={submitDeskDue}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
