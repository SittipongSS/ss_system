"use client";
// ── ทะเบียนสูตร (mig 0171) ─────────────────────────────────────────────
//
// เดิมสูตรเป็น 3 ช่องข้อความบนสินค้า (mig 0112) — ไม่มีตาราง ไม่มีความสัมพันธ์
// กับกลิ่น · คำร้อง "ขอราคา FB อ้างชื่อสูตร" จึงอ้างได้แค่ข้อความ
//
// ⭐ การ์ด "รอจัดระเบียบ": บน prod มีสินค้าที่กรอกชื่อสูตรไว้แต่ไม่มีรหัส และชื่อ
// พวกนั้นส่วนใหญ่คือ *ชื่อกลิ่น* (Walk on beach 01 · Forest night · …) เพราะเมื่อก่อน
// ไม่มีที่เก็บกลิ่น — migration ตั้งใจไม่เดาแทน RD จึงยกมาให้ตัดสินทีละแถวที่นี่
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive, ArchiveRestore, Beaker, Check, Coins, Pencil, Plus, RefreshCw, Search, Trash2, Wand2,
} from "lucide-react";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import Pager from "@/components/ui/Pager";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import RowActionMenu from "@/components/ui/RowActionMenu";
import RegistryPrice from "@/components/database/RegistryPrice";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import StatusNotice from "@/components/ui/StatusNotice";
import FormulaForm, { emptyFormulaForm, formulaToForm } from "@/components/database/FormulaForm";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import styles from "./page.module.css";
import { usePagination } from "@/lib/usePagination";
import { cachedFetchJson } from "@/lib/apiCache";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate, NA } from "@/lib/format";
import { customerArIndex, customerSearchText, customerWithAr } from "@/lib/master/customerAr";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { categoryNameBoth, findCategoryByCode } from "@/lib/master/productCategoryOptions";
import Link from "next/link";
import {
  FORMULA_SOURCES, FORMULA_STATUS_LABELS, FORMULA_STATUS_TONES, canProposeFormula,
  formulaSourceLabel, isFormulaRegistrar, isFormulaUsable, matchesFormulaSource,
} from "@/lib/master/formulas";

