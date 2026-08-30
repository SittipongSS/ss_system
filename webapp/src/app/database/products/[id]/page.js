"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Archive, ArchiveRestore, ShoppingCart, FolderKanban, AlertTriangle, Clock, MessagesSquare, Send } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import { ActionButton } from "@/components/ui/ActionButtons";
import StatusNotice from "@/components/ui/StatusNotice";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { DEFAULT_SALE_UNIT, formatVolume, hasPackagingFields } from "@/lib/master/units";
import ProductStatusPill from "@/components/ProductStatusPill";
import OrderStatusPill from "@/components/OrderStatusPill";
import EditProductModal from "@/components/EditProductModal";
import CostVatLines from "@/components/database/CostVatLines";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import SkeletonRows from "@/components/ui/Skeleton";
import ReadableText from "@/components/ui/ReadableText";
import Toast from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { customerDocTypes, productDocTypes } from "@/lib/master/attachmentTypes";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { brandThList, brandBoth, hasBrandField } from "@/lib/master/brands";
import { fmtDate, fmtMoney, fmtMoneyOrDash, fmtNumber, productNameBoth, naText, NA } from "@/lib/format";
import { productDisplayName } from "@/lib/master/productIdentity";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { approvalControlView, canApproveMasterRecord } from "@/lib/master/approvalControl";
import useApprovalDecision from "@/components/database/useApprovalDecision";
import { useTeams } from "@/lib/roleContext";
import { categoryOf, categoryFlags, showsRetailPrice } from "@/lib/master/categoryOf";
import { isAutoFgCode, isReusableCode } from "@/lib/master/masterCodes";
import { exciseRecommendationState } from "@/lib/excise/recommendation";
import { statusMeta } from "@/lib/excise/workflow";
import { apiCache } from "@/lib/apiCache";
import { apiFetch } from "@/lib/apiFetch";

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
  // พักใช้/เปิดใช้อีกครั้งสงวนสิทธิ์ให้ admin + ae_supervisor เท่านั้น — SA
  // (senior_ae/ac/ae) แก้สเปค/ราคาได้ปกติแต่ห้ามพักใช้สินค้าเอง (บังคับที่ server ด้วย).
  const role = useRole();
  const canToggleActive = isSuperuser(role);
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
  const [sendingExcise, setSendingExcise] = useState(false);

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
  useEffect(() => {
    if (!id) { setRegs([]); setOrders([]); setProjects([]); return; }
    apiFetch(`/api/master/products/${id}/relations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRegs(d.registrations || []); setOrders(d.orders || []); setProjects(d.projects || []); } })
      .catch(() => {});
  }, [id]);

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

  const { decide: sendDecision, overrideDialog } = useApprovalDecision({
    endpoint: "/api/master/products",
    onDone: fetchProduct,
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

  // ส่ง FG นี้เข้าระบบภาษีเป็นทะเบียนร่าง แล้วพาไปหน้าทะเบียนให้แนบเอกสารต่อ —
  // ลูกค้าเจ้าของถูก derive ฝั่ง server จาก products.customerId จึงส่งแค่ productId
  // (409 = มีทะเบียนอยู่แล้ว เช่น ทะเบียนข้ามทีมที่ผู้ใช้มองไม่เห็น — โชว์ข้อความ server ตรง ๆ)
  const sendToExcise = async () => {
    setSendingExcise(true);
    try {
      const res = await apiFetch("/api/excise-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "ส่งขึ้นทะเบียนไม่สำเร็จ");
      router.push(`/tax/registrations/${payload.id}`);
      return; // นำทางออกจากหน้า — คงสถานะ busy ไว้กันกดซ้ำระหว่างเปลี่ยนหน้า
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "ส่งขึ้นทะเบียนไม่สำเร็จ" });
      setSendingExcise(false);
    }
  };

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
  const isExciseCat = catFlags.isExcise;
  // หน่วยขายจริงของสินค้าตัวนี้ — หน้านี้เคยพูดว่า "ชิ้น" ตายตัวทุกที่ ทั้งที่หน่วยขาย
  // เป็นขวด/หลอด/Kg ได้ (ฟอร์มแก้ไปแล้ว หน้ารายละเอียดเพิ่งตามมา)
  const unit = product.saleUnit || DEFAULT_SALE_UNIT;
  // ราคาขายปลีกใช้กติกาเดียวกับฟอร์ม (กลุ่ม 01 หรือหมวดที่ติ๊กสรรพสามิต) — เดิมหน้านี้
  // ผูกกับ isExcise อย่างเดียว ⇒ ของที่กรอกไปตามกติกาฟอร์มจะหายจากจอ
  const showRetailPrice = showsRetailPrice(product.fgCode, productTypes)
    || product.retailPriceIncVat != null;

  /* ⚠️ **สินค้าที่ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก = ภาษีคิดออกมา 0**
     ภาษีสรรพสามิตคิดจากราคาขายปลีก (ถอด VAT × 8.8%) ⇒ ไม่มีราคา = ยื่นภาษีขาด
     · ราคานี้กรอกตั้งแต่ตอนเปิดสินค้าไม่ได้ มันมาทีหลัง ระบบจึงบล็อกที่ "ยื่นขึ้นทะเบียน"
     (lib/tax/requirements.js) — ที่นี่คือให้คนที่เปิดสินค้ามาเห็นก่อนว่าต้องเติม
     ⚠️ ขึ้นเฉพาะหมวดที่ต้องเสียภาษีจริง และไม่ขึ้นถ้าฝ่าย RA ยกเว้นรายตัวไว้ */
  const needsRetailPrice = catFlags.isExcise
    && product.isExciseTaxable !== false
    && !(Number(product.retailPriceIncVat) > 0);

  // แบนเนอร์แนะนำขึ้นทะเบียนสรรพสามิต — เฉพาะผู้เห็นระบบภาษี; helper คืน null เอง
  // เมื่อไม่เข้าข่าย (หมวดอื่น/พักใช้/ยกเว้นรายตัว/approved แล้ว — rail ขวาโชว์อยู่)
  const exciseRec = canViewTax ? exciseRecommendationState(product, catFlags, regs) : null;
  const exciseBanner = exciseRec && {
    unregistered: {
      tone: "amber",
      title: "สินค้าหมวดสรรพสามิต — ยังไม่ขึ้นทะเบียน",
      detail: "FG นี้ต้องขึ้นทะเบียนสรรพสามิตให้ลูกค้าเจ้าของก่อนเริ่มขาย/ยื่นชำระภาษี — ส่งเข้าระบบภาษีเพื่อเริ่มแนบเอกสารได้เลย",
    },
    incomplete: {
      tone: "amber",
      title: "ทะเบียนสรรพสามิตยังทำไม่เสร็จ",
      detail: `สถานะ: ${statusMeta(exciseRec.reg?.status).label} — แนบเอกสารให้ครบแล้วส่งให้ฝ่าย RA ตรวจ`,
      linkLabel: "ไปทำต่อ",
    },
    rejected: {
      tone: "amber",
      title: "ทะเบียนสรรพสามิตยังทำไม่เสร็จ — ถูกตีกลับ ต้องแก้ไข",
      detail: `สถานะ: ${statusMeta("rejected").label} — แก้ไขตามเหตุผลที่ฝ่าย RA แจ้ง แล้วส่งตรวจใหม่`,
      linkLabel: "ไปแก้ไข",
    },
    pending: {
      tone: "blue",
      title: "ทะเบียนอยู่ระหว่างนิติกรรมตรวจ",
      detail: `สถานะ: ${statusMeta("pending_legal").label} — ฝ่าย RA กำลังตรวจทะเบียนนี้`,
      linkLabel: "ดูสถานะ",
    },
  }[exciseRec.kind];

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
  const productActions = {
    /* ปุ่มหลัก = ก้าวถัดไปของระเบียน — ใบที่รออนุมัติและคนดูอนุมัติได้ ก้าวถัดไปคือ
       "อนุมัติ" ไม่ใช่ "แก้ไข" (ผังเดียวกับการ์ด control ของหน้าเอกสาร) */
    primaryAction: canDecide
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
      canEditProducts && exciseRec?.kind === "unregistered" && {
        id: "excise",
        kind: "submit",
        label: sendingExcise ? "กำลังส่ง..." : "ส่งขึ้นทะเบียนสรรพสามิต",
        onClick: sendToExcise,
        disabled: sendingExcise,
      },
      exciseRec?.reg?.id && {
        id: "excise-open",
        kind: "goto",
        label: "ดูทะเบียนสรรพสามิตของสินค้านี้",
        href: `/tax/registrations/${exciseRec.reg.id}`,
      },
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

  const summaryRows = [
    { id: "unit", label: "หน่วยขาย", value: unit },
    ...(showPackaging ? [{ id: "volume", label: "ปริมาตร/น้ำหนัก", value: formatVolume(product) }] : []),
    { id: "category", label: "หมวดสินค้า", value: product.categoryCode },
    ...(showRetailPrice ? [{ id: "retail", label: "ราคาขายปลีก", value: fmtMoneyOrDash(product.retailPriceIncVat) }] : []),
    ...(canViewTax && isExciseCat
      ? [{ id: "tax", label: `ภาษีต่อ${unit}`, value: isExempt ? "ยกเว้น" : fmtMoney((product.exciseTax || 0) + (product.localTax || 0)) }]
      : []),
  ];

  const productAside = (
    <>
      <DocumentSummaryCard
        title="สรุปสินค้า"
        total={canSeeCost ? fmtMoneyOrDash(product.costPrice) : undefined}
        totalCaption={canSeeCost ? `ราคาผลิตต่อ${unit} · ก่อน VAT` : null}
        rows={summaryRows}
        status={product.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"}
        statusColor={product.isActive === false ? "var(--text-3)" : "var(--green)"}
        statusLabel="สถานะการใช้งาน"
      />

      <DocumentControlCard
        /* การ์ดตัวเดียวกับหน้าเอกสาร แต่ของนี้ไม่ใช่เอกสาร — ป้ายบนหัวจึงต้องพูดว่า
           สินค้า ไม่ใช่ "DOCUMENT CONTROL" (ค่าตั้งต้นของการ์ด) */
        eyebrow="PRODUCT CONTROL"
        title="จัดการสินค้า"
        status={approvalView.label}
        statusColor={approvalView.color}
        statusDescription={workflowSteps[approvalView.currentIndex]?.hint}
        workflowSteps={workflowSteps}
        primaryAction={productActions.primaryAction}
        secondaryActions={productActions.secondaryActions}
        dangerActions={productActions.dangerActions}
        busy={isUpdating}
        /* เหตุผลที่ถูกตีกลับต้องอยู่ตรงที่คนกำลังจะกดแก้ ไม่ใช่ให้ไปหาในเธรด */
        notices={approvalView.rejected && product.rejectionReason
          ? <span className="ui-badge">เหตุผลที่ตีกลับ: {product.rejectionReason}</span>
          : null}
        footer={approvalView.status === "approved" && canEditProducts
          ? <span>แก้ข้อมูลสินค้าที่อนุมัติแล้ว = กลับไปรออนุมัติใหม่ และสินค้าจะหลุดจากรายการเลือกของทุกระบบจนกว่าจะอนุมัติอีกครั้ง (ยกเว้นหมายเหตุบนเอกสารขาย)</span>
          : null}
      />

      {/* ของประกอบด้านภาษี — เฉพาะหมวดสรรพสามิต (ธง isExcise) + tax-gated
          อยู่ท้ายราง ใต้การ์ดจัดการ: เป็นข้อมูลอ้างอิง ไม่ใช่ก้าวถัดไปของคนที่เปิดหน้า */}
      {canViewTax && isExciseCat && (
        <>
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

          <DetailCard icon={Package} eyebrow="EXCISE" title={`การขึ้นทะเบียนภาษีของสินค้านี้ (${regs.length})`}>
            {regs.length === 0 ? (
              /* ⚠️ ปุ่ม "ส่งขึ้นทะเบียนสรรพสามิต" เคยอยู่ตรงนี้ด้วย — ย้ายไป Control
                 Panel ที่เดียว (ม-49/ม-57) · ตรงนี้เหลือข้อความบอกสถานะอย่างเดียว */
              <p className="text-xs text-[var(--text-3)] italic">
                {canEditProducts && exciseRec?.kind === "unregistered"
                  ? "ยังไม่มีการขึ้นทะเบียนภาษีให้ลูกค้ารายใด — กด “ส่งขึ้นทะเบียนสรรพสามิต” ที่การ์ดจัดการสินค้าด้านบน"
                  : "ยังไม่มีการขึ้นทะเบียนภาษีให้ลูกค้ารายใด — ยื่นได้ที่เมนู “ยื่นขึ้นทะเบียนสินค้า”"}
              </p>
            ) : (
              <div className="space-y-2">
                {regs.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/tax/registrations?open=${r.id}`)}
                    className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                  >
                    <span className="font-medium text-[var(--text-2)]">{naText(r.customerName)}</span>
                    <div className="flex items-center gap-3">
                      {r.approvalNumber && <span className="font-mono text-[var(--text-3)]">{r.approvalNumber}</span>}
                      <ProductStatusPill status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </>
      )}
    </>
  );

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* แถวย้อนกลับอย่างเดียว — ใช้ปุ่ม router.back() ไม่ใช่ Workspace.back เพราะ
          หน้านี้เข้าได้จากหลายทาง
          ⚠️ **ปุ่มระดับสินค้าไม่อยู่ที่นี่แล้ว** (2026-08-30) — ย้ายเข้า Control Panel
          ที่รางขวาทั้งชุด · เดิมเป็นไอคอนเปล่าสามตัวที่ต้องเอาเมาส์ไปค้างถึงจะรู้ว่า
          ปุ่มไหนคืออะไร และบนจอสัมผัสไม่มีทางรู้เลย · ห้ามวางกลับ (ม-49/ม-57) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "14px" }}>
        <button
          type="button"
          className="btn ghost topbar-back-btn"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/database/products"))}
        >
          <ArrowLeft size={16} /> กลับ
        </button>
      </div>
      <SalesDetailOverview
        eyebrow="PRODUCT MASTER"
        /* รายละเอียด = "รหัส · ชื่อ EN·TH" บรรทัดเดียว (มติผู้ใช้ 2026-08-12) */
        title={`${product.fgCode ? `${product.fgCode} · ` : ""}${productNameBoth(product) || productDisplayName(product)}`}
        description={<>{showBrand && <span>แบรนด์ {naText(brandBoth(product.brandName, product.brandNameEn))}</span>}<span>สร้างเมื่อ {fmtDate(product.createdAt)}</span></>}
        badges={<>
          <SalesStateBadge label={product.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"} color={product.isActive === false ? "var(--text-3)" : "var(--green)"} />
          {isExciseCat && <SalesStateBadge label="ภาษีสรรพสามิต" color="var(--amber)" />}
          {/* เฟสแรกของ "ต้องจดแจ้ง อย." (มติ 2026-07-20): ป้าย + เตือนตอนสร้าง เท่านั้น */}
          {catFlags.requiresFdaNotice && <SalesStateBadge label="ต้องจดแจ้ง อย." color="var(--blue)" />}
        </>}
        facts={[
          // ตัวเลข "ความสัมพันธ์" เท่านั้น — ฟิลด์ตัวตน (ปริมาตร/ราคา/หมวด) อยู่บ้านเดียว
          // ที่การ์ดสเปคด้านล่าง ไม่โชว์ซ้ำบนแถบหัวอีก
          { icon: FolderKanban, label: "โครงการ", value: `${projects.length} โครงการ` },
          ...(canViewTax ? [{ icon: ShoppingCart, label: "ใบสั่งซื้อ", value: `${orders.length} รายการ` }] : []),
          ...(canViewTax && isExciseCat ? [
            { icon: Package, label: "ทะเบียนภาษี", value: `${regs.length} รายการ` },
            { icon: Package, label: "ภาษี/ชิ้น", value: isExempt ? "ยกเว้น" : fmtMoney((product.exciseTax || 0) + (product.localTax || 0)) },
          ] : []),
        ]}
      />

      {product.isActive === false && (
        <div className="my-[18px] rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ background: "var(--panel-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          <Archive size={16} className="text-[var(--text-3)]" />
          สินค้านี้ถูกพักใช้งาน — ไม่แสดงในรายการเลือกของระบบอื่น (กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมา)
        </div>
      )}

      {/* ⚠️ ขาดราคาขายปลีก = ภาษีคิดออกมา 0 — ขึ้นก่อนแบนเนอร์ทะเบียน เพราะไม่มีราคา
          ก็ยื่นขึ้นทะเบียนไม่ผ่านอยู่ดี (ด่านที่ lib/tax/requirements.js) */}
      {needsRetailPrice && (
        <StatusNotice
          tone="warning"
          title="ยังไม่มีราคาขายปลีก — ภาษีสรรพสามิตจะคิดออกมาเป็น 0"
          className="my-[18px]"
        >
          ภาษีสรรพสามิตคิดจากราคาขายปลีก (ถอด VAT แล้วคูณ 8.8%) · ต้องเติมราคาก่อน จึงจะยื่นขึ้นทะเบียนได้
        </StatusNotice>
      )}

      {/* แบนเนอร์แนะนำขึ้นทะเบียนสรรพสามิต (ช่องเดียวกับ callout พักใช้งาน) —
          amber = มีงานต้องลงมือ, blue = รอฝ่าย RA; approved ไม่มีแบนเนอร์ */}
      {exciseBanner && (
        <div
          className="my-[18px] rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm"
          style={{
            background: exciseBanner.tone === "blue" ? "var(--blue-soft)" : "var(--amber-soft)",
            border: `1px solid ${exciseBanner.tone === "blue" ? "var(--blue)" : "var(--amber)"}`,
            color: "var(--text)",
          }}
        >
          {exciseBanner.tone === "blue"
            ? <Clock size={16} className="shrink-0" style={{ color: "var(--blue)" }} />
            : <AlertTriangle size={16} className="shrink-0" style={{ color: "var(--amber)" }} />}
          <div className="min-w-0">
            <div className="font-semibold">{exciseBanner.title}</div>
            <div className="text-xs text-[var(--text-2)] mt-0.5">{exciseBanner.detail}</div>
          </div>
          {/* ⚠️ **ไม่มีปุ่ม "ส่งขึ้นทะเบียน" ที่แบนเนอร์แล้ว** — ปุ่มระดับสินค้าอยู่ที่
              Control Panel ที่เดียว (ม-49/ม-57) · ที่เหลือตรงนี้คือลิงก์ไปดูทะเบียนที่
              มีอยู่แล้ว ซึ่งเป็นการเดินทาง ไม่ใช่การลงมือกับตัวสินค้า */}
          {exciseRec.kind !== "unregistered" && (
            <div className="ml-auto shrink-0">
              <Link href={`/tax/registrations/${exciseRec.reg?.id}`} className="btn flex items-center gap-1.5">
                {exciseBanner.linkLabel}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ผังเดียวกับใบเสนอราคา/ใบสั่งขาย/คำร้อง: เนื้อซ้าย + รางขวาปักหมุด
          ⚠️ ไม่เปิด `controlFirst` — คนเปิดหน้าสินค้ามาอ่าน "สเปคคืออะไร" ก่อน
          ไม่ได้มาเพื่อกดก้าวถัดไปเหมือนหน้าเอกสาร (ดูเหตุผลเต็มที่ DetailPageLayout) */}
      <div className="mt-[18px]">
      <DetailPageLayout
        asideLabel="สรุปสินค้าและการดำเนินการ"
        aside={productAside}
      >
          {/* ⭐ การ์ดสเปคเรียงตาม **ลำดับเดียวกับฟอร์มสินค้า** (ProductForm section 1-3)
              — คนกรอกกับคนอ่านเดินสายตาชุดเดียวกัน · เดิมเป็นตารางยาว 12 ช่องรวด
              ไม่มีหัวข้อคั่น จึงอ่านไม่ออกว่าช่องไหนเป็นเรื่องเดียวกัน (ชื่อสูตร ·
              รหัสสูตร · วันที่สูตร กระจายอยู่คนละมุมกับปริมาตร/หน่วยขาย) */}
          <DetailCard icon={Package} eyebrow="Product specification" title="ข้อมูลสเปคสินค้า">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <SpecGroup label="1. ข้อมูลหลักสินค้า" />
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

              <SpecGroup label="2. สูตรและบรรจุภัณฑ์" />
              {/* ข้อมูลสูตร (0112 → ทะเบียน 0171) — FG ที่ไม่มีสูตร (กล่อง/บรรจุภัณฑ์)
                  โชว์ — ได้ · ชื่อ/รหัส/วันที่เป็น snapshot จากทะเบียน จึงยังอ่านจาก
                  แถวสินค้าตรง ๆ เหมือนเดิม ต่างแค่มีลิงก์กลับไปตัวสูตรเมื่อผูกแล้ว */}
              <div>
                <span className="text-[var(--text-3)] block mb-1">ชื่อสูตร (Formula)</span>
                {product.formulaId ? (
                  <Link
                    href={`/database/formulas?q=${encodeURIComponent(product.formulaCode || product.formulaName || "")}`}
                    className="font-semibold text-[var(--accent)] text-sm hover:underline"
                  >
                    {product.formulaName || product.formulaCode}
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
                    href={`/database/scents?q=${encodeURIComponent(product.scentName || "")}`}
                    className="font-semibold text-[var(--accent)] text-sm hover:underline"
                  >
                    {product.scentName || product.scentId}
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
              {/* กลุ่ม 03/04 ไม่มีของให้วัดขนาด — ไม่มีช่องนี้ทั้งในฟอร์มและหน้านี้ (ดู units.js)
                  โชว์เป็นขีดไว้เฉย ๆ ไม่ได้ เพราะขีดแปลว่า "ยังไม่กรอก" ซึ่งชวนให้คนไปหาอะไรมาใส่ */}
              {showPackaging && (
              <div>
                <span className="text-[var(--text-3)] block mb-1">ปริมาตร/น้ำหนักบรรจุ (Volume/Weight)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{formatVolume(product)}</span>
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

              <SpecGroup label="3. ราคา" />
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
                    ราคาขายปลีก{isExciseCat ? " (ฐานคำนวณสรรพสามิต)" : ""}
                  </span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{fmtMoneyOrDash(product.retailPriceIncVat)}</span>
                </div>
              )}

              {/* หมายเหตุบนเอกสารขาย (mig 0317) — ตั้งไว้ที่นี่ ระบบเติมลงรายการใน
                  ใบเสนอราคา/ใบสั่งขายตอนเลือกสินค้า
                  ⚠️ สองภาษาแยกกล่อง — ใบภาษาอังกฤษพิมพ์ช่อง EN ไม่ใช่คำแปลอัตโนมัติ */}
              <SpecGroup label="4. หมายเหตุบนเอกสารขาย" hint="เติมให้อัตโนมัติใต้รายการสินค้าในใบเสนอราคา/ใบสั่งขาย — คนออกใบแก้เฉพาะใบนั้นได้" />
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

          {/* Orders this product appears in (information) — tax-gated, read-only. */}
          {canViewTax && (
          <DetailCard icon={ShoppingCart} eyebrow="Orders" title={`ใบสั่งซื้อที่มีสินค้านี้ (${orders.length})`}>
            {orders.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] italic">ยังไม่มีใบสั่งซื้อที่อ้างถึงสินค้านี้</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => router.push(`/tax/filings/${o.id}`)}
                    className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold font-mono text-[var(--text)]">{o.quotationRef || o.id}</span>
                      <span className="text-[var(--text-3)] ml-2">{naText(o.customerName)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[var(--text-3)]">x{o.productQuantity}</span>
                      <OrderStatusPill status={o.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
          )}

          {/* PM projects this product is part of — read-only, deep-link to /sa. */}
          {projects.length > 0 && (
          <DetailCard icon={FolderKanban} eyebrow="Projects" title={`โครงการที่เกี่ยวข้อง (${projects.length})`}>
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/sa/projects/${p.id}`)}
                  className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text)]">{p.name || p.code}</span>
                    <span className="text-[var(--text-3)] font-mono ml-2">{p.code}</span>
                  </div>
                  {p.status && <span className="ui-badge shrink-0">{p.status}</span>}
                </div>
              ))}
            </div>
          </DetailCard>
          )}

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
            note="Artwork สินค้า (ใช้ต่อเรื่องขึ้นทะเบียนสรรพสามิต) และเอกสารอื่นๆ — สัญญาจ้างผลิตย้ายไปผูกกับลูกค้าแล้ว"
          />

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

          {/* เธรดกลาง (mig 0163) — ด่านอนุมัติเดียวกับลูกค้า: เหตุผลที่ตีกลับถูกล้าง
              ทั้งตอนอนุมัติและตอนแก้ · เธรดเก็บครบทุกรอบไว้กับตัวสินค้า */}
          <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
            <UpdateThread
              entityType="product"
              entityId={id}
              order="desc"
              placeholder="พิมพ์ข้อความ เช่น ลูกค้าขอเปลี่ยนขนาดบรรจุ..."
              emptyText="ยังไม่มีความเคลื่อนไหว"
            />
          </DetailCard>
      </DetailPageLayout>
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
