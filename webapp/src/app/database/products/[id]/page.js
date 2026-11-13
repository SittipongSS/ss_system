"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Archive, ArchiveRestore, Building2, ShoppingCart, FolderKanban, MessagesSquare, Send } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import { ActionButton } from "@/components/ui/ActionButtons";
import StatusNotice from "@/components/ui/StatusNotice";
import { useCan, useRole } from "@/lib/roleContext";
import { isRdRole, isSalesManager } from "@/lib/permissions";
import { DEFAULT_SALE_UNIT, formatVolume, hasPackagingFields } from "@/lib/master/units";
import OrderStatusPill from "@/components/OrderStatusPill";
import EditProductModal from "@/components/EditProductModal";
import { RegistrationWorkPanel } from "@/components/excise/RegistrationWorkModal";
import Tabs from "@/components/ui/Tabs";
import CostVatLines from "@/components/database/CostVatLines";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ProductRegistrationDocs from "@/components/database/ProductRegistrationDocs";
import SkeletonRows from "@/components/ui/Skeleton";
import ReadableText from "@/components/ui/ReadableText";
import Toast from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  ATTACHMENT_TYPES, COA_META_FIELDS, QC_PRODUCT_DOC_TYPES, RD_PRODUCT_DOC_TYPES, customerDocTypes, productDocTypes,
} from "@/lib/master/attachmentTypes";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { brandThList, brandBoth, hasBrandField } from "@/lib/master/brands";
import { fmtDate, fmtMoney, fmtMoneyOrDash, fmtNumber, productNameBoth, naText, NA } from "@/lib/format";
import { productDisplayName } from "@/lib/master/productIdentity";
import { registryLabel, scentLabel } from "@/lib/master/registryLabel";
import { isGiftSetCategory } from "@/lib/master/giftSetFormulas";
import { EXCISE_TAX_BASE, GIFT_SET_EXCISE_KIND, giftSetExcise, giftSetExciseSummary, giftSetPriceModeOf } from "@/lib/excise/giftSetExcise";
import { isFragranceOilCategory } from "@/lib/master/fragranceOilScent";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import ProductSpecCard from "@/components/database/ProductSpecCard";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { approvalControlView, canApproveMasterRecord } from "@/lib/master/approvalControl";
import useApprovalDecision from "@/components/database/useApprovalDecision";
import { useTeams } from "@/lib/roleContext";
import { categoryOf, categoryFlags, fdaNoticeState } from "@/lib/master/categoryOf";
import { isMissingRetailPrice } from "@/lib/tax/taxableProducts";
import { isProductTaxable, productExciseBadge, productShowsRetailPrice } from "@/lib/master/productFilter";
import { isAutoFgCode, isReusableCode } from "@/lib/master/masterCodes";
import { exciseRecommendationState } from "@/lib/excise/recommendation";
import { statusMeta } from "@/lib/excise/workflow";
import { apiCache } from "@/lib/apiCache";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import ProductBomStatus from "@/components/database/ProductBomStatus";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { BOM_STATUS_META, bomSendBlocker, bomStatusOf, hasBomStep } from "@/lib/master/productBom";
import { useCapUser, useDepartment } from "@/lib/roleContext";
import { canAccessRd } from "@/lib/permissions";
import IngredientListText from "@/components/database/IngredientListText";
import { INGREDIENT_LIST_LABEL, formulaNeedsIngredientList } from "@/lib/master/ingredientList";
import styles from "./page.module.css";

/* แถบแท็บของหน้า — id คงที่ให้ปุ่ม/ช่องสถานะพาเลื่อนมาที่แถบได้ */
const TABS_ID = "product-tabs";
/* การ์ดของแผง "เอกสารจาก RD" — ชุดคงตัว (แผงผูก handler กับ `types`) · ป้ายมาจากทะเบียนกลาง */
const RD_DOC_TYPES = ATTACHMENT_TYPES.product.filter((type) => RD_PRODUCT_DOC_TYPES.includes(type.key));
/* การ์ดของแผง "COA ประจำล็อต" (P4) — ชุดคงตัวเหมือนข้างบน */
const QC_DOC_TYPES = ATTACHMENT_TYPES.product.filter((type) => QC_PRODUCT_DOC_TYPES.includes(type.key));
/* โทนสถานะของสายสรรพสามิต (`statusMeta().tone`) → สีจุดบนแถบสถานะ */
const LANE_TONE_COLOR = {
  success: "var(--green)", warning: "var(--amber)", danger: "var(--red)", info: "var(--blue)", neutral: "var(--text-3)",
};

// หน้า detail สินค้า (รื้อจัดหน้า — มติผู้ใช้ 2026-07-19): "ข้อมูลหนึ่งชิ้นมีบ้านหลังเดียว"
//   - แถบหัว = ตัวตน (ชื่อ/FG/แบรนด์/สร้างเมื่อ) + ตัวเลขความสัมพันธ์ (โครงการ/ใบสั่งซื้อ/ภาษี)
//   - คอลัมน์หลักซ้าย = การ์ดรายละเอียดสเปค "พระเอกของหน้า" ตามด้วยต้นทุน/ใบสั่งซื้อ/
//     โครงการ/เอกสาร — ไม่มีแถบ KPI (StatCards) กับแถวการ์ดโครงการ (ContextCard) ที่
//     เคยโชว์ข้อมูลซ้ำ 2-3 รอบอีกแล้ว
//   - rail ขวา = สรุปสินค้า + Control Panel + ของประกอบด้านภาษี
//
// รอบจัดหน้าใหม่ (มติผู้ใช้ 2026-08-30): หน้านี้เคยเป็นหน้า master data หน้าเดียวที่
// **ไม่ได้ใช้ Control Panel กลาง** — ปุ่มระดับสินค้า (แก้ไข/พักใช้/ลบ) เป็นไอคอนเปล่า
// สามตัวมุมขวาบน ไม่มีป้ายกำกับ ไม่มีสถานะอนุมัติให้เห็น และปุ่ม "ส่งขึ้นทะเบียน
// สรรพสามิต" ยังซ้ำอยู่สองที่ (แบนเนอร์ + การ์ดทะเบียนในราง)
//   ⇒ ยกมาใช้ `DocumentSummaryCard` + `DocumentControlCard` ชุดเดียวกับใบเสนอราคา /
//     ใบสั่งขาย / คำร้อง / ทะเบียนสรรพสามิต · ปุ่มระดับสินค้าทุกปุ่มอยู่ในการ์ดเดียว
//   ⚠️ กติกา ม-49/ม-57: ปุ่มระดับ record อยู่ **ที่เดียว** — แบนเนอร์กับการ์ดทะเบียน
//     จึงเหลือแค่ข้อความและลิงก์ไปดูของที่มีอยู่แล้ว ห้ามวางปุ่มซ้ำกลับไป
/* หัวข้อย่อยในการ์ดสเปค — กินเต็มแถวของกริดสองคอลัมน์ ไม่งั้นหัวข้อไปนั่งครึ่งแถว
   แล้วช่องข้อมูลช่องแรกขึ้นมาอยู่ข้าง ๆ หัวข้อของตัวเอง */
function SpecGroup({ label, hint = null }) {
  return (
    <div className="md:col-span-2 border-b border-[var(--border)] pb-2 mt-2 first:mt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)]">{label}</span>
      {hint ? <p className="text-[11px] text-[var(--text-3)] mt-1">{hint}</p> : null}
    </div>
  );
}