export default function FormulasPage() {
  const role = useRole();
  const department = useDepartment();
  // department ใช้กับด่านใส่ราคา FB (canQuoteMaterial — ฝ่าย RD) เท่านั้น
  const me = useMemo(() => ({ role, department }), [role, department]);
  const registrar = isFormulaRegistrar(me);
  // ปุ่มใส่ราคา FB ต่อแถว (กติกาเดียวกับทะเบียนกลิ่น 2026-08-12):
  // ฝ่าย RD + สูตรสถานะใช้งานได้ (ร่าง/กำลังพัฒนายังอ้างราคาไม่ได้)
  const canPriceFormula = (f) => canQuoteMaterial(me, "RM_FB") && isFormulaUsable(f);

  // เมนู ⋯ ต่อแถว (มติผู้ใช้ 2026-08-12 — ปุ่มเรียง 3-4 ตัวกินสองบรรทัดทุกแถว)
  // แพตเทิร์นเดียวกับทะเบียนกลิ่น: เงื่อนไขทุกข้อยกมาเท่าเดิม เปลี่ยนแค่ที่วาง
  // · ปุ่มที่ยังโผล่นอกเมนู = งานหลักของแถว (รับเข้าทะเบียน · ใส่ราคาแถวที่ยังไม่มี)
  const rowMenu = (f) => [
    {
      id: "price",
      label: "ออกราคา FB ใหม่",
      icon: Coins,
      visible: canPriceFormula(f) && f.price?.unitPrice != null,
      onClick: () => setPricing(f),
    },
    {
      id: "edit",
      label: "แก้ไขข้อมูล",
      icon: Pencil,
      separatorBefore: true,
      visible: !!f._canEdit,
      onClick: () => setForm({ mode: "edit", formula: f, value: formulaToForm(f) }),
    },
    {
      id: "archive",
      label: "เก็บเข้ากรุ",
      icon: Archive,
      visible: registrar && f.status === "active",
      onClick: () => setConfirm({ kind: "archive", formula: f }),
    },
    {
      id: "restore",
      label: "เปิดใช้อีกครั้ง",
      icon: ArchiveRestore,
      visible: registrar && f.status === "archived",
      onClick: () => setConfirm({ kind: "restore", formula: f }),
    },
    {
      id: "delete",
      label: f.status === "draft" ? "ลบร่างนี้" : "ลบสูตร (ผู้ดูแลระบบ)",
      icon: Trash2,
      tone: "danger",
      separatorBefore: true,
      visible: isAdmin || (f._canEdit && f.status === "draft"),
      onClick: () => setConfirm({ kind: "delete", formula: f }),
    },
  ];
  const canPropose = canProposeFormula(me);
  // break-glass ของผู้ดูแลระบบ = role admin เท่านั้น (ดู lib/forceDelete.js)
  const isAdmin = role === "admin";

  const [formulas, setFormulas] = useState([]);
  const [scents, setScents] = useState([]);
  // ⭐ `customers` กลับมา (มติผู้ใช้ 2026-08-10: "สูตรผูกลูกค้าก่อน แล้วเลือกกลิ่นที่
  // ลูกค้ามี") — กลับทิศจาก 0207 · รูเดิม (สูตรลูกค้า A ใช้กลิ่นลูกค้า B) กันด้วยการ
  // กรองตัวเลือกบนฟอร์ม + ด่าน `formulaScentCustomerError` ฝั่ง server
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [unsorted, setUnsorted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // ?q= = ลิงก์เข้ามาจากที่อื่น — ดูหมายเหตุเดียวกันในหน้าทะเบียนกลิ่น
  const linkedQuery = useSearchParams().get("q") || "";
  /* ⭐ `?edit=<id>` — ปุ่ม "แก้ไขข้อมูล" บนหน้ารายละเอียดส่งกลับมาเปิดฟอร์มที่นี่
     ⚠️ **ไม่ก๊อปฟอร์มไปไว้หน้ารายละเอียด** — ฟอร์มแก้คือตัวเดียวกับตอนเพิ่ม
     (กฎ AGENTS.md) ⇒ ทางเข้าเดียว ไม่ใช่สองชุดที่ต้องคอยให้ตรงกัน */
  const linkedEditId = useSearchParams().get("edit") || "";
  const [search, setSearch] = useState(linkedQuery);
  // ที่มา: '' = ทั้งหมด · ตั้งต้นไม่กรอง — ทะเบียนคือของกลางที่ทุกฝ่ายมาหาข้อมูล
  const [sourceFilter, setSourceFilter] = useState("");
  /* ⭐ `?count=<key>` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายบอกว่ามีของ "รอเข้าทะเบียน"
     กี่ตัว ⇒ กดแล้วต้องเจอเท่านั้น ไม่ใช่ทะเบียนทั้งก้อนให้ไล่หาเอง
     ⚠️ ตั้งเป็น **ค่าเริ่มต้นของตัวกรอง ไม่ใช่ตัวกรองซ่อน** — ช่องสถานะบนหน้าโชว์ค่า
     "รอเข้าทะเบียน" อยู่ ผู้ใช้เห็นว่ากรองอยู่และเปลี่ยนเองได้ทันที ไม่ต้องมีชิปซ้ำ
     ⚠️ อ่านครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่า (แพตเทิร์นเดียวกับ `?count=` ของคิว RD) */
  const fromNavCount = useSearchParams().get("count") === "formulas";
  const [statusFilter, setStatusFilter] = useState(
    fromNavCount ? "draft" : (linkedQuery ? "" : "open"),
  );
  // ⭐ สูตรของลูกค้ากับสูตรฐานเป็นของคนละชนิดกัน — สูตรฐานมีน้อยแต่ปนอยู่ในลิสต์
  // เดียวกันทำให้ไล่หาของลูกค้ารายหนึ่งยาก · แยกด้วยตัวกรอง ไม่ใช่แถวคั่น เพราะ
  // ทะเบียนมีหน้าละหลายสิบแถวและแถวคั่นจะกระจายข้ามหน้า
  const [kindFilter, setKindFilter] = useState("");

  const [form, setForm] = useState(null);      // { mode, formula?, value }
  const [accept, setAccept] = useState(null);  // { formula, code }
  const [sorting, setSorting] = useState(null); // { row, as, code }
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [pricing, setPricing] = useState(null); // สูตรที่กำลังใส่ราคา FB

  // ⚠️ โหลดกลิ่นมาพร้อมกันใน reload เดียวกัน ไม่ใช่ useEffect แยกตอน mount —
  // ตารางแปลง scentId เป็นชื่อกลิ่นจากชุดนี้ ถ้าโหลดพลาดครั้งเดียวแล้วปุ่มรีเฟรช
  // ไม่ดึงซ้ำ คอลัมน์ "กลิ่นที่ใช้" จะค้างเป็นรหัสดิบตลอดจนกว่าจะรีโหลดทั้งหน้า
  // (เจอตอนตรวจหน้าจริง — ขึ้น "SCT-1" แทน "Forest night")
  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const [fRes, uRes, sRes, cRes] = await Promise.all([
        fetch("/api/master/formulas", { cache: "no-store" }),
        fetch("/api/master/formulas/unsorted", { cache: "no-store" }),
        fetch("/api/master/scents", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
      ]);
      const fData = await fRes.json().catch(() => null);
      if (!fRes.ok) throw new Error(fData?.error || "โหลดทะเบียนสูตรไม่สำเร็จ");
      setFormulas(Array.isArray(fData) ? fData : []);
      const uData = await uRes.json().catch(() => null);
      setUnsorted(uRes.ok && Array.isArray(uData) ? uData : []);
      const sData = await sRes.json().catch(() => null);
      setScents(sRes.ok && Array.isArray(sData) ? sData : []);
      // ⚠️ ลูกค้าโหลดไม่ได้ = ฟอร์มเลือกลูกค้าไม่ได้ แต่ไม่ควรทำให้ทั้งหน้าพัง
      const cData = await cRes.json().catch(() => null);
      setCustomers(cRes.ok && Array.isArray(cData) ? cData : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /* เปิดฟอร์มแก้จากลิงก์ `?edit=` — รอจนโหลดรายการเสร็จเพราะฟอร์มต้องใช้แถวเต็ม
     ⚠️ ยิงครั้งเดียว (`openedFromLink`) — ไม่งั้นปิดฟอร์มแล้วมันเด้งกลับมาเปิดใหม่
     ทุกครั้งที่ข้อมูลรีเฟรช เพราะพารามิเตอร์บน URL ยังอยู่ */
  const [openedFromLink, setOpenedFromLink] = useState(false);
  useEffect(() => {
    if (!linkedEditId || openedFromLink || !formulas.length) return;
    const row = formulas.find((x) => x.id === linkedEditId);
    setOpenedFromLink(true);
    if (row) setForm({ mode: "edit", formula: row, value: formulaToForm(row) });
  }, [linkedEditId, openedFromLink, formulas]);
  // หมวดสินค้าเป็นครึ่งหนึ่งของตัวตนสูตรแล้ว (0207) — ชุด master ที่แทบไม่เปลี่ยน
  // จึงโหลดครั้งเดียวผ่านแคช ไม่ต้องดึงซ้ำทุกครั้งที่กดรีเฟรชทะเบียน
  useEffect(() => {
    cachedFetchJson("/api/master/product-types")
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // ไม่เจอกลิ่น = คืน null ให้คนเรียกแสดง "—" · **ห้ามถอยไปโชว์ id ดิบ**
  // รหัสภายในบนหน้าจอผู้ใช้อ่านไม่รู้เรื่องและดูเหมือนข้อมูลเสีย
  const scentName = useCallback(
    (id) => scents.find((s) => s.id === id)?.name || null, [scents],
  );
  const scentCode = useCallback(
    (id) => scents.find((s) => s.id === id)?.code || null, [scents],
  );

  /* ⭐ **รหัสลูกค้า (AR) กำกับชื่อกิจการ** (IS-26080003 — เหมือนทะเบียนกลิ่น)
     สูตรของลูกค้าตั้งรหัสล้อกับรหัสลูกค้าเช่นกัน ⇒ ต้องอ่านคู่กันได้ในบรรทัดเดียว
     ⚠️ แผนที่เดียวใช้ทั้งสองตาราง — สร้างใหม่ทุกแถวคือ O(n²) ตอนเรนเดอร์ */
  const arIndex = useMemo(() => customerArIndex(customers), [customers]);
  // AR บน · ชื่อล่าง (มติผู้ใช้ 2026-08-12 — รหัสนำทุกตาราง)
  const customerCell = (row, fallback) => {
    if (!row.customerId && !row.customerName) return fallback;
    const { name, arCode } = customerWithAr(row.customerId, row.customerName, arIndex);
    return (
      <>
        {arCode ? <span className="mono block text-[11px] text-[var(--text-3)]">{arCode}</span> : null}
        {name}
      </>
    );
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return formulas.filter((f) => {
      if (!matchesFormulaSource(f, sourceFilter)) return false;
      if (statusFilter === "open" && f.status === "archived") return false;
      if (statusFilter && statusFilter !== "open" && f.status !== statusFilter) return false;
      // ⚠️ ตัวกรองชนิดต้องอยู่ **ก่อน** ทางลัด `if (!q) return true` — วางหลังเมื่อไร
      // มันจะทำงานเฉพาะตอนมีคำค้น แล้วผู้ใช้จะเห็นตัวกรองที่กดแล้วไม่มีอะไรเกิดขึ้น
      if (kindFilter === "customer" && !f.customerId) return false;
      if (kindFilter === "base" && f.customerId) return false;
      if (!q) return true;
      // ค้นด้วยชื่อที่ลูกค้าเรียกและรหัสหมวดได้ด้วย (เหมือนทะเบียนกลิ่น)
      // ⭐ รหัส AR ค้นได้ด้วย — คนที่ถือรหัสลูกค้าอยากรู้ว่ารายนี้มีสูตรอะไรบ้าง
      return [
        f.name, f.code, customerSearchText(f.customerId, f.customerName, arIndex),
        f.customerTradeName, f.categoryCode,
        // ค้นชื่อหมวดได้ทั้งไทย/อังกฤษ ไม่ใช่แค่รหัส (มติ 2026-08-12)
        categoryNameBoth(findCategoryByCode(categories, f.categoryCode)),
        scentName(f.scentId),
      ]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [formulas, categories, statusFilter, kindFilter, sourceFilter, search, scentName, arIndex]);

  // สายพันธุ์: id → ป้ายอ่านออก (แผนที่เดียวใช้ทั้งตาราง)
  const formulaLabelById = useMemo(
    () => new Map(formulas.map((f) => [f.id, f.code || f.name])),
    [formulas],
  );
  const categoryLabel = useCallback((code) => {
    if (!code) return null;
    // โชว์ "รหัส EN · TH" (มติ 2026-08-12) — helper กลางตัวเดียวกับตัวเลือกหมวด
    const name = categoryNameBoth(findCategoryByCode(categories, code));
    // ⚠️ หมวดที่ชื่อว่างทั้งสองภาษามีจริง (prod 5 แถว) — ถอยไปแสดงรหัส ห้ามบรรทัดว่าง
    return name ? `${code} ${name}` : code;
  }, [categories]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(visible, { resetKey: `${search}|${statusFilter}|${kindFilter}|${sourceFilter}` });

  // ── actions ──────────────────────────────────────────────────────────
  const call = async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(url, options);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: okMsg });
      await reload();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally { setSaving(false); }
  };

  const submitForm = async () => {
    const v = form.value;
    // ⚠️ ส่ง `customerId` ได้แล้ว (มติผู้ใช้ 2026-08-10 กลับทิศจาก 0207) แต่
    // `customerName` ยังไม่ส่ง — server อ่านจากทะเบียนลูกค้าเสมอ (ชื่ออาจเก่า)
    const payload = {
      name: v.name,
      formulaDate: v.formulaDate || null,
      categoryCode: v.categoryCode || null,
      customerId: v.customerId || null,
      scentId: v.scentId || null,
      customerTradeName: v.customerTradeName,
      derivedFromFormulaId: v.derivedFromFormulaId || null,
      note: v.note,
    };
    // ⭐ รหัสแก้ได้แล้วทั้งตอนสร้างและตอนแก้ (มติผู้ใช้ 2026-08-10) — ด่านจริงอยู่ที่
    // API ซึ่งยอมเฉพาะคนที่รับเข้าทะเบียนได้ · ที่นี่ส่งเฉพาะตอนมีสิทธิ์เพื่อไม่ให้
    // คนที่ไม่มีสิทธิ์โดนตีกลับทั้งฟอร์มเพราะช่องที่เขาแก้ไม่ได้อยู่แล้ว
    /* 🐞 **ส่งรหัสไปเสมอ รวมตอนช่องว่าง** — ของเดิมส่งเฉพาะตอนไม่ว่าง ⇒ ผู้ใช้
       ลบรหัสทิ้งแล้วกดบันทึก หน้าจอไม่ส่งอะไรไปเลย server จึงคงค่าเดิมไว้แล้วตอบ
       200 ⇒ **ขึ้นว่าบันทึกสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน** (ผู้ใช้ทัก 2026-08-10)
       ⚠️ ส่งค่าว่างไปแล้ว server เป็นคนตัดสิน: ร่างล้างได้ · สูตรที่รับเข้าทะเบียน
       แล้วตอบกลับเป็นข้อความไทยว่าทำไมไม่ได้ — เงียบแย่กว่าถูกปฏิเสธ */
    if (registrar) payload.code = v.code.trim();
    if (form.mode === "create") {
      const done = await call("/api/master/formulas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, payload.code ? "เพิ่มสูตรเข้าทะเบียนแล้ว" : "เสนอสูตรแล้ว รอ RD รับเข้าทะเบียน");
      if (done) setForm(null);
      return;
    }
    const done = await call(`/api/master/formulas/${form.formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", ...payload }),
    }, "บันทึกข้อมูลสูตรแล้ว");
    if (done) setForm(null);
  };

  const submitAccept = async () => {
    const done = await call(`/api/master/formulas/${accept.formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code: accept.code }),
    }, "รับสูตรเข้าทะเบียนแล้ว");
    if (done) setAccept(null);
  };

  const submitSorting = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/master/formulas/unsorted", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: sorting.row.productId,
          as: sorting.as,
          code: sorting.code || null,
          categoryCode: sorting.categoryCode || null,
          formulaDate: sorting.as === "formula" ? (sorting.formulaDate || null) : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "จัดระเบียบไม่สำเร็จ");
      const where = sorting.as === "scent" ? "กลิ่น" : "สูตร";
      // แยกข้อความ "ผูกกับของเดิม" ออกจาก "สร้างใหม่" — ของจริงมีชื่อซ้ำข้ามสินค้า
      // ถ้าบอกว่า "ย้ายแล้ว" เหมือนกันหมด คนจะนึกว่าเกิดของซ้ำในทะเบียน
      setToast({
        kind: "success",
        msg: d.reused
          ? `ผูกเข้าทะเบียน${where} "${d.row?.name}" ที่มีอยู่แล้ว`
          : `ย้ายเข้าทะเบียน${where}แล้ว`,
      });
      await reload();
      setSorting(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  // ลบ: admin ที่โดนกฎธุรกิจบล็อกจะได้พรีวิวว่ากระทบอะไรบ้าง แล้วถามยืนยันบังคับลบต่อ
  const runDelete = async (formula) => {
    setSaving(true);
    try {
      const result = await deleteWithForce(`/api/master/formulas/${formula.id}`, { isAdmin });
      if (result.ok) {
        setToast({ kind: "success", msg: result.forced ? "บังคับลบสูตรแล้ว" : "ลบร่างแล้ว" });
        await reload();
        setConfirm(null);
      } else if (result.cancelled) setConfirm(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  const runConfirm = async () => {
    const { kind, formula } = confirm;
    if (kind === "delete") return runDelete(formula);
    const done = await call(`/api/master/formulas/${formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: kind === "archive" ? "archived" : "active" }),
    }, kind === "archive" ? "เก็บสูตรเข้ากรุแล้ว" : "เปิดใช้สูตรอีกครั้งแล้ว");
    if (done) setConfirm(null);
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "delete") {
      const draft = confirm.formula.status === "draft";
      return {
        title: draft ? "ลบร่างสูตร" : "ลบสูตรออกจากทะเบียน",
        message: draft
          ? `ลบร่าง "${confirm.formula.name}" ทิ้ง? ทำแล้วย้อนไม่ได้`
          : `ลบ "${confirm.formula.name}" ออกจากทะเบียน? ถ้ามีสินค้าอ้างอยู่ ระบบจะแสดงรายการให้ยืนยันอีกครั้ง`,
        confirmLabel: draft ? "ลบร่าง" : "ลบสูตร",
      };
    }
    if (confirm.kind === "archive") {
      return {
        title: "เก็บสูตรเข้ากรุ",
        message: `"${confirm.formula.name}" จะไม่ถูกเลือกในคำร้องขอราคาอีก แต่ประวัติยังอยู่ครบ`,
        confirmLabel: "เก็บเข้ากรุ",
      };
    }
    return {
      title: "เปิดใช้สูตรอีกครั้ง",
      message: `นำ "${confirm.formula.name}" กลับมาใช้งาน`,
      confirmLabel: "เปิดใช้",
    };
  };

  return (
    <Workspace
      icon={<Beaker size={22} />}
      title="ทะเบียนสูตร"
      subtitle="สูตรของ RD พร้อมกลิ่นที่ใช้ — ใบขอราคาผลิตและคำร้องขอราคา FB อ้างจากที่นี่"
      headerRight={canPropose ? (
        <Button
          tone="accent"
          icon={<Plus size={15} aria-hidden="true" />}
          onClick={() => setForm({ mode: "create", value: emptyFormulaForm() })}
        >
          เพิ่มสูตร
        </Button>
      ) : null}
    >
      {/* รอจัดระเบียบ — ของเก่าที่กรอกชื่อไว้ในช่องสูตรของสินค้า */}
      {unsorted.length > 0 && (
        <WorkspaceSection
          className={styles.banner}
          icon={<Wand2 size={16} aria-hidden="true" />}
          title={`รอจัดระเบียบ (${unsorted.length})`}
        >
          <p className={styles.intro}>
            สินค้าที่กรอก &quot;ชื่อสูตร&quot; ไว้ตั้งแต่ก่อนมีทะเบียน — หลายรายการเป็น
            <strong> ชื่อกลิ่น</strong> ไม่ใช่ชื่อสูตร ระบบจึงไม่เดาให้
            {registrar ? " เลือกให้ทีละรายการว่าจะเข้าทะเบียนไหน" : " รอ RD จัดระเบียบ"}
          </p>
          <TableScroll surface="embedded">
            <table>
              <thead>
                <tr><th>ชื่อที่กรอกไว้</th><th>วันที่</th><th>สินค้า</th><th>ลูกค้า</th><th className={styles.sortCol}></th></tr>
              </thead>
              <tbody>
                {unsorted.map((r) => (
                  <tr key={r.productId}>
                    <td className={styles.name}>{r.formulaName}</td>
                    <td className="mono">{r.formulaDate ? fmtDate(r.formulaDate) : NA}</td>
                    <td>{r.productName}</td>
                    <td>{customerCell(r, "—")}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {registrar && (
                          <Button
                            size="sm"
                            onClick={() => setSorting({
                              row: r, as: "scent", code: "", categoryCode: "",
                              formulaDate: r.formulaDate || "",
                            })}
                          >
                            จัดระเบียบ
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </WorkspaceSection>
      )}

      <div className="toolbar">
        {/* .search-glass เป็นกล่องครอบ ไม่ใช่คลาสของ input (ดูคอมเมนต์เดียวกันที่หน้าทะเบียนกลิ่น) */}
        <div className="search-glass">
          <Search size={18} color="var(--text-3)" aria-hidden="true" />
          <input
            type="text" placeholder="ค้นชื่อสูตร · รหัส · กลิ่น · ลูกค้า"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาสูตร"
          />
        </div>
        <Select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "open", label: "ที่ใช้งานอยู่" },
            { value: "draft", label: "ร่าง — รอ RD รับ" },
            { value: "developing", label: "กำลังพัฒนา" },
            { value: "active", label: "ใช้งานได้" },
            { value: "archived", label: "เลิกใช้" },
            { value: "", label: "ทุกสถานะ" },
          ]}
          aria-label="กรองสถานะสูตร"
        />
        <Select
          value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
          options={[
            { value: "", label: "ทุกชนิดสูตร" },
            { value: "customer", label: "สูตรของลูกค้า" },
            { value: "base", label: "สูตรฐาน" },
          ]}
          aria-label="กรองชนิดสูตร"
        />
        {/* ⭐ ที่มา — กติกาเดียวกับทะเบียนกลิ่น (ม-74) · ข้อมูลส่วนใหญ่ควรมาจากสาย
            พัฒนาสูตร ส่วนที่เพิ่มตรงคือสูตรเดิมที่เคยทำไว้ก่อนมีระบบ */}
        <Select
          value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          options={[{ value: "", label: "ทุกที่มา" }, ...FORMULA_SOURCES]}
          aria-label="กรองที่มาของสูตร"
        />
        <span className="spacer" />
        <Button onClick={reload} disabled={loading} icon={<RefreshCw size={14} aria-hidden="true" />}>
          รีเฟรช
        </Button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <StatusNotice tone="error">{loadError}</StatusNotice>
      ) : visible.length === 0 ? (
        <EmptyState icon={Beaker}>
          {formulas.length === 0
            ? "ทะเบียนยังว่าง — กด \"เพิ่มสูตร\" เพื่อเริ่ม"
            : "ไม่มีสูตรที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <>
          <TableScroll>
            <table>
              <thead>
                <tr>
                  {/* รหัส+ชื่อรวมเซลล์เดียว 2 บรรทัด (มติผู้ใช้ 2026-08-12) */}
                  <th>สูตร</th><th>หมวดสินค้า</th><th>กลิ่นที่ใช้</th>
                  <th className={styles.colSource}>ที่มา</th>
                  {/* วันที่ = .num (ชิดขวา + tabular) — `mono` ไม่จัดชิด เทียบข้ามแถว
                      ไม่ได้ (กฎ 3 UI_DESIGN_SYSTEM — โรคเดียวกับที่ทะเบียนกลิ่นแก้แล้ว) */}
                  <th className="num">วันที่</th><th className={styles.colCustomer}>ลูกค้า</th>
                  {/* ราคา FB มาจากทะเบียนวัสดุ — คู่ขนานกับราคา F ของกลิ่น */}
                  <th className={`${styles.colPrice} num`}>ราคา FB</th>
                  <th>สถานะ</th><th className={styles.actionsCol}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((f) => (
                  <tr key={f.id}>
                    <td className={styles.name}>
                      {/* ⭐ ชื่อเป็นทางเข้าหน้ารายละเอียด · รหัสบน ชื่อล่าง (มติ 2026-08-12) */}
                      <Link href={`/database/formulas/${f.id}`}>
                        <span className="mono block text-[12px] text-[var(--accent)]">{f.code || "ไม่มีรหัส"}</span>
                        <span className="block">{f.name}</span>
                      </Link>
                      {/* ⚠️ ชื่อของลูกค้าอยู่ใต้ชื่อของเราและมีคำนำหน้ากำกับเสมอ
                          ไม่ใช่แทนที่กัน (กฎเดียวกับทะเบียนกลิ่น) */}
                      {f.customerTradeName && (
                        <div className={styles.sub}>ลูกค้าเรียก “{f.customerTradeName}”</div>
                      )}
                      {f.derivedFromFormulaId && (
                        <div className={styles.sub}>
                          └─ แก้จาก {formulaLabelById.get(f.derivedFromFormulaId) || "สูตรที่ถูกลบไปแล้ว"}
                        </div>
                      )}
                    </td>
                    {/* ⭐ หมวด × กลิ่น = ตัวตนของสูตร — ผูกกลิ่นแล้วแต่ไม่มีหมวด
                        แปลว่ายังไม่มีตัวตนที่เทียบซ้ำได้ ต้องเห็นว่าค้าง ไม่ใช่ขีดกลางเฉย ๆ */}
                    <td>
                      {f.categoryCode
                        ? (
                          <>
                            <span className="mono block text-[11px] text-[var(--text-3)]">{f.categoryCode}</span>
                            {categoryNameBoth(findCategoryByCode(categories, f.categoryCode)) || null}
                          </>
                        )
                        : f.scentId
                          ? <span className={styles.warn}>ยังไม่ระบุหมวด</span>
                          : <span className={styles.muted}>{NA}</span>}
                    </td>
                    <td>
                      {f.scentId && scentName(f.scentId)
                        ? (
                          <>
                            {scentCode(f.scentId)
                              ? <span className="mono block text-[11px] text-[var(--text-3)]">{scentCode(f.scentId)}</span>
                              : null}
                            {scentName(f.scentId)}
                          </>
                        )
                        : <span className={styles.muted}>{NA}</span>}
                    </td>
                    {/* ⭐ ที่มา — กติกาเดียวกับทะเบียนกลิ่น (ม-74) · หลักฐานตามจาก
                        `dept_request_items.producedFormulaId` ไม่ใช่จาก `dealId`
                        (ฟอร์มเพิ่มสูตรเองก็กรอกดีลได้)
                        ⚠️ ลิงก์ไปคำร้องเฉพาะตอนตามกลับได้จริง */}
                    <td>
                      {(() => {
                        const src = formulaSourceLabel(f);
                        return src.requestId ? (
                          <Link
                            href={`/requests/${src.requestId}`}
                            className="ui-badge ui-badge-cell ui-badge-w-source rich-link"
                          >
                            {src.label}
                          </Link>
                        ) : (
                          <span
                            className={`ui-badge ui-badge-cell ui-badge-w-source ${styles.muted}`}
                          >
                            {src.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="num">{f.formulaDate ? fmtDate(f.formulaDate) : NA}</td>
                    <td>
                      {customerCell(f, <span className={styles.muted}>สูตรกลาง</span>)}
                    </td>
                    {/* ราคา FB ล่าสุดจากทะเบียนวัสดุ · ปุ่มใส่ราคาเฉพาะแถวที่ยัง
                        ไม่มีราคา (งานกรอกจริง) — แถวที่มีแล้วออกใหม่ที่ปุ่ม Coins
                        ในคอลัมน์จัดการ (กติกาเดียวกับทะเบียนกลิ่น 2026-08-12) */}
                    <td className="num">
                      <RegistryPrice price={f.price} />
                      {canPriceFormula(f) && f.price?.unitPrice == null && (
                        <div className={styles.rowActions}>
                          <Button size="sm" icon={<Coins size={14} aria-hidden="true" />}
                            onClick={() => setPricing(f)}>
                            ใส่ราคา
                          </Button>
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        tone={FORMULA_STATUS_TONES[f.status]}
                        label={FORMULA_STATUS_LABELS[f.status]}
                      />
                    </td>
                    <td>
                      {/* ⋯ แทนปุ่มเรียง 3-4 ตัวที่เคยตกสองบรรทัดทุกแถว (มติผู้ใช้
                          2026-08-12) — เงื่อนไขทุกข้อคงเดิมใน rowMenu · ปุ่มที่ยังอยู่
                          นอกเมนูคืองานหลักของแถว: รับเข้าทะเบียน (ร่าง) */}
                      <div className={styles.rowActions}>
                        {registrar && f.status === "draft" && (
                          <Button size="sm" title="รับเข้าทะเบียน"
                            icon={<Check size={14} aria-hidden="true" />}
                            onClick={() => setAccept({ formula: f, code: "" })}>
                            รับเข้าทะเบียน
                          </Button>
                        )}
                        <RowActionMenu label={`การจัดการของ ${f.code || f.name}`} items={rowMenu(f)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager
            page={page} pageCount={pageCount} total={total} onPage={setPage}
            pageSize={pageSize} onPageSize={setPageSize}
          />
        </>
      )}

      {/* เพิ่ม / แก้ไข — ฟอร์มเดียวสองโหมด (กฎ AGENTS.md) */}
      {/* ปุ่มอยู่ใน prop `footer` = โซน .drawer-footer ของโครงโมดัล — เดิมใช้
          <div className="modal-actions"> ซึ่งไม่มี CSS อยู่จริง ปุ่มติดกัน 0px */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="md" dismissible={!saving}
        title={form?.mode === "edit" ? `แก้ข้อมูลสูตร — ${form.formula.name}` : "เพิ่มสูตรเข้าทะเบียน"}
        footer={form && (
          <>
            <Button variant="quiet" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</Button>
            <Button tone="accent" onClick={submitForm} disabled={saving}>บันทึก</Button>
          </>
        )}
      >
        {form && (
          <FormulaForm
            customers={customers}
            mode={form.mode} value={form.value} scents={scents}
            formulas={formulas} categories={categories}
            editingId={form.formula?.id || null}
            canSetCode={registrar} disabled={saving}
            onChange={(value) => setForm({ ...form, value })}
          />
        )}
      </Modal>

      <Modal
        open={!!accept} onClose={() => setAccept(null)} size="sm" dismissible={!saving}
        title={accept ? `รับเข้าทะเบียน — ${accept.formula.name}` : ""}
        footer={accept && (
          <>
            <Button variant="quiet" onClick={() => setAccept(null)} disabled={saving}>ยกเลิก</Button>
            <Button tone="accent" onClick={submitAccept} disabled={saving || !accept.code.trim()}>
              รับเข้าทะเบียน
            </Button>
          </>
        )}
      >
        {accept && (
          <div className="form-group">
            <label htmlFor="accept-formula-code">รหัสสูตร</label>
            <input
              id="accept-formula-code" className="premium-input" value={accept.code} disabled={saving}
              placeholder="เช่น PF638010202-P1" autoFocus
              onChange={(e) => setAccept({ ...accept, code: e.target.value })}
            />
            <small className={styles.hint}>รหัสของฝ่าย RD — ห้ามซ้ำกับสูตรอื่น</small>
          </div>
        )}
      </Modal>

      {/* จัดระเบียบของเก่า: กลิ่น หรือ สูตร */}
      <Modal
        open={!!sorting} onClose={() => setSorting(null)} size="sm" dismissible={!saving}
        title={sorting ? `จัดระเบียบ — ${sorting.row.formulaName}` : ""}
        footer={sorting && (
          <>
            <Button variant="quiet" onClick={() => setSorting(null)} disabled={saving}>ยกเลิก</Button>
            <Button
              tone="accent" onClick={submitSorting}
              disabled={saving
                || (sorting.as === "scent" && !sorting.row.customerId)
                || (sorting.as === "formula" && !sorting.categoryCode)}
            >
              ย้ายเข้าทะเบียน
            </Button>
          </>
        )}
      >
        {sorting && (
          <>
            <p className={styles.lead}>
              ชื่อนี้ถูกกรอกไว้ในช่อง &quot;ชื่อสูตร&quot; ของสินค้า <strong>{sorting.row.productName}</strong> —
              จริง ๆ แล้วเป็นอะไร?
            </p>
            <div className="form-grid">
              <div className="form-group col-span-2">
                <label htmlFor="sort-as">เข้าทะเบียน</label>
                <Select
                  id="sort-as" value={sorting.as} disabled={saving}
                  onChange={(e) => setSorting({ ...sorting, as: e.target.value })}
                  options={[
                    { value: "scent", label: "ทะเบียนกลิ่น" },
                    { value: "formula", label: "ทะเบียนสูตร" },
                  ]}
                />
              </div>
              <div className="form-group col-span-2">
                <label htmlFor="sort-code">
                  รหัส{sorting.as === "scent" ? "กลิ่น" : "สูตร"} <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <input
                  id="sort-code" className="premium-input" value={sorting.code} disabled={saving}
                  onChange={(e) => setSorting({ ...sorting, code: e.target.value })}
                />
                <small className={styles.hint}>เว้นว่าง = เก็บเป็นร่างไว้ใส่รหัสทีหลัง</small>
              </div>
              {/* ⭐ เข้าทะเบียนสูตรต้องเลือกหมวด — หมวด × กลิ่น คือตัวตนของสูตร (0207)
                  ปล่อยว่างได้เมื่อไร สูตรที่เพิ่งจัดระเบียบเสร็จจะไม่มีตัวตนตั้งแต่
                  วินาทีแรก แล้วก็ไม่มีใครกลับมาใส่ให้ — ซึ่งคือวิธีที่กอง
                  "รอจัดระเบียบ" กองนี้เกิดขึ้นมาแต่แรก */}
              {sorting.as === "formula" && (
                <ProductCategorySelect
                  categories={categories}
                  value={sorting.categoryCode}
                  disabled={saving}
                  required
                  onChange={(categoryCode) => setSorting({ ...sorting, categoryCode })}
                />
              )}
              {sorting.as === "formula" && (
                <div className="form-group col-span-2">
                  <label htmlFor="sort-date">วันที่ของสูตร</label>
                  <DateInput
                    id="sort-date" value={sorting.formulaDate} disabled={saving}
                    onChange={(v) => setSorting({ ...sorting, formulaDate: v })}
                  />
                  {/* prod มีปีพิมพ์ผิดจริง (2202) — ให้แก้ตรงนี้ได้เลย ไม่ใช่บล็อกทิ้งไว้ */}
                  {!!sorting.row.formulaDate && !/^(19|20)\d{2}-/.test(String(sorting.row.formulaDate)) && (
                    <small className={styles.warn}>
                      วันที่เดิมของสินค้า ({sorting.row.formulaDate}) ดูเหมือนพิมพ์ปีผิด — แก้ตรงนี้หรือเว้นว่างไว้ก่อนได้
                    </small>
                  )}
                </div>
              )}
            </div>
            {sorting.as === "scent" && !sorting.row.customerId && (
              <p className={styles.blocked}>
                สินค้านี้ยังไม่มีลูกค้า — กลิ่นต้องมีลูกค้าเจ้าของเสมอ ต้องผูกลูกค้าที่หน้าสินค้าก่อน
              </p>
            )}
            {sorting.as === "formula" && !sorting.categoryCode && (
              <p className={styles.blocked}>
                เลือกหมวดสินค้าก่อน — หมวดกับกลิ่นคือตัวตนของสูตร ไม่มีหมวดแล้วระบบเทียบไม่ได้ว่าซ้ำกับสูตรเดิมหรือเปล่า
              </p>
            )}
          </>
        )}
      </Modal>

      {/* ใส่ราคา FB จากแถวตาราง — โมดัลกลางตัวเดียวกับหน้ารายละเอียด */}
      <RegistryPriceModal
        open={!!pricing}
        onClose={() => setPricing(null)}
        title={pricing ? `${pricing.price?.unitPrice != null ? "ออกราคา FB ใหม่" : "ใส่ราคา FB"} — ${pricing.name}` : ""}
        endpoint={pricing ? `/api/master/formulas/${pricing.id}/price` : ""}
        onSaved={(msg) => {
          setPricing(null);
          setToast({ kind: "success", msg });
          reload();
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        {...confirmCopy()}
        busy={saving}
        tone={confirm?.kind === "delete" ? "danger" : "default"}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
