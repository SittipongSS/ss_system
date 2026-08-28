"use client";
import { useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, NA, naText } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, isTaxWaitingOnMe, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import { ageLabel, ageTone, registrationAge } from "@/lib/tax/registrationQueue";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import { brandLabel } from "@/lib/master/brands";
import { productDisplayName } from "@/lib/master/productIdentity";
import { toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";

// ⭐ **ภาษี/ชิ้นกับความพร้อมเอกสารคิดที่ server แล้ว** (`?view=queue`)
// 🐞 ของเดิมคิดฝั่งจอ จึงต้องโหลด `/api/products` (342 แถวเต็ม) + `/api/customers`
// (508 แถวเต็ม) ทุกครั้งที่เปิดหน้า เพื่อใช้จริงแค่ 17 แถว — สองลิสต์นั้นเหลือไว้ให้
// picker ของโมดัลเท่านั้น และโหลด **ตอนเปิดโมดัลครั้งแรก** ไม่ใช่ตอนเปิดหน้า
const registrationBrand = (r) => brandLabel(r.metadata?.brandNameTh, r.metadata?.brandNameEn || r.brandName);
const registrationProduct = (r) => productDisplayName(r);
const taxText = (r) => (r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(r.taxPerUnit || 0));

export default function RegistrationsPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("products:edit");   // SA: create / edit / resubmit / delete

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations?view=queue");

  /* ⚠️ "วันนี้" อ่านครั้งเดียวตอน mount จากนาฬิกา **ไทย** — ห้ามอ่านนาฬิกาตอนเรนเดอร์
     (ค่าจะขยับระหว่างเรนเดอร์ และเครื่องที่ตั้งโซนเวลาอื่นจะได้คนละวัน) */
  const todayIso = useMemo(() => businessDate(), []);

  const [userName, setUserName] = useState("");
  // RA lands on their queue; everyone else sees all. A ?status= deep-link
  // (from the dashboard) overrides the default after mount.
  /* เลนของผู้ใช้ (SA / RA) — ตัวเดียวกับที่ `?status=mine` และป้ายบนเมนูใช้ (ม-117)
     AD เห็นทั้งสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ชิป "รอฉันลงมือ" จะได้ 0 เสมอ จึงซ่อนทิ้ง */
  const myDept = deptOf(role);
  const filterOptions = useMemo(
    () => REGISTRATION_FILTERS.filter((f) => f.key !== "mine" || myDept === "SA" || myDept === "RA"),
    [myDept],
  );
  const [filter, setFilter] = useState(() => (deptOf(role) === "RA" ? "pending_legal" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && REGISTRATION_FILTERS.some((f) => f.key === s)) setFilter(s);
    // Legacy ?open=<id> deep-link → go straight to the detail page.
    const openId = params.get("open");
    if (openId) router.replace(`/tax/registrations/${openId}`);
  }, [router]);
  const [search, setSearch] = useStickyState("search", "");
  const [formOpen, setFormOpen] = useState(false);
  // โหลดลิสต์ของ picker ตอนเปิดโมดัลครั้งแรกแล้วค้างไว้ (ปิดแล้วเปิดใหม่ไม่โหลดซ้ำ)
  const [pickerReady, setPickerReady] = useState(false);
  const { data: products } = useApiList(pickerReady ? "/api/products" : null);
  const { data: customers } = useApiList(pickerReady ? "/api/customers" : null);
  const openForm = () => { setPickerReady(true); setFormOpen(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filter === "mine") {
        if (!isTaxWaitingOnMe(r, "registration", myDept)) return false;
      } else if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.approvalNumber, r.assignee,
        r.metadata?.productNameTh, r.metadata?.productNameEn,
        r.metadata?.brandNameTh, r.metadata?.brandNameEn]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search, myDept]);

  // After saving the form: a freshly created draft opens its full detail page so
  // the user lands on the attachment cards and can submit once they're complete.
  const handleSaved = async (saved, { created } = {}) => {
    await reload();
    if (created && saved?.id) router.push(`/tax/registrations/${saved.id}`);
  };

  const ageOf = (r) => registrationAge(r, todayIso);

  /* ── ป้ายอายุงาน ────────────────────────────────────────────────────────
     🐞 คิวเดิมไม่มีวันที่เลย ⇒ ใบที่ค้าง 34 วันหน้าตาเหมือนใบที่เพิ่งยื่นเมื่อวาน
     (ตรวจระบบ 2026-08-28: 9 ใบค้าง 28–34 วันโดยไม่มีอะไรฟ้อง) */
  const AgeCell = ({ row }) => {
    const days = ageOf(row);
    const tone = ageTone(days);
    return (
      <div>
        {/* โทนมาจากข้อมูล (จำนวนวัน) จึงเป็น inline style โดยเจตนา */}
        <div className={tone === "neutral" ? "muted" : undefined} style={tone === "neutral" ? undefined : { color: toneColor(tone), fontWeight: "var(--fw-semibold)" }}>
          {naText(ageLabel(days))}
        </div>
        <div className="cell-sub">{naText(fmtDate(row.updatedAt || row.createdAt, { short: true }))}</div>
      </div>
    );
  };

  /* เอกสาร: บอกว่า "ขาดอะไร" ไม่ใช่แค่ "ไม่ครบ" — ไม่งั้นต้องเปิดใบถึงจะรู้
     ⚠️ ใบที่อนุมัติแล้วไม่ต้องทวงเอกสาร ด่านนี้มีผลเฉพาะก่อนยื่น */
  const DocsCell = ({ row }) => {
    if (row.status === "approved" || row.docsReady === null || row.docsReady === undefined) {
      return <span className="cell-quiet">{NA}</span>;
    }
    if (row.docsReady) return <span className={styles.docsReady}>ครบ</span>;
    const labels = row.missingLabels || [];
    return (
      <span className={styles.docsMissing} title={labels.join("\n")}>
        ขาด {labels.length}
      </span>
    );
  };

  const columns = [
    {
      key: "fgCode", label: "รหัสสินค้า (FG)",
      render: (r) => (
        <div>
          <div className="font-semibold font-mono">{r.fgCode}</div>
          <div className="cell-sub">{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
        </div>
      ),
    },
    { key: "customerName", label: "ลูกค้า", render: (r) => <span className="muted">{naText(r.customerName)}</span> },
    {
      key: "tax", label: "ภาษี/ชิ้น", align: "right",
      sortValue: (r) => r.taxPerUnit || 0,
      render: (r) => (
        <div>
          <div className="font-mono">{taxText(r)}</div>
          {/* ฐานที่ใช้คิด — ฝ่าย RA อนุมัติโดยเห็นที่มาของตัวเลข ไม่ใช่ตัวเลขลอย ๆ */}
          <div className="cell-sub">
            {r.retailPriceIncVat ? `ปลีก ${fmtMoney(r.retailPriceIncVat)}` : NA}
          </div>
        </div>
      ),
    },
    { key: "docs", label: "เอกสาร", align: "center", sortValue: (r) => (r.docsReady ? 1 : 0), render: (r) => <DocsCell row={r} /> },
    {
      key: "assignee", label: "ผู้ยื่น",
      render: (r) => (
        <div>
          <div className="muted">{naText(r.assignee)}</div>
          <div className="cell-sub">{naText(r.team)}</div>
        </div>
      ),
    },
    { key: "age", label: "ค้างมา", sortValue: (r) => ageOf(r) ?? -1, render: (r) => <AgeCell row={r} /> },
    {
      key: "status", label: "สถานะ",
      render: (r) => (
        <div className={styles.stack}>
          <StatusBadge status={r.status} />
          {r.approvalNumber && <span className="cell-sub mono">{r.approvalNumber}</span>}
        </div>
      ),
    },
  ];

  const card = (r) => {
    const days = ageOf(r);
    return (
      <div className="flex flex-col gap-2">
        <div className={styles.cardHead}>
          <div className="min-w-0">
            <div className={styles.cardCode}>{r.fgCode}</div>
            <div className="cell-sub truncate">{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className={styles.cardLine}>
          <span className="muted truncate">{naText(r.customerName)}</span>
          <span className="font-mono">{taxText(r)}</span>
        </div>
        <div className={styles.cardMeta}>
          <span className="truncate">{naText(r.assignee)}</span>
          <span className="flex items-center gap-2">
            <DocsCell row={r} />
            {/* โทนมาจากข้อมูล (จำนวนวัน) */}
            <span style={ageTone(days) === "neutral" ? undefined : { color: toneColor(ageTone(days)) }}>
              ค้างมา {naText(ageLabel(days))}
            </span>
          </span>
        </div>
      </div>
    );
  };

  const headerRight = (
    <>
      <span className="ui-badge">{regs.length} รายการ</span>
      {canEdit && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={openForm}>
          <Plus size={16} /> สร้างทะเบียน
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="การขึ้นทะเบียนสรรพสามิต"
      subtitle="ยื่น ตรวจสอบ และอนุมัติการขึ้นทะเบียนภาษีสรรพสามิต (สินค้า + ลูกค้า)"
      headerRight={headerRight}
      loading={loading}
      toolbar={
        <FilterBar
          filters={filterOptions}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา FG / ลูกค้า / ผู้ยื่น / เลขอนุมัติ..."
        />
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/tax/registrations/${r.id}`)}
        card={card}
        /* เรียงเก่าสุดขึ้นก่อน — คิวงานที่เรียงตามรหัสสินค้าไม่ได้ตอบว่า "ทำอันไหนก่อน" */
        initialSort={{ key: "age", dir: "desc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        emptyIcon={ClipboardCheck}
      />

      {/* registrations = ชุดเต็ม (ไม่ใช่ rows ที่ผ่านตัวกรองจอ) — โมดัลใช้เช็คว่า
          FG ไหนขึ้นทะเบียนกับลูกค้าที่เลือกไปแล้ว จะได้ไม่ให้เลือกไปชน 409 */}
      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        registration={null}
        products={products}
        customers={customers}
        registrations={regs}
        userName={userName}
      />
    </Workspace>
  );
}