export default function ProductDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEditProducts = useCan("products:edit");
  const canDeleteProducts = useCan("products:delete");
  // พักใช้/เปิดใช้อีกครั้งสงวนสิทธิ์ให้ admin + ผู้มีอำนาจตัดสิน (CD · CM · AE Sup) เท่านั้น — SA
  // (senior_ae/ac/ae) แก้สเปค/ราคาได้ปกติแต่ห้ามพักใช้สินค้าเอง (บังคับที่ server ด้วย).
  const role = useRole();
  /* ⭐ เอกสารที่ RD ออก (MSDS · Spec Sheet · P2 09/11/2026) — แนบได้เฉพาะ RD + แอดมิน (ด่านเดียวกับ server: canAttachIssuedProductDoc) */
  const canEditRdDocs = isRdRole(role) || role === "admin";
  /* ⭐ COA ประจำล็อต (P4 · 09/11/2026) — แนบได้เฉพาะ QC + แอดมิน (ด่านเดียวกับ server: canAttachIssuedProductDoc) */
  const canEditQcDocs = role === "qc" || role === "admin";
  const canToggleActive = isSalesManager(role);
  // Factory cost data is confidential to the tax system. Two tiers (mirrors the
  // server-side redaction): costPrice is visible to SA + RA + admin + FN; the cost
  // breakdown + profit is RA + admin only. Other departments see neither.
  const canSeeMargin = useCan("products:margin");
  // FN (ฝ่ายบัญชี) เห็นราคาผลิตด้วย cap ของตัวเอง — ไม่พ่วง margin (มติผู้ใช้ 2026-08-28)
  // ⚠️ เรียก useCan แยกบรรทัด ห้ามยัดหลัง `||` — ลัดวงจรแล้วฮุคถูกข้าม ลำดับฮุคเพี้ยน
  const canSeeCostOnly = useCan("products:cost");
  const canSeeCost = canSeeMargin || canEditProducts || canSeeCostOnly;
  // Excise tax data (per-unit tax, registrations, breakdown) is confidential to
  // the tax workflow — shown only to roles that can see the tax system
  // (SA/RA/admin via history:view). Other depts (staff/viewer) never see it.
  const canViewTax = useCan("history:view");
  /* ⭐ ผู้อนุมัติกดตัดสินจากหน้านี้ได้ (มติผู้ใช้ 2026-08-30) — เดิมเห็น "รออนุมัติ"
     แล้วต้องถอยไปคิวหน้าทะเบียน ทั้งที่ของที่ต้องอ่านก่อนตัดสิน (สเปค · ราคา ·
     เอกสารแนบ) อยู่บนหน้านี้หน้าเดียว
     ⚠️ ตรรกะ/โมดัลอยู่ในฮุคชุดเดียวกับหน้าทะเบียน ห้ามเขียนซ้ำ */
  const myTeams = useTeams();
  /* คนของโมดูล RD เห็นทางไปคิวลง BOM (ปุ่มของ RD อยู่ที่คิว ไม่ใช่ที่นี่) — ด่านเดียวกับเมนู/API ของคิว */
  const capUser = useCapUser();
  const department = useDepartment();
  const rdViewer = canAccessRd({ ...capUser, department });

  const [product, setProduct] = useState(null);
  // แถวหมวดสินค้า — ใช้ตัดสินธงสรรพสามิต/จดแจ้ง อย. ของหมวด (mig 0131)
  const [productTypes, setProductTypes] = useState(() => apiCache.get("/api/master/product-types") ?? []);
  const [regs, setRegs] = useState([]);
  const [orders, setOrders] = useState([]);     // orders this product appears in (tax-gated)
  const [projects, setProjects] = useState([]); // PM projects this product is in (pm-gated)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [brandOptions, setBrandOptions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  /* แท็บที่เปิดอยู่ (มติเจ้าของ 04/11/2026 "แท็บตามม็อก") · `regKey` = รายการที่แผงทะเบียนในแท็บสรรพสามิตเลือกไว้ก่อน */
  const [tab, setTab] = useState("overview");
  const [regKey, setRegKey] = useState(null);
  /* ช่องสถานะ/ปุ่มในการ์ดจัดการพาไปแท็บ — เลื่อนให้แถบแท็บอยู่บนจอ (จอแคบการ์ดจัดการอยู่เหนือแถบ) */
  const goTab = (key) => {
    setTab(key);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => document.getElementById(TABS_ID)?.scrollIntoView({ block: "start" }));
    }
  };

  const fetchProduct = async () => {
    try {
      const res = await apiFetch(`/api/master/products/${id}`);
      if (res.ok) {
        setProduct(await res.json());
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลสินค้าได้");
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  // Cross-module relations (360-view): registrations + orders + projects from one
  // scoped endpoint. Returns [] for relations the user may not see (tax →
  // history:view, projects → pm:view), so no extra client-side gate is needed.
  /* ลิงก์ทะเบียนจากหน้าอื่น/แจ้งเตือน (`/go/registration/<id>` → `?registration=<id>`) เปิดแท็บสรรพสามิตที่ทะเบียนใบนั้นให้เลย
     อ่านจาก location ครั้งเดียวตอนเปิดหน้า — ไม่ใช้ useSearchParams (หน้านี้ไม่มี Suspense ครอบ) */
  useEffect(() => {
    const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("registration") : null;
    if (wanted) { setRegKey(wanted); setTab("excise"); }
  }, []);
  const loadRelations = useCallback(() => {
    if (!id) { setRegs([]); setOrders([]); setProjects([]); return; }
    apiFetch(`/api/master/products/${id}/relations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRegs(d.registrations || []); setOrders(d.orders || []); setProjects(d.projects || []); } })
      .catch(() => {});
  }, [id]);
  useEffect(() => { loadRelations(); }, [loadRelations]);

  useEffect(() => {
    if (id) fetchProduct();
    // หมวดสินค้า — เอาธง isExcise/requiresFdaNotice มาคุมการ์ดภาษี + ป้าย (mig 0131)
    apiFetch("/api/master/product-types")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set("/api/master/product-types", d || []); setProductTypes(d || []); })
      .catch(() => {});
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ใช้เป็นรายการแนะนำตอนแก้แบรนด์สินค้า
    apiFetch("/api/master/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setCustomers(d || []);
        setBrandOptions(brandThList((d || []).flatMap((c) => c.brands || [])));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* เธรดดึงเองตามจังหวะ poll — แต่คนที่เพิ่งกดอนุมัติ/ตีกลับต้องเห็นผลของตัวเอง
     เดี๋ยวนั้น (พบตอน UAT 2026-08-30: ต้องโหลดหน้าใหม่ถึงเห็นแถวที่เพิ่งเกิด) */
  const [threadToken, setThreadToken] = useState(0);
  const { decide: sendDecision, overrideDialog } = useApprovalDecision({
    endpoint: "/api/master/products",
    onDone: () => { fetchProduct(); setThreadToken((n) => n + 1); },
  });

  // Retire / reactivate a product (parity with customers). Retired products drop
  // out of registration/order pickers but keep history; used when a product is
  // discontinued but can't be deleted (still referenced).
  const toggleActive = async () => {
    const next = !(product.isActive !== false);
    setIsUpdating(true);
    try {
      const res = await apiFetch(`/api/master/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (res.ok) await fetchProduct();
      else setToast({ kind: "error", msg: (await res.json()).error || "ดำเนินการไม่สำเร็จ" });
    } catch {
      setToast({ kind: "error", msg: "เกิดข้อผิดพลาด" });
    }
    setIsUpdating(false);
  };

  const handleToggleActive = () => {
    if (product.isActive !== false) {
      setConfirmBox({
        title: "พักใช้งานสินค้านี้?",
        message: "สินค้าจะหายจากรายการเลือกของระบบอื่น (ประวัติยังอยู่ครบ) — กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมาได้",
        confirmLabel: "พักใช้",
        danger: false,
        onConfirm: toggleActive,
      });
    } else {
      toggleActive();
    }
  };

  /* ⭐ งานทะเบียนสรรพสามิตของ SA อยู่ที่หน้านี้ (มติ 02/11 V7 · V14) — เดิมส่งเป็นร่างแล้วพาไป /tax/registrations
     ซึ่งฝ่ายขายเข้าไม่ได้แล้ว ⇒ เปิดแผงทะเบียนบนหน้า (สร้างคำขอ · แนบเอกสาร · ยื่นให้ RA · ยื่นใหม่) ตัวเดียวกับหน้า SO
     รายการ = ทะเบียนของ FG นี้ที่มองเห็น + คำขอใหม่ของลูกค้าเจ้าของ FG (ถ้ายังไม่มี) */
  const regItems = useMemo(() => {
    if (!product) return [];
    const base = { productId: product.id, fgCode: product.fgCode, label: product.productDescription || product.name || product.fgCode };
    const items = regs.map((r) => ({
      ...base, key: r.id, customerId: r.customerId, customerName: r.customerName, registrationId: r.id,
      stateLabel: statusMeta(r.status).label,
    }));
    if (product.customerId && !regs.some((r) => r.customerId === product.customerId)) {
      items.push({ ...base, key: "new", customerId: product.customerId, customerName: product.customerName || null, registrationId: null });
    }
    return items;
  }, [product, regs]);

  // ดูเหตุผลที่ต้องบอกชะตากรรมของเลขตั้งแต่ตอนยืนยัน ที่หน้ารายละเอียดลูกค้า (mig 0248)
  const handleDelete = () => setConfirmBox({
    title: "ลบรหัสสินค้านี้?",
    message: "ข้อมูลสินค้าจะถูกลบออกจากระบบและกู้คืนไม่ได้"
      + (isAutoFgCode(product?.fgCode)
        ? (isReusableCode(product)
          ? ` · รหัส ${product.fgCode} ยังไม่เคยผ่านอนุมัติ เลขรันนี้จะกลับไปรอออกให้ใบถัดไป`
          : ` · รหัส ${product.fgCode} เคยผ่านอนุมัติแล้ว เลขรันนี้จะไม่ถูกออกให้ใบอื่นอีก`)
        : ""),
    confirmLabel: "ลบสินค้า",
    danger: true,
    onConfirm: async () => {
      setIsUpdating(true);
      try {
        const res = await apiFetch(`/api/master/products/${id}`, { method: "DELETE" });
        if (res.ok) {
          router.push("/database/products");
        } else {
          const errData = await res.json();
          setToast({ kind: "error", msg: errData.error || "ไม่สามารถลบข้อมูลสินค้าได้" });
        }
      } catch (err) {
        setToast({ kind: "error", msg: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์" });
      }
      setIsUpdating(false);
    },
  });

  if (loading) return <SkeletonRows rows={8} />;

  if (error || !product) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{error || "ไม่พบข้อมูลสินค้านี้"}</h2>
        <Link href="/database/products" className="btn btn-primary inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> กลับไปฐานข้อมูลสินค้า
        </Link>
      </div>
    );
  }

  const isExempt = product.isExciseTaxable === false;
  // การ์ดฝั่งภาษี (Excise breakdown + ทะเบียน) และต้นทุนโรงงาน คิดเฉพาะหมวดที่ติ๊ก
  // "เสียภาษีสรรพสามิต" (product_types.isExcise, mig 0131 — มติผู้ใช้ 2026-07-19);
  // หมวดอื่นไม่เข้าข่ายสรรพสามิต ไม่โชว์เลย
  const catFlags = categoryFlags(product.categoryCode || categoryOf(product.fgCode), productTypes);
  // กลุ่ม 03/04 ไม่มีปริมาตร/หน่วยบรรจุ/ต่อลัง — ซ่อนทั้งสองแถว (ดู units.js)
  const showPackaging = hasPackagingFields(product);
  // กลุ่ม 03/04 ไม่มีแบรนด์ — ซ่อนทั้งบรรทัดหัวและช่องในการ์ด (ดู brands.js)
  const showBrand = hasBrandField(product);
  /* "เข้าข่ายสรรพสามิต" ของหน้านี้ = หมวดติ๊ก isExcise **หรือ** สินค้าถูกตั้งให้เสียภาษี (ชุดของขวัญที่มีน้ำหอม — มติ 11/11 ·
     mig 0430 · ของที่ RA บังคับรายตัว) · ของที่ RA ยกเว้นยังเข้าข่าย (โชว์ "ยกเว้น") เหมือนเดิม */
  const isExciseCat = catFlags.isExcise || product.isExciseTaxable === true;
  // ชุดของขวัญ: แบบของชุด + วิธีแจ้งราคาที่เลือก (รวมชุด / รายชิ้น · G5) — ตัวเดียวกับฟอร์มและ API (mig 0430/0431)
  const giftSetTax = isGiftSetCategory(product.categoryCode) && productTypes.length
    ? giftSetExcise(product.formulaComponents || [], productTypes, { mode: giftSetPriceModeOf(product) }) : null;
  // วิธีแจ้งราคาของชุด (R3 · mig 0433 · ทุกชุด) — รายชิ้น = โชว์ราคา/ชิ้นใต้ทุกแถว
  const giftSetPieces = isGiftSetCategory(product.categoryCode) && giftSetPriceModeOf(product) === EXCISE_TAX_BASE.pieces;
  // หน่วยขายจริงของสินค้าตัวนี้ — หน้านี้เคยพูดว่า "ชิ้น" ตายตัวทุกที่ ทั้งที่หน่วยขาย
  // เป็นขวด/หลอด/Kg ได้ (ฟอร์มแก้ไปแล้ว หน้ารายละเอียดเพิ่งตามมา)
  const unit = product.saleUnit || DEFAULT_SALE_UNIT;
  // ราคาขายปลีกใช้กติกาเดียวกับฟอร์ม (กลุ่ม 01 หรือหมวดที่ติ๊กสรรพสามิต) — เดิมหน้านี้
  // ผูกกับ isExcise อย่างเดียว ⇒ ของที่กรอกไปตามกติกาฟอร์มจะหายจากจอ
  // ⭐ + สินค้าที่ต้องเสียภาษี (RA บังคับในหมวดอื่นได้) — คู่ของคำเตือนขาดราคาข้างล่าง ไม่งั้นเตือนแต่ไม่มีแถวราคา (L16c)
  const showRetailPrice = productShowsRetailPrice(product, productTypes);
  // ต้องเสียภาษีตามกฎเดียวของระบบ (ธงรายตัวของ RA ชนะหมวด) — ป้ายหัว/คำกำกับราคาพูดตามตัวนี้ ไม่ใช่ธงหมวดล้วน
  const isTaxable = isProductTaxable(product, productTypes);
  const exciseBadge = productExciseBadge(product, productTypes);

  /* ⚠️ **สินค้าที่ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก = ภาษีคิดออกมา 0**
     ภาษีสรรพสามิตคิดจากราคาขายปลีก (ถอด VAT × 8.8%) ⇒ ไม่มีราคา = ยื่นภาษีขาด
     · ราคานี้กรอกตั้งแต่ตอนเปิดสินค้าไม่ได้ มันมาทีหลัง ระบบจึงบล็อกที่ "ยื่นขึ้นทะเบียน"
     (lib/tax/requirements.js) — ที่นี่คือให้คนที่เปิดสินค้ามาเห็นก่อนว่าต้องเติม
     ⚠️ ขึ้นเฉพาะสินค้าที่ต้องเสียภาษีจริง (กฎเดียวของระบบ — ธงรายตัวของ RA ชนะหมวด) · ไม่ขึ้นถ้า RA ยกเว้นรายตัวไว้
     ⭐ ตัวเดียวกับตัวกรอง "ขาดราคาขายปลีก" ของทะเบียน (`isMissingRetailPrice`) ⇒ ใบที่ตัวกรองนับ เปิดมาต้องเห็นคำเตือน
     🐞 เดิมดูธงหมวดก่อน (`catFlags.isExcise && isExciseTaxable !== false`) ⇒ สินค้าที่ RA บังคับเสียภาษีในหมวดอื่น
        ถูกนับในตัวกรองแต่หน้าใบไม่เตือน (ตรวจตัวเลข 26/10 · L16c) */
  const needsRetailPrice = isMissingRetailPrice(
    { ...product, categoryCode: product.categoryCode || categoryOf(product.fgCode) }, productTypes,
  );

  /* สถานะทะเบียนที่ฝ่ายขายต้องทำต่อ — ใช้ตัดสินว่าโชว์ "คำขอใหม่" ในแผงทะเบียน + ปุ่ม "ขึ้นทะเบียนสรรพสามิต" ในการ์ดจัดการ
     (เฉพาะผู้เห็นระบบภาษี · helper คืน null เองเมื่อไม่เข้าข่าย)
     ⚠️ แบนเนอร์ใต้หัวเดิมถอดแล้ว (04/11/2026) — สถานะอยู่ที่ช่อง "สรรพสามิต" บนแถบสถานะ + แท็บสรรพสามิต (เดิมพูดเรื่องเดียวกัน 4 ที่) */
  const exciseRec = canViewTax ? exciseRecommendationState(product, catFlags, regs) : null;

  /* ── ขั้นลง BOM (mig 0419 · มติเจ้าของ 03/11/2026) ────────────────────────────────
     ⚠️ ด่าน "ส่ง" = `bomSendBlocker` ตัวเดียวกับที่ API ปฏิเสธ — เงื่อนไขของสินค้าไม่ผ่าน = ปุ่มยังโชว์ บอกเหตุ (กฎ UI)
     ⚠️ ทุกปุ่มมีกล่องยืนยันบอกผลก่อนกด (สูตร/ปริมาตรจะล็อก · RD ได้กระดิ่ง) */
  const runBom = async (action, { title, description, detail, confirmLabel, done }) => {
    const yes = await confirmAction({ title, description, detail, confirmLabel });
    if (!yes) return;
    setIsUpdating(true);
    try {
      await apiJson(`/api/products/${id}/bom`, { method: "POST", json: { action }, fallbackError: "บันทึกสถานะ BOM ไม่สำเร็จ" });
      setToast({ kind: "success", msg: done });
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "บันทึกสถานะ BOM ไม่สำเร็จ" });
    }
    // ตีกลับ 409 = จอไม่ตรงกับของจริง (RD รับเรื่องไปก่อน) ⇒ ดึงใหม่ทั้งสองทาง · ปุ่มล็อกจนแถวใหม่มาถึง
    try { await fetchProduct(); } finally { setThreadToken((n) => n + 1); setIsUpdating(false); }
  };

  /* ── Control Panel ของสินค้า ───────────────────────────────────────────────
     สถานะสองแกนของสินค้าหนึ่งตัว ต้องไม่ยัดเป็นป้ายเดียวกัน:
       · ด่านอนุมัติ (approvalStatus) — คุมว่าสินค้าโผล่ใน picker ของระบบอื่นไหม
       · วงจรชีวิต (isActive) — พักใช้/เปิดใช้ ซึ่งคนละเรื่องกับการอนุมัติ
     ⇒ การ์ด control ถือแกนอนุมัติ (มีรางสามขั้น) · การ์ดสรุปถือแกนใช้งาน */
  const approvalView = approvalControlView(product, {
    noun: "สินค้า",
    savedHint: "ทะเบียน FG ถูกสร้างแล้ว",
    doneHint: "สินค้าพร้อมให้ทุกระบบเลือกใช้",
  });
  const workflowSteps = workflowStepsFromIndex(approvalView.steps, approvalView.currentIndex);

  /* ⚠️ **แก้ของที่อนุมัติแล้วแม้ช่องเดียว = หลุดกลับไปรออนุมัติ** (resetApprovalOnEdit)
     ⇒ สินค้าหายจาก picker ทุกหน้าทันที · บอกไว้ใต้ปุ่มแก้ไข ไม่ใช่ให้คนไปเจอเอง
     ยกเว้นหมายเหตุบนเอกสารขาย (mig 0317 · PRODUCT_DOC_NOTE_FIELDS) */
  const canDecide = approvalView.status === "pending" && canApproveMasterRecord(role, myTeams, product);
  const decideSubject = [product.fgCode, product.productDescription].filter(Boolean).join(" · ");
  const editAction = canEditProducts && {
    id: "edit",
    kind: "edit",
    label: "แก้ไขข้อมูลสินค้า",
    variant: canDecide ? "outline" : "filled",
    onClick: () => setShowEdit(true),
    disabled: isUpdating,
  };
  const bomStep = hasBomStep(product);
  const bomStatus = bomStatusOf(product);
  const bomBlocker = bomStep ? bomSendBlocker(product, { formulaComponents: product.formulaComponents }) : "";
  const bomSendAction = bomStep && canEditProducts && (bomStatus == null || bomStatus === "returned") && {
    id: "bom-send",
    kind: "submit",
    label: bomStatus === "returned" ? "ส่ง RD ลง BOM อีกครั้ง" : "ส่ง RD ลง BOM",
    disabled: isUpdating || !!bomBlocker,
    disabledReason: bomBlocker || undefined,
    onClick: () => runBom("send", {
      title: "ส่ง RD ลง BOM",
      description: `ส่ง ${decideSubject} ให้ RD ลง BOM ใน Express`,
      detail: "RD ทุกคนได้กระดิ่ง · สูตร/กลิ่น และปริมาตรบรรจุจะล็อกตั้งแต่ตอนนี้ — ดึงกลับได้จนกว่า RD จะรับเรื่อง",
      confirmLabel: "ส่ง RD",
      done: "ส่ง RD ลง BOM แล้ว",
    }),
  };
  /* ⭐ ส่ง RD เป็นปุ่มหลักเมื่อพร้อมส่งจริงเท่านั้น — FG เก่าที่ยังไม่ผูกสูตร (ส่วนใหญ่ของทะเบียน) ปุ่มหลักยังเป็น "แก้ไข"
     เพราะก้าวถัดไปของมันคือไปผูกสูตรก่อน */
  const bomPrimary = !canDecide && bomSendAction && !bomBlocker;
  const productActions = {
    /* ปุ่มหลัก = ก้าวถัดไปของระเบียน — ใบที่รออนุมัติและคนดูอนุมัติได้ ก้าวถัดไปคือ
       "อนุมัติ" ไม่ใช่ "แก้ไข" (ผังเดียวกับการ์ด control ของหน้าเอกสาร) */
    primaryAction: bomPrimary ? bomSendAction : canDecide
      ? {
        id: "approve",
        kind: "approve",
        label: "อนุมัติสินค้านี้",
        variant: "filled",
        onClick: () => sendDecision(product.id, "approved", { subject: decideSubject }),
        disabled: isUpdating,
      }
      : editAction,
    secondaryActions: [
      canDecide && {
        id: "reject",
        kind: "reject",
        label: "ไม่อนุมัติ — ตีกลับให้แก้ไข",
        onClick: () => sendDecision(product.id, "rejected", { subject: decideSubject }),
        disabled: isUpdating,
      },
      canDecide && editAction,
      bomPrimary && editAction && { ...editAction, variant: "outline" },
      !bomPrimary && bomSendAction,
      bomStep && canEditProducts && bomStatus === "queued" && {
        id: "bom-pullback",
        kind: "withdraw",
        label: "ดึงกลับจาก RD",
        disabled: isUpdating,
        onClick: () => runBom("pullback", {
          title: "ดึงเรื่องลง BOM กลับ",
          description: `ดึง ${decideSubject} ออกจากคิว RD`,
          detail: "RD ยังไม่รับเรื่อง — แถวหายจากคิว RD และสูตร/ปริมาตรกลับมาแก้ได้ · แก้เสร็จแล้วกดส่งใหม่",
          confirmLabel: "ดึงกลับ",
          done: "ดึงเรื่องกลับแล้ว — แก้สูตร/ปริมาตรได้",
        }),
      },
      bomStep && rdViewer && bomStatus && bomStatus !== "returned" && {
        id: "bom-queue",
        kind: "goto",
        label: "เปิดคิวลง BOM",
        href: "/rd/bom",
      },
      canEditProducts && exciseRec?.kind === "unregistered" && regItems.some((item) => item.key === "new") && {
        id: "excise",
        kind: "submit",
        label: "ขึ้นทะเบียนสรรพสามิต",
        onClick: () => { setRegKey("new"); goTab("excise"); },
      },
      /* ⚠️ ปุ่มทางลัด "ทะเบียนสรรพสามิตของสินค้านี้" ถอดแล้ว (04/11/2026) — ช่อง "สรรพสามิต" บนแถบสถานะกับแท็บสรรพสามิตพาไปที่เดียวกัน
         ปุ่มนี้กินที่การ์ดจัดการ ~56px ซึ่งเป็นตัวที่ดันที่ว่างใต้หัวสินค้า (เจ้าของทักตอนรีวิว) */
      canToggleActive && (product.isActive === false
        ? { id: "resume", kind: "resume", icon: ArchiveRestore, label: "เปิดใช้อีกครั้ง", onClick: handleToggleActive, disabled: isUpdating }
        : { id: "pause", kind: "pause", icon: Archive, label: "พักใช้งานสินค้า", onClick: handleToggleActive, disabled: isUpdating }),
    ].filter(Boolean),
    dangerActions: [
      canDeleteProducts && {
        id: "delete",
        kind: "delete",
        label: "ลบสินค้า",
        onClick: handleDelete,
        disabled: isUpdating,
      },
    ].filter(Boolean),
  };

  /* การ์ดจัดการ — ใบเดียวในราง (มติ 04/11/2026: ข้อมูลสรุป/ภาษี/ทะเบียนย้ายไปแท็บของมัน · รางไม่ต้องเลื่อนในตัวอีก) */
  const controlCard = (
  <DocumentControlCard
    /* การ์ดตัวเดียวกับหน้าเอกสาร แต่ของนี้ไม่ใช่เอกสาร — ป้ายบนหัวจึงต้องพูดว่า
       สินค้า ไม่ใช่ "DOCUMENT CONTROL" (ค่าตั้งต้นของการ์ด) */
    eyebrow="PRODUCT CONTROL"
    title="จัดการสินค้า"
    status={approvalView.label}
    statusColor={approvalView.color}
    statusDescription={workflowSteps[approvalView.currentIndex]?.hint}
    /* รางสามขั้น (บันทึก → รออนุมัติ → อนุมัติ) มีความหมายตอนยังไม่ผ่าน · อนุมัติแล้วเหลือบรรทัดสถานะพอ
       (04/11/2026: รางกิน ~220px ของการ์ดที่ต้องสูงไม่เกินหัวสินค้า ไม่งั้นแถบแท็บตกจอ) */
    workflowSteps={approvalView.status === "approved" ? [] : workflowSteps}
    primaryAction={productActions.primaryAction}
    secondaryActions={productActions.secondaryActions}
    dangerActions={productActions.dangerActions}
    busy={isUpdating}
    /* เหตุผลที่ถูกตีกลับต้องอยู่ตรงที่คนกำลังจะกดแก้ ไม่ใช่ให้ไปหาในเธรด */
    notices={(approvalView.rejected && product.rejectionReason) || bomStatus === "returned" ? (
      <>
        {approvalView.rejected && product.rejectionReason
          ? <span className="ui-badge">เหตุผลที่ตีกลับ: {product.rejectionReason}</span>
          : null}
        {/* สถานะ BOM — แกนที่สาม (คนละเรื่องกับอนุมัติ/ใช้งาน) · ปุ่มของมันอยู่ในช่องปุ่มของการ์ดนี้ */}
        {/* BOM ที่ RD ตีกลับ = ก้าวถัดไปของคนเปิดหน้า ⇒ เหตุผลอยู่ข้างปุ่ม "ส่ง RD อีกครั้ง" · สถานะอื่นของ BOM อยู่บนแถบสถานะ + แท็บสเปค */}
        {bomStatus === "returned" ? <ProductBomStatus product={product} /> : null}
      </>
    ) : null}
    footer={approvalView.status === "approved" && canEditProducts
      ? <span>แก้ข้อมูลสินค้าที่อนุมัติแล้ว = กลับไปรออนุมัติใหม่ และสินค้าจะหลุดจากรายการเลือกของทุกระบบจนกว่าจะอนุมัติอีกครั้ง (ยกเว้นหมายเหตุบนเอกสารขาย)</span>
      : null}
  />
  );

  /* ── แถบสถานะรายเรื่องใต้หัว (มติเจ้าของ 04/11/2026 "แท็บตามม็อก") ─────────────────────────────
     หนึ่งช่องต่อหนึ่งเรื่องที่เดินคนละด่าน — ข้อมูลสินค้า (อนุมัติ) · BOM · สรรพสามิต · กดช่องที่มีแท็บของตัวเองแล้วพาไปแท็บนั้น
     ⚠️ ช่องเป็น **ป้ายบอกสถานะ ไม่ใช่ปุ่มทำงาน** — ปุ่มระดับสินค้าอยู่ในการ์ดจัดการที่เดียว (ม-49/ม-57) */
  const showPriceTab = canSeeCost || showRetailPrice;
  // แท็บสรรพสามิต: กติกาเดิมของการ์ดภาษี (หมวดสรรพสามิต) + ของที่ RA บังคับเสียรายตัว + มีทะเบียน/บันทึกยื่นอยู่แล้ว
  const showExciseTab = canViewTax && (isExciseCat || isTaxable || regs.length > 0 || orders.length > 0);
  const ownerReg = regs.find((r) => r.customerId === product.customerId) || regs[0] || null;
  const exciseLane = !showExciseTab ? null
    : isExempt ? { label: "ยกเว้นภาษี", tone: "neutral" }
      : ownerReg ? { label: statusMeta(ownerReg.status).label, tone: statusMeta(ownerReg.status).tone }
        : { label: "ยังไม่ขึ้นทะเบียน", tone: isExciseCat ? "warning" : "neutral" };
  const bomMeta = BOM_STATUS_META[bomStatus || "none"];
  /* จดแจ้ง อย. = ธงของหมวดล้วน (มติเจ้าของ 05/11/2026 "แสดงตามหมวดพอ") — บอกทั้ง "ต้องจด" และ "ไม่ต้องจด" ·
     รายการหมวดยังไม่มา/หมวดไม่อยู่ในทะเบียน = ไม่โชว์ช่อง (ไม่เดาว่าไม่ต้องจด) · ไม่มีแท็บของตัวเอง (เก็บเลขที่/ไฟล์ = พักไว้) */
  const fdaNotice = fdaNoticeState(product.categoryCode || categoryOf(product.fgCode), productTypes);
  const lanes = [
    { key: "approval", label: "ข้อมูลสินค้า", value: approvalView.label, color: approvalView.color, tab: "spec" },
    bomStep && { key: "bom", label: "BOM", value: bomMeta.label, color: bomMeta.color, tab: "spec" },
    exciseLane && { key: "excise", label: "สรรพสามิต", value: exciseLane.label, color: LANE_TONE_COLOR[exciseLane.tone] || LANE_TONE_COLOR.neutral, tab: "excise" },
    fdaNotice && {
      key: "fda", label: "จดแจ้ง อย.", value: fdaNotice.label, hint: `ตามหมวด ${fdaNotice.categoryLabel}`,
      color: fdaNotice.required ? LANE_TONE_COLOR.info : LANE_TONE_COLOR.neutral,
    },
  ].filter(Boolean);

  /* `narrow: "hide"` = หลบบนจอโทรศัพท์ (≤480px) ให้การ์ดจัดการขึ้นมาในจอแรก — ราคา/ภาษีมีบ้านของตัวเองในแท็บราคาและแท็บสรรพสามิต
     (กติกาของ DetailOverview: ซ่อนได้เฉพาะของที่อ่านที่อื่นได้) · ลูกค้ากับขนาดอยู่ครบทุกจอ */
  const headerFacts = [
    { key: "customer", icon: Building2, label: "ลูกค้าเจ้าของ", value: naText(product.customerName) },
    { key: "unit", icon: Package, label: showPackaging ? "ปริมาตร · หน่วยขาย" : "หน่วยขาย", value: showPackaging ? `${formatVolume(product)} · ${unit}` : unit },
    canSeeCost && { key: "cost", icon: Package, label: `ราคาผลิต/${unit} · ก่อน VAT`, value: fmtMoneyOrDash(product.costPrice), narrow: "hide" },
    /* ภาษีต่อหน่วยเป็นบรรทัดรองใต้ราคาขายปลีก (ภาษีคิดจากราคานี้) — ช่องที่ 5 เคยตกไปอยู่แถวเดียวโดด ๆ บนจอคอม */
    showRetailPrice && {
      key: "retail", icon: Package, label: "ราคาขายปลีก รวม VAT", value: fmtMoneyOrDash(product.retailPriceIncVat), narrow: "hide",
      sub: canViewTax && isExciseCat
        ? `ภาษีสรรพสามิต/${unit} ${isExempt ? "ยกเว้น" : fmtMoney((product.exciseTax || 0) + (product.localTax || 0))}`
        : null,
    },
    !showRetailPrice && canViewTax && isExciseCat && {
      key: "tax", icon: Package, label: `ภาษีสรรพสามิต/${unit}`,
      value: isExempt ? "ยกเว้น" : fmtMoney((product.exciseTax || 0) + (product.localTax || 0)), narrow: "hide",
    },
  ].filter(Boolean);

  /* รายการในแผงทะเบียน — "คำขอใหม่" ของลูกค้าเจ้าของโผล่เฉพาะคนที่สร้างได้และสินค้าเข้าข่ายต้องขึ้นทะเบียน
     (ด่านเดียวกับปุ่ม "ขึ้นทะเบียนสรรพสามิต" เดิม) · คนดูอย่างเดียวเห็นแค่ทะเบียนที่มีอยู่ */
  const panelItems = regItems.filter((item) => item.key !== "new" || (canEditProducts && exciseRec?.kind === "unregistered"));

  const tabs = [
    { key: "overview", label: "ภาพรวม" },
    { key: "spec", label: isFragranceOilCategory(product.categoryCode) ? "กลิ่นและบรรจุภัณฑ์" : "สเปคและสูตร" },
    showPriceTab && { key: "price", label: "ราคาและต้นทุน" },
    showExciseTab && { key: "excise", label: regs.length ? `สรรพสามิต (${regs.length})` : "สรรพสามิต" },
    { key: "docs", label: "เอกสาร" },
    { key: "log", label: "ความเคลื่อนไหว" },
  ];
  // แท็บที่ถูกขอแต่ไม่มีสำหรับคนนี้ (ลิงก์ทะเบียนของคนที่ไม่เห็นภาษี) = กลับไปภาพรวม
  const currentTab = tabs.some((t) => t && t.key === tab) ? tab : "overview";

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* แถวย้อนกลับอย่างเดียว — ใช้ปุ่ม router.back() ไม่ใช่ Workspace.back เพราะหน้านี้เข้าได้จากหลายทาง
          ⚠️ **ปุ่มระดับสินค้าไม่อยู่ที่นี่** (2026-08-30) — อยู่ในการ์ดจัดการทั้งชุด · ห้ามวางกลับ (ม-49/ม-57) */}
      <div className="ui-workspace-back-row">
        <button
          type="button"
          className="ui-workspace-back"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/database/products"))}
        >
          <ArrowLeft size={16} /> กลับ
        </button>
      </div>

      {/* ⭐ ผังใหม่ (มติเจ้าของ 04/11/2026 "แท็บตามม็อก" · ทิศเดียวกับมติหน้า SO ข้อ 8): **หัวสินค้า + การ์ดจัดการอยู่แถวบน
          ข้างกัน** · เนื้อทั้งหมดแยกเป็นแท็บเต็มกว้างด้านล่าง — การ์ดจัดการไม่ตามลงมาแล้ว (รางมีแค่การ์ดนี้ใบเดียว)
          🐞 เดิมหน้าเดียวยาว 3,744px (มือถือ 7,107px) · รางขวาเลื่อนในตัว (1,813px ในกล่อง 721px) ซ่อนการ์ดภาษีไว้ใต้กล่อง ·
             มือถือปุ่มจัดการไปอยู่ต่อจากเธรด ~5,900px จากหัว · ราคาโผล่ 5 ที่ · ทะเบียนโผล่ 4 ที่ (วัดจอจริง 04/11)
          ⚠️ จอแคบ (≤1050px) การ์ดจัดการไหลลงมาต่อจากหัวทันที — ก่อนแถบแท็บ ไม่ใช่ก้นหน้า */}
      <DetailPageLayout asideLabel="จัดการสินค้า" aside={controlCard}>
        <SalesDetailOverview
          eyebrow="PRODUCT MASTER"
          /* รายละเอียด = "รหัส · ชื่อ EN·TH" บรรทัดเดียว (มติผู้ใช้ 2026-08-12) */
          title={`${product.fgCode ? `${product.fgCode} · ` : ""}${productNameBoth(product) || productDisplayName(product)}`}
          description={<>{showBrand && <span>แบรนด์ {naText(brandBoth(product.brandName, product.brandNameEn))}</span>}<span>สร้างเมื่อ {fmtDate(product.createdAt)}</span></>}
          /* ⭐ แถวตัวเลขหลักบนหัว (เจ้าของ 04/11/2026 "ที่ว่างใต้หัวสินค้า") — ของที่ทุกคนเปิดหน้ามาดูก่อน อยู่ข้างการ์ดจัดการ
             ในจอแรก · **บ้านเดียวของตัวเลขสรุป** (การ์ด "สรุปตัวเลข" ในแท็บภาพรวมถอดแล้ว) · รายละเอียดราคา/ภาษีอยู่แท็บของมัน */
          facts={headerFacts}
          badges={<>
            <SalesStateBadge label={product.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"} color={product.isActive === false ? "var(--text-3)" : "var(--green)"} />
            {/* ป้ายเดียวกับแถวในทะเบียนสินค้า/หน้าลูกค้า (`productExciseBadge`) — RA ยกเว้น = "ยกเว้นสรรพสามิต" ·
                RA บังคับในหมวดอื่น = "ภาษีสรรพสามิต" (เดิมดูธงหมวดล้วน · ตรวจตัวเลข 26/10 · L16b) */}
            {exciseBadge && (
              <SalesStateBadge
                label={exciseBadge === "taxable" ? "ภาษีสรรพสามิต" : "ยกเว้นสรรพสามิต"}
                color={exciseBadge === "taxable" ? "var(--amber)" : "var(--text-3)"}
              />
            )}
            {/* ⚠️ ป้าย "ต้องจดแจ้ง อย." ย้ายไปเป็นช่อง "จดแจ้ง อย." ในแถบสถานะใต้หัว (05/11/2026) — ช่องนั้นบอกทั้งต้อง/ไม่ต้องจด · ห้ามวางป้ายซ้ำที่นี่ */}
          </>}
        >
          <div className={styles.lanes} role="list" aria-label="สถานะรายเรื่องของสินค้า">
            {lanes.map((lane) => {
              const body = (
                <>
                  <span className={styles.laneLabel}>{lane.label}</span>
                  <span className={styles.laneValue}><i className={styles.laneDot} style={{ "--lane-color": lane.color }} aria-hidden="true" />{lane.value}</span>
                </>
              );
              return (
                <div key={lane.key} role="listitem" className={styles.laneItem}>
                  {lane.tab
                    ? <button type="button" className={styles.lane} onClick={() => goTab(lane.tab)} aria-label={`${lane.label}: ${lane.value} — เปิดแท็บ`}>{body}</button>
                    : <div className={styles.lane} title={lane.hint}>{body}</div>}
                </div>
              );
            })}
          </div>
        </SalesDetailOverview>

        {product.isActive === false && (
          <StatusNotice tone="neutral" title="สินค้านี้ถูกพักใช้งาน">
            ไม่แสดงในรายการเลือกของระบบอื่น — กด “เปิดใช้อีกครั้ง” ที่การ์ดจัดการเพื่อนำกลับมา
          </StatusNotice>
        )}

        {/* ⚠️ ขาดราคาขายปลีก = ภาษีคิดออกมา 0 — อยู่ใต้หัวทุกแท็บ เพราะไม่มีราคาก็ยื่นขึ้นทะเบียนไม่ผ่านอยู่ดี
            (ด่านที่ lib/tax/requirements.js) */}
        {needsRetailPrice && (
          <StatusNotice tone="warning" title="ยังไม่มีราคาขายปลีก — ภาษีสรรพสามิตจะคิดออกมาเป็น 0">
            ภาษีสรรพสามิตคิดจากราคาขายปลีก (ถอด VAT แล้วคูณ 8.8%) · ต้องเติมราคาก่อน จึงจะยื่นขึ้นทะเบียนได้
          </StatusNotice>
        )}
      </DetailPageLayout>

      {/* ── แท็บตามหัวข้อ — ข้อมูลหนึ่งชิ้นมีบ้านหลังเดียว (ราคาอยู่แท็บราคา · ภาษี/ทะเบียน/บันทึกยื่นอยู่แท็บสรรพสามิต) ──
          ⚠️ แท็บสรรพสามิตโผล่เฉพาะคนที่เห็นระบบภาษี (`history:view`) — ของในแท็บนั้นเป็นความลับของสายภาษีทั้งก้อน */}
      <div className={styles.tabsZone}>
        <Tabs id={TABS_ID} ariaLabel="หัวข้อของสินค้า" tabs={tabs} value={currentTab} onChange={setTab} />

        {currentTab === "overview" && (
          <div className={styles.pane}>
            <DetailCard icon={Package} eyebrow="Product" title="ข้อมูลหลักสินค้า">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div className="md:col-span-2">
                  <span className="text-[var(--text-3)] block mb-1">{CUSTOMER_NAME_LABEL} (เจ้าของสินค้า)</span>
                  {product.customerId ? (
                    <Link href={`/database/customers/${product.customerId}`} className="font-semibold text-[var(--accent)] text-sm hover:underline">
                      {product.customerName || product.customerId}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[var(--text)] text-sm">{naText(product.customerName)}</span>
                  )}
                </div>
                <div>
                  <span className="text-[var(--text-3)] block mb-1">รหัสสำเร็จรูป FG Code</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">{product.fgCode}</span>
                </div>
                <div>
                  <span className="text-[var(--text-3)] block mb-1">หมวดหมู่ (Category)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{naText(product.categoryCode)}</span>
                </div>
                {showBrand && (
                  <div className="md:col-span-2">
                    <span className="text-[var(--text-3)] block mb-1">แบรนด์ (Brand Name)</span>
                    <span className="font-semibold text-[var(--text)] text-sm">{naText(brandBoth(product.brandName, product.brandNameEn))}</span>
                  </div>
                )}
              </div>
            </DetailCard>
            {/* PM projects this product is part of — read-only, deep-link to /sa. */}
            {projects.length > 0 && (
            <DetailCard icon={FolderKanban} eyebrow="Projects" title={`โครงการที่เกี่ยวข้อง (${projects.length})`}>
              <div className="space-y-2">
                {projects.map((p) => (
                  /* ห่อทั้งแถวด้วย <Link> ได้ — ป้ายสถานะเป็น span ที่ใส่คลาส ui-badge
                     ที่เหลือเป็นข้อความล้วน ⇒ ไม่มี interactive descendant
                     🪤 จงใจไม่เขียนชื่อคลาสในรูป `className="…"` ตรงนี้ — badgeFamilies.test.mjs
                        นับ *สตริงที่มีชื่อคลาส* จากไฟล์ดิบ (ไม่ล้างคอมเมนต์) ⇒ คอมเมนต์ที่ยกโค้ด
                        มาแปะจะไปบวกตัวเลข "จุดที่ใช้งานจริง" บนหน้าต้นแบบให้เพี้ยน */
                  <Link
                    key={p.id}
                    prefetch={false}
                    href={`/sa/projects/${p.id}`}
                    className="card-link flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--text)]">{p.name || p.code}</span>
                      <span className="text-[var(--text-3)] font-mono ml-2">{p.code}</span>
                    </div>
                    {p.status && <span className="ui-badge shrink-0">{p.status}</span>}
                  </Link>
                ))}
              </div>
            </DetailCard>
            )}
          </div>
        )}

        {currentTab === "spec" && (
          <div className={styles.pane}>
            {/* ลง BOM (mig 0419) — สถานะ/ผู้ส่ง/ผู้รับ/รหัส BOM อยู่ที่นี่ คู่กับสูตร/ปริมาตรที่ล็อกเมื่อส่ง · ปุ่มส่ง/ดึงกลับอยู่ในการ์ดจัดการที่เดียว */}
            {bomStep ? <ProductBomStatus product={product} /> : null}
            <DetailCard icon={Package} eyebrow="Product specification" title={isFragranceOilCategory(product.categoryCode) ? "กลิ่นและบรรจุภัณฑ์" : "สูตรและบรรจุภัณฑ์"}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                {/* ข้อมูลสูตร (0112 → ทะเบียน 0171) — FG ที่ไม่มีสูตร (กล่อง/บรรจุภัณฑ์)
                    โชว์ — ได้ · ชื่อ/รหัส/วันที่เป็น snapshot จากทะเบียน จึงยังอ่านจาก
                    แถวสินค้าตรง ๆ เหมือนเดิม ต่างแค่มีลิงก์กลับไปตัวสูตรเมื่อผูกแล้ว */}
                {/* ชุดของขวัญ (01-037 · มติ 2026-10-05 · mig 0403) — หลายสูตร แถวละ หมวด · สูตร | รหัส | วันที่
                    (ลำดับเดียวกับใบสเปค FM-SA-04) แทนสามช่องของสูตรเดี่ยว · อ่านสดจากทะเบียนสูตร */}
                {isGiftSetCategory(product.categoryCode) ? (
                  <div className="md:col-span-2">
                    <span className="text-[var(--text-3)] block mb-1">สูตรในชุด (Formulas)</span>
                    {(product.formulaComponents || []).length ? (
                      <ol className="flex flex-col gap-2">
                        {product.formulaComponents.map((row, index) => (
                          <li key={row.id || index} className="text-sm">
                            <span className="text-[var(--text-3)]">{`สูตร ${index + 1} · ${row.categoryName || row.categoryCode}`}</span>
                            {/* R2 (mig 0433): แถวที่ยังไม่เลือกสูตร — สูตรต้องครบก่อนส่งลง BOM */}
                            {row.formulaId ? (
                              <span className="block">
                                {/* PF · ชื่อ · วันที่ (มติเจ้าของ 13/11) */}
                                <Link
                                  href={`/database/formulas?q=${encodeURIComponent(row.formulaCode || row.formulaName || "")}`}
                                  className="font-semibold text-[var(--accent)] hover:underline"
                                >
                                  {registryLabel({ code: row.formulaCode, name: row.formulaName, date: row.formulaDate })}
                                </Link>
                              </span>
                            ) : (
                              <span className="block text-[var(--text-2)]">ยังไม่เลือกสูตร — ต้องเลือกก่อนส่งลง BOM</span>
                            )}
                            {/* แจ้งราคารายชิ้น (R3 · mig 0433) — ทุกแถวมีราคา/ชิ้น · ฐานภาษีนับเฉพาะแถวหมวดเสียภาษี */}
                            {giftSetPieces && (
                              <span className="block text-[var(--text-2)]">
                                {`ราคาขายปลีก/ชิ้น ${fmtMoneyOrDash(row.retailPriceIncVat)} (รวม VAT) × ${fmtNumber(row.pieceQty || 1)} ชิ้น`}
                              </span>
                            )}
                            {/* Ingredient List ของสูตรตัวนี้ในชุด (ม-158) — อ่านสดจากทะเบียนสูตร */}
                            {(row.ingredientList || formulaNeedsIngredientList({ id: row.formulaId, categoryCode: row.categoryCode })) && (
                              <div className="mt-1">
                                <span className="text-[var(--text-3)] block">{INGREDIENT_LIST_LABEL}</span>
                                <IngredientListText text={row.ingredientList} lines={2} empty="ยังไม่มี — RD ใส่ที่หน้าสูตร" />
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <span className="font-semibold text-[var(--text)] text-sm">{NA}</span>
                    )}
                    {giftSetTax && (product.formulaComponents || []).length > 0 && (
                      <div className="mt-2">
                        <StatusNotice tone={giftSetTax.kind === GIFT_SET_EXCISE_KIND.none ? "neutral" : !giftSetTax.mode || giftSetTax.missingPriceRows.length ? "warning" : "info"}>
                          {giftSetExciseSummary(giftSetTax)}
                        </StatusNotice>
                      </div>
                    )}
                  </div>
                ) : isFragranceOilCategory(product.categoryCode) ? (
                <>
                {/* หัวน้ำหอม (02-020 · มติ 2026-11-02) — ผูกกลิ่นแทนสูตร ⇒ ชื่อกลิ่น · รหัสกลิ่น แทนสามช่องของสูตร
                    (แถวเดียวกับที่ใบสเปค FM-SA-04 พิมพ์ "กลิ่น / รหัสกลิ่น" ให้ FG ที่ไม่มีสูตร) */}
                <div>
                  <span className="text-[var(--text-3)] block mb-1">กลิ่น (Scent)</span>
                  {product.scentId ? (
                    <Link
                      href={`/database/scents?q=${encodeURIComponent(product.scentCode || product.scentName || "")}`}
                      className="font-semibold text-[var(--accent)] text-sm hover:underline"
                    >
                      {registryLabel({ code: product.scentCode, name: product.scentName, date: product.scentProducedAt })}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[var(--text)] text-sm">{NA}</span>
                  )}
                </div>
                <div>
                  <span className="text-[var(--text-3)] block mb-1">รหัสกลิ่น (Scent Code)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{naText(product.scentCode)}</span>
                </div>
                </>
                ) : (
                <>
                <div>
                  <span className="text-[var(--text-3)] block mb-1">ชื่อสูตร (Formula)</span>
                  {product.formulaId ? (
                    <Link
                      href={`/database/formulas?q=${encodeURIComponent(product.formulaCode || product.formulaName || "")}`}
                      className="font-semibold text-[var(--accent)] text-sm hover:underline"
                    >
                      {registryLabel({ code: product.formulaCode, name: product.formulaName, date: product.formulaDate })}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[var(--text)] text-sm">
                      {naText(product.formulaName)}
                      {product.formulaName && (
                        <span className="ml-2 text-xs font-normal text-[var(--amber)]">ยังไม่ผูกทะเบียนสูตร</span>
                      )}
                    </span>
                  )}
                </div>
                {/* กลิ่น — โผล่เฉพาะสินค้าที่ RD จัดระเบียบแล้วว่าค่าเดิมในช่อง "ชื่อสูตร"
                    จริง ๆ เป็นชื่อกลิ่น (ตอนนั้นระบบยังไม่มีที่เก็บกลิ่น) */}
                {product.scentId && (
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">กลิ่น (Scent)</span>
                    <Link
                      href={`/database/scents?q=${encodeURIComponent(product.scentCode || product.scentName || "")}`}
                      className="font-semibold text-[var(--accent)] text-sm hover:underline"
                    >
                      {registryLabel({ code: product.scentCode, name: product.scentName, date: product.scentProducedAt })}
                    </Link>
                  </div>
                )}
                <div>
                  <span className="text-[var(--text-3)] block mb-1">รหัสสูตร (Formula Code)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{naText(product.formulaCode)}</span>
                </div>
                <div>
                  <span className="text-[var(--text-3)] block mb-1">วันที่สูตร (Formula Date)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.formulaDate ? fmtDate(product.formulaDate) : NA}</span>
                </div>
                {/* ⭐ Ingredient List ของสูตร (ม-158) — อ่านสดจากทะเบียนสูตร · แก้ที่หน้าสูตร (RD) ไม่ใช่ที่นี่
                    · FG ที่ไม่ผูกสูตรไม่มีแถวนี้ (ไม่มีที่ให้มันมาจาก) · สูตรหัวน้ำหอมที่ไม่มีค่าไม่โชว์ */}
                {product.formulaId && (product.formulaIngredientList
                  || formulaNeedsIngredientList({ id: product.formulaId, categoryCode: product.formulaCategoryCode })) && (
                  <div className="md:col-span-2">
                    <span className="text-[var(--text-3)] block mb-1">{INGREDIENT_LIST_LABEL}</span>
                    <IngredientListText text={product.formulaIngredientList} lines={3} empty="ยังไม่มี — RD ใส่ที่หน้าสูตร" />
                  </div>
                )}
                </>
                )}
                {/* กลุ่ม 03/04 ไม่มีของให้วัดขนาด — ไม่มีช่องนี้ทั้งในฟอร์มและหน้านี้ (ดู units.js)
                    โชว์เป็นขีดไว้เฉย ๆ ไม่ได้ เพราะขีดแปลว่า "ยังไม่กรอก" ซึ่งชวนให้คนไปหาอะไรมาใส่ */}
                {showPackaging && (
                <div>
                  <span className="text-[var(--text-3)] block mb-1">ปริมาตร/น้ำหนักบรรจุ (Volume/Weight)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{formatVolume(product)}</span>
                </div>
                )}
                {/* ⭐ สองช่องนี้เป็น **กระจกของใบสเปค FM-SA-04** (mig 0364) — เขียนตอนใบผ่าน
                    การอนุมัติ ไม่ใช่ช่องกรอกที่นี่ · ของจริงอยู่ที่ฉบับที่อนุมัติล่าสุด
                    ⚠️ อ่านอย่างเดียวโดยตั้งใจ: แก้ที่ทะเบียนได้เมื่อไร ทะเบียนกับใบที่ลูกค้า
                       เซ็นจะเดินคนละทางโดยไม่มีอะไรฟ้อง — แก้ที่ใบแล้วค่านี้เดินตามเอง */}
                {showPackaging && (
                <div>
                  <span className="text-[var(--text-3)] block mb-1">ลักษณะเนื้อสาร (Texture)</span>
                  <span className="font-semibold text-[var(--text)] text-sm">{naText(product.texture)}</span>
                </div>
                )}
                {showPackaging && (
                <div>
                  <span className="text-[var(--text-3)] block mb-1">บรรจุภัณฑ์มาตรฐาน (Standard Packaging)</span>
                  <span className="font-semibold text-[var(--text)] text-sm">{naText(product.standardPackaging)}</span>
                </div>
                )}
                <div>
                  {/* หน่วยขาย = หน่วยที่พิมพ์บนใบเสนอราคา/ใบสั่งขาย (คนละอย่างกับปริมาตรบรรจุ)
                      เดิมตั้งได้ในฟอร์มแต่ไม่โชว์ที่ไหนเลย ต้องเปิดฟอร์มแก้ถึงจะรู้ว่าตั้งอะไรไว้ */}
                  <span className="text-[var(--text-3)] block mb-1">หน่วยขาย (Sale Unit)</span>
                  <span className="font-semibold text-[var(--text)] text-sm">{product.saleUnit || DEFAULT_SALE_UNIT}</span>
                </div>
                {showPackaging && (
                <div>
                  <span className="text-[var(--text-3)] block mb-1">จำนวนต่อลัง (Per Case)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.piecesPerCase ? `${fmtNumber(product.piecesPerCase)} ${unit}/ลัง` : NA}</span>
                </div>
                )}
              </div>
            </DetailCard>
            {/* ⭐ ใบสเปคสินค้า FM-SA-04 (mig 0364) — **บ้านของใบอยู่ที่นี่** (มติ 17/09)
                วางถัดจากใบสั่งซื้อเพราะเรียงตาม SO เหมือนกัน · การ์ดคืน null เองเมื่อสินค้า
                อยู่นอกขอบเขต (หมวด 03/04 ไม่ใช่ตัวสินค้า จึงไม่มีสเปกให้ตกลง)
                ⚠️ ห้ามย้ายไปรวมกับ AttachmentsPanel "เอกสารของสินค้า" ข้างล่าง — นั่นคือไฟล์
                   ที่คนอัปโหลดและมีด่านนับ "ยังขาดเอกสาร" ของตัวเอง */}
            <ProductSpecCard productId={id} canEdit={canEditProducts} />
            {/* หมายเหตุบนเอกสารขาย (mig 0317) — ตั้งไว้ที่นี่ ระบบเติมลงรายการในใบเสนอราคา/ใบสั่งขายตอนเลือกสินค้า
                ⚠️ สองภาษาแยกกล่อง — ใบภาษาอังกฤษพิมพ์ช่อง EN ไม่ใช่คำแปลอัตโนมัติ */}
            <DetailCard icon={Package} eyebrow="Document note" title="หมายเหตุบนเอกสารขาย" meta="เติมให้อัตโนมัติใต้รายการสินค้าในใบเสนอราคา/ใบสั่งขาย — คนออกใบแก้เฉพาะใบนั้นได้">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div className="md:col-span-2">
                  <span className="text-[var(--text-3)] block mb-1">ภาษาไทย</span>
                  <div className="readable-field is-compact text-sm">
                    <ReadableText text={product.docNote} lines={3} />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <span className="text-[var(--text-3)] block mb-1">ภาษาอังกฤษ</span>
                  <div className="readable-field is-compact text-sm">
                    <ReadableText text={product.docNoteEn} lines={3} />
                  </div>
                </div>
              </div>
            </DetailCard>
          </div>
        )}

        {currentTab === "price" && (
          <div className={styles.pane}>
            <DetailCard icon={Package} eyebrow="Price" title={`ราคาต่อ${unit}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                {/* ราคาผลิตเคยโผล่เฉพาะการ์ดต้นทุนซึ่งขึ้นเฉพาะหมวดสรรพสามิต ⇒ สินค้าหมวด
                    อื่นกรอกราคาผลิตได้แต่ไม่มีที่ไหนให้ดู ต้องเปิดโมดัลแก้ถึงจะรู้
                    (การ์ดต้นทุน+กำไรยังเป็นของหมวดสรรพสามิตเหมือนเดิมตามมติ 2026-07-19) */}
                {canSeeCost && (
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">ราคาผลิต (ต่อ{unit} · ก่อน VAT)</span>
                    <span className="font-semibold font-mono text-[var(--text)] text-sm">{fmtMoneyOrDash(product.costPrice)}</span>
                    <CostVatLines costPrice={product.costPrice} />
                  </div>
                )}
                {showRetailPrice && (
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      {/* "ฐานคำนวณ" เฉพาะของที่ต้องเสียจริง — RA ยกเว้นไม่มีภาษีให้คิด · RA บังคับในหมวดอื่นคิดจากราคานี้ */}
                      ราคาขายปลีก{isTaxable ? " (ฐานคำนวณสรรพสามิต)" : ""}
                    </span>
                    <span className="font-semibold font-mono text-[var(--text)] text-sm">{fmtMoneyOrDash(product.retailPriceIncVat)}</span>
                  </div>
                )}
              </div>
            </DetailCard>
            {/* Cost breakdown — เฉพาะหมวดสรรพสามิต (ธง isExcise — มติ 2026-07-19); สิทธิ์เดิม: SA เห็น
                costPrice, RA + admin เห็น breakdown + กำไร. แผนกอื่นไม่เห็นเลย. */}
            {canSeeCost && isExciseCat && (
            <DetailCard
              icon={Package}
              eyebrow="Cost"
              title={canSeeMargin ? `โครงสร้างต้นทุนโรงงานและกำไรต่อ${unit}` : `ราคาทุนโรงงานต่อ${unit}`}
            >
              <div className={canSeeMargin ? "grid grid-cols-1 md:grid-cols-2 gap-6 text-xs" : "text-xs"}>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-3)]">ราคาทุนโรงงาน (Cost Price)</span>
                    <span className="font-bold text-[var(--text)] font-mono">{fmtMoneyOrDash(product.costPrice)}</span>
                  </div>
                  {canSeeMargin && (
                    <>
                      <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                        <span>↳ ค่าวัตถุดิบ (65%)</span><span className="font-mono">{fmtMoneyOrDash(product.materialCost)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                        <span>↳ ค่าแรงบรรจุ (Labor Cost)</span><span className="font-mono">{fmtMoneyOrDash(product.laborCost)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                        <span>↳ ค่าจัดส่งสินค้า (Shipping)</span><span className="font-mono">{fmtMoneyOrDash(product.shippingCost)}</span>
                      </div>
                    </>
                  )}
                </div>
                {canSeeMargin && (
                  <div className="flex flex-col justify-between bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)]">
                    <span className="text-[var(--green)] font-semibold block text-[10px] uppercase tracking-wider">กำไรของโรงงานต่อ{unit} (Factory Profit)</span>
                    <div className="text-2xl font-bold font-mono text-[var(--green)] mt-2">{fmtMoneyOrDash(product.factoryProfit)}</div>
                  </div>
                )}
              </div>
            </DetailCard>
            )}
          </div>
        )}

        {currentTab === "excise" && (
          <div className={styles.pane}>
            <div className={styles.grid2}>
              <DetailCard icon={Package} eyebrow="EXCISE" title="การขึ้นทะเบียนสรรพสามิต">
                {/* ⭐ แผงทะเบียนตัวเดียวกับหน้า SO (`RegistrationWorkModal.js` — ที่นี่ใช้แบบฝังหน้า) · สร้างคำขอ · เช็กลิสต์ด่านยื่น ·
                    "ใช้ไฟล์นี้ยื่น" · แนบ · ยื่นให้ RA · ยื่นใหม่ — งานทะเบียนของ SA ทั้งหมดอยู่ที่นี่ (มติ 02/11 V7 · V14) */}
                {panelItems.length ? (
                  <RegistrationWorkPanel
                    key={regKey || "panel"}
                    items={panelItems}
                    initialKey={regKey}
                    canEdit={canEditProducts}
                    onChanged={loadRelations}
                  />
                ) : (
                  <p className="text-xs text-[var(--text-3)] italic">ยังไม่มีการขึ้นทะเบียนภาษีให้ลูกค้ารายใด</p>
                )}
              </DetailCard>
              <div className={styles.stack}>
                {isExciseCat && (
                          <DetailCard icon={Package} eyebrow="EXCISE" title="ภาษีสรรพสามิตต่อหน่วย">
                            {isExempt ? (
                              <div className="bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)] text-center text-xs">
                                <span className="font-bold text-[var(--green)] block text-sm">ได้รับการยกเว้นภาษีสรรพสามิต</span>
                                <p className="text-[10px] text-[var(--text-3)] mt-1">สินค้านี้ได้รับยกเว้น ไม่ต้องชำระภาษีสรรพสามิต</p>
                              </div>
                            ) : (
                              <div className="space-y-4 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-[var(--text-3)]">ราคาขายปลีกรวม VAT</span>
                                  <span className="font-bold text-[var(--text)] font-mono">{fmtMoneyOrDash(product.retailPriceIncVat)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                                  <span>ราคาขายปลีกก่อน VAT (7%)</span><span className="font-mono">{fmtMoneyOrDash(product.retailPriceExVat)}</span>
                                </div>
                                <div className="border-t border-dashed border-[var(--border)] my-2 pt-2"></div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[var(--text-3)]">ภาษีสรรพสามิต (8%)</span>
                                  <span className="font-semibold text-[var(--text)] font-mono">{fmtMoneyOrDash(product.exciseTax)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[var(--text-3)]">ภาษีบำรุงท้องถิ่น (10% ของสรรพสามิต)</span>
                                  <span className="font-semibold text-[var(--text)] font-mono">{fmtMoneyOrDash(product.localTax)}</span>
                                </div>
                                <div className="bg-[var(--red-soft)] p-4 rounded-xl border border-[var(--border)] mt-4">
                                  <span className="text-[var(--red)] font-semibold block text-[10px] uppercase tracking-wider">ภาษีรวมต่อ{unit} (Total Tax Rate)</span>
                                  <div className="text-2xl font-bold font-mono text-[var(--red)] mt-1">{fmtMoney((product.exciseTax || 0) + (product.localTax || 0))}</div>
                                </div>
                              </div>
                            )}
                          </DetailCard>
                )}
              </div>
            </div>
            {/* บันทึกการยื่นภาษี (แถว `orders` · ลิงก์ไป /go/filing) — tax-gated, read-only
                🐞 เดิมชื่อ "ใบสั่งซื้อที่มีสินค้านี้" ทั้งที่ไม่ใช่ใบสั่งซื้อหรือใบสั่งขาย (ตรวจจอ 04/11/2026) */}
            {canViewTax && (
            <DetailCard icon={ShoppingCart} eyebrow="Orders" title={`บันทึกการยื่นภาษีที่มีสินค้านี้ (${orders.length})`}>
              {orders.length === 0 ? (
                <p className="text-xs text-[var(--text-3)] italic">ยังไม่มีบันทึกการยื่นภาษีที่อ้างถึงสินค้านี้</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    /* ห่อทั้งแถวด้วย <Link> ได้ — `<OrderStatusPill>` คืน <span> ที่เหลือเป็น
                       ข้อความล้วน ⇒ ไม่มี interactive descendant (เหตุผลเต็มอยู่ที่การ์ด EXCISE) */
                    <Link
                      key={o.id}
                      prefetch={false}
                      href={`/go/filing/${o.id}`}
                      className="card-link flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold font-mono text-[var(--text)]">{o.quotationRef || o.id}</span>
                        <span className="text-[var(--text-3)] ml-2">{naText(o.customerName)}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-[var(--text-3)]">x{o.productQuantity}</span>
                        <OrderStatusPill status={o.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </DetailCard>
            )}
          </div>
        )}

        {currentTab === "docs" && (
          <div className={styles.pane}>
            {/* เอกสารของสินค้า — สัญญาจ้างผลิต / Artwork ฯลฯ */}
            {/* การ์ดเอกสารตามหมวด — Artwork บังคับเฉพาะกลุ่ม 01 (ODM) กลุ่มบริการ/ค่าออกแบบ/
                รายได้อื่นๆ ไม่มีของให้แนบ · ต้องส่ง docTypes ชุดเดียวกับที่ด่านอนุมัติฝั่ง
                server ใช้ ไม่งั้นจอขึ้น "ยังขาด" แต่กดอนุมัติผ่าน (หรือกลับกัน) */}
            <AttachmentsPanel
              entityType="product"
              entityId={id}
              canEdit={canEditProducts}
              docTypes={productDocTypes(product)}
              title="เอกสารของสินค้า"
              note="Artwork สินค้า = ฉลากที่ใช้ยื่นทะเบียนสรรพสามิต (ไฟล์ชุดเดียวกับแท็บสรรพสามิต — แนบที่ไหนก็ขึ้นทั้งสองที่) · ไฟล์ที่ทะเบียนยื่นไปแล้ว ลบแล้วระบบเก็บไว้ให้ทะเบียน · สัญญาจ้างผลิตย้ายไปผูกกับลูกค้าแล้ว"
            />

            {/* ⭐ เอกสารจาก RD (ศูนย์กลางเอกสารของสินค้า P2 · มติเจ้าของ 09/11/2026: MSDS และ Specification Sheet "ระดับ FG · RD ออก")
                — เก็บที่ตัวสินค้า ฝ่ายขายเปิดส่งลูกค้าได้จากที่นี่ · แนบ/ลบได้เฉพาะ RD + แอดมิน (server ตรวจซ้ำ: canAttachIssuedProductDoc)
                ⚠️ แผงแยกจาก "เอกสารของสินค้า" เพราะคนแนบคนละฝ่าย — แผงนั้น canEdit ตามสิทธิ์แก้สินค้า (ฝ่ายขาย) ·
                สองคีย์นี้ถูกซ่อนจากแผงนั้น (PANEL_HIDDEN_DOC_TYPES) ไม่ตกกอง "อื่นๆ" ที่มีปุ่มลบของฝ่ายขาย */}
            <AttachmentsPanel
              entityType="product"
              entityId={id}
              canEdit={canEditRdDocs}
              docTypes={RD_DOC_TYPES}
              title="เอกสารจาก RD"
              note="MSDS และ Specification Sheet ของ FG นี้ — RD เป็นผู้ออกและแนบ · Specification Sheet ของ RD คนละใบกับใบสเปคสินค้า (FM-SA-04) ในแท็บสเปค"
              cardColumns={1}
            />

            {/* ⭐ COA ประจำล็อต (ศูนย์กลางเอกสารของสินค้า P4 · มติเจ้าของ 09/11/2026: "COA เป็น by FG by lot การผลิต (QC ออก)" ·
                "พิมพ์เลขล็อตเอง") — เก็บที่สินค้า · แนบด้วยฟอร์มรายละเอียดที่บังคับเลขล็อต (server ตรวจซ้ำ: coaLotError) · ยังไม่ผูกงานผลิต
                · ทุกคนที่เปิดสินค้าได้เห็น (ฝ่ายขายส่งลูกค้า) · แนบ/ลบได้เฉพาะ QC + แอดมิน */}
            <AttachmentsPanel
              entityType="product"
              entityId={id}
              canEdit={canEditQcDocs}
              docTypes={QC_DOC_TYPES}
              metaFields={COA_META_FIELDS}
              title="COA ประจำล็อต (QC)"
              note="ผลวิเคราะห์ของแต่ละล็อตการผลิต — QC แนบพร้อมเลขล็อต · หาล็อตที่ต้องการจากเลขล็อตใต้ชื่อไฟล์"
            />

            {/* ⭐ IFRA ของกลิ่นใน FG นี้ (ศูนย์กลางเอกสารของสินค้า P3 · มติเจ้าของ 09/11/2026: "IFRA เก็บ by กลิ่น") — ไฟล์อยู่ที่ **กลิ่น**
                (หน้ากลิ่น) · ที่นี่ดึงมาแสดงทุกกลิ่นของ FG (`fgScents` = กลิ่นที่ผูกตรง + ของสูตร + ทุกสูตรในชุดของขวัญ)
                · RD แนบจากที่นี่ได้ด้วย (ไฟล์ลงที่กลิ่นตัวเดียวกัน) · ฝ่ายขายเปิดดู/ส่งลูกค้าได้ */}
            {(product.fgScents || []).map((scent) => (
              <AttachmentsPanel
                key={scent.id}
                entityType="scent"
                entityId={scent.id}
                canEdit={canEditRdDocs}
                docTypes={ATTACHMENT_TYPES.scent}
                title={`IFRA ของกลิ่น ${scentLabel(scent)}`}
                note="IFRA เก็บที่กลิ่น — FG ทุกตัวที่ใช้กลิ่นนี้เห็นไฟล์ชุดเดียวกัน"
                cardColumns={1}
              />
            ))}

            {/* ⭐ เอกสารสรรพสามิตของสินค้านี้ (ศูนย์กลางเอกสารของสินค้า P1 · มติเจ้าของ 09/11/2026 — "ฐานข้อมูลเก็บข้อมูลของระบบอื่น
                ที่เกี่ยวกับสินค้ากลับเข้ามา") · ฉลากที่แต่ละทะเบียนยื่น + ใบอนุมัติ อ่านอย่างเดียว · ลงมือที่แท็บสรรพสามิต
                ⚠️ ข้อมูลภาษีเป็นของคนที่เห็นภาษีเท่านั้น (ด่านเดียวกับแท็บสรรพสามิต) */}
            {canViewTax && regs.length > 0 && (
              <DetailCard icon={Package} eyebrow="EXCISE" title="เอกสารสรรพสามิตของสินค้านี้"
                meta="ฉลากที่ยื่นมาจาก Artwork ของสินค้าด้านบน · ใบอนุมัติขึ้นทะเบียนแนบโดยฝ่าย RA">
                <ProductRegistrationDocs
                  registrations={regs}
                  onOpen={showExciseTab ? (registrationId) => { setRegKey(registrationId); goTab("excise"); } : undefined}
                />
              </DetailCard>
            )}

            {/* เอกสารลูกค้าเจ้าของ (อ่านอย่างเดียว) — เชื่อมโยงผ่าน product.customerId */}
            {product.customerId && (
              <AttachmentsPanel
                entityType="customer"
                entityId={product.customerId}
                canEdit={false}
                docTypes={customerDocTypes(product.customerType)}
                title={`เอกสารลูกค้าเจ้าของ${product.customerName ? ` — ${product.customerName}` : ""}`}
                note="เอกสารของลูกค้าที่เป็นเจ้าของสินค้านี้ (จัดการได้ที่หน้าข้อมูลลูกค้า)"
              />
            )}
          </div>
        )}

        {currentTab === "log" && (
          <div className={styles.pane}>
            {/* เธรดกลาง (mig 0163) — ด่านอนุมัติเดียวกับลูกค้า: เหตุผลที่ตีกลับถูกล้าง
                ทั้งตอนอนุมัติและตอนแก้ · เธรดเก็บครบทุกรอบไว้กับตัวสินค้า */}
            <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
              <UpdateThread
                entityType="product"
                entityId={id}
                reloadToken={threadToken}
                order="desc"
                placeholder="พิมพ์ข้อความ เช่น ลูกค้าขอเปลี่ยนขนาดบรรจุ..."
                emptyText="ยังไม่มีความเคลื่อนไหว"
              />
            </DetailCard>
          </div>
        )}
      </div>

      {overrideDialog}
      <EditProductModal open={showEdit} product={product} onClose={() => setShowEdit(false)} onSaved={fetchProduct} brandOptions={brandOptions} customers={customers} />
      <ConfirmDialog
        open={!!confirmBox}
        onClose={() => setConfirmBox(null)}
        onConfirm={async () => { await confirmBox?.onConfirm?.(); setConfirmBox(null); }}
        title={confirmBox?.title}
        message={confirmBox?.message}
        confirmLabel={confirmBox?.confirmLabel}
        danger={confirmBox?.danger !== false}
      />
    </>
  );
}
