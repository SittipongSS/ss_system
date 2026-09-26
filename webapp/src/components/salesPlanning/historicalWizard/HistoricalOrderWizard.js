"use client";
// ── ฟอร์มคีย์ใบสั่งขายย้อนหลัง (หน้าเต็ม 4 ขั้น · มติเจ้าของ 22/09 · mig 0374) ──────────────────
//
// ⭐ **สร้าง = แก้ component ตัวเดียว** (กฎ AGENTS.md) — ต่างกันแค่ `orderId` ที่หน้าเรียกส่งมา
//    · ไม่มี orderId = สร้างใบใหม่ (POST …/historical)
//    · มี orderId    = แก้ใบร่าง/ใบที่ถูกตีกลับ (PATCH …/historical/[id]) ฟอร์มหน้าตาเดียวกันทุกช่อง
// ⭐ **พรีวิวจาก server ด้วยตัวตัดสินชุดเดียวกับตอนบันทึก** (บทเรียน #1685) — ทั้งสองโหมดยิงเส้นเดียวกัน
//    ด้วย body ที่ประกอบจากตัวเดียว (`historicalWizardBody`) ต่างแค่ `preview`
// ⭐ **ปุ่มเดียวเดินหลายจังหวะ** (`nextSaveStage`) — ไฟล์เอกสารแทนสัญญาและหลักฐานงวดยกมาเกิดก่อนใบไม่ได้:
//      ① สร้าง/แก้ใบ → ② อัปไฟล์สัญญา → ③ อัปหลักฐาน → ④ แก้ใบผูก ref หลักฐาน → ⑤ ส่งอนุมัติ
//    ระหว่างทางถ้าพัง กดใหม่ได้ทันทีโดย **ไม่สร้างใบซ้ำและไม่อัปไฟล์ซ้ำ** (ทั้งสองอย่างถูกจำไว้)
// ⭐ หลัง ① สำเร็จ ฟอร์มเปลี่ยน URL เป็นเส้นแก้ใบด้วย `window.history.replaceState` (Next รองรับ —
//    node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md) ⇒ component
//    ตัวเดิมกลายเป็นโหมดแก้ใบทันที · รีโหลดแล้วได้ใบจากฐาน ไม่เสียงานที่พิมพ์ไว้
//
// ⚠️ **ห้ามส่ง `retry: true`** — route เขียนห้ามไว้ (สร้างซ้ำ/PATCH ซ้ำตอบคนละเรื่องกับความจริง)
// ⚠️ ตรรกะฝั่งจอทั้งหมดอยู่ที่ `lib/sales/historicalIntakeForm.js` (ทดสอบได้โดยไม่ต้องเรนเดอร์)
// ⭐ ขั้น ④ (มติเจ้าของ 25/09 — "ตรวจแบบผู้อนุมัติ"): ความคืบหน้า/ผลของการบันทึกอยู่ใน **แผงบันทึก** เหนือแถบท้าย
//    (`historicalSaveStages` / `historicalSaveResultView` — lib/sales/historicalReviewView.js) · ปุ่มหลักมีตัวเดียว
//    ลองใหม่ = ปุ่ม "บันทึกและส่งอนุมัติ" ตัวเดิมซึ่งผ่านด่านใบซ้ำทุกครั้ง (ของเดิมมี "บันทึกอีกครั้ง" ตัวที่สองที่ข้ามด่าน)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import Button from "@/components/ui/Button";
import { ActionButton } from "@/components/ui/ActionButtons";
import SectionRail from "@/components/ui/SectionRail";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import { WorkflowRail } from "@/components/ui/DocumentControlPanel";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { cachedFetchJson, dropCache } from "@/lib/apiCache";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { useCan, useRole, useTeams } from "@/lib/roleContext";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import useDealOwners from "@/lib/sales/useDealOwners";
import { customerSelectOptions } from "@/components/master/customerOption";
import { EXTERNAL_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { userTeams, ROLE_LABELS } from "@/lib/permissions";
import { salesPlanningEditScope } from "@/lib/salesPlanning";
import {
  HISTORICAL_EDITABLE_STATUSES,
  canKeyHistoricalSalesOrder, historicalEditPath, isHistoricalOrder,
} from "@/lib/sales/historicalOrders";
import {
  HISTORICAL_SAVE_BUTTON_LABEL, HISTORICAL_SAVE_STAGES, HISTORICAL_TERMS_LOAD_FAILED, HISTORICAL_WIZARD_STEPS,
  HISTORICAL_WIZARD_STEP_ORDER, emptyHistoricalWizard, emptySaveProgress,
  firstStepWithIssues, historicalAsideRows, historicalContractDateWarnings, historicalContractFileCount,
  historicalDuplicateGate,
  historicalDocStatusLabel, historicalFieldAnchorId, historicalFootNote, historicalIssuesWithRowKeys, historicalMoneyView,
  historicalMergeIssues, historicalNextBlock, historicalPruneIssues, historicalSaveExit, historicalZeroValue,
  historicalStepHasInput, historicalTeamField, historicalVisibleIssues, historicalWizardBody,
  historicalWizardLocalIssues, historicalWizardRail, historicalZonesWithPlanPrices, issuesForStep,
  newHistoricalIntakeKey, nextSaveStage, saveProgressAfter, wizardStateFromOrder,
} from "@/lib/sales/historicalIntakeForm";
import {
  historicalKeyerMode, historicalReviewFootNote, historicalSaveResultView, historicalSaveStages, historicalSubmitToast,
  historicalWarningGroups,
} from "@/lib/sales/historicalReviewView";
import { uploadContractFiles, uploadOpeningEvidence } from "@/lib/sales/historicalWizardUploads";
import { createFormTermsState } from "@/lib/sales/salesOrderCreateInstallments";
import WizardContractStep from "./WizardContractStep";
import WizardZonesStep from "./WizardZonesStep";
import WizardMoneyStep from "./WizardMoneyStep";
import WizardReviewStep from "./WizardReviewStep";
import styles from "./HistoricalOrderWizard.module.css";

const REGISTER_PATH = "/sa/sales-orders";
const ORDER_PATH = (id) => `/sa/sales-orders/${id}`;
const HISTORICAL_PATH = "/api/sales-planning/sales-orders/historical";
const SAVE_ERROR = "บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ";
/* FG ของนิติบุคคลของลูกค้า — `taxSiblings=1` รวมใบอื่นที่เลขผู้เสียภาษีเดียวกัน (กติกาเดียวกับหน้าออกใบเสนอราคา)
   ⚠️ ที่เดียวของ URL นี้ — ตัวโหลดกับตัวทิ้งแคช (`dropCache`) ต้องชี้คีย์เดียวกันเป๊ะ */
const PRODUCTS_PATH = (customerId) => `/api/products?customerId=${encodeURIComponent(customerId)}&taxSiblings=1`;

/* คีย์ของไฟล์ในตะกร้า = ตัวเดียวกับที่ `PendingFiles` ใช้ ⇒ อัปแล้วจำได้ว่าใบไหนอัปไปแล้ว */
const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;

export default function HistoricalOrderWizard({ orderId = null }) {
  const router = useRouter();
  const role = useRole();
  const myTeams = useTeams();
  const canEdit = useCan("salesplan:edit");
  const canKey = canKeyHistoricalSalesOrder({ role });

  const [state, setState] = useState(() => emptyHistoricalWizard());
  const [step, setStep] = useState("contract");
  const [intakeKey] = useState(() => newHistoricalIntakeKey());
  const [plan, setPlan] = useState(null);
  /* ⭐ R7 (ครึ่ง server): "ครึ่งเงิน" ของแผนที่พรีวิวส่งมาพร้อม 400 (`data.money`) — ยอดใบของ server
     ที่ใช้ได้ทั้งที่ฟอร์มยังมี error ⇒ ขั้น ③ ไม่ต้องคิดเลขคู่ขนานอีกชุด · `null` = server บอกว่า
     ยังคิดยอดไม่ได้ (หรือยังไม่เคยกดตรวจ) ⇒ ถอยไปคิดเองใน `historicalMoneyView` */
  const [serverMoney, setServerMoney] = useState(null);
  const [issues, setIssues] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [blockedNote, setBlockedNote] = useState(null);
  /* ⭐ แผงบันทึก (ขั้น ④ · มติ 25/09) — `saveRun` = กำลังบันทึกจังหวะไหน นับไฟล์ไปกี่ไฟล์แล้ว · `saveFailure` = ผลที่ล้ม
     (ทางออก · จังหวะที่ล้ม · ใบร่างที่ลงฐานแล้ว · ไฟล์ที่อัปไม่ขึ้น) · อยู่นอกเนื้อขั้น ⇒ รอดการพาไปขั้นอื่น · ล้างทุกครั้งที่แก้ฟอร์ม
     ⚠️ `error` ข้างล่างเหลือไว้เฉพาะเรื่องที่ไม่ใช่การบันทึก (ไฟล์ใหญ่เกิน · ตรวจข้อมูลไม่สำเร็จ) */
  const [saveRun, setSaveRun] = useState(null);
  const [saveFailure, setSaveFailure] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(null);
  const [hydrating, setHydrating] = useState(Boolean(orderId));
  const [contractId, setContractId] = useState(null);
  /* ⭐ สองตัวนับของไฟล์เอกสารแทนสัญญา (รีวิว R6) — ดูหัว `historicalContractFileCount`
     · `panelContractFiles` = ของจริงที่แผงไฟล์แนบรายงานมา (นับเฉพาะ external_doc) · null = ยังไม่รายงาน
     · `hydratedContractFiles` = จำนวนที่ติดมากับใบตอนเปิดฟอร์ม — ที่ถอยไปใช้ระหว่างรอแผง */
  /* ⭐ ขั้น ④ ต้องรู้ **ชื่อ** ของไฟล์ ไม่ใช่แค่จำนวน (แถว "ไฟล์หลักฐานลงนาม" = ไฟล์แรกที่แนบ) ⇒ เก็บรายการ external_doc
     เรียงตามเวลาแนบ · จำนวนอ่านจากความยาวของรายการเดียวกัน (ตัวนับกับชื่อจึงไม่พูดคนละเรื่อง) */
  const [panelContractItems, setPanelContractItems] = useState(null);
  const panelContractFiles = panelContractItems ? panelContractItems.length : null;
  const [hydratedContractFiles, setHydratedContractFiles] = useState(null);
  const [hydratedContractNames, setHydratedContractNames] = useState([]);
  /* อัปไฟล์สัญญาสำเร็จแล้วแผงต้องอ่านใหม่ — มันโหลดตอน mount/เปลี่ยน entityId เท่านั้น
     ⇒ เลขนี้ถูกใช้เป็น React key ของแผง (บวกหนึ่ง = remount = fetch ใหม่) */
  const [contractFilesVersion, setContractFilesVersion] = useState(0);
  const [contractFiles, setContractFiles] = useState([]);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersError, setCustomersError] = useState("");
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState("");
  /* ผู้คีย์ = ผู้ใช้ที่ล็อกอิน (ไม่ใช่ AE เจ้าของใบ) — ขั้น ④ บอก "คีย์โดย …" และตัดสินคำของขั้นผู้อนุมัติจากตำแหน่งของคนนี้ */
  const [me, setMe] = useState(null);
  const meId = me?.id || null;

  /* ไฟล์ที่อัปสำเร็จแล้วในรอบนี้ (คีย์ไฟล์ → ref) — กดใหม่ต้องไม่อัปซ้ำ (retry-must-not-reupload) */
  const uploadedContract = useRef(new Map());
  const uploadedEvidence = useRef(new Map());
  /* ชื่อไฟล์เอกสารแทนสัญญาที่อัปสำเร็จในรอบนี้ (ตามลำดับ) — แถว "ไฟล์หลักฐานลงนาม" ของขั้น ④ ต้องรู้ไฟล์ที่ขึ้นไปแล้ว
     แม้แผงไฟล์แนบ (ขั้น ①) ไม่ได้เรนเดอร์อยู่ (รีวิวขั้น ④ 25/09: อัปขึ้น 1 ไฟล์แล้วไฟล์ถัดไปล้ม ⇒ แถวเคยชี้ไฟล์ที่ล้ม) */
  const uploadedContractNames = useRef([]);
  const progressRef = useRef(null);
  const [dirty, setDirty] = useState(false);
  const dupSwitchRef = useRef(null);
  /* แผงผลการบันทึกที่ล้ม — เลื่อนมาให้เห็นและโฟกัส (ปุ่มกดแล้วผลอยู่นอกจอ = อ่านเหมือนปุ่มตาย) */
  const savePanelRef = useRef(null);
  /* ช่องที่ต้องพาไปหาหลังกดปุ่มที่ติดด่าน — เก็บเป็น state เพราะจอต้องวาดเครื่องหมาย "ผิด"
     ให้เสร็จก่อน แล้วค่อยเลื่อน/โฟกัส (อ่านชื่อช่องจาก `historicalNextBlock`) */
  const [focusField, setFocusField] = useState(null);
  /* ⭐ มติเจ้าของ 25/09: ก้อนแดงขึ้นหลังกดไปต่อเท่านั้น ทุกขั้น — ขั้นที่ผู้คีย์เคยกด "ถัดไป"/แตะขั้นข้างหน้า/บันทึกจากมันแล้ว
     (ดูหัว `historicalVisibleIssues`) · ด่านของปุ่มยังอ่านข้อครบเสมอ ซ่อนแค่การแสดงก่อนผู้คีย์พยายามไปต่อ */
  const [revealedSteps, setRevealedSteps] = useState(() => new Set());
  const reveal = useCallback((key) => {
    if (!key) return;
    setRevealedSteps((current) => (current.has(key) ? current : new Set([...current, key])));
  }, []);
  const todayIso = businessDate();

  useEffect(() => {
    let alive = true;
    apiJson("/api/users/me", { fallbackError: "อ่านข้อมูลผู้ใช้ไม่สำเร็จ" })
      .then((user) => { if (alive) setMe(user?.id ? { id: user.id, name: user.name || null } : null); })
      .catch(() => { if (alive) setMe(null); });
    return () => { alive = false; };
  }, []);

  const { owners, lockedOwner } = useDealOwners(meId);

  /* ── โหมดแก้ใบ: ดึงใบจากฐาน **ครั้งเดียวตอน mount** ────────────────────────────────
     ⚠️ ห้ามดึงซ้ำหลังบันทึกจังหวะแรก — component ตัวเดิมเปลี่ยน URL เป็นเส้นแก้ใบเอง
     (replaceState) ถ้าดึงใหม่ตรงนั้นจะเขียนทับของที่ผู้คีย์พิมพ์ค้างไว้ */
  useEffect(() => {
    if (!orderId) return undefined;
    let alive = true;
    setHydrating(true);
    (async () => {
      try {
        const order = await apiJson(`/api/sales-planning/sales-orders/${orderId}`, {
          fallbackError: "โหลดใบสั่งขายย้อนหลังไม่สำเร็จ",
        });
        if (!alive) return;
        if (!isHistoricalOrder(order)) {
          setReadOnly("ใบนี้ไม่ใช่ใบสั่งขายย้อนหลัง — เปิดที่หน้าใบสั่งขายตามปกติ");
          return;
        }
        if (!HISTORICAL_EDITABLE_STATUSES.includes(order.status)) {
          setReadOnly(order.status === "pending_approval"
            ? "ใบนี้ส่งอนุมัติไปแล้ว — ดึงกลับที่หน้าใบสั่งขายก่อนจึงแก้ได้"
            : "ใบนี้แก้ในฟอร์มคีย์ใบไม่ได้แล้ว — ดูสถานะที่หน้าใบสั่งขาย");
          return;
        }
        setState(wizardStateFromOrder(order));
        setContractId(order.serviceContract?.id || order.serviceContractId || null);
        /* 🔴 นับเฉพาะ `external_doc` — ชนิดเดียวที่ RPC ส่งอนุมัติยอมรับ (0374) · นับทุกชนิด =
           ด่านบนจอผ่านด้วยไฟล์ที่ฐานไม่รับ แล้วไปตายที่จังหวะสุดท้ายของการบันทึก */
        const externalDocs = (order.serviceContractFiles || []).filter((file) => file?.docType === EXTERNAL_DOC_TYPE);
        setHydratedContractFiles(externalDocs.length);
        /* ⭐ ไฟล์หลักฐานลงนาม = `signedFileCandidate` ของ server (signedFileId หรือ external_doc ใบแรกตามเวลาแนบ) ⇒ ขึ้นก่อน */
        setHydratedContractNames([
          ...externalDocs.filter((file) => file.signedFileCandidate),
          ...externalDocs.filter((file) => !file.signedFileCandidate),
        ].map((file) => file.fileName).filter(Boolean));
      } catch (loadError) {
        if (alive) setReadOnly(loadError?.message || "โหลดใบสั่งขายย้อนหลังไม่สำเร็จ");
      } finally {
        if (alive) setHydrating(false);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  /* 🐞 **N4** — ทางออกของก้อน "โหลดทะเบียนไม่สำเร็จ" เคยเป็น `window.location.reload()` ทั้งที่
     ฟอร์มนี้ติด `useUnsavedChanges` อยู่ ⇒ ผู้คีย์ที่พิมพ์อะไรไว้แล้วกดปุ่มนั้นเจอโมดัล
     "ออกจากหน้านี้ไหม" ของเบราว์เซอร์ (ยาม dirty ไม่รู้ว่าเรากำลังจะโหลดใหม่เอง) และถ้ากดออก
     **ของที่คีย์ไว้หายทั้งใบ** เพื่อแก้เรื่องที่แค่ยิงสองเส้นใหม่ก็จบ
     ⇒ ยิงใหม่ที่เดิมด้วยตัวนับรอบ (dep ของทั้งสองเอฟเฟกต์) · `cachedFetchJson` ไม่เก็บผลที่พัง
       ⇒ รอบใหม่คือคำขอจริง ไม่ใช่คำตอบเก่าในแคช */
  const [registryRound, setRegistryRound] = useState(0);
  /* 🐞 ธง "กำลังโหลด…" ของปุ่มนี้ต้องคลุม **ทั้งสองเส้น** — ของเดิมมีธงเดียวที่ล้างใน `.finally()`
     ของเส้นลูกค้าเท่านั้น ⇒ เส้นสินค้าตอบช้ากว่าเมื่อไร (คนละคำขอ คนละขนาด) ปุ่มกลับมากดได้ก่อน
     ทั้งที่ทะเบียนสินค้ายังค้างอยู่ ⇒ กดรอบสองซ้อนรอบแรก แล้วอ่านผลว่า "กดแล้วไม่เกิดอะไร"
     ⇒ ธงรายเส้น ปุ่มอ่านผลรวม · ธงตั้งที่หัวเอฟเฟกต์ด้วย ไม่ใช่แค่ตอนกดปุ่ม เพราะรอบแรก
       (ตอน mount / ตอนเปลี่ยนลูกค้า) ก็เป็นการอ่านทะเบียนที่ปุ่มต้องไม่โกหกทับ
     ⚠️ เส้นสินค้าที่ยังไม่มีลูกค้า = ไม่มีคำขอ ⇒ ต้องล้างธงในสาขานั้นด้วย ไม่งั้นปุ่มดับค้างตลอด */
  const [customersBusy, setCustomersBusy] = useState(false);
  const [productsBusy, setProductsBusy] = useState(false);
  const registryBusy = customersBusy || productsBusy;
  const reloadRegistries = useCallback(() => {
    setCustomersBusy(true);
    setProductsBusy(true);
    setRegistryRound((round) => round + 1);
  }, []);

  /* 🐞 รีวิว R9: สองเส้นนี้เคย `.catch(() => setRows([]))` เฉย ๆ ⇒ **โหลดพังอ่านเหมือนทะเบียนว่าง**
     แล้วจอบอกเหตุผิด ("ลูกค้ารายนี้ยังไม่มีสินค้าหมวด 02-001 ในทะเบียน") ⇒ ผู้คีย์ไปไล่ทีม
     ทะเบียนสินค้าให้สร้างแพ็คเกจที่มีอยู่แล้ว · โหมดแก้ใบหนักกว่า: ชื่อลูกค้าของใบกลายเป็นขีด
     และแพ็คเกจของแถวที่เลือกไว้แล้วเด้งกลับเป็น placeholder
     ⇒ เก็บเหตุไว้เป็น state แล้วส่งลงไปให้ทุกช่องที่ต้องพูดคนละคำเมื่อ "โหลดไม่ขึ้น" */
  useEffect(() => {
    let alive = true;
    setCustomersBusy(true);
    cachedFetchJson("/api/customers")
      .then((rows) => { if (alive) { setCustomers(Array.isArray(rows) ? rows : []); setCustomersError(""); } })
      .catch((loadError) => {
        if (alive) { setCustomers([]); setCustomersError(loadError?.message || "โหลดทะเบียนลูกค้าไม่สำเร็จ"); }
      })
      .finally(() => { if (alive) setCustomersBusy(false); });
    return () => { alive = false; };
  }, [registryRound]);

  /* FG ของนิติบุคคลของลูกค้าที่เลือก (`PRODUCTS_PATH`)
     ⭐ `productsRound` = อ่านใหม่หลังพรีวิวพบว่าราคาในทะเบียนขยับจากลิสต์ที่แคชไว้ (ดู `runPreview`) */
  const customerId = state.customerId;
  const [productsRound, setProductsRound] = useState(0);
  useEffect(() => {
    if (!customerId) { setProducts([]); setProductsError(""); setProductsBusy(false); return undefined; }
    let alive = true;
    setProductsBusy(true);
    cachedFetchJson(PRODUCTS_PATH(customerId))
      .then((rows) => { if (alive) { setProducts(Array.isArray(rows) ? rows : []); setProductsError(""); } })
      .catch((loadError) => {
        if (alive) { setProducts([]); setProductsError(loadError?.message || "โหลดทะเบียนสินค้าไม่สำเร็จ"); }
      })
      .finally(() => { if (alive) setProductsBusy(false); });
    return () => { alive = false; };
  }, [customerId, registryRound, productsRound]);

  /* รอบวางบิลของลูกค้า (mig 0389 · กำหนดวางบิล รอบสอง ข้อ 6) — ชิป "ตามรอบของลูกค้า" ในหน้าต่างแบ่งงวดของขั้น ③
     ⭐ อ่านแคบรายเดียว (`/api/customers?billingTermsOf=` — 4 คอลัมน์) ไม่ใช่ลิสต์ picker: ลิสต์ไม่แบกคอลัมน์นี้โดยเจตนา
     `null` = ยังไม่เลือกลูกค้า/กำลังโหลด · `{ status: 'ready', supported, rule }` · `{ status: 'error', detail }`
     (รูปเดียวกับหน้าสร้างใบสั่งขาย — `createFormTermsState`)
     ⚠️ โหลดไม่ขึ้น **ไม่บล็อกอะไร** — หน้าต่างแบ่งงวดบอกเหตุหนึ่งบรรทัด ตัวเลือกวันครบกำหนดเดิมใช้ได้ครบ
     ⚠️ ไม่แคช: รอบแก้ได้ตลอด (ทะเบียนลูกค้า — SA/FN ไม่ต้องอนุมัติ) ⇒ เปลี่ยนลูกค้า/รีเฟรชทะเบียนแล้วอ่านใหม่ */
  const [billingTerms, setBillingTerms] = useState(null);
  useEffect(() => {
    if (!customerId) { setBillingTerms(null); return undefined; }
    let alive = true;
    setBillingTerms(null);
    apiJson(`/api/customers?billingTermsOf=${encodeURIComponent(customerId)}`, {
      cache: "no-store", fallbackError: HISTORICAL_TERMS_LOAD_FAILED,
    })
      .then((data) => { if (alive) setBillingTerms(createFormTermsState(data)); })
      .catch((loadError) => {
        if (alive) setBillingTerms({ status: "error", detail: loadError?.message || HISTORICAL_TERMS_LOAD_FAILED });
      });
    return () => { alive = false; };
  }, [customerId, registryRound]);

  const customerOptions = useMemo(() => customerSelectOptions(customers), [customers]);
  const ownerOptions = useMemo(() => owners.map((person) => ({
    value: person.id,
    label: `${person.name} · ${ROLE_LABELS[person.role] || person.role}`,
    search: `${person.name} ${(person.teams || []).join(" ")}`,
  })), [owners]);
  const ownerPick = useMemo(
    () => (lockedOwner && lockedOwner.id === state.ownerId ? lockedOwner : owners.find((p) => p.id === state.ownerId)) || null,
    [owners, lockedOwner, state.ownerId],
  );
  const ownerTeams = useMemo(() => userTeams(ownerPick), [ownerPick]);
  /* ผู้คีย์ที่ขอบเขตไม่ใช่ทั้งบริษัทเลือกได้เฉพาะทีมที่ตัวเองกับ AE มีร่วมกัน (ด่านจริงอยู่ที่แผนฝั่ง server) */
  const sharedTeams = useMemo(
    () => (salesPlanningEditScope(role) === "all" ? [] : ownerTeams.filter((team) => myTeams.includes(team))),
    [role, ownerTeams, myTeams],
  );

  /* ช่องทีม: ชุดตัวเลือก คำถาม และค่าที่ล็อก มาจากตัวตัดสินตัวเดียว ⇒ "ถามข้อที่ไม่มีช่องให้ตอบ" เกิดไม่ได้ */
  const teamField = useMemo(
    () => historicalTeamField({ ownerTeams, sharedTeams, locked: Boolean(state.orderId) }),
    [ownerTeams, sharedTeams, state.orderId],
  );

  /* ⭐ ไฟล์ที่ **ยังไม่ได้อัป** เท่านั้นที่บวกเพิ่ม — ที่อัปแล้วถูกนับอยู่ในจำนวนของ server แล้ว
     (ไม่งั้นนับซ้ำ ⇒ ด่านผ่านด้วยไฟล์ที่ไม่มีจริง) · ตัวตัดสินอยู่ที่ `historicalContractFileCount` */
  const pendingContractFiles = contractFiles
    .filter((file) => !uploadedContract.current.has(fileKey(file))).length;
  const contractFileCount = historicalContractFileCount({
    contractId,
    serverCount: panelContractFiles,
    hydratedCount: hydratedContractFiles,
    pendingCount: pendingContractFiles,
  });
  /* 🪤 **ทำไมหลักฐานงวดยกมาไม่ติดโรคภาพนิ่งตัวเดียวกัน** (รีวิว R6 ข้อสอง) — ตัวนับนี้บวกสองกอง
     ที่ฟอร์มเป็นเจ้าของเองและไม่ทับกัน: `state.openingEvidence` (ref ที่ติดมากับใบตอน hydrate)
     กับ `evidenceFiles` (ตะกร้าในเครื่อง) · ช่องนี้เป็น `PendingFiles` ล้วน **ไม่มีแผงที่อัป/ลบ
     ขึ้น server เองอยู่ข้างหลังตัวนับ** และไม่มีจังหวะไหนเติม ref ที่เพิ่งอัปกลับเข้า
     `state.openingEvidence` (ดู `persist`) ⇒ นับซ้ำไม่ได้ และค้างอดีตไม่ได้
     🔴 ถ้าวันหนึ่งช่องนี้เปลี่ยนไปใช้ `AttachmentsPanel` เหมือนไฟล์สัญญา **ต้องย้ายมาใช้
        `historicalContractFileCount` แบบเดียวกัน** ไม่งั้นทางตัน R6 เกิดซ้ำที่ขั้น ③ */
  const evidenceFileCount = (state.openingEvidence?.length || 0) + evidenceFiles.length;
  /* ⚠️ `zeroValue` = ธงตัวเดียวกับที่ขั้น ③ ใช้ซ่อนช่อง (`historicalZeroValue`) — ใบยอด 0 บาทไม่มีงวดให้ตอบ */
  /* ⚠️ `todayIso` = นาฬิกาไทยของหน้า (businessDate) — ส่งลงไปให้ตัวตัดสิน ไม่ให้มันอ่านเวลาเอง
     (กติกา thai-time) · ไม่ส่ง = กฎ "วันเริ่มต้องไม่เกินวันนี้" เงียบจนกว่า server จะตีกลับ */
  /* ⭐ ยอดใบที่จอใช้ได้ตั้งแต่ยังไม่มีแผน (รีวิว R7) — มีแผนใช้แผน ไม่มีก็คิดจากยอดโซน + โหมด VAT
     ด้วย `splitHistoricalAmounts` ก้อนเดียวกับ server ⇒ ขั้น ③ ใช้งานได้ทั้งที่ฟอร์มยังมี error */
  const money = useMemo(() => historicalMoneyView(state, plan, serverMoney), [state, plan, serverMoney]);
  /* ⭐ มติ 25/09 (รื้อขั้น ③): ตัวตรวจขั้น ③ ใช้ห่วงโซ่ของงวด ⇒ ต้องรู้ยอดใบ (งวดสุดท้ายรับยอดที่เหลือ) ·
     ใบ ฿0 รู้จากแผน หรือจากยอดที่คิดได้บนฟอร์มเมื่อยังไม่มีแผน (`historicalZeroValue`) */
  const invoiceTotal = money.ok ? money.totalAmount : null;
  const zeroValue = historicalZeroValue(plan, money);
  const localIssues = useMemo(() => historicalWizardLocalIssues(state, {
    role, userId: meId, ownerTeams, sharedTeams, contractFileCount, evidenceFileCount,
    zeroValue, todayIso, totalAmount: invoiceTotal,
  }), [state, role, meId, ownerTeams, sharedTeams, contractFileCount, evidenceFileCount, zeroValue, todayIso, invoiceTotal]);

  /* ⚠️ คำเตือน **ไม่ใช่ issue** — ห้ามไหลเข้า `localIssues` (ทุกข้อในนั้นบล็อกปุ่ม)
     ใบที่มีอยู่แล้วซึ่งสัญญาสิ้นสุดไประหว่างทาง = เตือน ไม่ใช่ด่าน (มติข้อ 9 · ตรงกับ ctx.editing ของแผน) */
  const contractWarnings = useMemo(
    () => historicalContractDateWarnings(state, { todayIso, editing: Boolean(state.orderId) }),
    [state, todayIso],
  );


  /* AE ที่ล็อกเป็นตัวเอง = เติมชื่อให้ตั้งแต่ต้น (ล็อกดีกว่าซ่อน — form-design-rules §2) */
  useEffect(() => {
    if (!lockedOwner?.id || state.orderId || state.ownerId) return;
    setState((current) => ({ ...current, ownerId: lockedOwner.id, team: lockedOwner.team || "" }));
  }, [lockedOwner, state.orderId, state.ownerId]);

  /* เลือกได้ทีมเดียวทั้งที่ AE อยู่หลายทีม = ตอบให้เลย แล้วขั้น ① โชว์เป็นช่องล็อก (ล็อกดีกว่าซ่อน)
     ⚠️ ค่าที่ระบบเติมเอง ไม่ใช่การแก้ของผู้คีย์ ⇒ ใช้ setState ตรง ๆ เหมือนช่อง AE ที่ล็อกเป็นตัวเอง
     (patch จะปั๊ม dirty และล้างแผนที่เพิ่งตรวจผ่านทิ้งทุกครั้งที่รายชื่อ AE โหลดเสร็จ) */
  /* 🪤 ต้องเฝ้า `state.team` ด้วย ไม่ใช่เฝ้าแต่ทีมที่ล็อก — สลับ AE จะล้างช่องทีมเป็นค่าว่าง
     (`patch({ ownerId, team: "" })`) แต่ถ้า AE คนใหม่ล็อกทีมเดิม ค่าที่เฝ้าไม่ขยับ เอฟเฟกต์ไม่ทำงาน
     แล้วใบถูกส่งขึ้นไปแบบไม่มีทีม = ถอยไปทีมหลักของ AE คนใหม่เงียบ ๆ ซึ่งคือบั๊กตัวเดิมเป๊ะ */
  useEffect(() => {
    if (!teamField.lockedTeam || state.team === teamField.lockedTeam) return;
    setState((current) => (current.team === teamField.lockedTeam
      ? current : { ...current, team: teamField.lockedTeam }));
  }, [teamField.lockedTeam, state.team]);

  /* แก้ฟอร์มเมื่อไร แผนที่ตรวจไว้หมดอายุทันที และรอบบันทึกที่ค้างอยู่ต้องเริ่มจากจังหวะแรกใหม่
     (ของที่ลงฐานไปแล้วยังอยู่ — จังหวะแรกกลายเป็น "แก้ใบ" ไม่ใช่ "สร้างใหม่")
     ⭐ มติ 25/09: error ของ server ที่พูดถึง **ช่องที่เพิ่งแก้** หายทันที (`historicalPruneIssues`)
     🐞 ของเดิมไม่แตะ `issues` เลย ⇒ แก้จำนวนแล้ว "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" ยังค้างจนกว่าจะกด "ถัดไป" อีกรอบ
     ⚠️ อ่าน state ก่อนแก้จาก ref (ไม่ทำ side effect ใน updater ของ setState — StrictMode เรียกซ้ำ) */
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const patch = useCallback((next) => {
    setDirty(true);
    const before = stateRef.current;
    setIssues((current) => historicalPruneIssues(current, before, { ...before, ...next }));
    setState((current) => ({ ...current, ...next }));
    setPlan(null);
    /* 🪤 แก้ฟอร์ม = ยอดที่ server ตอบมาเป็นของ payload เก่า ⇒ ทิ้งทันที ไม่งั้นยอดค้างในอดีต */
    setServerMoney(null);
    setDuplicates([]);
    setAcknowledged(false);
    setBlockedNote(null);
    setSaveFailure(null);
    progressRef.current = null;
  }, []);

  /* ⭐ ยามคลุมตอนกำลังบันทึกด้วย (ของเดิม `dirty && !busy` = ปิดยามพอดีตอนที่ออกแล้วใบค้างเป็นร่าง) · `router.push` หลังสำเร็จ
     ไม่ผ่านยามนี้ (มันจับแค่ลิงก์กับการปิดแท็บ) ⇒ ไม่ถามซ้ำตอนระบบพาไปหน้าใบ */
  /* ⚠️ ผูกกับ **รอบบันทึก** (`saveRun`) ไม่ใช่ `busy` — busy ติดระหว่างพรีวิวด้วย ซึ่งไม่เขียนอะไร (รีวิวขั้น ④: ถามว่า "ใบจะค้างเป็นร่าง" ทั้งที่ไม่มีร่าง) */
  useUnsavedChanges(dirty || Boolean(saveRun), saveRun ? { message: "กำลังบันทึกอยู่ — ออกตอนนี้ใบจะค้างเป็นฉบับร่าง" } : undefined);

  /* ⭐ **ปุ่มที่ติดด่านต้องพาไปถึงช่องที่ผิดจริง** (กฎบ้าน ui-visibility: ติดด่าน = โชว์แล้วบอกเหตุ)
     🐞 UAT 23/09: กด "ถัดไป" ตอนยังไม่แนบไฟล์สัญญา = ไม่มีอะไรเกิดขึ้นเลย ⇒ อ่านเหมือนปุ่มตาย
     ⚠️ จุดยึดมาจาก `historicalFieldAnchorId` ตัวเดียวกับที่แต่ละขั้นใช้วาด `id` ⇒ ไม่มีทางชี้ไปที่
        ช่องที่ไม่มีอยู่ (เทสต์ผูกสองฝั่งไว้ด้วยกัน) · ช่องที่หาไม่เจอก็ยังมีก้อน error อยู่บนจอเหมือนเดิม */
  useEffect(() => {
    if (!focusField) return undefined;
    setFocusField(null);
    if (typeof document === "undefined") return undefined;
    const node = document.getElementById(historicalFieldAnchorId(focusField) || "");
    if (!node) return undefined;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = node.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    focusable?.focus?.({ preventScroll: true });
    return undefined;
  }, [focusField]);

  useEffect(() => {
    if (!saveFailure) return;
    const node = savePanelRef.current;
    node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    node?.focus?.({ preventScroll: true });
  }, [saveFailure]);

  /* ⭐ **ตัวนับไฟล์สัญญาเดินตามของจริงบนเซิร์ฟเวอร์** (รีวิว R6) — แผงไฟล์แนบอัป/ลบเองได้ตรง ๆ
     ⚠️ `loaded` เท็จ = ยังไม่รู้ (ยังโหลดไม่เสร็จ หรือโหลดไม่สำเร็จ) ⇒ **null ไม่ใช่ 0** —
        0 ที่เดาเอาเองคือคำตอบที่ผิดทั้งสองทาง (บอกว่ายังไม่แนบ ทั้งที่แนบแล้ว)
     ⚠️ นับเฉพาะ `external_doc` — ชนิดเดียวที่ RPC ส่งอนุมัติของ 0374 ยอมรับ (แผงถูกแคบไว้
        ด้วย `docTypes` ชุดเดียวกันแล้ว แต่ตัวนับต้องไม่ฝากความถูกไว้กับ prop ของอีกไฟล์) */
  const handleContractPanelItems = useCallback((items, { loaded } = {}) => {
    /* เรียงตามเวลาแนบ (เก่าก่อน) แล้วตาม id — กติกาเดียวกับตัวเลือกไฟล์หลักฐานลงนามของ server (historicalOrderWorkflow) */
    setPanelContractItems(loaded
      ? (Array.isArray(items) ? items : []).filter((item) => item?.docType === EXTERNAL_DOC_TYPE)
        .slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
          || String(a.id || "").localeCompare(String(b.id || "")))
      : null);
  }, []);

  /* เปลี่ยนสัญญา = จำนวนเดิมไม่ใช่ของใบนี้แล้ว ⇒ กลับไปเป็น "ยังไม่รู้" จนกว่าแผงจะรายงานใหม่ */
  useEffect(() => { setPanelContractItems(null); }, [contractId]);

  const evidenceRefs = useCallback(() => [
    ...(state.openingEvidence || []),
    ...evidenceFiles.map((file) => uploadedEvidence.current.get(fileKey(file))).filter(Boolean),
  ], [state.openingEvidence, evidenceFiles]);

  /**
   * พรีวิว = ด่านของทุกขั้น · คืน `{ ok, fieldErrors }`
   * 🪤 พรีวิวที่ข้อมูลยังไม่ผ่านตอบ **400 พร้อม `errors[]`** ไม่ใช่ 200 พร้อม `plan.errors`
   *    (historicalOrderCommit ตอบ 400 ก่อนถึงสาขาพรีวิว) ⇒ ที่นี่แปลงเป็นผลพรีวิวปกติของฟอร์มที่ยังกรอกไม่ครบ
   */
  const runPreview = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const body = historicalWizardBody(state, {
        preview: true,
        intakeKey: state.orderId ? null : intakeKey,
        openingEvidenceRefs: evidenceRefs(),
        totalAmount: invoiceTotal,
      });
      const data = state.orderId
        ? await apiJson(`${HISTORICAL_PATH}/${state.orderId}`, { method: "PATCH", json: body, fallbackError: "ตรวจข้อมูลไม่สำเร็จ" })
        : await apiJson(HISTORICAL_PATH, { method: "POST", json: body, fallbackError: "ตรวจข้อมูลไม่สำเร็จ" });
      setPlan(data?.plan || null);
      /* ⭐ ราคา/หน่วยของแผน (อ่านจากทะเบียนตอนตรวจ) → แถวบนจอ (รีวิว 23/09) — ไม่งั้นเซลล์ "จำนวนเงิน" กับยอดไซต์
         พูดราคาที่เติมตอนเลือกแพ็คเกจ (ลิสต์แคช 2 นาที · ใบที่ถูกตีกลับแล้วเปิดใหม่) ขณะที่ยอดใบ/ขั้น ③/④ พูดราคาของแผน
         = จอเดียวสองตัวเลข · ใบเสนอราคาไม่เป็นเพราะโหลดบรรทัดใหม่หลังบันทึก ⇒ ที่นี่ทำแบบเดียวกันกับแผน
         ⚠️ `setState` ตรง ๆ **ไม่ผ่าน `patch`** — patch ปั๊ม dirty และทิ้งแผนที่เพิ่งตรวจผ่าน · ช่องถูกปิดระหว่างตรวจ
            (`busy`) แต่ยังเทียบกับ `state.zones` ชุดที่ส่งไปตรวจก่อนทับ กันเขียนทับของที่เปลี่ยนไปแล้ว
         ⚠️ ราคาขยับ = ลิสต์สินค้าที่แคชไว้เก่ากว่าทะเบียน ⇒ ทิ้งแคชแล้วอ่านใหม่ ไม่งั้นคำเตือน "ราคาในฐานข้อมูลตอนนี้"
            ของเซลล์ราคาจะเอาราคาเก่าในแคชมาพูดว่าเป็นราคาปัจจุบัน (กลับหัวกับความจริง) */
      const synced = historicalZonesWithPlanPrices(state.zones, data?.plan || null);
      if (synced !== state.zones) {
        setState((current) => (current.zones === state.zones ? { ...current, zones: synced } : current));
        if (state.customerId) dropCache(PRODUCTS_PATH(state.customerId));
        setProductsRound((round) => round + 1);
      }
      /* แผนผ่านแล้ว = แผนเป็นเจ้าของยอด ⇒ ไม่ต้องถือยอดสำรองของรอบก่อนไว้ */
      setServerMoney(null);
      setDuplicates(data?.plan?.duplicates || []);
      /* 🪤 `issues` เก็บ **error รายช่องจาก server** อย่างเดียว — local issues ถูกรวมตอนเรนเดอร์อยู่แล้ว
         (`stepIssues`) · ก๊อปมาใส่ซ้ำ = ก้อนที่ถ่ายไว้ตอนก่อนพรีวิวค้างอยู่ทั้งที่แผนใหม่ทำให้ข้อนั้น
         หมดไปแล้ว (เช่นใบยอด 0 บาทที่เลิกถามงวดยกมา) แล้วผู้คีย์เห็นข้อที่ไม่มีช่องให้แก้ */
      setIssues([]);
      return { ok: true, fieldErrors: null };
    } catch (previewError) {
      const fieldErrors = Array.isArray(previewError?.data?.errors) && previewError.data.errors.length
        ? previewError.data.errors
        : null;
      setPlan(null);
      /* ⭐ R7: พรีวิวที่ยังไม่ผ่านคืน `money` มาด้วยเมื่อยอดเชื่อได้ (null = server บอกว่ายังคิดไม่ได้)
         ⇒ เก็บไว้ให้ขั้น ③ กับแถบสรุปใช้ยอดของ server ไม่ใช่เลขที่จอคิดเอง */
      setServerMoney(previewError?.data?.money || null);
      if (!fieldErrors) setError(previewError?.message || "ตรวจข้อมูลไม่สำเร็จ");
      return { ok: false, fieldErrors };
    } finally {
      setBusy(false);
    }
  }, [state, intakeKey, evidenceRefs, invoiceTotal]);

  /**
   * error รายช่องของพรีวิว → พาไปขั้นที่ผิด · **ตัวเดียว** ที่ทั้ง "ถัดไป" และการกดปุ่มบันทึกตอนยังไม่มีแผน (ขั้น ④) ใช้
   * 🐞 รีวิวขั้น ④ 25/09: ปุ่มบันทึกตอนไม่มีแผนเคยเรียก `runPreview()` แล้วทิ้งผล ⇒ error รายช่องหายเงียบ ปุ่มอ่านเหมือนปุ่มตาย
   */
  const applyPreviewErrors = useCallback((fieldErrors, from, to) => {
    const index = (key) => HISTORICAL_WIZARD_STEP_ORDER.indexOf(key);
    const first = firstStepWithIssues(fieldErrors);
    /* ⭐ ผูก error รายบรรทัดกับ `key` ของแถว **ตอนนี้** (ลำดับของ body = ลำดับของ state ที่ส่งไปตรวจ · ช่องปิดระหว่างตรวจ)
       ⇒ ลบ/เพิ่มบรรทัดทีหลังแล้วข้อความไม่เลื่อนไปเกาะบรรทัดผิด (บั๊กเดิม: จับคู่ด้วยลำดับตอนวาด) */
    const keyed = historicalIssuesWithRowKeys(fieldErrors, state.zones, state.installments);
    /* ⭐ พรีวิวไม่ผ่านแล้วพากลับไปขั้นที่ผิด = โฟกัสช่องแรกของขั้นนั้นด้วย (เหมือนด่านบนจอ) — ไม่งั้นผู้คีย์ต้องไล่หาเอง */
    const focusOn = (key) => setFocusField(issuesForStep(keyed, key)[0]?.field || null);
    if (first && index(first) <= index(from)) { reveal(first); setIssues(keyed); setStep(first); focusOn(first); return; }
    /* ขั้น ④ ต้องมีแผนจริงถึงจะโชว์อะไรได้ ⇒ ไม่ผ่าน = พาไปขั้นที่ช่องแรกอยู่ (ก้อนเดียวบอกทุกช่อง) */
    if (to === "review") { reveal(first || from); setIssues(keyed); setStep(first || from); focusOn(first || from); return; }
    /* 🐞 UAT 25/09: เดินจากขั้น ① มาขั้น ② ที่ยังว่าง = ก้อนแดง "ต้องมีรายการอย่างน้อย 1 บรรทัด" รอต้อนรับ ทั้งที่ตารางว่าง
       บอกอยู่แล้วและผู้คีย์ยังไม่ได้แตะอะไร (เจ้าของบ่นเรื่อง error รกเป็นข้อแรก) ⇒ ข้อ "ยังไม่มีบรรทัด" ไม่ถูกพกมา —
       มันกลับมาเองตอนกด "ถัดไป" ของขั้นนี้ · ข้อของบรรทัดที่คีย์ไว้แล้ว (ใบที่ถูกตีกลับ ฯลฯ) ยังพกมาตามเดิม */
    const carried = keyed.filter((issue) => issue.field !== "zones");
    /* 🐞 รีวิว 25/09: ข้อของบรรทัดที่คีย์ไว้แล้ว (ใบที่ถูกตีกลับ · โซนถูกปิดระหว่างทาง ฯลฯ) ถูกพกมาแต่ขั้นปลายทางยังไม่ "เปิดเผย"
       ⇒ ซ่อนไปหนึ่งรอบ ทั้งที่ server เพิ่งบอกว่าผิด · มีข้อของขั้นปลายทางติดมา **และขั้นนั้นมีของอยู่แล้ว** = เปิดเผยเลย
       (ขั้นที่ยังว่าง — ② ไม่มีบรรทัด · ③ ยังไม่ตอบงวดยกมาและไม่มีงวด — ข้อที่ติดมาคือ "ยังว่าง" ล้วน ⇒ รอกดไปต่อ · UAT 25/09) */
    if (issuesForStep(carried, to).length && historicalStepHasInput(state, to)) reveal(to);
    setIssues(carried);
    setStep(to);
  }, [state, reveal]);

  /**
   * เดินไปอีกขั้น — ถอยหลังเดินได้เลย · เดินหน้าต้องผ่านพรีวิวของขั้นที่ยืนอยู่ก่อน
   * ⚠️ พรีวิวไม่ผ่านไม่ได้แปลว่าขั้นนี้ผิด: ตอนอยู่ขั้น ① ใบยังไม่มีโซนเสมอ ⇒ ตกอยู่ที่ **ขั้นแรก
   *    ที่มีข้อผิดพลาด** เมื่อขั้นนั้นอยู่ก่อนหรือเท่ากับขั้นปัจจุบัน ไม่งั้นเดินต่อได้ตามปกติ
   */
  const goToStep = useCallback(async (to) => {
    const from = step;
    const index = (key) => HISTORICAL_WIZARD_STEP_ORDER.indexOf(key);
    if (index(to) <= index(from)) { setStep(to); return; }
    /* ของที่ server มองไม่เห็น (ไฟล์ · โหมด VAT · ทีม) ตรวจก่อน แล้วค่อยจ่ายค่าพรีวิว
       🐞 UAT 23/09: ของเดิมเขียน `{ setIssues([]); return; }` = **ไม่เกิดอะไรขึ้นเลยบนจอ** ซ้ำยัง
          ล้าง error ของ server ที่ค้างอยู่ทิ้ง ⇒ ติดด่านต้อง **คาข้อความไว้แล้วพาไปที่ช่องแรกที่ผิด**
          (ก้อน error ของขั้นวาดจาก localIssues อยู่แล้ว — ห้ามแตะ `issues` ซึ่งเป็นของ server) */
    /* กดไปต่อจากขั้นนี้แล้ว = ขั้นนี้ "เปิดเผย" ข้อที่ต้องแก้ได้ (ก้อนแดง + ใต้ช่อง) — ไม่ว่าจะติดด่านหรือผ่าน */
    reveal(from);
    const block = historicalNextBlock(localIssues, from);
    if (block.blocked) { setFocusField(block.field); return; }
    const { ok, fieldErrors } = await runPreview();
    if (ok) { setIssues([]); setStep(to); return; }
    if (!fieldErrors) return;
    applyPreviewErrors(fieldErrors, from, to);
  }, [step, runPreview, localIssues, reveal, applyPreviewErrors]);

  /* ── บันทึกและส่งอนุมัติ: เดินทีละจังหวะจนจบ (nextSaveStage) ───────────────────────── */
  const runSave = useCallback(async () => {
    setBusy(true);
    setError("");
    setSaveFailure(null);
    let orderRowId = state.orderId;
    let orderNumber = state.orderNumber || null;
    let updatedAt = state.updatedAt;
    let contractRowId = contractId;
    let stage = null;
    const pendingOf = (files, store) => files.filter((file) => !store.current.has(fileKey(file))).length;
    /* 🐞 รีวิว 25/09: ใบที่ไม่มีงวดยกมาส่ง (ใบ ฿0 · ยังไม่เคยจ่าย) ไม่มีที่ให้หลักฐานไปผูก ⇒ ห้ามอัปไฟล์ในตะกร้าขึ้นไปเป็นไฟล์กำพร้า */
    const sendsOpening = historicalWizardBody(state, { totalAmount: invoiceTotal }).opening !== null;
    const evidenceToUpload = sendsOpening ? evidenceFiles : [];
    let progress = progressRef.current || emptySaveProgress({
      orderId: orderRowId,
      pendingContractFiles: pendingOf(contractFiles, uploadedContract),
      pendingEvidence: pendingOf(evidenceToUpload, uploadedEvidence),
    });
    /* แผงบันทึก: จำนวนไฟล์ของรอบนี้ (ที่ยังไม่ได้อัป) — นับขึ้นทีละไฟล์ตอนอัปสำเร็จ */
    const contractTotal = pendingOf(contractFiles, uploadedContract);
    const evidenceTotal = pendingOf(evidenceToUpload, uploadedEvidence);
    const show = (patchRun) => setSaveRun((current) => ({
      stage: null, orderNumber, counts: { contract: [0, contractTotal], evidence: [0, evidenceTotal] }, ...current, ...patchRun,
    }));
    const bump = (key) => setSaveRun((current) => {
      if (!current) return current;
      const [done, total] = current.counts[key];
      return { ...current, counts: { ...current.counts, [key]: [Math.min(done + 1, total), total] } };
    });
    setSaveRun({ stage: null, orderNumber, counts: { contract: [0, contractTotal], evidence: [0, evidenceTotal] } });

    const persist = async () => {
      const body = historicalWizardBody(state, {
        intakeKey: orderRowId ? null : intakeKey,
        expectedUpdatedAt: orderRowId ? updatedAt : null,
        acknowledgeDuplicates: acknowledged,
        openingEvidenceRefs: evidenceRefs(),
        totalAmount: invoiceTotal,
      });
      const data = orderRowId
        ? await apiJson(`${HISTORICAL_PATH}/${orderRowId}`, { method: "PATCH", json: body, fallbackError: SAVE_ERROR })
        : await apiJson(HISTORICAL_PATH, { method: "POST", json: body, fallbackError: SAVE_ERROR });
      const created = !orderRowId;
      orderRowId = data?.order?.id || orderRowId;
      orderNumber = data?.order?.orderNumber || orderNumber;
      show({ orderNumber });
      updatedAt = data?.order?.updatedAt || updatedAt;
      contractRowId = data?.contract?.id || contractRowId;
      /* ⭐ URL กลายเป็นเส้นแก้ใบทันที — component ตัวเดิมทำงานต่อ (ไม่ remount) และรีโหลดแล้วได้ใบจากฐาน */
      if (created && orderRowId && typeof window !== "undefined") {
        window.history.replaceState(null, "", historicalEditPath(orderRowId));
      }
      setContractId(contractRowId);
      setState((current) => ({
        ...current,
        orderId: orderRowId,
        updatedAt,
        status: data?.order?.status || current.status,
        orderNumber: data?.order?.orderNumber || current.orderNumber,
      }));
    };

    try {
      /* ⚠️ เพดานรอบ — ตัวเดินจังหวะต้องคืบทุกรอบ · ถ้าจังหวะไหนทำแล้วของที่ค้างไม่ลด (เช่นตัวอัปไฟล์
         คืนมาโดยไม่ได้จำ ref) จะวนกดซ้ำไม่รู้จบเงียบ ๆ ⇒ หยุดแล้วบอกตรง ๆ ดีกว่าแขวนจอไว้ */
      for (let guard = HISTORICAL_SAVE_STAGES.length + 2; guard > 0; guard -= 1) {
        progress = {
          ...progress,
          orderId: orderRowId,
          pendingContractFiles: pendingOf(contractFiles, uploadedContract),
          pendingEvidence: pendingOf(evidenceToUpload, uploadedEvidence),
        };
        stage = nextSaveStage(progress);
        if (!stage) break;
        show({ stage });
        if (stage === "persist") {
          await persist();
        } else if (stage === "contractFiles") {
          await uploadContractFiles({
            contractId: contractRowId,
            files: contractFiles.map((file) => ({ file, ref: uploadedContract.current.get(fileKey(file)) || null })),
            /* ⚠️ ขั้น ① อาจไม่ได้ถูกเรนเดอร์อยู่ตอนนี้ (ผู้คีย์ยืนอยู่ขั้น ④) ⇒ แผงไม่มีโอกาสรายงาน ⇒ นับ **ทีละไฟล์ที่ขึ้นจริง**
               (แผงเขียนทับด้วยของจริงทันทีที่ได้เรนเดอร์) · 🐞 รีวิวขั้น ④ 25/09: ของเดิมตั้งพื้นหลังอัปครบทั้งชุดเท่านั้น ⇒ ไฟล์ที่ 2 ล้ม
               = จำนวน "ยังอ่านไม่ได้" แล้วปุ่ม "เอาไฟล์นี้ออกจากตะกร้า" ส่งผู้คีย์กลับขั้น ① แทนที่จะส่งต่อได้ · รายการที่แผงรายงานไว้แล้ว
               ต่อท้ายด้วยไฟล์ใหม่ (ใหม่สุด = ท้ายสุด — ไม่ใช่ไฟล์หลักฐานลงนาม) */
            onUploaded: (file, ref) => {
              uploadedContract.current.set(fileKey(file), ref);
              uploadedContractNames.current = [...uploadedContractNames.current, file.name];
              setHydratedContractFiles((current) => (current || 0) + 1);
              setPanelContractItems((items) => (items
                ? [...items, { id: ref?.id || fileKey(file), fileName: file.name, docType: EXTERNAL_DOC_TYPE }]
                : items));
              bump("contract");
            },
          });
          /* แผงไฟล์แนบโหลดตอน mount/เปลี่ยน entityId เท่านั้น ⇒ อัปเสร็จแล้วต้องสั่งให้อ่านใหม่
             ไม่งั้นตัวนับของจริงค้างที่เลขก่อนอัป แล้วด่าน "ต้องแนบไฟล์" ค้างทั้งที่ไฟล์ขึ้นไปแล้ว */
          setContractFilesVersion((version) => version + 1);
        } else if (stage === "evidence") {
          await uploadOpeningEvidence({
            orderId: orderRowId,
            files: evidenceToUpload.map((file) => ({ file, ref: uploadedEvidence.current.get(fileKey(file)) || null })),
            onUploaded: (file, ref) => { uploadedEvidence.current.set(fileKey(file), ref); bump("evidence"); },
          });
        } else if (stage === "persistEvidence") {
          await persist();
        } else if (stage === "submit") {
          const data = await apiJson(`/api/sales-planning/sales-orders/${orderRowId}`, {
            method: "PATCH",
            json: {
              action: "submit",
              expectedUpdatedAt: updatedAt,
              ...(state.hasOpening === true ? { openingEvidence: evidenceRefs() } : {}),
            },
            fallbackError: "ส่งอนุมัติใบสั่งขายย้อนหลังไม่สำเร็จ",
          });
          updatedAt = data?.updatedAt || updatedAt;
        }
        progress = saveProgressAfter(progress, stage, { orderId: orderRowId });
        progressRef.current = progress;
      }
      if (nextSaveStage(progress)) {
        throw new Error(`บันทึกไม่จบในรอบเดียว — กด “${HISTORICAL_SAVE_BUTTON_LABEL}” อีกครั้ง หากยังไม่ผ่านแจ้งผู้ดูแลระบบ`);
      }
      setDirty(false);
      progressRef.current = null;
      /* ⚠️ ไม่ปลด busy หลังสำเร็จโดยเจตนา — หน้ากำลังจะเปลี่ยนไปหน้าใบ ปลดตอนนี้ = ปุ่มกลับกดได้ซ้ำระหว่างนำทาง
         (ใบเกิดไปแล้ว กดซ้ำคือการส่งอนุมัติรอบสอง ซึ่ง RPC ตอบ replayed อยู่แล้ว — แต่ผู้คีย์ไม่ควรต้องเห็นปุ่มกระพริบ)
         toast ระดับแอป — อยู่รอดข้ามการเปลี่ยนหน้า (ผู้คีย์อ่านผลที่หน้าใบ ไม่ใช่ที่ฟอร์มที่กำลังหายไป) */
      notifyToast.success(historicalSubmitToast(orderNumber));
      router.push(ORDER_PATH(orderRowId));
    } catch (saveError) {
      /* ⭐ ผูก error รายบรรทัดกับ `key` **ตอนนี้** ด้วยชุดบรรทัดที่ส่งไปบันทึกจริง (`state` ของรอบนี้) — ผูกทีหลัง
         = ใช้ชุดบรรทัดของตอนนั้น ซึ่งผู้คีย์อาจลบ/เพิ่มไปแล้ว ⇒ ข้อความเกาะบรรทัดผิด (รีวิว 25/09) */
      const exitInfo = historicalSaveExit(saveError);
      const errors = Array.isArray(exitInfo.errors)
        ? historicalIssuesWithRowKeys(exitInfo.errors, state.zones, state.installments) : null;
      const exit = errors ? { ...exitInfo, errors } : exitInfo;
      setSaveRun(null);
      setBusy(false);
      /* 409 ใบซ้ำ = **ไม่ใช่จอผิดพลาด** — การ์ดใบที่อาจซ้ำรีเฟรช สวิตช์กลับเป็นปิด เหตุอยู่ใต้สวิตช์ (ไม่มีแผงบันทึก) */
      if (exit.kind === "duplicate") {
        setDuplicates(Array.isArray(exit.duplicates) ? exit.duplicates : []);
        setAcknowledged(false);
        setBlockedNote(exit.message || null);
        setStep("review");
        return;
      }
      /* ⭐ 400 = **ลงเครื่องหมายผิดทันที** ที่ขั้นแรกที่มีข้อต้องแก้ (ของเดิมรอกด "กลับไปแก้" ก่อน) · ไม่มี error รายช่อง =
         ตารางรหัส→ขั้นของ `historicalSaveExit` ตัดสินว่าขั้นไหน · ข้อความของ server อยู่ในแผงบันทึกซึ่งรอดการพาไปขั้นอื่น */
      let landed = "review";
      if (exit.kind === "invalid") {
        landed = exit.goToStep || "contract";
        reveal(landed);
        if (errors?.length) {
          setIssues(errors);
          setFocusField(issuesForStep(errors, landed)[0]?.field || null);
        }
        setStep(landed);
      }
      setSaveFailure({
        exit,
        stage,
        /* ใบร่างที่ **ของรอบนี้** ลงฐานแล้ว — จังหวะแรกผ่านในฟอร์มนี้ (แก้ฟอร์มแล้วรอบเริ่มใหม่ — `patch` ล้าง progressRef)
           🐞 รีวิวขั้น ④ 25/09: ของเดิมดูแค่ "มีเลขใบ" ⇒ ใบเดิมที่ PATCH แรกล้มก็ขึ้น "ใบร่าง … บันทึกแล้ว" ทั้งที่ของที่แก้ไม่ได้ลง
              (ใบที่ถูกตีกลับยังเป็น 'rejected' ด้วยซ้ำ) */
        orderNumber: progress.persisted ? orderNumber : null,
        orderId: orderRowId || null,
        failedFile: saveError?.failedFile || null,
        landed,
      });
    }
  }, [state, contractId, contractFiles, evidenceFiles, intakeKey, acknowledged, evidenceRefs, router, reveal, invoiceTotal]);

  /* ทางออกในแผงบันทึก (ไม่เกินหนึ่งปุ่ม · ไม่มีปุ่มหลักตัวที่สอง — ลองใหม่คือปุ่มบันทึกตัวเดิม) */
  const runSaveAction = useCallback(async (action) => {
    if (!action || !saveFailure) return;
    if (action.key === "removeFile") {
      const target = saveFailure.failedFile;
      const keep = (file) => fileKey(file) !== target?.key;
      if (target?.kind === "evidence") setEvidenceFiles((files) => files.filter(keep));
      else setContractFiles((files) => files.filter(keep));
      /* ⚠️ ไม่ต้องแตะรอบที่ค้าง (`progressRef`) — ตัวเดินจังหวะนับไฟล์ที่ยังไม่อัปจากตะกร้าจริงทุกรอบอยู่แล้ว */
      setDirty(true);
      setSaveFailure(null);
      return;
    }
    if (action.key === "goToStep" && action.step) {
      reveal(action.step);
      setStep(action.step);
      return;
    }
    if (action.key === "reload") {
      const path = historicalEditPath(saveFailure.orderId || state.orderId || orderId);
      if (!(await confirmAction("ของที่แก้หลังบันทึกครั้งล่าสุดจะหาย — โหลดใบล่าสุดจากฐานข้อมูล?", { title: "โหลดใบล่าสุด" }))) return;
      /* ยืนยันแล้ว = ปลดยามงานยังไม่บันทึกก่อนออก (flushSync ⇒ ตัวดัก beforeunload ถูกถอดก่อน assign) ไม่งั้นเบราว์เซอร์ถามซ้ำ */
      flushSync(() => { setDirty(false); });
      window.location.assign(path);
    }
  }, [saveFailure, reveal, state.orderId, orderId]);

  if (!canKey || !canEdit) {
    return (
      <AccessDenied
        icon={<History size={22} />}
        title="คีย์ SO ย้อนหลัง (งานบริการ)"
        message="คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน"
        back={{ href: REGISTER_PATH, label: "ทะเบียนใบสั่งขาย" }}
      />
    );
  }

  const workspaceProps = {
    icon: <History size={22} />,
    title: "คีย์ SO ย้อนหลัง (งานบริการ)",
    subtitle: "งานบริการที่ขายไปแล้วก่อนเข้าระบบ — คีย์ครั้งเดียวแล้วเดินตาม flow ปกติ",
    back: { href: REGISTER_PATH, label: "ทะเบียนใบสั่งขาย" },
  };

  if (hydrating) return <Workspace {...workspaceProps}><SkeletonRows rows={6} /></Workspace>;
  if (readOnly) {
    return (
      <Workspace {...workspaceProps}>
        <StatusNotice
          tone="warning"
          title="แก้ใบนี้ในฟอร์มคีย์ใบไม่ได้"
          action={orderId ? <Button as={Link} href={ORDER_PATH(orderId)} size="sm" variant="ghost">เปิดหน้าใบสั่งขาย</Button> : null}
        >
          {readOnly}
        </StatusNotice>
      </Workspace>
    );
  }

  const gate = historicalDuplicateGate({ duplicates, acknowledged, localIssues });
  const stepIndex = HISTORICAL_WIZARD_STEP_ORDER.indexOf(step);
  const customerLabel = customerOptions.find((option) => option.value === state.customerId)?.label || null;
  const ownerLabel = ownerPick?.name || lockedOwner?.name || null;

  /* ⭐ ราง + แถบสรุป มาจากตัวตัดสินที่ตรึงด้วยเทสต์ และ **อ่าน state ของฟอร์มก่อนเสมอ**
     🐞 UAT 23/09 สองข้อในก้อนเดียวกัน: รางนับเป็นเศษส่วน 1/1 ⇒ ขั้นที่ error มาจากพรีวิวอ่านว่า
        "ครบ" ตั้งแต่ฟอร์มยังเปล่า · แถบสรุปอ่าน `plan?.header` อย่างเดียว ⇒ เลือกลูกค้าแล้ว
        ยังขึ้นขีด ทั้งที่แถวช่วงสัญญาใต้มันขยับทันที (ดูหัว `historicalWizardRail`/`historicalAsideRows`) */
  const rail = historicalWizardRail(state, {
    step, localIssues, serverIssues: issues, plan, customerLabel, revealedSteps, zeroValue,
    duplicatesPending: duplicates.length > 0 && !acknowledged,
  });
  const sections = rail.map((item) => ({
    key: item.key,
    /* `label` ของ SectionRail รับ node อยู่แล้ว ⇒ บรรทัดสรุปไม่ต้องเพิ่มช่องให้ primitive กลาง */
    label: (
      <>
        <span className={styles.railName}>{item.label}</span>
        <span className={styles.railSummary} data-blocked={item.blocked ? "yes" : undefined}>{item.summary}</span>
      </>
    ),
    title: item.title,
    tone: item.tone,
  }));

  /* แถวสรุปชุดเดียว — ช่องสรุปบนหัวเอกสารของขั้น ① อ่านก้อนนี้ (`historicalContractFacts`)
     ⭐ มติเจ้าของ 25/09: ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว (ขั้น ③ ถอดด้วย — ยอดอยู่ในกล่องสรุปท้ายตารางงวด) */
  const asideRows = historicalAsideRows(state, { plan, serverMoney, customerLabel, ownerLabel, contractFileCount, evidenceFileCount });

  /* ⭐ ขั้น ④ แถว "ไฟล์หลักฐานลงนาม": ชื่อไฟล์ที่ขึ้นแล้ว (แผงรายงาน · ถอยไปชื่อที่ติดมากับใบ) ต่อด้วยไฟล์ในตะกร้าที่ยังไม่อัป */
  const pendingContractNames = contractFiles
    .filter((file) => !uploadedContract.current.has(fileKey(file))).map((file) => file.name);
  const reviewContractFiles = {
    count: contractFileCount,
    names: [
      ...(panelContractItems ? panelContractItems.map((item) => item.fileName) : [...hydratedContractNames, ...uploadedContractNames.current]),
      ...pendingContractNames,
    ],
    pending: pendingContractNames,
  };

  /* ⭐ แผงบันทึก + บรรทัดใต้ปุ่มของขั้น ④ — ตัวตัดสินใน lib ตัวเดียว (historicalReviewView) */
  const saving = saveRun ? historicalSaveStages({ stage: saveRun.stage, counts: saveRun.counts, orderNumber: saveRun.orderNumber }) : null;
  const saveResult = saveFailure
    ? historicalSaveResultView(saveFailure.exit, {
      stage: saveFailure.stage, orderNumber: saveFailure.orderNumber, failedFile: saveFailure.failedFile, currentStep: step,
    })
    : null;
  const footNote = step === "review"
    ? historicalReviewFootNote({
      plan, gate, localIssues, warningGroups: historicalWarningGroups(plan, { todayIso }), saving,
      failed: saveFailure ? { orderNumber: saveFailure.orderNumber, exit: saveFailure.exit } : null,
    })
    : { text: historicalFootNote({ step }), tone: null };

  /* ⚠️ ข้อที่จอตรวจเองกับข้อของ server ช่องเดียวกัน (VAT ที่ยังไม่เลือก ฯลฯ) = **ข้อเดียว** — local ชนะ (มันสดกว่า
     และดับทันทีที่แก้) · 🐞 UAT 25/09: VAT ย้ายมาขั้น ② แล้วขึ้นสองบรรทัดคำเกือบเดียวกันในก้อนแดง */
  /* 🐞 รีวิว 25/09: แถวที่ผูก key แล้วเทียบด้วย (key ของแถว, ช่อง) ไม่ใช่ชื่อช่องดิบ — ลบงวดบนแล้วเลขในชื่อช่องเลื่อน */
  const stepIssues = (key) => issuesForStep(historicalMergeIssues(localIssues, issues), key);
  /* ⭐ ที่วาดได้จริงของขั้นนั้น (มติ 25/09 — ก้อนแดงหลังกดไปต่อเท่านั้น) · `summary` = วาดก้อนแดงหัวขั้นไหม */
  const shownIssues = (key) => historicalVisibleIssues(stepIssues(key), { revealed: revealedSteps.has(key) });
  let body = null;
  if (step === "contract") {
    body = (
      <WizardContractStep
        state={state}
        onChange={patch}
        issues={shownIssues("contract").issues}
        summary={shownIssues("contract").summary}
        facts={asideRows}
        statusLabel={historicalDocStatusLabel(state)}
        warnings={contractWarnings}
        customerOptions={customerOptions}
        customersError={customersError}
        ownerOptions={ownerOptions}
        lockedOwner={lockedOwner}
        teamOptions={teamField.options}
        lockedTeam={teamField.lockedTeam}
        contractFiles={contractFiles}
        onContractFiles={(files) => { setDirty(true); setContractFiles(files); }}
        contractId={contractId}
        contractFilesVersion={contractFilesVersion}
        onContractPanelItems={handleContractPanelItems}
        busy={busy}
        onOversize={setError}
      />
    );
  } else if (step === "zones") {
    body = (
      <WizardZonesStep
        state={state}
        onChange={patch}
        issues={shownIssues("zones").issues}
        summary={shownIssues("zones").summary}
        plan={plan}
        money={money}
        products={products}
        productsError={productsError}
        busy={busy}
      />
    );
  } else if (step === "money") {
    body = (
      <WizardMoneyStep
        state={state}
        onChange={patch}
        issues={shownIssues("money").issues}
        summary={shownIssues("money").summary}
        plan={plan}
        money={money}
        evidenceFiles={evidenceFiles}
        onEvidenceFiles={(files) => { setDirty(true); setEvidenceFiles(files); }}
        todayIso={todayIso}
        customerTerms={billingTerms}
        busy={busy}
        onOversize={setError}
      />
    );
  } else {
    body = (
      <WizardReviewStep
        plan={plan}
        keyerMode={historicalKeyerMode(role)}
        keyerName={me?.name || null}
        customerLabel={customerLabel}
        orderNumber={state.orderNumber || null}
        statusLabel={historicalDocStatusLabel(state)}
        contractFiles={reviewContractFiles}
        evidenceFileCount={evidenceFileCount}
        duplicates={duplicates}
        acknowledged={acknowledged}
        onAcknowledge={(next) => { setAcknowledged(next); setBlockedNote(null); }}
        dupNote={blockedNote}
        switchRef={dupSwitchRef}
        busy={busy}
        onEditStep={(key, field) => { setStep(key); setFocusField(field || null); }}
        todayIso={todayIso}
      />
    );
  }

  const prevStep = stepIndex > 0 ? HISTORICAL_WIZARD_STEP_ORDER[stepIndex - 1] : null;
  const nextStep = stepIndex < HISTORICAL_WIZARD_STEP_ORDER.length - 1
    ? HISTORICAL_WIZARD_STEP_ORDER[stepIndex + 1] : null;

  return (
    <Workspace {...workspaceProps}>
      {state.rejection ? (
        /* ใบที่ถูกตีกลับ — เหตุผลต้องอยู่บนฟอร์มจนกว่าจะส่งใหม่ ไม่ใช่ toast ที่หายไปแล้ว
           ⭐ มติ 25/09: ไม่เรียก "AE Sup" (CM/CD ก็ตีกลับได้) · ชื่อคนตีกลับบอกอยู่แล้วว่าใคร */
        <StatusNotice tone="warning" title={`ตีกลับให้แก้ไข${state.rejection.by ? ` — ${state.rejection.by}` : ""}`}>
          {state.rejection.reason || "ไม่ได้ระบุเหตุผล"}
        </StatusNotice>
      ) : null}
      {/* 🐞 รีวิว R9: ทะเบียนที่โหลดไม่ขึ้นเคยเงียบสนิท ⇒ จอพูดแทนว่า "ทะเบียนว่าง" แล้วผู้คีย์
          ไปไล่อีกฝ่ายให้สร้างของที่มีอยู่แล้ว · โหลดใหม่ได้ผล เพราะ apiCache ไม่เก็บผลที่พัง
          🐞 **N4**: ปุ่มนี้เคยเป็น `window.location.reload()` ⇒ ชนยาม `useUnsavedChanges` ของฟอร์ม
             เอง (โมดัล "ออกจากหน้านี้ไหม" ของเบราว์เซอร์) และเสี่ยงทิ้งของที่คีย์ไว้ทั้งใบ
             ⇒ ยิงสองเส้นใหม่ที่เดิม ไม่ออกจากหน้า ไม่แตะฟอร์ม (ดู `reloadRegistries`) */}
      {customersError || productsError ? (
        <StatusNotice
          tone="error"
          title="โหลดทะเบียนไม่สำเร็จ — ของที่หายไปคือ “โหลดไม่ขึ้น” ไม่ใช่ “ไม่มีในทะเบียน”"
          action={(
            <Button size="sm" variant="ghost" disabled={busy || registryBusy}
              onClick={reloadRegistries}>
              {registryBusy ? "กำลังโหลด…" : "ลองอ่านทะเบียนอีกครั้ง"}
            </Button>
          )}
        >
          <ul className={styles.warnList}>
            {customersError ? <li>ทะเบียนลูกค้า: {customersError}</li> : null}
            {productsError ? <li>ทะเบียนสินค้า (แพ็คเกจบริการ): {productsError}</li> : null}
          </ul>
        </StatusNotice>
      ) : null}
      {/* ⚠️ error ของ **การบันทึก** ไม่ขึ้นที่นี่แล้ว — อยู่ในแผงบันทึกเหนือแถบท้าย (มติ 25/09) · ที่นี่เหลือไฟล์ใหญ่เกิน/ตรวจไม่สำเร็จ */}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {/* ⭐ ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว (มติเจ้าของ 25/09 — ขั้น ① ย้ายขึ้นหัวเอกสาร · ขั้น ③ อยู่ในกล่องสรุปท้ายตารางงวด)
          ตารางรายการของใบเสนอราคา (ขั้น ② ④) ต้องการกล่อง ≥ 900px — มีแถบสรุป = เนื้อขั้นเหลือ 816–866px (วัด 23/09) */}
      <DetailPageLayout asideLabel="สรุปใบสั่งขายย้อนหลัง" aside={null}>
        <SectionRail
          sections={sections}
          value={step}
          onChange={(key) => { if (!busy) goToStep(key); }}
          ariaLabel="ขั้นของการคีย์ใบสั่งขายย้อนหลัง"
        >
          {body}
        </SectionRail>

        {saving ? (
          /* ⭐ แผงบันทึก — เฉพาะจังหวะที่มีงานจริงของรอบนี้ · อยู่นอกเนื้อขั้น ⇒ รอดการพาไปขั้นอื่น
             (StatusNotice ให้ role เอง: info = status · error = alert) */
          <div className={styles.savePanel}>
            <StatusNotice tone="info" title="กำลังบันทึกและส่ง — อย่าปิดหน้านี้">
              {/* ⚠️ รางแนวตั้ง (ค่าตั้งต้น) — แบบแนวนอนซ่อนบรรทัดรองที่จอ ≤1100px ซึ่งคือเลข SO กับ "k/n ไฟล์" (รีวิวขั้น ④ 25/09) */}
              <WorkflowRail steps={saving.stages.map((item) => ({ id: item.key, label: item.label, hint: item.hint, state: item.state }))}
                label="จังหวะของการบันทึก" />
            </StatusNotice>
          </div>
        ) : saveResult ? (
          <div className={styles.savePanel} ref={savePanelRef} tabIndex={-1}>
            {/* ⚠️ ทางออกไม่เกินหนึ่งปุ่ม · ปุ่มรอง (neutral) เสมอ · **ไม่มี runSave ที่นี่** — ลองใหม่คือปุ่มบันทึกตัวเดิมซึ่งผ่านด่าน */}
            <StatusNotice
              tone="error"
              title={saveResult.title}
              action={saveResult.action ? (
                saveResult.action.key === "open" ? (
                  <Button as={Link} href={historicalEditPath(saveResult.action.orderId)} size="sm" tone="neutral" variant="ghost">
                    {saveResult.action.label}
                  </Button>
                ) : saveResult.action.key === "openOrder" ? (
                  <Button as={Link} href={ORDER_PATH(saveFailure.orderId || state.orderId)} size="sm" tone="neutral" variant="ghost">
                    {saveResult.action.label}
                  </Button>
                ) : (
                  <Button size="sm" tone="neutral" variant="ghost" disabled={busy} onClick={() => runSaveAction(saveResult.action)}>
                    {saveResult.action.label}
                  </Button>
                )
              ) : null}
            >
              {saveResult.body}
            </StatusNotice>
          </div>
        ) : null}

        <div className="form-action-bar is-page">
          <div className={styles.footLead}>
            {/* ⭐ "ออกจากฟอร์ม" (เดิม "ยกเลิก" — อ่านเหมือนยกเลิกใบ) · ว่าง = ลิงก์ (ยามงานยังไม่บันทึกถาม) ·
                กำลังบันทึก = ปุ่มดับจริง **ไม่ใช่ router.push** (ยามจับ router.push ไม่ได้) */}
            {busy ? (
              <Button tone="neutral" variant="quiet" disabled>ออกจากฟอร์ม</Button>
            ) : (
              <Button as={Link} href={REGISTER_PATH} tone="neutral" variant="quiet">ออกจากฟอร์ม</Button>
            )}
            {/* 🐞 UAT 23/09: ประโยค "ส่งให้ AE Sup อนุมัติทันทีที่บันทึก" เคยขึ้นบนขั้น ①–③ ซึ่งมี
                ปุ่มเดียวคือ "ถัดไป" และไม่บันทึกอะไรเลย ⇒ ถ้อยคำของแถบท้ายมาจากตัวตัดสินตัวเดียว */}
            <span className={styles.footNote} data-blocked={footNote.tone === "warn" ? "yes" : undefined}
              data-busy={footNote.tone === "busy" ? "yes" : undefined}>
              {footNote.text}
            </span>
          </div>
          {prevStep ? (
            <Button tone="neutral" disabled={busy} onClick={() => setStep(prevStep)}
              icon={<ArrowLeft size={15} aria-hidden="true" />}>ย้อนกลับ</Button>
          ) : null}
          {nextStep ? (
            <Button tone="primary" disabled={busy} onClick={() => goToStep(nextStep)}
              icon={<ArrowRight size={15} aria-hidden="true" />}>
              {busy ? "กำลังตรวจ…" : `ถัดไป · ${HISTORICAL_WIZARD_STEPS[stepIndex + 1].label}`}
            </Button>
          ) : (
            /* ⚠️ kind="submit" = primary (navy) ไม่ใช่ accent — accent แปลว่า "เริ่มของใหม่" ห้ามติดปุ่มบันทึก
               ⭐ ปุ่มติดด่าน = **โชว์แล้วบอกเหตุตอนกด** ไม่ใช่ซ่อนหรือจางเฉย ๆ (กฎบ้าน) */
            <ActionButton
              kind="submit"
              label={busy ? (saveRun ? "กำลังบันทึก…" : "กำลังตรวจ…") : HISTORICAL_SAVE_BUTTON_LABEL}
              disabled={busy}
              aria-disabled={gate.gated ? "true" : undefined}
              className={gate.gated && !busy ? styles.gatedButton : ""}
              title={gate.buttonTitle || undefined}
              onClick={async () => {
                if (gate.gated) {
                  /* ⚠️ ไม่ล้าง `issues` (ของ server) ทิ้ง — พาไปขั้นที่ยังขาด แล้วโฟกัสช่องแรกที่ผิด */
                  if (localIssues.length) {
                    const first = firstStepWithIssues(localIssues) || "contract";
                    reveal(first);
                    setStep(first);
                    setFocusField(historicalNextBlock(localIssues, first).field);
                    return;
                  }
                  /* ใต้สวิตช์ใบซ้ำพูดเรื่องใบซ้ำเท่านั้น — ข้อที่ต้องแก้ของขั้นอื่นเคยค้างเป็นคำอำพันใต้สวิตช์ (รีวิวขั้น ④ 25/09) */
                  setBlockedNote(gate.blockedNote);
                  /* เหตุผลของด่านอยู่ข้างสวิตช์ซึ่งอาจเลื่อนพ้นจอไปแล้ว — ไม่พาไปหา = ปุ่มอ่านเหมือนปุ่มตาย */
                  dupSwitchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                  dupSwitchRef.current?.focus();
                  return;
                }
                /* ตอนยังไม่มีแผน การกดครั้งแรกคือการตรวจ — error รายช่องพาไปขั้นที่ผิดด้วยตัวเดียวกับ "ถัดไป" */
                if (!plan) {
                  const { fieldErrors } = await runPreview();
                  if (fieldErrors) applyPreviewErrors(fieldErrors, "review", "review");
                  return;
                }
                runSave();
              }}
            />
          )}
        </div>

      </DetailPageLayout>
    </Workspace>
  );
}
