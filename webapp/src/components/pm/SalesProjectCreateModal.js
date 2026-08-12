"use client";

// ── ฟอร์มโครงการตัวเดียวของระบบ — สร้าง/แก้ ใช้ตัวนี้ทุกทางเรียก ─────────────
//
// ⭐ มติผู้ใช้ 2026-08-08 (artifact 23dc1d94): **โครงการ = ภาชนะรวมดีล** —
// ฟอร์มถามเฉพาะเรื่องของภาชนะ: สายธุรกิจ · ชื่อ · ลูกค้า/แบรนด์ · หมวดสินค้า ·
// วันที่ · ทีมงาน — จบแค่นั้น
//   · **ไม่มีช่องประเภทงาน/แม่แบบไทม์ไลน์** — ไทม์ไลน์ของโครงการคือไทม์ไลน์ของ
//     ดีลที่ผูก (segment ต่อดีล — DEAL_PROJECT_RESTRUCTURE_PLAN §1) · ตอนสร้างจากดีล
//     endpoint ใช้ประเภทของดีลก่อตั้งเอง (create-project fallback ไป deal.dealType)
//   · **ไม่มีช่องผูก FG** (มติเดียวกัน "เอา FG ออก") และไม่มีช่องเลขที่ QT/PO —
//     เอกสารขายเป็นชั้นดีล ดูจากดีล/เอกสารที่ผูกแทน
//   · มูลค่า/FC/ยอดจริงของโครงการ **คำนวณจากดีลที่ผูก** ไม่มีช่องให้กรอกเอง
//
// แทน ProjectFormModal (ยุค 1:1 เก่า — ลบทิ้งแล้ว): หน้าดีลเรียกฟอร์มนี้ผ่าน
// `createEndpoint`/`subtitle` — ฟอร์มเดียวสองทางเรียกตามกฎ AGENTS.md
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import BusinessLineSelect from "@/components/ui/BusinessLineSelect";
import PersonSelect, { personIdByName } from "@/components/ui/PersonSelect";
import { personFullName } from "@/lib/ui/personName";
import { brandSelectOptions } from "@/lib/master/brands";
import { categoryFlags } from "@/lib/master/categoryOf";
import { CUSTOMER_NAME_LABEL, CUSTOMER_PICKER_EMPTY_HINT } from "@/lib/uiLabels";
import { cachedFetchJson } from "@/lib/apiCache";
import { fmtDate } from "@/lib/format";
import { useRole } from "@/lib/roleContext";

