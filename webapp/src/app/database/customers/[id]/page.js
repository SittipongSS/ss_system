"use client";
import { teamLabelNow } from "@/lib/master/salesTeamRegistry";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Archive, ArchiveRestore, ClipboardList, Handshake, MapPin, MessageCircleQuestion, MessagesSquare, Wallet } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import Workspace from "@/components/ui/Workspace";
import { useCan, useCapUser, useDepartment, useRole, useTeams } from "@/lib/roleContext";
import { canEditCustomerBillingRule, canEditIssuedMasterCode, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import CustomerForm, { EMPTY_CUSTOMER, customerToForm } from "@/components/database/CustomerForm";
import CustomerBillingRuleCard from "@/components/database/CustomerBillingRuleCard";
import { customerCreditSummary } from "@/lib/master/customerCredit";
import { customerNameIn } from "@/lib/master/customerName";
import { isAutoArCode, isReusableCode, reclaimableArNumber } from "@/lib/master/masterCodes";
import { approvalStatusOf } from "@/components/ApprovalStatus";
import CustomerZonesPanel from "@/components/service/CustomerZonesPanel";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import CustomerHub from "@/components/database/customerHub/CustomerHub";
import { hubFacts } from "@/lib/master/customerHub";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmDialog, { confirmAction } from "@/components/ui/ConfirmDialog";
import {
  ADDRESS_USE_LABELS, addressLabel, addressTextIn, customerAddresses, isBillingAddress, isShippingAddress,
} from "@/lib/master/addresses";
import { branchLabel } from "@/lib/master/thaiAddress";
import { brandBothOf } from "@/lib/master/brands";
import { fmtPhone, fmtNationalId, fmtMoney, fmtDate, naText } from "@/lib/format";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { approvalControlView, canApproveMasterRecord } from "@/lib/master/approvalControl";
import useApprovalDecision from "@/components/database/useApprovalDecision";
import { apiFetch, apiJson } from "@/lib/apiFetch";

// หน้า detail ลูกค้า (รื้อจัดหน้า — มติผู้ใช้ 2026-07-19): "ข้อมูลหนึ่งชิ้นมีบ้านหลังเดียว"
//   - แถบหัว = ตัวตน (ชื่อ/AR/ประเภท/สร้างเมื่อ) + ตัวเลขความสัมพันธ์
//   - คอลัมน์หลักซ้าย = การ์ดข้อมูลลูกค้า "พระเอกของหน้า" ตามด้วยแท็บความสัมพันธ์ + เอกสาร
//   - rail ขวา = สรุปลูกค้า + Control Panel + ภาระภาษี
//
// รอบจัดหน้าใหม่ (มติผู้ใช้ 2026-08-30 · ทำต่อจากหน้าสินค้า): สองหน้านี้เป็น master
// data ที่เดินด่านอนุมัติชุดเดียวกัน จึงต้องหน้าตาเดียวกัน
//   · ปุ่มระดับลูกค้า (แก้ไข/พักใช้/ลบ) เคยเป็นไอคอนเปล่าในแถวปุ่มย้อนกลับ ⇒ ย้ายเข้า
//     Control Panel ทั้งชุด (ม-49/ม-57: ปุ่มระดับ record อยู่ที่เดียว ห้ามวางกลับ)
//   · **สถานะอนุมัติไม่เคยโผล่บนหน้านี้เลย** ทั้งที่เป็นตัวตัดสินว่าลูกค้าจะขึ้นใน
//     picker ของทุกหน้าไหม · เหตุผลที่ถูกตีกลับก็ต้องไปหาในเธรด ⇒ ขึ้นการ์ดจัดการ
//   · **ผู้ติดต่อกับแบรนด์ย้ายออกจากราง** มาอยู่ในการ์ดข้อมูลลูกค้า — เป็นข้อมูลของ
//     ลูกค้า (section 1 และ 3 ของฟอร์ม) ไม่ใช่สถานะหรือปุ่ม · การ์ดเรียงตามลำดับ
//     เดียวกับฟอร์ม: ข้อมูลหลัก → ที่อยู่ → ผู้ติดต่อ

// แถวความสัมพันธ์ในแท็บ 360-view: ชื่อ + บรรทัดรอง + ของฝั่งขวา · ทุกแท็บทรงเดียวกัน
// เดิมก๊อปมาร์กอัปชุดนี้ซ้ำทีละแท็บ ซึ่งเป็นวิธีที่แท็บพวกนี้เพี้ยนหากันทีละนิด
// (กฎเดียวกับ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ใน AGENTS.md)
/* หัวข้อย่อยในการ์ดข้อมูลลูกค้า — กินเต็มแถวของกริดสามคอลัมน์ ไม่งั้นหัวข้อไปนั่ง
   หนึ่งในสามของแถว แล้วช่องข้อมูลช่องแรกขึ้นมาอยู่ข้าง ๆ หัวข้อของตัวเอง
   (ตัวเดียวกับ SpecGroup ของหน้าสินค้า ต่างแค่จำนวนคอลัมน์ที่ต้อง span) */
function ProfileGroup({ label, hint = null }) {
  return (
    <div className="md:col-span-3 border-b border-[var(--border)] pb-2 mt-2 first:mt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)]">{label}</span>
      {hint ? <p className="text-[11px] text-[var(--text-3)] mt-1">{hint}</p> : null}
    </div>
  );
}

/* ส่วนในแท็บที่มีลิงก์ชี้เข้ามา — ประกาศนอกคอมโพเนนต์ให้อ้างอิงคงที่ (CustomerHub ผูก listener กับค่านี้) */
const BILLING_RULE_HASH_TABS = Object.freeze({ "billing-rule": "profile" });

export default function CustomerDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("customers:edit");
  const canDelete = useCan("customers:delete");
  /* ⭐ ผู้อนุมัติกดตัดสินจากหน้านี้ได้ (มติผู้ใช้ 2026-08-30) — ตรรกะ/โมดัลอยู่ในฮุค
     ชุดเดียวกับหน้าทะเบียน ห้ามเขียนซ้ำ */
  // เหตุผลเดียวกับหน้าสินค้า — คนที่เพิ่งกดต้องเห็นแถวของตัวเองในเธรดทันที
  const [threadToken, setThreadToken] = useState(0);
  const { decide: sendDecision, overrideDialog } = useApprovalDecision({
    endpoint: "/api/master/customers",
    onDone: () => { fetchCustomerData(); setThreadToken((n) => n + 1); },
  });
  // Excise tax data (rollups, orders/filings, per-item tax) is confidential to
  // the tax workflow — shown only to roles allowed to see the tax system.
  const canViewTax = useCan("history:view");
  const role = useRole();
  const myTeams = useTeams();
  const capUser = useCapUser();
  const department = useDepartment();
  const superuser = isSuperuser(role);
  // แอดมินแก้เลข AR ได้ทุกใบ รวมใบที่ระบบออกเลขให้ (มติ 2026-08-24) — ด่านจริงอยู่ที่ PATCH
  const canFixArCode = canEditIssuedMasterCode(role);

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [regs, setRegs] = useState([]); // excise registrations for this customer (tax-gated)
  /* หน้าลูกค้าศูนย์รวม (H1) — ดีล/QT/SO/งวด/คำร้อง/สัญญา/SO ค่าสรรพสามิต กรองตามสิทธิ์รายโมดูลที่ server · null = ยังโหลดไม่เสร็จ */
  const [hub, setHub] = useState(null);
  // ทะเบียนกลิ่น/สูตรของลูกค้ารายนี้ (mig 0171) — scents."customerId" เป็น NOT NULL
  // (มติ 9: กลิ่นของลูกค้า A ใช้กับ B ไม่ได้) ความสัมพันธ์จึงเป็นของลูกค้าเต็มตัว
  // ไม่ใช่ของแถม · อ่านอย่างเดียว จัดการจริงที่ /database/scents · /database/formulas
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
  // ไซต์บริการของลูกค้ารายนี้ (S-4) — อ่านอย่างเดียว จัดการจริงที่ /database/sites
  // ⭐ ลูกค้าหนึ่งรายมีได้หลายจุดติดตั้ง ซึ่ง `customers.address` ช่องเดียวเก็บไม่ได้
  const [serviceSites, setServiceSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null); // { title, message, confirmLabel, danger, onConfirm }

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_CUSTOMER);


  const fetchCustomerData = async () => {
    try {
      const res = await apiFetch(`/api/master/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        /* `billingSkipReady` (ฐานรัน 0393 แล้ว) มาแยกจากแถว — เติมเข้าก้อนที่การ์ด/โมดัลวางบิลอ่าน (`customer.billingSkipReady`) */
        setCustomer(typeof data.billingSkipReady === "boolean" ? { ...data.customer, billingSkipReady: data.billingSkipReady } : data.customer);
        setProducts(data.products || []);

        // Populate edit form (fallback ข้อมูลยุคเก่าอยู่ใน customerToForm)
        setFormData(customerToForm(data.customer));
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลลูกค้าได้");
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id]);

  /* ลิงก์ "ดูที่ทะเบียนลูกค้า"/"ตั้งรอบ" จากหน้าสร้าง SO · แผงงวด · ทะเบียน FN ชี้ `#billing-rule` (กำหนดวางบิล)
     — การ์ดขึ้นหลังโหลดลูกค้าเสร็จ เบราว์เซอร์เลื่อนไปหา anchor ตอนเปิดหน้าไม่เจอ ⇒ เลื่อนเองครั้งเดียวหลังได้ลูกค้า */
  const hasCustomer = Boolean(customer);
  useEffect(() => {
    if (!hasCustomer || typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (hash !== "billing-rule") return;
    window.requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
  }, [hasCustomer]);

  // Cross-module relations (360-view): registrations + ทะเบียนกลิ่น/สูตร + `hub` (สายขาย/การเงิน/คำร้อง · H1)
  // from one scoped endpoint instead of fetching every registration and filtering
  // client-side. The endpoint returns [] for relations the user may not see
  // (tax → history:view, hub → สิทธิ์ของแต่ละโมดูล, กลิ่น/สูตร → products:view), so no
  // extra client-side capability gate is needed here.
  useEffect(() => {
    if (!id) { setRegs([]); setHub(null); setScents([]); setFormulas([]); return; }
    apiFetch(`/api/master/customers/${id}/relations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRegs(d.registrations || []); setHub(d.hub || null);
        setScents(d.scents || []); setFormulas(d.formulas || []);
      })
      .catch(() => {});
  }, [id]);

  /* ทะเบียนพื้นที่บริการ (เฟส 3A · §5A) — คนละคำถามกับแท็บ "ไซต์บริการ" ข้างบน
     ⭐ แท็บนั้นตอบเรื่อง **ปฏิบัติการ**: มีเครื่องกี่ตัว เข้าครั้งหน้าเมื่อไร น้ำหอมใกล้หมดไหม
        แท็บนี้ตอบเรื่อง **ก่อนขาย**: พื้นที่ไหนวัดไว้แล้วเท่าไร ขายไปแล้วหรือยัง
        ⇒ คนละคนอ่าน (TS กับ AE) คนละความละเอียด (ไซต์ กับ พื้นที่) ⇒ แยกแท็บ
     ⚠️ โหลดแยกคำขอเพราะเป็นคนละระบบ · ผู้ใช้ที่ไม่มีสิทธิ์จะได้ 403 → แท็บไม่โผล่ */
  const [zoneRegistry, setZoneRegistry] = useState(null);
  const [zoneRegistryError, setZoneRegistryError] = useState("");
  const [zoneRegistryLoading, setZoneRegistryLoading] = useState(false);

  useEffect(() => {
    if (!id) { setZoneRegistry(null); return undefined; }
    let alive = true;
    setZoneRegistryLoading(true);
    setZoneRegistryError("");
    apiJson(`/api/service/customers/${encodeURIComponent(id)}/zones`)
      .then((d) => { if (alive) setZoneRegistry(d); })
      /* ⚠️ 403 = ไม่มีสิทธิ์ ⇒ แท็บไม่โผล่เลย (เงียบถูกแล้ว) · error อื่นต้องบอก —
         โหลดพังกับ "ลูกค้ารายนี้ไม่มีพื้นที่" หน้าตาเหมือนกันถ้ากลืนทั้งคู่ */
      .catch((e) => {
        if (!alive) return;
        setZoneRegistry(null);
        if (!/403|ไม่มีสิทธิ|forbidden/i.test(e?.message || "")) {
          setZoneRegistryError(e?.message || "โหลดทะเบียนพื้นที่ไม่สำเร็จ");
        }
      })
      .finally(() => { if (alive) setZoneRegistryLoading(false); });
    return () => { alive = false; };
  }, [id]);

  // ไซต์บริการ (S-4) — แยกคำขอเพราะเป็นคนละระบบ (ธุรกิจบริการ ไม่ใช่ฐานข้อมูล)
  // ⚠️ ผู้ใช้ที่ไม่มี service:view จะได้ 403 → ตกเป็น [] เงียบ ๆ แล้วแท็บไม่โผล่
  // (แพตเทิร์นเดียวกับ relations ที่คืน [] สำหรับความสัมพันธ์ที่ผู้ใช้ไม่มีสิทธิ์เห็น)
  useEffect(() => {
    if (!id) { setServiceSites([]); return; }
    apiFetch(`/api/service/sites?customerId=${id}&withSchedule=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setServiceSites(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [id]);

  // ── บันทึกจริง ──────────────────────────────────────────────────────────
  // แยกจาก `handleEditSubmit` เพราะการเปลี่ยน **เลข AR** ต้องผ่านโมดัลยืนยันก่อน
  // (ผลที่ตามมาเรียกคืนไม่ได้ ดูข้อความในโมดัล) · การแก้ช่องอื่นบันทึกตรงเหมือนเดิม
  const saveEdit = async () => {
    setIsSubmitting(true);

    // แผนที่/เอกสารย้ายไปจัดการที่ส่วน "เอกสารของลูกค้า" (attachments) แล้ว.
    const payload = {
      arCode: formData.arCode,
      name: formData.name,
      nameEn: formData.nameEn,               // ชื่ออังกฤษ (mig 0283) — อย่างน้อยหนึ่งภาษา
      /* คำนำหน้า + ชื่อเปล่าของลูกค้าบุคคล (mig 0296) — `name` ข้างบนเป็นกระจกที่ฟอร์ม
         ประกอบไว้แล้ว แต่ **สองช่องนี้ต้องส่งไปด้วย** ไม่งั้นเซิร์ฟเวอร์เขียน null ลงฐาน
         แล้วเปิดฟอร์มรอบหน้าจะไปแยกจากชื่อเต็มใหม่ทุกครั้ง (ผลลัพธ์เหมือนกันจนกว่า
         จะเจอชื่อที่แยกไม่เข้ารูปเดิม แล้วค่าจะเพี้ยนเงียบ ๆ)
         🪤 payload ตัวนี้เป็น whitelist — เพิ่มคอลัมน์ใหม่ให้ลูกค้าต้องเติมชื่อที่นี่ด้วย
            ทั้งหน้าสร้างและหน้าแก้ ไม่งั้นค่าหายเงียบไม่มี error */
      nameTitle: formData.nameTitle,
      namePerson: formData.namePerson,
      customerType: formData.customerType || "company",
      teams: formData.teams,
      taxId: formData.taxId,
      isForeign: formData.isForeign === true,   // ต่างประเทศ (mig 0319) — ตัวตัดสินด่าน 13 หลัก
      phone: formData.phone,
      // ที่อยู่ส่งเป็นลิสต์ก้อนเดียว (0202) — address/shippingAddress/branchCode
      // เป็นกระจกที่ server เขียนเองจากที่อยู่หลัก ไม่ให้ client ส่งสองทาง
      addresses: formData.addresses || [],
      brands: formData.brands || [], // [{th,en}] — API normalize อีกชั้น (0059)
      contacts: formData.contacts || [],
      /* ⚠️ ไม่ส่ง `creditTerms` แล้ว (มติเจ้าของ 26/09 · mig 0390) — เครดิตตั้งที่การ์ด "เครดิตและรอบวางบิล"
         ทางเดียว (เส้น `/billing-rule` ไม่ต้องอนุมัติใหม่) · ข้อความเดิมในฐานคงไว้ อ่านอย่างเดียว */
    };

    try {
      const res = await apiFetch(`/api/master/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsEditing(false);
        await fetchCustomerData();
      } else {
        const errData = await res.json();
        setToast({ kind: "error", msg: errData.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
      }
    } catch (err) {
      setToast({ kind: "error", msg: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
    }
    setIsSubmitting(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const nextAr = String(formData.arCode || "").trim();
    const currentAr = String(customer?.arCode || "").trim();
    if (currentAr && nextAr && nextAr !== currentAr) {
      // เปลี่ยนเลข AR = บอกผลลัพธ์ให้ครบ **ก่อน**กด — ทุกข้อข้างล่างกดแก้กลับแล้วไม่คืน
      // (เลขเดิมไม่กลับเข้ากองเลขคืน · เอกสารที่พิมพ์ไปแล้วอยู่นอกระบบ)
      // · แพตเทิร์นเดียวกับด่านเตือนหมวดภาษีของฟอร์มสินค้า
      // รหัส FG: ตัวที่ยังไม่ขึ้นเอกสารเปลี่ยนตามให้ ตัวที่ขึ้นแล้วคงเดิม (มติเจ้าของ 12/11/2026)
      // — รายชื่อมาจากแผนตัวเดียวกับที่ PATCH เขียนจริง ไม่ได้เดาที่จอ
      let fgPlan = null;
      try {
        fgPlan = await apiJson(`/api/master/customers/${id}/fg-recode?arCode=${encodeURIComponent(nextAr)}`);
      } catch {
        fgPlan = null; // อ่านไม่ได้ ⇒ ยังบอกกติกาได้ แค่ไม่มีรายชื่อ
      }
      const listCodes = (rows) => rows.slice(0, 5).map((r) => r.fgCode).join(", ") + (rows.length > 5 ? ` และอีก ${rows.length - 5} รายการ` : "");
      const fgChanges = fgPlan?.changes || [];
      const fgKept = fgPlan?.kept || [];
      const fgLines = !fgPlan
        ? ["· รหัสสินค้าที่ยังไม่ขึ้นเอกสารจะเปลี่ยนท่อนลูกค้าตามเลขใหม่ (หมวดและเลขรันเดิม) · ตัวที่ขึ้นเอกสารแล้วคงรหัสเดิม (ตรวจรายชื่อไม่สำเร็จ)"]
        : [
          fgChanges.length
            ? `· รหัสสินค้า ${fgChanges.length} รายการจะเปลี่ยนตาม (หมวดและเลขรันเดิม) เช่น ${fgChanges[0].fgCode} → ${fgChanges[0].next}`
            : null,
          fgKept.length
            ? `· รหัสสินค้า ${fgKept.length} รายการคงเลขเดิม เพราะขึ้นเอกสารแล้วหรือเป็นรหัสกรอกมือ: ${listCodes(fgKept)}`
            : null,
        ];
      const accepted = await confirmAction({
        title: "เปลี่ยนเลขที่ลูกค้า (AR Code)",
        description: `${currentAr} → ${nextAr}`,
        detail: [
          /* เลขเดิมได้คืนหรือไม่ ตัดสินด้วยกติกาเดียวกับ server (reclaimableArNumber)
             — ห้ามให้โมดัลสัญญาอย่างหนึ่งแล้ว API ทำอีกอย่าง */
          reclaimableArNumber(customer)
            ? `· เลขเดิม ${currentAr} จะกลับเข้ากองรอออกให้ลูกค้ารายถัดไป (ใบนี้ยังไม่เคยผ่านอนุมัติ)`
            : `· เลขเดิม ${currentAr} จะไม่ถูกนำกลับไปออกให้ลูกค้ารายอื่น`,
          ...fgLines,
          "· ใบเสนอราคา/ใบสั่งขาย/ทะเบียนสรรพสามิตที่พิมพ์รหัสเดิมไปแล้ว ไม่เปลี่ยนตาม",
          fgKept.length || !fgPlan
            ? "· สินค้าที่สร้างหลังจากนี้จะได้ท่อนลูกค้าใหม่ ⇒ ลูกค้ารายนี้จะมีรหัสสินค้าสองท่อนปนกัน"
            : null,
          approvalStatusOf(customer) === "approved"
            ? "· ลูกค้ารายนี้จะกลับไปสถานะ “รออนุมัติ” และหลุดจากลิสต์เลือกทุกหน้าจนกว่าจะอนุมัติใหม่"
            : null,
        ].filter(Boolean).join("\n"),
        confirmLabel: "เปลี่ยนรหัสและบันทึก",
        danger: true,
      });
      if (!accepted) return;
    }
    await saveEdit();
  };

  // Retire / reactivate a customer. Retired (isActive=false) customers drop out
  // of every downstream picker but keep their history — used when a customer
  // stops ordering but can't be deleted (still referenced by orders/projects).
  const toggleActive = async () => {
    const next = !(customer.isActive !== false);
    try {
      const res = await apiFetch(`/api/master/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (res.ok) await fetchCustomerData();
      else setToast({ kind: "error", msg: (await res.json()).error || "ดำเนินการไม่สำเร็จ" });
    } catch {
      setToast({ kind: "error", msg: "เกิดข้อผิดพลาด" });
    }
  };

  const handleToggleActive = () => {
    if (customer.isActive !== false) {
      setConfirmBox({
        title: "พักใช้งานลูกค้ารายนี้?",
        message: "ลูกค้าจะหายจากรายการเลือกของระบบอื่น (ประวัติยังอยู่ครบ) — กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมาได้",
        confirmLabel: "พักใช้",
        danger: false,
        onConfirm: toggleActive,
      });
    } else {
      toggleActive();
    }
  };

  // ชะตากรรมของเลขรันต้องบอก **ก่อนกดลบ** ไม่ใช่หลัง — กดยืนยันแล้วหน้าเด้งกลับไปที่
  // ทะเบียนทันที ข้อความหลังลบจึงไม่มีใครได้อ่าน · และผู้ใช้ไม่ได้เป็นคนตั้งรหัสเอง
  // จึงไม่มีทางรู้ว่าเลขนั้นจะกลับมาหรือหายถาวร ถ้าไม่เขียนไว้ตรงนี้ (mig 0248)
  const handleDelete = () => setConfirmBox({
    title: "ลบข้อมูลลูกค้ารายนี้?",
    message: "ข้อมูลลูกค้าจะถูกลบออกจากระบบและกู้คืนไม่ได้"
      + (isAutoArCode(customer?.arCode)
        ? (isReusableCode(customer)
          ? ` · รหัส ${customer.arCode} ยังไม่เคยผ่านอนุมัติ เลขนี้จะกลับไปรอออกให้รายถัดไป`
          : ` · รหัส ${customer.arCode} เคยผ่านอนุมัติแล้ว เลขนี้จะไม่ถูกออกให้รายอื่นอีก`)
        : ""),
    confirmLabel: "ลบลูกค้า",
    danger: true,
    onConfirm: async () => {
      try {
        const res = await apiFetch(`/api/master/customers/${id}`, { method: "DELETE" });
        if (res.ok) {
          router.push("/database/customers");
        } else {
          const errData = await res.json();
          setToast({ kind: "error", msg: errData.error || "ไม่สามารถลบข้อมูลได้" });
        }
      } catch (err) {
        setToast({ kind: "error", msg: "เกิดข้อผิดพลาดในการลบข้อมูล" });
      }
    },
  });

  if (loading) return <SkeletonRows rows={8} />;

  if (error || !customer) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">
          {error || "ไม่พบข้อมูลลูกค้ารายนี้"}
        </h2>
        <p className="text-[var(--text-3)] mb-6">
          ลูกค้าที่คุณกำลังพยายามเข้าถึงอาจถูกลบหรือไม่มีอยู่ในระบบ
        </p>
        <Link href="/database/customers" className="btn btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={16} /> กลับไปยังข้อมูลลูกค้า
        </Link>
      </div>
    );
  }

  // Field cell for the profile grid.
  const Field = ({ label, value, mono }) => (
    <div>
      <span className="text-[var(--text-3)] block mb-1 text-[11px]">{label}</span>
      <span className={`font-semibold text-[var(--text)] text-sm ${mono ? "font-mono" : ""}`}>{naText(value)}</span>
    </div>
  );

  /* ตัวเลขบนหัว (หน้าลูกค้าศูนย์รวม H1) — กลุ่มที่ไม่มีสิทธิ์ = null ⇒ ไม่วาดช่องนั้น */
  const facts = hubFacts(hub || {});
  const teamsLabel = naText((customer.teams?.length ? customer.teams : customer.team ? [customer.team] : []).map((t) => teamLabelNow(t)).join(", "));

  // ที่อยู่ (0202) — แถวที่ยังไม่ backfill อ่านจากช่องเดี่ยวเดิม ไม่ใช่โชว์ว่าง
  const addresses = customerAddresses(customer);
  const primaryBillingIndex = addresses.findIndex(isBillingAddress);
  const primaryShippingIndex = addresses.findIndex(isShippingAddress);

  /* ── Control Panel ของลูกค้า ───────────────────────────────────────────────
     สองแกนเหมือนหน้าสินค้า: ด่านอนุมัติ (คุมว่าขึ้น picker ไหม) กับวงจรชีวิต
     (พักใช้/เปิดใช้) · การ์ด control ถือแกนอนุมัติ · การ์ดสรุปถือแกนใช้งาน */
  const approvalView = approvalControlView(customer, {
    noun: "ลูกค้า",
    savedHint: "ทะเบียนลูกค้าถูกสร้างแล้ว",
    doneHint: "ลูกค้าพร้อมให้ออกเอกสารและผูกสินค้าได้",
  });
  const workflowSteps = workflowStepsFromIndex(approvalView.steps, approvalView.currentIndex);

  const canDecide = approvalView.status === "pending" && canApproveMasterRecord(role, myTeams, customer);
  /* รอบวางบิล (mig 0389 · มติเจ้าของ 25/09 ข้อ 4) — ฝ่ายขายทีมที่ดูแล **และฝ่ายบัญชี** แก้ได้
     ⚠️ ด่านคนละตัวกับ `canEdit` ข้างบน: FN ไม่มี customers:edit แต่ต้องเห็นปุ่มแก้รอบวางบิล ·
     ตัวตัดสินตัวเดียวกับ API (`canEditCustomerBillingRule`) — ส่งฝ่าย + ทีมเข้าไปด้วย ไม่งั้นแคบผิด */
  const canEditBillingRule = canEditCustomerBillingRule({ ...capUser, department, teams: myTeams }, customer);
  const decideSubject = [customer.arCode, customerNameIn(customer)].filter(Boolean).join(" · ");
  const editAction = canEdit && {
    id: "edit",
    kind: "edit",
    label: "แก้ไขข้อมูลลูกค้า",
    variant: canDecide ? "outline" : "filled",
    onClick: () => setIsEditing(true),
  };
  const customerActions = {
    /* ปุ่มหลัก = ก้าวถัดไปของระเบียน (ผังเดียวกับหน้าสินค้า/หน้าเอกสาร) */
    primaryAction: canDecide
      ? {
        id: "approve",
        kind: "approve",
        label: "อนุมัติลูกค้ารายนี้",
        variant: "filled",
        onClick: () => sendDecision(customer.id, "approved", { subject: decideSubject }),
      }
      : editAction,
    secondaryActions: [
      canDecide && {
        id: "reject",
        kind: "reject",
        label: "ไม่อนุมัติ — ตีกลับให้แก้ไข",
        onClick: () => sendDecision(customer.id, "rejected", { subject: decideSubject }),
      },
      canDecide && editAction,
      canEdit && (customer.isActive === false
        ? { id: "resume", kind: "resume", icon: ArchiveRestore, label: "เปิดใช้อีกครั้ง", onClick: handleToggleActive }
        : { id: "pause", kind: "pause", icon: Archive, label: "พักใช้งานลูกค้า", onClick: handleToggleActive }),
    ].filter(Boolean),
    dangerActions: [
      canEdit && canDelete && { id: "delete", kind: "delete", label: "ลบลูกค้า", onClick: handleDelete },
    ].filter(Boolean),
  };

  const customerAside = (
    <>
      <DocumentSummaryCard
        title="สรุปลูกค้า"
        rows={[
          { id: "type", label: "ประเภทลูกค้า", value: customer.customerType === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล" },
          { id: "team", label: "ทีมดูแล", value: teamsLabel },
          { id: "tax", label: "เลขผู้เสียภาษี", value: customer.taxId ? fmtNationalId(customer.taxId) : "" },
          /* วางบิลและกำหนดชำระ (mig 0390 → รุ่นสี่ 0393) — ประโยคนโยบาย (รูปย่อชุดเดียวกับทะเบียนการชำระ · "ไม่ต้องวางบิล" …)
             ยังไม่ระบุ = ข้อความเดิมที่พิมพ์ไว้ (บอกว่าเป็นของเดิม) · ไม่มีทั้งคู่ = ขีด
             ⭐ ป้ายชื่อเดียวกับหัวการ์ดข้างล่าง (review 29/09 — ค่าเป็นคำตอบรุ่นสี่แล้ว "เงื่อนไขเครดิต: ไม่ต้องวางบิล" อ่านไม่รู้เรื่อง)
             ⭐ ประโยคอยู่ที่ `lib/master/customerCredit` ตัวเดียว — คอลัมน์เดียวกันในไฟล์ Excel ทะเบียนลูกค้าเรียกตัวนี้ */
          { id: "credit", label: "วางบิลและกำหนดชำระ", value: customerCreditSummary(customer) },
          { id: "addresses", label: "ที่อยู่", value: `${addresses.length} รายการ` },
          { id: "contacts", label: "ผู้ติดต่อ", value: `${(customer.contacts || []).length} คน` },
        ]}
        status={customer.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"}
        statusColor={customer.isActive === false ? "var(--text-3)" : "var(--green)"}
        statusLabel="สถานะการใช้งาน"
      />

      <DocumentControlCard
        /* การ์ดตัวเดียวกับหน้าเอกสาร แต่ของนี้ไม่ใช่เอกสาร — ป้ายบนหัวต้องพูดว่าลูกค้า */
        eyebrow="CUSTOMER CONTROL"
        title="จัดการลูกค้า"
        status={approvalView.label}
        statusColor={approvalView.color}
        statusDescription={workflowSteps[approvalView.currentIndex]?.hint}
        workflowSteps={workflowSteps}
        primaryAction={customerActions.primaryAction}
        secondaryActions={customerActions.secondaryActions}
        dangerActions={customerActions.dangerActions}
        /* เหตุผลที่ถูกตีกลับต้องอยู่ตรงที่คนกำลังจะกดแก้ ไม่ใช่ให้ไปหาในเธรด
           ⚠️ ช่องนี้ถูกล้างทุกครั้งที่อนุมัติ/แก้ (resetApprovalOnEdit) — รอบก่อน ๆ
           อ่านย้อนได้ที่เธรดเท่านั้น */
        notices={approvalView.rejected && customer.rejectionReason
          ? <span className="ui-badge">เหตุผลที่ตีกลับ: {customer.rejectionReason}</span>
          : null}
        /* ⚠️ ต่างจากสินค้า: ผู้ติดต่อ/ที่อยู่ลิสต์ **ยกเว้น** จากการอนุมัติใหม่
           (CUSTOMER_CONTACT_FIELDS + CUSTOMER_ADDRESS_EXEMPT_FIELDS) — ชื่อ เลขภาษี
           สาขา ที่อยู่ออกเอกสาร รหัส AR ไม่ยกเว้น เพราะไปโผล่บนเอกสารถึงกรมสรรพสามิต
           · รอบวางบิล (mig 0389) บันทึกผ่านเส้นแยก `/billing-rule` ซึ่งไม่แตะด่านอนุมัติเลย (มติ 25/09 ข้อ 4) */
        footer={approvalView.status === "approved" && canEdit
          ? <span>แก้ชื่อ · เลขผู้เสียภาษี · ที่อยู่ออกเอกสาร · รหัส AR = กลับไปรออนุมัติใหม่ และลูกค้าจะหลุดจากรายการเลือกทุกหน้าจนกว่าจะอนุมัติอีกครั้ง (แก้ผู้ติดต่อ ที่อยู่จัดส่ง หรือเครดิตและรอบวางบิลไม่กระทบ)</span>
          : null}
      />

    </>
  );

  return (
    <Workspace
      hideHeader
      back={{ href: "/database/customers", label: "กลับไปข้อมูลลูกค้า" }}
      /* ⚠️ **ปุ่มระดับลูกค้าไม่อยู่แถวนี้แล้ว** (2026-08-30) — ย้ายเข้า Control Panel
         ที่รางขวาทั้งชุด · เดิมเป็นไอคอนเปล่าที่ต้องเอาเมาส์ไปค้างถึงจะรู้ว่าปุ่มไหน
         คืออะไร และบนจอสัมผัสไม่มีทางรู้เลย · ห้ามวางกลับ (ม-49/ม-57) */
    >
      <Toast toast={toast} onClose={() => setToast(null)} />
      <SalesDetailOverview
        eyebrow="CUSTOMER MASTER"
        /* รายละเอียด = "รหัส · ชื่อ" บรรทัดเดียว (มติผู้ใช้ 2026-08-12) */
        title={`${customer.arCode ? `${customer.arCode} · ` : ""}${customerNameIn(customer)}`}
        description={<><span>{customer.customerType === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล"}</span><span>สร้างเมื่อ {fmtDate(customer.createdAt)}</span></>}
        badges={<SalesStateBadge label={customer.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"} color={customer.isActive === false ? "var(--text-3)" : "var(--green)"} />}
        facts={[
          /* ⭐ ตัวเลขบนหัว (หน้าลูกค้าศูนย์รวม H1) — ช่องที่ผู้ดูไม่มีสิทธิ์ไม่วาด (hubFacts คืน null · มติ 4)
             Actual = ตัวแบ่งยอดกลาง splitSalesOrderAmounts (ไม่รวมใบย้อนหลัง/ค่าสรรพสามิต · รออนุมัติไม่นับ) */
          ...(facts.actual ? [{ icon: ClipboardList, label: "ยอด Actual สะสม", value: `${fmtMoney(facts.actual.amount)} · ${facts.actual.orders} ใบ` }] : []),
          ...(facts.openDeals ? [{ icon: Handshake, label: "ดีลเปิดอยู่", value: `${facts.openDeals.count} ดีล · ${fmtMoney(facts.openDeals.value)}` }] : []),
          ...(facts.outstanding ? [{ icon: Wallet, label: "ค้างชำระ", value: `${fmtMoney(facts.outstanding.amount)}${facts.outstanding.overdue ? ` · เกินกำหนด ${facts.outstanding.overdue} งวด` : ""}` }] : []),
          ...(facts.openRequests ? [{ icon: MessageCircleQuestion, label: "คำร้องค้าง", value: `${facts.openRequests.count} ใบ` }] : []),
          { icon: Building2, label: "ทีมดูแล", value: teamsLabel },
        ]}
      />

      {customer.isActive === false && (
        <div className="my-[18px] rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ background: "var(--panel-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          <Archive size={16} className="text-[var(--text-3)]" />
          ลูกค้ารายนี้ถูกพักใช้งาน — ไม่แสดงในรายการเลือกของระบบอื่น (กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมา)
        </div>
      )}

      {/* ผังเดียวกับหน้าสินค้า/ใบเสนอราคา/ใบสั่งขาย: เนื้อซ้าย + รางขวาปักหมุด
          ⚠️ ไม่เปิด `controlFirst` — คนเปิดหน้าลูกค้ามาอ่านข้อมูลลูกค้าก่อน ไม่ได้มา
          เพื่อกดก้าวถัดไปเหมือนหน้าเอกสาร (เหตุผลเต็มอยู่ที่ DetailPageLayout) */}
      <DetailPageLayout asideLabel="สรุปลูกค้าและการดำเนินการ" aside={customerAside}>
          {/* ⭐ หน้าลูกค้าศูนย์รวม (มติเจ้าของ 13/11/2026 · docs/customer-hub-plan.md) — ทั้งหน้าเป็นแท็บชุดเดียว
              ภาพรวม (เปิดมาที่นี่ · มติ 2 · H2) · ข้อมูลลูกค้า · การขาย (ตามดีล) · สินค้า · คำร้อง · การเงิน · สรรพสามิต ·
              บริการ · เอกสาร · ความเคลื่อนไหว · คำค้นช่องเดียวกรองทุกแท็บรายการ · แท็บที่ผู้ดูไม่มีสิทธิ์ไม่โผล่
              ⚠️ แท็บ "การยื่นชำระภาษี" (ตาราง orders 0 แถว) และ "โครงการ" (ถอดโครงการทาง ก.) ถอดแล้ว (H1)
              ⚠️ การ์ดข้อมูลลูกค้า · วางบิล · ไฟล์แนบ · เธรด ยังเป็นของหน้านี้ (ฟอร์ม/ด่าน/เธรดผูกกับ state ที่นี่) — ส่งเข้าแท็บเป็น render function */}
          <CustomerHub
            hub={hub}
            products={products}
            scents={scents}
            formulas={formulas}
            registrations={canViewTax ? regs : []}
            service={serviceSites.length > 0 ? {
              /* โผล่เมื่อมีไซต์จริงเท่านั้น — ลูกค้า OEM ส่วนใหญ่ไม่มีระบบกระจายกลิ่น (เงื่อนไขผูกกับไซต์ ไม่ใช่จำนวนพื้นที่) */
              label: `พื้นที่บริการ (${zoneRegistry?.zoneCount || 0} พื้นที่ · ${serviceSites.length} สถานที่)`,
              render: () => (
                <CustomerZonesPanel
                  registry={zoneRegistry}
                  sitesOps={serviceSites}
                  loading={zoneRegistryLoading}
                  error={zoneRegistryError}
                />
              ),
            } : null}
            /* แท็บเริ่มต้น = ภาพรวม (มติ 2) · ลิงก์ `#billing-rule` (หน้าสร้าง SO · แผงงวด · ทะเบียน FN) เปิดแท็บข้อมูลลูกค้า */
            hashTabs={BILLING_RULE_HASH_TABS}
            profile={() => (
              <>
                {/* ⭐ การ์ดนี้เรียงตาม **ลำดับเดียวกับฟอร์มลูกค้า** (CustomerForm section 1-3)
                    — คนกรอกกับคนอ่านเดินสายตาชุดเดียวกัน · แบรนด์กับผู้ติดต่อเคยอยู่ในราง
                    ขวา ทั้งที่เป็นช่องในฟอร์มนี้ ไม่ใช่สถานะหรือปุ่ม */}
                <DetailCard icon={Building2} eyebrow="Customer profile" title="ข้อมูลลูกค้า บริษัท/บุคคล">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                    <ProfileGroup label="1. ข้อมูลหลัก" />
                    {/* ชื่ออังกฤษ (mig 0283) — ช่องของเอกสาร IFRA/MSDS · ว่าง = ขีดตามกติกา
                        ค่าว่างของทั้งระบบ (ต่างจากบรรทัดอังกฤษใต้ที่อยู่ ซึ่งเป็นบรรทัดเสริม
                        ไม่ใช่ช่อง จึงตัดทิ้งเมื่อว่าง) */}
                    <Field label="ชื่อภาษาอังกฤษ" value={customer.nameEn} />
                    <Field label="ประเภทลูกค้า" value={customer.customerType === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล (บริษัท)"} />
                    <Field label="ทีมดูแล" value={teamsLabel} />
                    <Field label="รหัสลูกค้า AR Code" value={customer.arCode} mono />
                    <Field label="เลขผู้เสียภาษี (Tax ID)" value={customer.taxId ? fmtNationalId(customer.taxId) : ""} mono />
                    <Field label="เบอร์โทร (Phone)" value={customer.phone ? fmtPhone(customer.phone) : ""} mono />
                    {/* เงื่อนไขเครดิตย้ายไปการ์ด "เครดิตและรอบวางบิล" ข้างล่าง (มติ 26/09) — ฟอร์มลูกค้าไม่มีช่องนี้แล้ว
                        การ์ดนี้เรียงตามฟอร์ม จึงไม่มีช่องนี้เหมือนกัน */}
                    {/* แบรนด์เป็นของลูกค้า (customers.brands[]) — สินค้าหยิบไปเป็นตัวเลือก
                        ตอนตั้งแบรนด์ของ FG · เคยอยู่ในรางขวา ซึ่งทำให้คนหาไม่เจอตอนกรอกฟอร์ม */}
                    <div className="md:col-span-3">
                      <span className="text-[var(--text-3)] block mb-2 text-[11px]">แบรนด์สินค้าที่ดูแล ({(customer.brands || []).length})</span>
                      {customer.brands && customer.brands.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {customer.brands.map((b, i) => (
                            <span key={i} className="bg-[var(--panel-2)] px-2.5 py-0.5 rounded-full text-[11px] text-[var(--text-2)] font-semibold">
                              {brandBothOf(b)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--text-3)] text-sm italic">ยังไม่มีแบรนด์</span>
                      )}
                    </div>

                    <ProfileGroup label="2. ที่อยู่" hint="ป้าย “หลัก” คือที่อยู่ที่เอกสารใหม่จะตั้งต้นให้" />
                    {/* ที่อยู่หลายรายการ (0202) — ป้าย "หลัก" คือตัวที่เอกสารใหม่จะตั้งต้นให้ */}
                    <div className="md:col-span-3">
                      <span className="text-[var(--text-3)] block mb-2 text-[11px]">ที่อยู่ ({addresses.length})</span>
                      {addresses.length === 0 ? (
                        <p className="text-[var(--text-3)] italic text-sm">ยังไม่มีที่อยู่</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {addresses.map((a, i) => (
                            <div key={a.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span className="text-[11px] font-semibold text-[var(--text-2)]">{addressLabel(a)}</span>
                                <span className="text-[10px] text-[var(--text-3)]">{ADDRESS_USE_LABELS[a.useFor]}</span>
                                {i === primaryBillingIndex && <span className="status-pill">บิลหลัก</span>}
                                {i === primaryShippingIndex && <span className="status-pill">จัดส่งหลัก</span>}
                                {/* สาขาโชว์เฉพาะที่อยู่ที่ใช้ออกเอกสาร — เลขนี้คือเลขที่จะไปอยู่
                                    บนใบกำกับภาษีของใบที่เลือกที่อยู่นี้ (มติ 2026-08-06) */}
                                {isBillingAddress(a) && (
                                  <span className="text-[10px] text-[var(--text-3)] font-mono">{branchLabel(a.branchCode)}</span>
                                )}
                                {a.mapUrl && (
                                  <a
                                    href={a.mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] inline-flex items-center gap-1 text-[var(--accent)]"
                                  >
                                    <MapPin size={11} /> แผนที่
                                  </a>
                                )}
                              </div>
                              {/* ภาษาหลักของหน้าจอคือไทย — ที่อยู่ที่มีแต่ภาษาอังกฤษให้ขึ้น
                                  อังกฤษเป็นบรรทัดหลักไปเลย ดีกว่าบรรทัดว่าง (มติ 2026-08-22) */}
                              <p className="font-medium text-[var(--text)] leading-relaxed text-sm">{addressTextIn(a, "th")}</p>
                              {/* บรรทัดอังกฤษ = ของที่ RD ก๊อปไปวางในเทมเพลต IFRA/MSDS
                                  ⚠️ ไม่มี = ไม่มีบรรทัด ไม่ใช่ขีด (แพตเทิร์นเดียวกับลิงก์แผนที่) */}
                              {!!a.addressEn && a.addressEn !== addressTextIn(a, "th") && (
                                <p className="text-[12px] text-[var(--text-2)] leading-relaxed mt-0.5 break-words">{a.addressEn}</p>
                              )}
                              {(a.contactName || a.contactPhone) && (
                                <p className="text-[11px] text-[var(--text-3)] mt-1">
                                  ผู้รับของ: {naText(a.contactName)}
                                  {a.contactPhone ? ` · ${fmtPhone(a.contactPhone)}` : ""}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ⚠️ ผู้ติดต่อคนแรก = ค่า mirror ของ contactPerson/contactPhone/email
                        (mig 0033) ที่เอกสารหยิบไปใช้ตั้งต้น ⇒ ป้าย "(หลัก)" ไม่ใช่แค่ลำดับ */}
                    <ProfileGroup label="3. ผู้ติดต่อ" hint="คนแรกคือผู้ติดต่อหลัก — เอกสารใหม่ตั้งต้นให้จากคนนี้" />
                    <div className="md:col-span-3">
                      <span className="text-[var(--text-3)] block mb-2 text-[11px]">ผู้ติดต่อ ({(customer.contacts || []).length})</span>
                      {(customer.contacts || []).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {customer.contacts.map((c, i) => (
                            <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                {c.role && <span className="ui-badge">{c.role}</span>}
                                <span className="font-medium text-[var(--text)] text-sm">{naText(c.name)}</span>
                                {i === 0 && <span className="text-[10px] text-[var(--text-3)]">(หลัก)</span>}
                              </div>
                              {(c.phone || c.email) && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[var(--text-2)] text-[12px]">
                                  {c.phone && <span className="font-mono">{fmtPhone(c.phone)}</span>}
                                  {c.email && <span className="break-all">{c.email}</span>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--text-3)] text-sm italic">ยังไม่มีผู้ติดต่อ — เพิ่มได้ที่ “แก้ไขข้อมูลลูกค้า”</span>
                      )}
                    </div>
                  </div>
                </DetailCard>

                {/* วางบิลและกำหนดชำระ (รุ่นสี่ · mig 0393 · แบบ A "ประโยคนโยบาย") — ใต้การ์ดข้อมูลลูกค้า · ที่เดียวที่ตั้งกติกาได้
                    ⚠️ บันทึกแล้วเติมเฉพาะช่องกติกาลงแถวที่มีอยู่ ไม่โหลดทั้งหน้าใหม่ (ฟอร์มแก้ลูกค้า
                    ที่อาจค้างอยู่ไม่ถูกเขียนทับ · ด่านอนุมัติไม่ขยับ จึงไม่มีอะไรอื่นบนหน้าเปลี่ยน)
                    · การ์ดเปิดจอ "งวดที่วันจะเปลี่ยน" เองหลังบันทึก · 409 ในโมดัลก็เรียก onSaved (ค่าล่าสุดของคนอื่น · unchanged:false = โหลดเธรดใหม่) */}
                <CustomerBillingRuleCard
                  customer={customer}
                  canEdit={canEditBillingRule}
                  onSaved={(fields) => {
                    const { unchanged, ...saved } = fields || {};
                    setCustomer((prev) => (prev ? { ...prev, ...saved } : prev));
                    /* แถว "รอบวางบิล" เพิ่งลงเธรดความเคลื่อนไหว — โหลดเธรดใหม่ทันที ไม่รอรอบ poll (ช้าได้ถึงหลายนาที) */
                    if (!unchanged) setThreadToken((n) => n + 1);
                  }}
                />
              </>
            )}
            docs={() => (
              <>
                {/* เอกสารแนบของลูกค้า — แผนที่/สัญญา/หนังสือรับรอง/ภพ.20 ฯลฯ */}
                <AttachmentsPanel
                  entityType="customer"
                  entityId={id}
                  canEdit={canEdit}
                  docTypes={customerDocTypes(customer.customerType)}
                  title="เอกสารของลูกค้า"
                  note={customer.customerType === "individual"
                    ? "เอกสารบุคคลธรรมดา: สำเนาบัตรประชาชน, แผนที่ที่อยู่, ทะเบียนบ้าน, เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)"
                    : "เอกสารนิติบุคคล: หนังสือรับรองบริษัท, ภ.พ.20, บัตร/ทะเบียนบ้านกรรมการ, หนังสือมอบอำนาจ, แผนที่ที่อยู่"}
                />
              </>
            )}
            activity={() => (
              <>
                {/* เธรดกลาง (mig 0163) — ด่านอนุมัติ master data บังคับกรอกเหตุผลที่ตีกลับ
                    แต่ `rejectionReason` ถูกล้างทั้งตอนอนุมัติและตอนแก้ (resetApprovalOnEdit)
                    → ตีกลับรอบสองลบเหตุผลรอบแรกทิ้ง · เธรดเก็บครบทุกรอบไว้กับตัวลูกค้า */}
                <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
                  <UpdateThread
                    entityType="customer"
                    entityId={id}
                    reloadToken={threadToken}
                    order="desc"
                    placeholder="พิมพ์ข้อความ เช่น ลูกค้าแจ้งเปลี่ยนที่อยู่ออกใบกำกับ..."
                    emptyText="ยังไม่มีความเคลื่อนไหว"
                  />
                </DetailCard>
              </>
            )}
          />
      </DetailPageLayout>

      {overrideDialog}

      {/* Edit modal */}
      <Modal open={isEditing} onClose={() => setIsEditing(false)} title="แก้ไขข้อมูลลูกค้า (Edit Customer)" size="lg">
        <form onSubmit={handleEditSubmit}>
          {/* ฟอร์มเดียวกับโมดัลเพิ่มลูกค้า (หน้ารวม) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง.
              ต่างแค่โหมด: มีช่องทีมดูแล (ย้ายทีมได้เฉพาะ superuser — API บังคับซ้ำ) ·
              ไม่มีสวิตช์โหมดรหัส (รหัสออกไปแล้ว) และรหัสที่ระบบเป็นคนออกให้ = ล็อก
              (mig 0230 — API บังคับซ้ำที่ PATCH) ยกเว้น **แอดมิน** ที่แก้ได้ทุกใบและพิมพ์ได้
              ทั้งสองรูปแบบ (มติ 2026-08-24 · `canEditIssuedMasterCode`) */}
          <CustomerForm
            form={formData}
            onForm={(patch) => setFormData((f) => ({ ...f, ...patch }))}
            showTeams
            canEditTeams={superuser}
            arLocked={isAutoArCode(customer.arCode) && !canFixArCode}
            arAllowIssued={canFixArCode}
            selfId={customer.id}
          />
          <div className="form-action-bar is-page">
            <button type="button" onClick={() => setIsEditing(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmBox}
        onClose={() => setConfirmBox(null)}
        onConfirm={async () => { await confirmBox?.onConfirm?.(); setConfirmBox(null); }}
        title={confirmBox?.title}
        message={confirmBox?.message}
        confirmLabel={confirmBox?.confirmLabel}
        danger={confirmBox?.danger !== false}
      />
    </Workspace>
  );
}
