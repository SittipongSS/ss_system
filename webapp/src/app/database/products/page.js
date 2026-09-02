"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import useStickyState from "@/lib/ui/useStickyState";
import { Package, Plus, Search, LayoutGrid, Table2, ChevronRight, ClipboardCheck, Archive, CircleDollarSign, FileCheck2, Download } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import FilterPopover from "@/components/ui/FilterPopover";
import ProductForm, { EMPTY_PRODUCT } from "@/components/database/ProductForm";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import StatCards from "@/components/database/StatCards";
import ApprovalQueue from "@/components/ui/ApprovalQueue";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { TableScroll } from "@/components/ui/Table";
import { ApprovalBadge, ApprovalActions, approvalStatusOf } from "@/components/ApprovalStatus";
import useApprovalDecision from "@/components/database/useApprovalDecision";
import { categoryOf, categoryFlags, categoryInfoOf } from "@/lib/master/categoryOf";
import { categoryNameBoth } from "@/lib/master/productCategoryOptions";
import { filterProducts, productCategoryCode, productCategoryLabel } from "@/lib/master/productFilter";
import { missingRetailPriceProducts } from "@/lib/tax/taxableProducts";
import {
  CODE_MODE_AUTO, DEFAULT_CODE_MODE, customerCodeSegment, fgCodeError,
} from "@/lib/master/masterCodes";
import { brandBoth, hasBrandField, normalizeBrands } from "@/lib/master/brands";
import { productNameBoth, fmtMoney, fmtMoneyOrDash, naText, NA } from "@/lib/format";
import CostVatLines from "@/components/database/CostVatLines";
import { apiFetch } from "@/lib/apiFetch";
import { canApproveMasterRecord } from "@/lib/master/approvalControl";

// Management view sees every status; the default GET (used by registration / PM
// pickers) returns only approved products.
const MANAGE_KEY = "/api/master/products?manage=1";
// ร่างสูตรที่ RD ยังไม่รับก็เลือกได้ (สินค้าเข้าระบบก่อนสูตรถูกรับเป็นเรื่องปกติ)
// — ตัดเฉพาะที่เก็บเข้ากรุออกที่ฝั่งฟอร์ม
const FORMULA_KEY = "/api/master/formulas";

// Master product catalog. Every FG is created here owned by a customer
// (chosen in the form). Excise approval still happens later in the excise
// registration flow (/excise).
/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];
/* ค่าตั้งต้นของตัวกรองต้องเป็น array ตัวเดิมทุกเรนเดอร์ (เหตุผลเดียวกับ EMPTY) */
const PENDING_ONLY = ["pending"];