const today = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export default function SalesProjectCreateModal({
  open,
  onClose,
  onSuccess,
  editingId = null,
  initialData = null,
  customers = [],
  categories = [],
  // ทางเรียกจากดีล (สร้างโครงการจากดีลก่อตั้ง) ส่งสองตัวนี้มา — ฟอร์มไม่เปลี่ยนรูป
  createEndpoint = "/api/sa/projects",
  createLabel = "สร้างโครงการ",
  // บรรทัดบริบทใต้ชื่อโมดัล เช่น "ดีลก่อตั้ง: DL-… · ชื่อดีล · NPD"
  subtitle = null,
  /* เจ้าของ "วันที่เริ่ม" (มติผู้ใช้ 2026-08-12): โครงการที่ยังไม่มีดีลเป็นเจ้าของวันเอง
     พอมีดีลแล้ววันของแต่ละ segment เป็นของดีล (ราก segment ถูกปักหมุด — แก้ที่โครงการ
     ไม่ขยับอยู่ดี) ⇒ ส่งชื่อที่มาเข้ามาเมื่อวันไม่ใช่ของโครงการ แล้วช่องกลายเป็นช่องเส้นประ
     อ่านอย่างเดียว **ล็อกไม่ใช่ซ่อน** (form-design-rules §2) คนต้องเห็นว่าค่ามาจากไหน */
  startDateFrom = null,
}) {
  const [users, setUsers] = useState([]);
  // ล็อกช่องผู้รับผิดชอบตามตำแหน่งผู้สร้าง (มติผู้ใช้): AE/Senior→ผู้ดูแลโครงการ,
  // AC→ผู้ประสานงาน, AE Supervisor→ผู้ตรวจสอบ; role อื่นเลือกได้. ล็อกเฉพาะตอนสร้างใหม่.
  const role = useRole();
  const [myId, setMyId] = useState("");
  const [fallbackName, setFallbackName] = useState("");
  useEffect(() => {
    try {
      setMyId(localStorage.getItem("userId") || "");
      setFallbackName(localStorage.getItem("userName") || "");
    } catch { /* ssr */ }
  }, []);
  /* ช่องนี้เก็บ **ชื่อเต็ม** ลง DB — ห้ามใช้ `localStorage.userName` ตรง ๆ เพราะเป็น
     ชื่อย่อ แล้ว `personIdByName` ข้างล่างจะจับคู่ไม่ได้ (บั๊กเดิม: prod 11/14 โครงการ
     เกิดมาพร้อม aeOwnerId ว่าง) */
  const myName = useMemo(
    () => personFullName(users.find((u) => u.id === myId)) || fallbackName,
    [users, myId, fallbackName],
  );
  const lockPeopleField = (!editingId && myName)
    ? ((role === "ae" || role === "senior_ae") ? "aeOwner"
      : role === "ac" ? "preparedBy"
      : role === "ae_supervisor" ? "aeSupervisor" : null)
    : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", customerId: "", brand: "", line: "", mainCode: "", typeCode: "",
    productMainCategory: "", productSubCategory: "", startDate: today(), dueDate: "",
    aeOwner: "", preparedBy: "", aeSupervisor: "",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    const categoryCode = initialData?.productMainCategory || "";
    const [mainCode = "", typeCode = ""] = categoryCode.split("-");
    setForm({
      name: initialData?.name || "", customerId: initialData?.customerId || "", brand: initialData?.metadata?.brand || "", line: initialData?.line || "",
      mainCode, typeCode, productMainCategory: categoryCode, productSubCategory: initialData?.productSubCategory || "",
      startDate: initialData?.startDate || today(), dueDate: initialData?.dueDate || "", aeOwner: initialData?.aeOwner || "",
      preparedBy: initialData?.preparedBy || "", aeSupervisor: initialData?.aeSupervisor || "",
    });
    cachedFetchJson("/api/pm/assignable-users")
      .then((rows) => setUsers(rows || []))
      .catch(() => setUsers([]));
  }, [open, initialData]);

  const brandOptions = useMemo(() => {
    const customer = customers.find((row) => row.id === form.customerId);
    const unique = [...new Map(brandSelectOptions(customer?.brands || []).map((option) => [option.value, option])).values()];
    if (form.brand && !unique.some((option) => option.value === form.brand)) unique.unshift({ value: form.brand, label: form.brand });
    return unique;
  }, [customers, form.customerId, form.brand]);

  // ธงภาษี/อย. ของหมวดที่เลือก — อ่านจากทะเบียนหมวดที่โหลดมาแล้ว (mig 0131)
  const categoryFlagsOf = useMemo(
    () => categoryFlags(form.productMainCategory, categories),
    [form.productMainCategory, categories],
  );

  /* ผู้ดูแลโครงการ = AE / Senior AE (มติผู้ใช้ 2026-08-08) — supervisor ไม่ใช่คนถือ
     โครงการ (มีช่องผู้ตรวจสอบของตัวเอง) · โครงการเก่าที่ผู้ดูแลเป็น role อื่นอยู่แล้ว
     ต้องยังเห็นค่าตัวเองตอนแก้ ไม่ใช่ช่องว่างเงียบ ๆ จึงคงคนที่เป็นค่าปัจจุบันไว้ในลิสต์ */
  const currentOwner = lockPeopleField === "aeOwner" ? myName : form.aeOwner;
  const ownerUsers = useMemo(
    () => users.filter((u) => ["ae", "senior_ae"].includes(u.role) || (currentOwner && personFullName(u) === currentOwner)),
    [users, currentOwner],
  );

  const submit = async (event) => {
    event.preventDefault();
    // ด่านรวมข้อความเดียว (docs/form-design-rules.md §2) — บอกทุกช่องที่ขาดในครั้งเดียว
    const missing = [
      [!form.line, "สายธุรกิจ"],
      [!form.name.trim(), "ชื่อโครงการ"],
      [!form.customerId, "ลูกค้า"],
      // วันเริ่มที่มาจากดีลไม่ใช่ช่องที่คนกรอก จึงไม่ใช่ช่องบังคับของฟอร์มนี้
      [!startDateFrom && !form.startDate, "วันที่เริ่มโครงการ"],
    ].filter(([absent]) => absent).map(([, label]) => label);
    if (missing.length) return setError(`กรุณากรอก ${missing.join(" · ")} ให้ครบ`);
    setSubmitting(true);
    setError("");
    try {
      const customer = customers.find((row) => row.id === form.customerId);
      const res = await fetch(editingId ? `/api/pm/projects/${editingId}` : createEndpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(lockPeopleField ? { [lockPeopleField]: myName } : {}), // บังคับช่องที่ล็อก = ผู้สร้าง
          // ตัวตนของผู้ดูแลเดินคู่ชื่อเสมอ (mig 0190) — ชื่อไว้พิมพ์เอกสาร id ไว้แจ้งเตือน
          // จับคู่ไม่ได้ (ใบเก่าที่เก็บชื่อย่อ) = คง id เดิมไว้ ห้ามล้างเป็น null
          aeOwnerId: personIdByName(users, lockPeopleField === "aeOwner" ? myName : form.aeOwner)
            ?? initialData?.aeOwnerId ?? null,
          customerName: customer?.name || null,
          metadata: { ...(initialData?.metadata || {}), brand: form.brand, containerOnly: true },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างโครงการไม่สำเร็จ");
      onSuccess?.(data);
    } catch (err) {
      setError(err.message || "สร้างโครงการไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingId ? "แก้ไขโครงการ" : "สร้างโครงการใหม่"}
      subtitle={subtitle}
      size="lg"
      footer={(
        <>
          {/* ภาชนะไม่มีช่องมูลค่า/ไทม์ไลน์โดยเจตนา — บอกไว้ตรงนี้ กันคนหาช่องที่ไม่มี */}
          <span className="drawer-footer-note">มูลค่า · FC · ยอดจริง และไทม์ไลน์ มาจากดีลที่ผูกกับโครงการ</span>
          <Button variant="quiet" onClick={onClose} disabled={submitting}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : createLabel}
          </Button>
        </>
      )}
    >
      <form onSubmit={submit}>
        <div className="pm-form-grid gap-[18px]">
          {/* สายธุรกิจอยู่บนสุด (มติผู้ใช้ 2026-08-08) — คำถามที่กว้างสุดของภาชนะ
              ตอบก่อนแล้วที่เหลือตามมา · แผ่นเลือก 2 ใบ ไม่มี default (mig 0191) */}
          <div className="form-group col-span-2">
            <label>สายธุรกิจ <span className="required-mark">*</span></label>
            <BusinessLineSelect value={form.line} onChange={(line) => setForm((f) => ({ ...f, line }))} />
          </div>
          <div className="form-group col-span-2">
            <label>ชื่อโครงการ <span className="required-mark">*</span></label>
            <input className="premium-input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>{CUSTOMER_NAME_LABEL} <span className="required-mark">*</span></label>
            <SearchableSelect
              entity="customer"
              value={form.customerId}
              onChange={(customerId) => setForm((f) => ({ ...f, customerId, brand: "" }))}
              options={customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.arCode} — ${c.name}` : c.name, search: `${c.arCode || ""} ${c.name}` }))}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              emptyText={CUSTOMER_PICKER_EMPTY_HINT}
            />
          </div>
          <div className="form-group">
            <label>แบรนด์</label>
            <SearchableSelect entity="brand" disabled={!form.customerId} value={form.brand} onChange={(brand) => setForm((f) => ({ ...f, brand }))} options={brandOptions} placeholder={form.customerId ? "เลือกแบรนด์..." : "เลือกลูกค้าก่อน"} emptyText="ยังไม่มีแบรนด์ของลูกค้านี้ — เพิ่มที่หน้าข้อมูลลูกค้า" />
          </div>
          <div className="form-group col-span-2">
            <ProductCategorySelect
              categories={categories}
              value={form.productMainCategory}
              mainValue={form.mainCode}
              subValue={form.typeCode}
              onChange={(productMainCategory, meta) => setForm((f) => ({ ...f, mainCode: meta.mainCode, typeCode: meta.typeCode, productMainCategory, productSubCategory: meta.category?.nameTh || meta.category?.nameEn || "" }))}
            />
            {/* ⭐ ธงของหมวดที่เลือก — **มีผลกับไทม์ไลน์จริง**: หมวดสรรพสามิตทำให้
                แม่แบบงอกขั้นขึ้นทะเบียน (mig 0131 · token flag:excise) ⇒ ต้องเห็น
                ตอนเลือก ไม่ใช่ไปเซอร์ไพรส์ตอนโครงการเกิด · เหลือง = "มีขั้นตอนเพิ่ม"
                (ข้อมูลนี้เคยมีในฟอร์มยุคเก่าแล้วหายไปตอนยุบฟอร์ม — เอากลับมา) */}
            {(categoryFlagsOf.isExcise || categoryFlagsOf.requiresFdaNotice) && (
              <div className="flex flex-wrap gap-[6px] mt-[6px]">
                {categoryFlagsOf.isExcise && (
                  <span className="ui-badge text-[var(--amber)]">เสียภาษีสรรพสามิต — ไทม์ไลน์จะมีขั้นขึ้นทะเบียน</span>
                )}
                {categoryFlagsOf.requiresFdaNotice && (
                  <span className="ui-badge text-[var(--amber)]">ต้องแจ้ง อย.</span>
                )}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>วันที่เริ่มโครงการ {startDateFrom ? null : <span className="required-mark">*</span>}</label>
            {startDateFrom ? (
              <>
                <div className="deal-derived">{form.startDate ? fmtDate(form.startDate) : "— ตามวันเริ่มของดีล —"}</div>
                <small>มาจาก{startDateFrom} · แก้วันของงานให้ไปแก้ที่ดีลนั้น</small>
              </>
            ) : (
              <DateInput value={form.startDate} onChange={(startDate) => setForm((f) => ({ ...f, startDate }))} className="w-full" />
            )}
          </div>
          <div className="form-group">
            <label>วันที่สิ้นสุด <span className="text-[var(--text-3)] font-normal">(กำหนดส่งลูกค้า)</span></label>
            <DateInput value={form.dueDate} onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))} className="w-full" />
          </div>
          {/* ทีมงาน 3 ช่องบรรทัดเดียว (มติผู้ใช้ 2026-08-08) — จอแคบพับเป็นคอลัมน์เดียว */}
          <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-[18px]">
          <div className="form-group">
            <label>ผู้ดูแลโครงการ (AE / Senior AE){lockPeopleField === "aeOwner" ? " · ล็อกเป็นคุณ" : ""}</label>
            <PersonSelect by="name" users={ownerUsers} value={currentOwner} disabled={lockPeopleField === "aeOwner"} ariaLabel="ผู้ดูแลโครงการ (AE / Senior AE)" onChange={(aeOwner) => setForm((f) => ({ ...f, aeOwner }))} />
          </div>
          <div className="form-group">
            <label>ผู้ประสานงานโครงการ (AC){lockPeopleField === "preparedBy" ? " · ล็อกเป็นคุณ" : ""}</label>
            <PersonSelect by="name" users={users.filter((u) => u.role === "ac")} value={lockPeopleField === "preparedBy" ? myName : form.preparedBy} disabled={lockPeopleField === "preparedBy"} ariaLabel="ผู้ประสานงานโครงการ (AC)" onChange={(preparedBy) => setForm((f) => ({ ...f, preparedBy }))} />
          </div>
          <div className="form-group">
            <label>ผู้ตรวจสอบ (AE Supervisor){lockPeopleField === "aeSupervisor" ? " · ล็อกเป็นคุณ" : ""}</label>
            <PersonSelect by="name" users={users.filter((u) => u.role === "ae_supervisor")} value={lockPeopleField === "aeSupervisor" ? myName : form.aeSupervisor} disabled={lockPeopleField === "aeSupervisor"} ariaLabel="ผู้ตรวจสอบ (AE Supervisor)" onChange={(aeSupervisor) => setForm((f) => ({ ...f, aeSupervisor }))} />
          </div>
          </div>
        </div>
        {error && <p className="text-[13px] text-[var(--red)] mt-3">{error}</p>}
      </form>
    </Modal>
  );
}
