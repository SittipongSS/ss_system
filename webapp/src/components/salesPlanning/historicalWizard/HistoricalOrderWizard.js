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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { apiJson } from "@/lib/apiFetch";
import { cachedFetchJson } from "@/lib/apiCache";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { fmtMoney, NA } from "@/lib/format";
import { useCan, useRole, useTeams } from "@/lib/roleContext";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import useDealOwners from "@/lib/sales/useDealOwners";
import { customerSelectOptions } from "@/components/master/customerOption";
import { EXTERNAL_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { userTeams, ROLE_LABELS } from "@/lib/permissions";
import { salesPlanningEditScope } from "@/lib/salesPlanning";
import { isSalesOrderReviewer } from "@/lib/sales/salesOrderWorkflow";
import {
  HISTORICAL_EDITABLE_STATUSES, HISTORICAL_STATUS_NOTE,
  canKeyHistoricalSalesOrder, historicalEditPath, isHistoricalOrder,
} from "@/lib/sales/historicalOrders";
import {
  HISTORICAL_SAVE_BUTTON_LABEL, HISTORICAL_SAVE_STAGES, HISTORICAL_WIZARD_STEPS,
  HISTORICAL_WIZARD_STEP_ORDER, emptyHistoricalWizard, emptySaveProgress,
  firstStepWithIssues, historicalAsideRows, historicalContractDateWarnings, historicalContractFileCount,
  historicalDuplicateGate, historicalExitActions,
  historicalFieldAnchorId, historicalFootNote, historicalMoneyView, historicalNextBlock, historicalSaveExit,
  historicalSaveFailureState, historicalTeamField, historicalWizardBody, historicalWizardLocalIssues,
  historicalWizardRail, issuesForStep, newHistoricalIntakeKey, nextSaveStage, saveProgressAfter,
  wizardStateFromOrder,
} from "@/lib/sales/historicalIntakeForm";
import { uploadContractFiles, uploadOpeningEvidence } from "@/lib/sales/historicalWizardUploads";
import WizardContractStep from "./WizardContractStep";
import WizardZonesStep from "./WizardZonesStep";
import WizardMoneyStep from "./WizardMoneyStep";
import WizardReviewStep from "./WizardReviewStep";
import styles from "./HistoricalOrderWizard.module.css";

const REGISTER_PATH = "/sa/sales-orders";
const ORDER_PATH = (id) => `/sa/sales-orders/${id}`;
const HISTORICAL_PATH = "/api/sales-planning/sales-orders/historical";
const SAVE_ERROR = "บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ";

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
  const [exit, setExit] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(null);
  const [hydrating, setHydrating] = useState(Boolean(orderId));
  const [contractId, setContractId] = useState(null);
  /* ⭐ สองตัวนับของไฟล์เอกสารแทนสัญญา (รีวิว R6) — ดูหัว `historicalContractFileCount`
     · `panelContractFiles` = ของจริงที่แผงไฟล์แนบรายงานมา (นับเฉพาะ external_doc) · null = ยังไม่รายงาน
     · `hydratedContractFiles` = จำนวนที่ติดมากับใบตอนเปิดฟอร์ม — ที่ถอยไปใช้ระหว่างรอแผง */
  const [panelContractFiles, setPanelContractFiles] = useState(null);
  const [hydratedContractFiles, setHydratedContractFiles] = useState(null);
  /* อัปไฟล์สัญญาสำเร็จแล้วแผงต้องอ่านใหม่ — มันโหลดตอน mount/เปลี่ยน entityId เท่านั้น
     ⇒ เลขนี้ถูกใช้เป็น React key ของแผง (บวกหนึ่ง = remount = fetch ใหม่) */
  const [contractFilesVersion, setContractFilesVersion] = useState(0);
  const [contractFiles, setContractFiles] = useState([]);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersError, setCustomersError] = useState("");
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState("");
  const [meId, setMeId] = useState(null);

  /* ไฟล์ที่อัปสำเร็จแล้วในรอบนี้ (คีย์ไฟล์ → ref) — กดใหม่ต้องไม่อัปซ้ำ (retry-must-not-reupload) */
  const uploadedContract = useRef(new Map());
  const uploadedEvidence = useRef(new Map());
  const progressRef = useRef(null);
  const [dirty, setDirty] = useState(false);
  const dupSwitchRef = useRef(null);
  /* ช่องที่ต้องพาไปหาหลังกดปุ่มที่ติดด่าน — เก็บเป็น state เพราะจอต้องวาดเครื่องหมาย "ผิด"
     ให้เสร็จก่อน แล้วค่อยเลื่อน/โฟกัส (อ่านชื่อช่องจาก `historicalNextBlock`) */
  const [focusField, setFocusField] = useState(null);
  const todayIso = businessDate();

  useEffect(() => {
    let alive = true;
    apiJson("/api/users/me", { fallbackError: "อ่านข้อมูลผู้ใช้ไม่สำเร็จ" })
      .then((me) => { if (alive) setMeId(me?.id || null); })
      .catch(() => { if (alive) setMeId(null); });
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
        setHydratedContractFiles((order.serviceContractFiles || [])
          .filter((file) => file?.docType === EXTERNAL_DOC_TYPE).length);
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

  /* FG ของนิติบุคคลของลูกค้าที่เลือก — `taxSiblings=1` รวมใบอื่นที่เลขผู้เสียภาษีเดียวกัน
     (กติกาเดียวกับหน้าออกใบเสนอราคา) */
  const customerId = state.customerId;
  useEffect(() => {
    if (!customerId) { setProducts([]); setProductsError(""); setProductsBusy(false); return undefined; }
    let alive = true;
    setProductsBusy(true);
    cachedFetchJson(`/api/products?customerId=${encodeURIComponent(customerId)}&taxSiblings=1`)
      .then((rows) => { if (alive) { setProducts(Array.isArray(rows) ? rows : []); setProductsError(""); } })
      .catch((loadError) => {
        if (alive) { setProducts([]); setProductsError(loadError?.message || "โหลดทะเบียนสินค้าไม่สำเร็จ"); }
      })
      .finally(() => { if (alive) setProductsBusy(false); });
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
  /* ⚠️ `zeroValue` มาจากแผนของ server ตัวเดียวกับที่ขั้น ③ ใช้ซ่อนช่อง — ใบยอด 0 บาทไม่มีงวดให้ตอบ */
  /* ⚠️ `todayIso` = นาฬิกาไทยของหน้า (businessDate) — ส่งลงไปให้ตัวตัดสิน ไม่ให้มันอ่านเวลาเอง
     (กติกา thai-time) · ไม่ส่ง = กฎ "วันเริ่มต้องไม่เกินวันนี้" เงียบจนกว่า server จะตีกลับ */
  const localIssues = useMemo(() => historicalWizardLocalIssues(state, {
    role, userId: meId, ownerTeams, sharedTeams, contractFileCount, evidenceFileCount,
    zeroValue: Boolean(plan?.zeroValue), todayIso,
  }), [state, role, meId, ownerTeams, sharedTeams, contractFileCount, evidenceFileCount, plan, todayIso]);

  /* ⚠️ คำเตือน **ไม่ใช่ issue** — ห้ามไหลเข้า `localIssues` (ทุกข้อในนั้นบล็อกปุ่ม)
     ใบที่มีอยู่แล้วซึ่งสัญญาสิ้นสุดไประหว่างทาง = เตือน ไม่ใช่ด่าน (มติข้อ 9 · ตรงกับ ctx.editing ของแผน) */
  const contractWarnings = useMemo(
    () => historicalContractDateWarnings(state, { todayIso, editing: Boolean(state.orderId) }),
    [state, todayIso],
  );

  /* ⭐ ยอดใบที่จอใช้ได้ตั้งแต่ยังไม่มีแผน (รีวิว R7) — มีแผนใช้แผน ไม่มีก็คิดจากยอดโซน + โหมด VAT
     ด้วย `splitHistoricalAmounts` ก้อนเดียวกับ server ⇒ ขั้น ③ ใช้งานได้ทั้งที่ฟอร์มยังมี error */
  const money = useMemo(() => historicalMoneyView(state, plan, serverMoney), [state, plan, serverMoney]);

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
     (ของที่ลงฐานไปแล้วยังอยู่ — จังหวะแรกกลายเป็น "แก้ใบ" ไม่ใช่ "สร้างใหม่") */
  const patch = useCallback((next) => {
    setDirty(true);
    setState((current) => ({ ...current, ...next }));
    setPlan(null);
    /* 🪤 แก้ฟอร์ม = ยอดที่ server ตอบมาเป็นของ payload เก่า ⇒ ทิ้งทันที ไม่งั้นยอดค้างในอดีต */
    setServerMoney(null);
    setDuplicates([]);
    setAcknowledged(false);
    setBlockedNote(null);
    progressRef.current = null;
  }, []);

  useUnsavedChanges(dirty && !busy);

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

  /* ⭐ **ตัวนับไฟล์สัญญาเดินตามของจริงบนเซิร์ฟเวอร์** (รีวิว R6) — แผงไฟล์แนบอัป/ลบเองได้ตรง ๆ
     ⚠️ `loaded` เท็จ = ยังไม่รู้ (ยังโหลดไม่เสร็จ หรือโหลดไม่สำเร็จ) ⇒ **null ไม่ใช่ 0** —
        0 ที่เดาเอาเองคือคำตอบที่ผิดทั้งสองทาง (บอกว่ายังไม่แนบ ทั้งที่แนบแล้ว)
     ⚠️ นับเฉพาะ `external_doc` — ชนิดเดียวที่ RPC ส่งอนุมัติของ 0374 ยอมรับ (แผงถูกแคบไว้
        ด้วย `docTypes` ชุดเดียวกันแล้ว แต่ตัวนับต้องไม่ฝากความถูกไว้กับ prop ของอีกไฟล์) */
  const handleContractPanelItems = useCallback((items, { loaded } = {}) => {
    setPanelContractFiles(loaded
      ? (Array.isArray(items) ? items : []).filter((item) => item?.docType === EXTERNAL_DOC_TYPE).length
      : null);
  }, []);

  /* เปลี่ยนสัญญา = จำนวนเดิมไม่ใช่ของใบนี้แล้ว ⇒ กลับไปเป็น "ยังไม่รู้" จนกว่าแผงจะรายงานใหม่ */
  useEffect(() => { setPanelContractFiles(null); }, [contractId]);

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
      });
      const data = state.orderId
        ? await apiJson(`${HISTORICAL_PATH}/${state.orderId}`, { method: "PATCH", json: body, fallbackError: "ตรวจข้อมูลไม่สำเร็จ" })
        : await apiJson(HISTORICAL_PATH, { method: "POST", json: body, fallbackError: "ตรวจข้อมูลไม่สำเร็จ" });
      setPlan(data?.plan || null);
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
  }, [state, intakeKey, evidenceRefs]);

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
    const block = historicalNextBlock(localIssues, from);
    if (block.blocked) { setFocusField(block.field); return; }
    const { ok, fieldErrors } = await runPreview();
    if (ok) { setIssues([]); setStep(to); return; }
    if (!fieldErrors) return;
    const first = firstStepWithIssues(fieldErrors);
    if (first && index(first) <= index(from)) { setIssues(fieldErrors); setStep(first); return; }
    /* ขั้น ④ ต้องมีแผนจริงถึงจะโชว์อะไรได้ ⇒ ไม่ผ่าน = พาไปขั้นที่ช่องแรกอยู่ (ก้อนเดียวบอกทุกช่อง) */
    if (to === "review") { setIssues(fieldErrors); setStep(first || from); return; }
    setIssues(fieldErrors);
    setStep(to);
  }, [step, runPreview, localIssues]);

  /* ── บันทึกและส่งอนุมัติ: เดินทีละจังหวะจนจบ (nextSaveStage) ───────────────────────── */
  const runSave = useCallback(async () => {
    setBusy(true);
    setError("");
    setExit(null);
    let orderRowId = state.orderId;
    let updatedAt = state.updatedAt;
    let contractRowId = contractId;
    const pendingOf = (files, store) => files.filter((file) => !store.current.has(fileKey(file))).length;
    let progress = progressRef.current || emptySaveProgress({
      orderId: orderRowId,
      pendingContractFiles: pendingOf(contractFiles, uploadedContract),
      pendingEvidence: pendingOf(evidenceFiles, uploadedEvidence),
    });

    const persist = async () => {
      const body = historicalWizardBody(state, {
        intakeKey: orderRowId ? null : intakeKey,
        expectedUpdatedAt: orderRowId ? updatedAt : null,
        acknowledgeDuplicates: acknowledged,
        openingEvidenceRefs: evidenceRefs(),
      });
      const data = orderRowId
        ? await apiJson(`${HISTORICAL_PATH}/${orderRowId}`, { method: "PATCH", json: body, fallbackError: SAVE_ERROR })
        : await apiJson(HISTORICAL_PATH, { method: "POST", json: body, fallbackError: SAVE_ERROR });
      const created = !orderRowId;
      orderRowId = data?.order?.id || orderRowId;
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
          pendingEvidence: pendingOf(evidenceFiles, uploadedEvidence),
        };
        const stage = nextSaveStage(progress);
        if (!stage) break;
        if (stage === "persist") {
          await persist();
        } else if (stage === "contractFiles") {
          await uploadContractFiles({
            contractId: contractRowId,
            files: contractFiles.map((file) => ({ file, ref: uploadedContract.current.get(fileKey(file)) || null })),
            onUploaded: (file, ref) => uploadedContract.current.set(fileKey(file), ref),
          });
          /* แผงไฟล์แนบโหลดตอน mount/เปลี่ยน entityId เท่านั้น ⇒ อัปเสร็จแล้วต้องสั่งให้อ่านใหม่
             ไม่งั้นตัวนับของจริงค้างที่เลขก่อนอัป แล้วด่าน "ต้องแนบไฟล์" ค้างทั้งที่ไฟล์ขึ้นไปแล้ว */
          setContractFilesVersion((version) => version + 1);
          /* ⚠️ ขั้น ① อาจไม่ได้ถูกเรนเดอร์อยู่ตอนนี้ (ผู้คีย์ยืนอยู่ขั้น ④) ⇒ แผงไม่มีโอกาสรายงาน
             ⇒ ตั้ง **พื้นล่างที่รู้แน่** ไว้ก่อน: ไฟล์ที่เพิ่งอัปสำเร็จมีอยู่จริงอย่างน้อยเท่านี้
             (แผงเขียนทับด้วยของจริงทันทีที่ได้เรนเดอร์) — ไม่ใช่ภาพนิ่ง แต่เป็นขอบล่างที่ไม่โกหก */
          setHydratedContractFiles((current) => Math.max(current || 0, contractFiles.length));
        } else if (stage === "evidence") {
          await uploadOpeningEvidence({
            orderId: orderRowId,
            files: evidenceFiles.map((file) => ({ file, ref: uploadedEvidence.current.get(fileKey(file)) || null })),
            onUploaded: (file, ref) => uploadedEvidence.current.set(fileKey(file), ref),
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
        throw new Error('บันทึกไม่จบในรอบเดียว — กดบันทึกอีกครั้ง หากยังไม่ผ่านแจ้งผู้ดูแลระบบ');
      }
      setDirty(false);
      progressRef.current = null;
      /* ⚠️ ไม่ปลด busy หลังสำเร็จโดยเจตนา — หน้ากำลังจะเปลี่ยนไปหน้าใบ ปลดตอนนี้ = ปุ่มกลับกดได้ซ้ำระหว่างนำทาง
         (ใบเกิดไปแล้ว กดซ้ำคือการส่งอนุมัติรอบสอง ซึ่ง RPC ตอบ replayed อยู่แล้ว — แต่ผู้คีย์ไม่ควรต้องเห็นปุ่มกระพริบ)
         toast ระดับแอป — อยู่รอดข้ามการเปลี่ยนหน้า (ผู้คีย์อ่านผลที่หน้าใบ ไม่ใช่ที่ฟอร์มที่กำลังหายไป) */
      notifyToast.success("บันทึกและส่งให้ AE Sup อนุมัติแล้ว — ใบย้อนหลังไม่นับ Actual");
      router.push(ORDER_PATH(orderRowId));
    } catch (saveError) {
      const next = historicalSaveFailureState(historicalSaveExit(saveError));
      setExit(next.exit);
      setError(next.error);
      if (next.duplicates) { setDuplicates(next.duplicates); setAcknowledged(false); }
      setStep(next.step);
      setBusy(false);
    }
  }, [state, contractId, contractFiles, evidenceFiles, intakeKey, acknowledged, evidenceRefs, router]);

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

  const gate = historicalDuplicateGate({ duplicates, acknowledged, warnings: plan?.warnings, localIssues });
  const stepIndex = HISTORICAL_WIZARD_STEP_ORDER.indexOf(step);
  const customerLabel = customerOptions.find((option) => option.value === state.customerId)?.label || null;
  const ownerLabel = ownerPick?.name || lockedOwner?.name || null;

  /* ⭐ ราง + แถบสรุป มาจากตัวตัดสินที่ตรึงด้วยเทสต์ และ **อ่าน state ของฟอร์มก่อนเสมอ**
     🐞 UAT 23/09 สองข้อในก้อนเดียวกัน: รางนับเป็นเศษส่วน 1/1 ⇒ ขั้นที่ error มาจากพรีวิวอ่านว่า
        "ครบ" ตั้งแต่ฟอร์มยังเปล่า · แถบสรุปอ่าน `plan?.header` อย่างเดียว ⇒ เลือกลูกค้าแล้ว
        ยังขึ้นขีด ทั้งที่แถวช่วงสัญญาใต้มันขยับทันที (ดูหัว `historicalWizardRail`/`historicalAsideRows`) */
  const rail = historicalWizardRail(state, { step, localIssues, serverIssues: issues, plan, customerLabel });
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

  const aside = (
    <DocumentSummaryCard
      title={<>สรุปใบ<span className={styles.asideBadge}>ย้อนหลัง</span></>}
      total={money.ok ? fmtMoney(money.totalAmount) : NA}
      totalCaption={state.orderNumber ? `เลขที่ใบ ${state.orderNumber}` : "เลข SO ออกให้ตอนบันทึก · เติมตามที่กรอก"}
      rows={historicalAsideRows(state, { plan, serverMoney, customerLabel, ownerLabel, contractFileCount, evidenceFileCount })}
      status={state.orderId ? "ฉบับร่าง — ยังไม่ส่งอนุมัติ" : "ยังไม่ออกใบ"}
      statusLabel="สถานะเอกสาร"
    >
      <p className={styles.hint}>{HISTORICAL_STATUS_NOTE}</p>
    </DocumentSummaryCard>
  );

  const stepIssues = (key) => issuesForStep([...localIssues, ...issues], key);
  let body = null;
  if (step === "contract") {
    body = (
      <WizardContractStep
        state={state}
        onChange={patch}
        issues={stepIssues("contract")}
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
        issues={stepIssues("zones")}
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
        issues={stepIssues("money")}
        plan={plan}
        money={money}
        evidenceFiles={evidenceFiles}
        onEvidenceFiles={(files) => { setDirty(true); setEvidenceFiles(files); }}
        todayIso={todayIso}
        busy={busy}
        onOversize={setError}
      />
    );
  } else {
    body = (
      <WizardReviewStep
        plan={plan}
        keyerIsReviewer={isSalesOrderReviewer(role)}
        keyerName={ownerPick?.name || lockedOwner?.name || null}
        contractFileCount={contractFileCount}
        evidenceFileCount={evidenceFileCount}
        duplicates={duplicates}
        acknowledged={acknowledged}
        onAcknowledge={(next) => { setAcknowledged(next); setBlockedNote(null); }}
        blockedNote={blockedNote}
        switchRef={dupSwitchRef}
        busy={busy}
      />
    );
  }

  const prevStep = stepIndex > 0 ? HISTORICAL_WIZARD_STEP_ORDER[stepIndex - 1] : null;
  const nextStep = stepIndex < HISTORICAL_WIZARD_STEP_ORDER.length - 1
    ? HISTORICAL_WIZARD_STEP_ORDER[stepIndex + 1] : null;

  return (
    <Workspace {...workspaceProps}>
      {state.rejection ? (
        /* ใบที่ AE Sup ตีกลับ — เหตุผลต้องอยู่บนฟอร์มจนกว่าจะส่งใหม่ ไม่ใช่ toast ที่หายไปแล้ว */
        <StatusNotice tone="warning" title={`AE Sup ตีกลับให้แก้ไข${state.rejection.by ? ` — ${state.rejection.by}` : ""}`}>
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
      {exit?.hint ? <StatusNotice tone="info" title="ทำต่อยังไง">{exit.hint}</StatusNotice> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <DetailPageLayout asideLabel="สรุปใบสั่งขายย้อนหลัง" aside={aside}>
        <SectionRail
          sections={sections}
          value={step}
          onChange={(key) => { if (!busy) goToStep(key); }}
          ariaLabel="ขั้นของการคีย์ใบสั่งขายย้อนหลัง"
        >
          {body}
        </SectionRail>

        <div className="form-action-bar is-page">
          <div className={styles.footLead}>
            <Button as={Link} href={REGISTER_PATH} tone="neutral" variant="quiet" disabled={busy}>ยกเลิก</Button>
            {/* 🐞 UAT 23/09: ประโยค "ส่งให้ AE Sup อนุมัติทันทีที่บันทึก" เคยขึ้นบนขั้น ①–③ ซึ่งมี
                ปุ่มเดียวคือ "ถัดไป" และไม่บันทึกอะไรเลย ⇒ ถ้อยคำของแถบท้ายมาจากตัวตัดสินตัวเดียว */}
            <span className={styles.footNote} data-blocked={gate.gated && step === "review" ? "yes" : undefined}>
              {historicalFootNote({ step, gate })}
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
              label={busy ? "กำลังบันทึก…" : HISTORICAL_SAVE_BUTTON_LABEL}
              disabled={busy}
              aria-disabled={gate.gated ? "true" : undefined}
              title={gate.buttonTitle || undefined}
              onClick={() => {
                if (gate.gated) {
                  setBlockedNote(gate.blockedNote);
                  /* ⚠️ ไม่ล้าง `issues` (ของ server) ทิ้ง — พาไปขั้นที่ยังขาด แล้วโฟกัสช่องแรกที่ผิด */
                  if (localIssues.length) {
                    const first = firstStepWithIssues(localIssues) || "contract";
                    setStep(first);
                    setFocusField(historicalNextBlock(localIssues, first).field);
                    return;
                  }
                  /* เหตุผลของด่านอยู่ข้างสวิตช์ซึ่งอาจเลื่อนพ้นจอไปแล้ว — ไม่พาไปหา = ปุ่มอ่านเหมือนปุ่มตาย */
                  dupSwitchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                  dupSwitchRef.current?.focus();
                  return;
                }
                if (!plan) { runPreview(); return; }
                runSave();
              }}
            />
          )}
        </div>

        {exit ? (
          <div className={styles.splitRow}>
            {historicalExitActions(exit).map((action) => {
              if (action.key === "edit") {
                return (
                  <Button key="edit" tone="neutral" disabled={busy} onClick={() => {
                    setIssues(action.errors);
                    setError(action.carryMessage || "");
                    setExit(null);
                    setStep(action.goToStep);
                  }}>{action.label}</Button>
                );
              }
              if (action.key === "open") {
                return (
                  <Button key="open" tone="neutral" as={Link} href={historicalEditPath(action.orderId)}>
                    {action.label}
                  </Button>
                );
              }
              return (
                <Button key="retry" tone="primary" disabled={busy} onClick={() => { setExit(null); runSave(); }}>
                  {action.label}
                </Button>
              );
            })}
          </div>
        ) : null}
      </DetailPageLayout>
    </Workspace>
  );
}