export default function ProductRegistry() {
  const canEdit = useCan("products:edit");
  const canMargin = useCan("products:margin");
  // FN (ฝ่ายบัญชี) เห็นราคาผลิตด้วย cap ของตัวเอง — ไม่ได้ products:margin ไปด้วย
  const canCost = useCan("products:cost");
  const role = useRole();
  const myTeam = useTeam();
  const myTeams = useTeams();
  // ราคาผลิตเป็นข้อมูลลับ — โชว์เฉพาะ SA (products:edit) · RA/admin หรือผู้ที่ได้รับสิทธิ์
  // products:margin (เช่น SA ที่ทำรายงานผู้บริหาร) · FN (products:cost).
  // ใช้ useCan เพื่อให้ตรงกับ redactProductMargin
  // ฝั่ง server (รวม per-user grant) — ฟิลด์ costPrice จะไม่ถูกส่งมาเลยถ้าไม่มีสิทธิ์.
  const canSeeCost = canEdit || canMargin || canCost;
  // Senior AE approves only own team; supervisor/admin any team. (Products GET is
  // already team-scoped, but the explicit check keeps the rule consistent.)
  // กฎเดียวกับหน้าลูกค้าและหน้ารายละเอียด — อยู่ที่ lib/master/approvalControl ที่เดียว
  const canApproveRow = (rec) => canApproveMasterRecord(role, myTeams, rec);
  const [products, setProducts] = useState(() => apiCache.get(MANAGE_KEY) ?? []);
  const [productTypes, setProductTypes] = useState(() => apiCache.get("/api/master/product-types") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/master/customers") ?? []);
  // ทะเบียนสูตร — ช่อง "สูตร" ในฟอร์มเลือกจากที่นี่ ไม่ให้พิมพ์เอง (mig 0171)
  const [formulas, setFormulas] = useState(() => apiCache.get(FORMULA_KEY) ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has(MANAGE_KEY));
  const [showForm, setShowForm] = useState(false);
  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด
  /* ⭐ `?count=products` — ลิงก์จากป้ายตัวเลขบนเมนู · ป้ายนับใบที่รออนุมัติ ⇒ กดแล้ว
     ต้องเจอเท่านั้น ไม่ใช่ทะเบียนสินค้าทั้งกองให้ไล่หาเอง (ทรงเดียวกับทะเบียนลูกค้า)
     ⚠️ ตั้งเป็น **ค่าตั้งต้นของตัวกรองจริง** ไม่ใช่ตัวกรองซ่อน — FilterPopover ขึ้นเลข 1
     และล้างได้จากที่เดิม · `useStickyState` คืนค่าที่จำไว้เฉพาะตอนกดย้อนกลับ ⇒ เข้าจาก
     เมนูได้ค่านี้เสมอ ไม่ถูกตัวกรองเก่าของ session ทับ */
  const fromNavCount = useSearchParams().get("count") === "products";
  const [statusFilter, setStatusFilter] = useStickyState(
    "statusFilter", fromNavCount ? PENDING_ONLY : EMPTY,
  );
  // การขึ้นทะเบียนสรรพสามิต ('none'|'in_progress'|'approved') — มีความหมายเฉพาะ
  // หมวดสรรพสามิต: เลือกแล้วสินค้าหมวดอื่นถูกตัดออกทั้งหมด
  const [regFilter, setRegFilter] = useStickyState("regFilter", EMPTY);
  const [showInactive, setShowInactive] = useState(false);
  const [missingPrice, setMissingPrice] = useState(false);
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  const emptyForm = EMPTY_PRODUCT;
  const [formData, setFormData] = useState(emptyForm);
  // โหมดรหัสสินค้า (มติผู้ใช้ 2026-08-12) — ตั้งต้น "ระบบใหม่" ทุกครั้งที่เปิดฟอร์ม
  const [codeMode, setCodeMode] = useState(DEFAULT_CODE_MODE);
  const [nextFgRunNo, setNextFgRunNo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState("");
  const [search, setSearch] = useStickyState("search", "");

  const fetchProducts = async () => {
    try {
      const res = await apiFetch(MANAGE_KEY);
      if (res.ok) {
        const data = await res.json();
        apiCache.set(MANAGE_KEY, data);
        setProducts(data);
      }
      const typeRes = await apiFetch("/api/master/product-types");
      if (typeRes.ok) {
        const typeData = await typeRes.json();
        apiCache.set("/api/master/product-types", typeData);
        setProductTypes(typeData);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Approve / reject a pending product (AE Supervisor only — enforced server-side too).
  // ด่านเอกสารบังคับ + ทางยกเว้น อยู่ในฮุคชุดเดียวกับหน้าลูกค้า (กฎของโปรเจกต์:
  // ตรรกะเดียวกันห้ามเขียนสองชุด — เดี๋ยวเพี้ยนหากันโดยไม่มีใครรู้)
  const { decide: sendDecision, overrideDialog } = useApprovalDecision({
    endpoint: "/api/master/products",
    onDone: fetchProducts,
  });

  // รับ "ทั้งระเบียน" ไม่ใช่แค่ id — โมดัลยืนยันต้องเอ่ยรหัส FG ที่กำลังอนุมัติ
  const decide = async (product, status) => {
    // เหตุผลที่ไม่อนุมัติถามในโมดัลของฮุค (2026-08-30) — เดิมเป็น window.prompt ที่นี่
    await sendDecision(product.id, status, {
      subject: [product.fgCode, product.productDescription].filter(Boolean).join(" · "),
    });
  };

  // Main category (เช่น ODM) + sub-category name for the list — prefers the
  // stored categoryCode (set on save), falls back to deriving it from fgCode
  // for legacy rows saved before that column existed.
  // นิยามอยู่ที่ lib/master/productFilter — ตัวเดียวกับที่ปุ่มส่งออก Excel ใช้
  const categoryLabelOf = (p) => productCategoryLabel(p, productTypes);

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    fetchProducts();
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ดึงมาเป็นรายการแนะนำของช่องแบรนด์
    apiFetch("/api/master/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set("/api/master/customers", d || []); setCustomers(d || []); })
      .catch(() => {});
    apiFetch(FORMULA_KEY)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set(FORMULA_KEY, d || []); setFormulas(d || []); })
      .catch(() => {});
  }, []);

  // FG ผูกกับลูกค้าเสมอ — เลือกลูกค้าก่อน แล้วแบรนด์ที่แนะนำมาจาก brands[] ของลูกค้านั้น
  // (ยังพิมพ์แบรนด์ใหม่ได้ เผื่อแบรนด์ยังไม่ถูกบันทึกในข้อมูลลูกค้า)
  const customerList = useMemo(
    () => [...customers].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [customers],
  );
  const selectedCustomer = useMemo(
    () => customers.find((x) => x.id === formData.customerId),
    [customers, formData.customerId],
  );
  // แบรนด์ = ช่องเดียว โชว์สองภาษา (EN · TH). value ที่เก็บภายใน = TH (คีย์) ถ้ามี ไม่งั้น EN.
  const brandOptions = useMemo(() => normalizeBrands(selectedCustomer?.brands || []), [selectedCustomer]);





  // เปิดฟอร์ม = เริ่มใหม่ทุกครั้ง (ฟอร์มเปล่า + สวิตช์กลับไปที่ "ระบบใหม่") แล้วถาม
  // เลขรันถัดไปมาโชว์บนแถบรหัส
  // ⚠️ พรีวิวเท่านั้น — เลขจริงจองตอน POST (ฟอร์มเขียนกำกับไว้แล้ว)
  const openForm = async () => {
    setFormData(emptyForm);
    setCodeMode(DEFAULT_CODE_MODE);
    setNextFgRunNo(null);
    setShowForm(true);
    try {
      const res = await apiFetch("/api/master/products/next-code");
      if (res.ok) setNextFgRunNo((await res.json()).number ?? null);
    } catch {
      // อ่านไม่ได้ = ท่อนเลขรันบนแถบเป็นช่องว่าง ไม่ใช่ตัวเลขมั่ว — บันทึกได้ตามปกติ
    }
  };

  // prefill จากใบขอราคาผลิต (มติ 2026-07-23 — "ไปต่อ" กรอกฟอร์มให้เกือบหมด):
  // หน้า costing stash ข้อมูลไว้ใน sessionStorage แล้วส่ง ?prefill=costing มา
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("prefill") !== "costing") return;
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem("costingFgPrefill") || "null"); } catch { data = null; }
    sessionStorage.removeItem("costingFgPrefill");
    if (!data) return;
    // เติมเฉพาะช่องที่ฟอร์มสินค้ามีจริง — ชื่อสินค้าจากรายการในใบขอราคา
    // (ประกอบกลิ่นเข้าไปในชื่อถ้ามี ช่วยให้ไม่ต้องพิมพ์ซ้ำ) เซลเติมรหัส FG + ลูกค้าเอง
    const desc = [data.productDescription, data.fragranceName].filter(Boolean).join(" · ");
    // เปิดผ่าน openForm เพื่อให้ได้ของครบชุดเหมือนกดปุ่มเอง (สวิตช์โหมดรหัส + เลขรัน
    // ถัดไปบนแถบรหัส) แล้วค่อยเติมชื่อจากใบขอราคาทับ — เปิดฟอร์มเองตรง ๆ เมื่อไร
    // แถบรหัสจะว่างทั้งที่โหมดเป็น "ระบบใหม่"
    openForm().then(() => setFormData((f) => ({ ...f, productDescription: desc })));
    // ล้าง query ออกจาก URL กัน prefill ซ้ำตอน refresh
    window.history.replaceState({}, "", window.location.pathname);
    // emptyForm คงที่ตลอดอายุหน้า — รันครั้งเดียวตอน mount พอ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // customerId/brandName ใช้ SearchableSelect (ไม่ใช่ native input) — ตรวจ required เองที่นี่
    if (!formData.customerId) { notifyToast.error("กรุณาเลือกลูกค้าเจ้าของสินค้า"); return; }
    // แบรนด์บังคับเฉพาะกลุ่มที่มีช่องแบรนด์ — กลุ่ม 03/04 ฟอร์มไม่มีช่องนี้เลย (brands.js)
    // หมวดอ่านทางเดียวกับฟอร์ม: โหมดระบบใหม่จากตัวเลือกหมวด · โหมดกรอกเองจากรหัสที่พิมพ์
    const brandCategory = codeMode === CODE_MODE_AUTO ? formData.categoryCode : categoryOf(formData.fgCode);
    // ⚠️ ส่ง hasBrand ไปด้วย — กลุ่ม 02 ปิดสวิตช์แล้วไม่บังคับกรอก (มติ 2026-08-31)
    if (hasBrandField({ categoryCode: brandCategory, hasBrand: formData.hasBrand })
      && !formData.brandName?.trim() && !formData.brandNameEn?.trim()) { notifyToast.error("กรุณาระบุชื่อแบรนด์"); return; }
    // ชื่อสินค้าไม่บังคับภาษาไทย แต่ต้องมีอย่างน้อย 1 ภาษา
    if (!formData.productDescription?.trim() && !formData.productDescriptionEn?.trim()) {
      notifyToast.error("กรุณากรอกชื่อสินค้าอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ)"); return;
    }
    // ด่านรหัส/หมวด — ตัวตรวจตัวเดียวกับที่ API ใช้ (กฎ: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้
    // ห้ามมี) · โหมดระบบใหม่: ยังไม่มีรหัสให้ตรวจ (server ประกอบตอนบันทึก) จึงตรวจว่า
    // ตอบครบสามคำตอบหรือยังแทน
    if (codeMode === CODE_MODE_AUTO) {
      if (!formData.categoryCode) { notifyToast.error("กรุณาเลือกหมวดสินค้า"); return; }
      const customer = customers.find((c) => c.id === formData.customerId);
      if (!customerCodeSegment(customer?.arCode)) {
        notifyToast.error(`ลูกค้ารายนี้มีรหัส ${naText(customer?.arCode)} ซึ่งไม่ใช่รูปแบบ AR ที่ระบบรู้จัก — ปิดสวิตช์ระบบใหม่แล้วกรอกรหัสสินค้าเอง`);
        return;
      }
    } else {
      const codeError = fgCodeError(formData.fgCode, { mode: codeMode, categoryCode: formData.categoryCode });
      if (codeError) { notifyToast.error(codeError); return; }
    }
    // เตือนกลับด้านกับของเดิม: popup เฉพาะหมวดที่ติ๊กธงบน product_types (mig 0131 —
    // ส่วนน้อยที่มีภาระตามมา) — หมวดอื่นบันทึกเงียบ ๆ
    const catInfo = categoryInfoOf(formData.categoryCode || categoryOf(formData.fgCode), productTypes);
    const catLabel = catInfo?.typeInfo
      ? `${catInfo.code} (${categoryNameBoth(catInfo.typeInfo)})`
      : catInfo?.code || "";
    if (catInfo?.typeInfo?.isExcise) {
      const accepted = await confirmAction(
        `⚠️ แจ้งเตือน:\nรหัสสินค้า (FG) อยู่ในหมวด ${catLabel} ซึ่งเสียภาษีสรรพสามิต\n\nสินค้านี้ต้องขึ้นทะเบียนและชำระภาษีสรรพสามิต (ระบบจะคิดภาษีอัตโนมัติ)\nต้องการบันทึกต่อหรือไม่?`,
      );
      if (!accepted) return;
    }
    // เฟสแรกของ "ต้องจดแจ้ง อย.": แค่เตือนตอนสร้าง — ไม่ผูกไทม์ไลน์/เอกสาร (มติ 2026-07-20)
    if (catInfo?.typeInfo?.requiresFdaNotice) {
      const accepted = await confirmAction(
        `📋 แจ้งเตือน:\nรหัสสินค้า (FG) อยู่ในหมวด ${catLabel} ซึ่งต้องจดแจ้ง อย.\n\nโปรดตรวจว่าสินค้านี้ได้จดแจ้ง อย. ก่อนวางจำหน่าย\nต้องการบันทึกต่อหรือไม่?`,
      );
      if (!accepted) return;
    }
    setSubmitting(true);
    const payload = {
      ...formData,
      codeMode,
      assignee: userName,
      volume: parseFloat(formData.volume),
      volumeUnit: formData.volumeUnit || "ml",
      costPrice: formData.costPrice === "" ? null : parseFloat(formData.costPrice),
      retailPriceIncVat: formData.retailPriceIncVat === "" ? null : parseFloat(formData.retailPriceIncVat),
    };
    try {
      const res = await apiFetch("/api/master/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setShowForm(false);
        await fetchProducts();
        // โหมดระบบใหม่ผู้ใช้ไม่ได้พิมพ์รหัสเอง — ต้องบอกว่าได้รหัสอะไรไป
        if (codeMode === CODE_MODE_AUTO && created?.fgCode) {
          notifyToast.success(`บันทึกแล้ว — รหัสสินค้าที่ได้คือ ${created.fgCode}`);
        }
        if (created?.approvalStatus === "pending") {
          notifyToast.info("บันทึกแล้ว — รอ Senior AE ขึ้นไปอนุมัติก่อนจึงจะนำสินค้านี้ไปใช้งานได้");
        }
      } else {
        const err = await res.json();
        notifyToast.error(err.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      notifyToast.error("Error submitting form");
    } finally {
      setSubmitting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const counts = {
    pending: products.filter((p) => approvalStatusOf(p) === "pending").length,
    approved: products.filter((p) => approvalStatusOf(p) === "approved").length,
    taxable: products.filter((p) => p.isExciseTaxable !== false).length,
    inactive: products.filter((p) => p.isActive === false).length,
  };
  // registrationStatus แนบมาจาก server เฉพาะผู้ที่เห็นระบบภาษี (history:view) —
  // การมี field เป็นสัญญาณเปิดตัวกรอง "การขึ้นทะเบียน"; role อื่นไม่เห็นตัวกรองเลย
  const hasRegData = products.some((p) => p.registrationStatus !== undefined);
  /* ⭐ "ขาดราคาขายปลีก" ย้ายมาจากแท็บในหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29)
     — รายการนี้เป็นข้อมูลของ **สินค้า** ไม่ใช่ของทะเบียน (สินค้าพวกนี้ยังไม่มีทะเบียน
     ด้วยซ้ำ เพราะยื่นไม่ได้จนกว่าจะเติมราคา) และการแก้คือมากดที่หน้านี้อยู่แล้ว
     ⚠️ นับด้วยกฎเดียวกับที่ Excel ของโมดูลภาษีใช้ (`lib/tax/taxableProducts`) */
  const missingPriceCount = useMemo(
    () => missingRetailPriceProducts(
      products.map((p) => ({ ...p, categoryCode: productCategoryCode(p) })), productTypes,
    ).length,
    [products, productTypes],
  );
  /* ⚠️ ตัวกรองอยู่ที่ lib/master/productFilter ตัวเดียว — ปุ่ม "ส่งออก Excel" ส่ง
     ตัวกรองชุดนี้ไปให้ server แล้วกรองด้วยฟังก์ชันเดียวกัน ไฟล์จึงมีแถวเท่าที่ตาเห็น
     ถ้าย้ายตรรกะกลับมาเขียนสดตรงนี้ ไฟล์กับตารางจะเดินหนีกันเงียบ ๆ */
  const filteredProducts = filterProducts(products, {
    search: q, statuses: statusFilter, registrations: regFilter, showInactive, productTypes,
    missingRetailPrice: missingPrice,
  });

  // Pending records this user may approve — surfaced at the top as a queue.
  const approvalQueue = products.filter(
    (p) => approvalStatusOf(p) === "pending" && canApproveRow(p),
  );

  // Default ordering: by product code (FG Code). The first column shows both the
  // description and the FG code, so it sorts by code to match the "(FG Code)" header.
  const sort = useSortableTable(filteredProducts, {
    product: (p) => p.fgCode || p.productDescription || "",
    category: (p) => { const c = categoryLabelOf(p); return c ? `${c.main} ${c.sub}` : ""; },
    brand: (p) => p.brandName || "",
    volume: (p) => p.volume ?? null,
    cost: (p) => p.costPrice ?? null,
    retail: (p) => p.retailPriceIncVat ?? null,
    tax: (p) => (p.isExciseTaxable === false ? 0 : (p.exciseTax || 0) + (p.localTax || 0)),
  }, { key: "product", dir: "asc" });

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      resetKey: `${q}|${statusFilter.join(",")}|${regFilter.join(",")}|${showInactive}|${sort.sortKey}|${sort.sortDir}`,
    });

  const open = (p) => (window.location.href = `/database/products/${p.id}`);
  const taxPerUnit = (p) => (p.isExciseTaxable === false ? 0 : (p.exciseTax || 0) + (p.localTax || 0));

  /* ปุ่มส่งออกพกตัวกรองปัจจุบันไปด้วย — server กรองซ้ำด้วย filterProducts ตัวเดียวกัน
     (ส่งเป็น query ไม่ใช่ POST พร้อมรายการ id: proxy กั้น POST ของ /api/products ไว้ที่
     products:edit ⇒ ฝ่ายบัญชีจะกดโหลดไม่ได้เลย) */
  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter.length) params.set("status", statusFilter.join(","));
    if (regFilter.length) params.set("reg", regFilter.join(","));
    if (showInactive) params.set("inactive", "1");
    if (missingPrice) params.set("missingPrice", "1");
    const qs = params.toString();
    return `/api/products/export${qs ? `?${qs}` : ""}`;
  }, [q, statusFilter, regFilter, showInactive, missingPrice]);

  const headerRight = (
    <>
      <span className="ui-badge">{products.length} รายการ</span>
      {/* ใช้ Button primitive (as=Link) — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาส btn */}
      <Button
        as={Link}
        prefetch={false}
        href={exportHref}
        variant="quiet"
        icon={<Download size={16} />}
        title={`ดาวน์โหลด ${filteredProducts.length} รายการที่กรองอยู่เป็นไฟล์ Excel`}
      >
        ส่งออก Excel
      </Button>
      {canEdit && (
        <button onClick={openForm} className="btn btn-accent flex items-center gap-1.5">
          <Plus size={16} /> เพิ่มสินค้า
        </button>
      )}
    </>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="search-glass" style={{ width: "240px" }}>
        <Search size={18} color="var(--text-3)" />
        <input autoComplete="off" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า / FG / แบรนด์..." />
      </div>
      {/* ปุ่มกรองอยู่ติดช่องค้นหา (ซ้าย) แบบเดียวกับหน้า list ฝั่งขาย — popover เปิด
          ชิดซ้ายของปุ่ม (left:0 กว้าง 420px) ถ้าวางชิดขวาแผงจะล้นขอบจอ */}
      <FilterPopover
        count={statusFilter.length + regFilter.length + (showInactive ? 1 : 0) + (missingPrice ? 1 : 0)}
        onClear={() => { setStatusFilter([]); setRegFilter([]); setShowInactive(false); setMissingPrice(false); }}
        groups={[
          {
            key: "status", label: "สถานะอนุมัติ", icon: ClipboardCheck,
            options: [
              { value: "pending", label: "รออนุมัติ" },
              { value: "approved", label: "อนุมัติแล้ว" },
              { value: "rejected", label: "ไม่อนุมัติ" },
            ],
            selected: statusFilter, onChange: setStatusFilter,
          },
          // เฉพาะผู้เห็นระบบภาษี (server แนบ registrationStatus มาให้เท่านั้น) —
          // มิติกรองเฉพาะหมวดสรรพสามิต: เลือกแล้วหมวดอื่นไม่แสดง
          ...(hasRegData ? [{
            key: "registration", label: "การขึ้นทะเบียน", icon: FileCheck2,
            options: [
              { value: "none", label: "ยังไม่ขึ้นทะเบียน" },
              { value: "in_progress", label: "มีทะเบียน (รอ/ร่าง)" },
              { value: "approved", label: "อนุมัติแล้ว" },
            ],
            selected: regFilter, onChange: setRegFilter,
          }] : []),
          /* ⚠️ ขึ้นเฉพาะตอนมีของค้างจริง — ตัวกรองที่กดแล้วได้ 0 เสมอคือขยะบนแถบ
             ⭐ ไม่มีราคาขายปลีก = ภาษีคิดออกมา 0 ⇒ ขายแล้วยื่นจะยื่นขาดโดยไม่มีอะไรฟ้อง */
          ...(missingPriceCount > 0 ? [{
            key: "missingPrice", label: "ราคาขายปลีก", icon: CircleDollarSign,
            options: [{ value: "missing", label: `ขาดราคาขายปลีก (${missingPriceCount})` }],
            selected: missingPrice ? ["missing"] : [],
            onChange: (vals) => setMissingPrice(vals.includes("missing")),
          }] : []),
          ...(counts.inactive > 0 ? [{
            key: "inactive", label: "ที่เลิกใช้", icon: Archive,
            options: [{ value: "show", label: `รวมสินค้าที่เลิกใช้ (${counts.inactive})` }],
            selected: showInactive ? ["show"] : [],
            onChange: (vals) => setShowInactive(vals.includes("show")),
          }] : []),
        ]}
      />
      <div className="spacer" />
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <Workspace
      icon={<Package size={22} />}
      title="ข้อมูลสินค้า"
      subtitle="ฐานข้อมูลสินค้ากลาง (Master Data) — รหัส FG สเปค และต้นทุน/ภาษีต่อหน่วย"
      headerRight={headerRight}
      loading={loading}
      rail={
        <>
          <StatCards
            items={[
              { label: "ทั้งหมด", value: products.length },
              { label: "รออนุมัติ", value: counts.pending, tone: counts.pending ? "warn" : undefined },
              { label: "อนุมัติแล้ว", value: counts.approved, tone: "success" },
              /* is-accent ไม่มีกฎ CSS รองรับ (โทนตาย ไม่เคยติดสี) — เลขจำแนกประเภท
                 ใช้ info · accent สงวนให้ปุ่ม/จุดกดตามกติกา L1 */
              { label: "ต้องเสียภาษี", value: counts.taxable, tone: "info" },
            ]}
          />
          <ApprovalQueue
            items={approvalQueue}
            onDecide={decide}
            primary={(p) => p.fgCode}
            secondary={(p) => { const b = brandBoth(p.brandName, p.brandNameEn); return `${productNameBoth(p)}${b ? ` · ${b}` : ""}`; }}
            onOpen={open}
          />
        </>
      }
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <EmptyState icon={Package}>
          {q || statusFilter.length || regFilter.length ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้าในระบบ"}
        </EmptyState>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pageRows.map((p) => {
            const flags = categoryFlags(p.categoryCode || categoryOf(p.fgCode), productTypes);
            const isExciseCat = flags.isExcise;
            const status = approvalStatusOf(p);
            const showActions = status === "pending" && canApproveRow(p);
            const inactive = p.isActive === false;
            const cat = categoryLabelOf(p);
            return (
              <div key={p.id} onClick={() => open(p)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2" style={inactive ? { opacity: 0.6 } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--accent)] font-mono">{p.fgCode}</div>
                    <div className="font-semibold text-[var(--text)] text-sm truncate mt-0.5">{productNameBoth(p)}</div>
                    {cat && <div className="text-[10px] text-[var(--text-3)] mt-0.5 truncate">{cat.main} · {cat.sub}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ApprovalBadge status={status} />
                    {inactive && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-2)] truncate">{naText(brandBoth(p.brandName, p.brandNameEn))}</span>
                  <span className="font-mono text-[var(--text-2)]">{p.volume} {p.volumeUnit || "ml"}</span>
                </div>
                {canSeeCost && (
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-[var(--text-3)]">ราคาผลิต</span>
                    <div className="text-right">
                      {/* ค่าที่เก็บคือ "ก่อน VAT" — อีกสองบรรทัดคำนวณสด (มติผู้ใช้ 2026-08-28) */}
                      <div className="font-mono text-[var(--text-2)]">{fmtMoneyOrDash(p.costPrice)}</div>
                      <CostVatLines costPrice={p.costPrice} />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-3)]">ราคาขายปลีก</span>
                  <div className="text-right">
                    <div className="font-mono text-[var(--text-2)]">{fmtMoneyOrDash(p.retailPriceIncVat)}</div>
                    {/* ป้ายเฉพาะหมวดที่ติ๊กธง (ส่วนน้อยที่ต้องขึ้นทะเบียน+ชำระสรรพสามิต / จดแจ้ง อย.) — เรื่องยกเว้นดูที่การ์ดภาษีในหน้ารายละเอียด */}
                    {(isExciseCat || flags.requiresFdaNotice) && (
                      <div className="mt-0.5 flex items-center justify-end gap-1.5">
                        {isExciseCat && taxPerUnit(p) > 0 && <span className="text-[10px] text-[var(--text-3)]">ภาษี/ชิ้น: {fmtMoney(taxPerUnit(p))}</span>}
                        {isExciseCat && <span className="status-pill warning text-[10px]">ภาษีสรรพสามิต</span>}
                        {flags.requiresFdaNotice && <span className="status-pill info text-[10px]">จดแจ้ง อย.</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end pt-2 border-t border-[var(--border)]">
                  {showActions ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <ApprovalActions onDecide={(s) => decide(p, s)} />
                    </div>
                  ) : <ChevronRight size={16} className="text-[var(--text-3)]" />}
                </div>
                {status === "rejected" && p.rejectionReason && (
                  <div className="text-[11px] text-[var(--text-3)] whitespace-normal">เหตุผล: {p.rejectionReason}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel">
          <TableScroll surface="embedded" className="border-none" family="list">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="รายละเอียดสินค้า (FG Code)" sortKey="product" sort={sort} />
                  <SortTh label="หมวดหมู่" sortKey="category" sort={sort} />
                  <SortTh label="แบรนด์" sortKey="brand" sort={sort} />
                  <SortTh label="ปริมาตร" sortKey="volume" sort={sort} className="num" />
                  {/* หัวบอกว่าเลขหลัก (ตัวที่เรียง) คือราคาก่อน VAT — อีกสองบรรทัดอยู่ในช่อง */}
                  {canSeeCost && <SortTh label="ราคาผลิต (ก่อน VAT)" sortKey="cost" sort={sort} className="num" />}
                  <SortTh label="ราคาขายปลีก" sortKey="retail" sort={sort} className="num" />
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const flags = categoryFlags(p.categoryCode || categoryOf(p.fgCode), productTypes);
                  const isExciseCat = flags.isExcise;
                  const cat = categoryLabelOf(p);
                  return (
                    <tr key={p.id} onClick={() => open(p)} className="clickable-row" style={p.isActive === false ? { opacity: "var(--op-muted)" } : undefined}>
                      <td>
                        {/* รหัสบน · ชื่อ EN·TH ล่าง (มติผู้ใช้ 2026-08-12 — ทุกตารางทรงเดียว) */}
                        <div className="mono text-[12px] text-[var(--accent)]">{p.fgCode}</div>
                        <div className="font-semibold text-[var(--text)] mt-0.5">{productNameBoth(p)}</div>
                      </td>
                      <td>
                        {cat ? (
                          <div className="text-xs leading-tight">
                            {/* รหัสหมวดบน · ชื่อ EN·TH ล่าง — กลุ่มหลักฝังในรหัสอยู่แล้ว */}
                            <div className="mono text-[11px] text-[var(--text-3)]">{p.categoryCode || categoryOf(p.fgCode)}</div>
                            <div className="text-[var(--text-2)]">{cat.sub}</div>
                          </div>
                        ) : <span className="text-[var(--text-3)]">{NA}</span>}
                      </td>
                      <td className="text-[var(--text-2)]">{naText(brandBoth(p.brandName, p.brandNameEn))}</td>
                      <td className="num font-mono text-[var(--text-2)]">{p.volume} {p.volumeUnit || "ml"}</td>
                      {canSeeCost && (
                        <td className="num mono text-[var(--text-2)]">
                          {fmtMoneyOrDash(p.costPrice)}
                          <CostVatLines costPrice={p.costPrice} />
                        </td>
                      )}
                      <td className="num mono text-[var(--text-2)]">
                        {fmtMoneyOrDash(p.retailPriceIncVat)}
                        {(isExciseCat || flags.requiresFdaNotice) && (
                          <div className="mt-0.5 flex items-center justify-end gap-1.5">
                            {isExciseCat && taxPerUnit(p) > 0 && <span className="text-[11px] text-[var(--text-3)] font-normal">ภาษี/ชิ้น: {fmtMoney(taxPerUnit(p))}</span>}
                            {isExciseCat && <span className="status-pill warning text-[10px]">ภาษีสรรพสามิต</span>}
                            {flags.requiresFdaNotice && <span className="status-pill info text-[10px]">จดแจ้ง อย.</span>}
                          </div>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {approvalStatusOf(p) === "pending" && canApproveRow(p) ? (
                          <ApprovalActions onDecide={(status) => decide(p, status)} />
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <ApprovalBadge status={approvalStatusOf(p)} />
                            {p.isActive === false && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                            {approvalStatusOf(p) === "rejected" && p.rejectionReason && (
                              <div className="text-[11px] text-[var(--text-3)] mt-1 max-w-[200px] whitespace-normal">เหตุผล: {p.rejectionReason}</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      {sort.sorted.length > 0 && (
        <Pager
          page={page}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={setPageSize}
        />
      )}

      {/* Add product modal — FG always belongs to a customer (selected below). */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="เพิ่มสินค้าใหม่ (New Product)" size="lg">
        <form onSubmit={handleSubmit}>
          {/* ฟอร์มเดียวกับโมดัลแก้ไข (EditProductModal) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง */}
          <ProductForm
            form={formData}
            onForm={(patch) => setFormData((f) => ({ ...f, ...patch }))}
            productTypes={productTypes}
            customers={customerList}
            formulas={formulas}
            brandOptions={brandOptions}
            creatorName={userName}
            onCustomerChange={(v) => setFormData((f) => ({ ...f, customerId: v, brandName: "", brandNameEn: "" }))}
            codeMode={codeMode}
            onCodeMode={setCodeMode}
            nextFgRunNo={nextFgRunNo}
          />
          <div className="form-action-bar">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "กำลังบันทึก..." : "บันทึกสินค้า"}
            </button>
          </div>
        </form>
      </Modal>

      {/* กล่องขอเหตุผลเมื่ออนุมัติทั้งที่เอกสารบังคับยังไม่ครบ */}
      {overrideDialog}
    </Workspace>
  );
}
