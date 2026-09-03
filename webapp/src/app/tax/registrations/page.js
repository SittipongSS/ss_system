"use client";
import { useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, fmtNumber, NA, naText } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, isTaxWaitingOnMe, ownedStages, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import { queueExportIds, queueStatusParam } from "@/lib/tax/exportUrl";
import ReportExportActions from "@/components/excise/ReportExportActions";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { Building2 } from "lucide-react";
import { ageLabel, ageTone, registrationAge } from "@/lib/tax/registrationQueue";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import { brandLabel } from "@/lib/master/brands";
import { customerNameIn } from "@/lib/master/customerName";
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
/* ⭐ **คิวเล่าเรื่องเดียวกับรายงาน** (มติผู้ใช้ 2026-08-28) — เดิมต้องเปิด /tax/reports
   อีกหน้าเพื่อดู ขนาด · เลขผู้เสียภาษี · ราคาถอด VAT · ต้นทุน/กำไร ทั้งที่กำลังตัดสินใจ
   อยู่บนคิว · ตัวเลขทุกตัวคิดที่ server (`registrationProductFacts`) จอแค่วาด */
const sizeText = (r) => (r.volume != null ? `${fmtNumber(r.volume)} ${r.volumeUnit || "ml"}` : null);
const retailText = (r) => (r.retailPriceIncVat ? fmtMoney(r.retailPriceIncVat) : null);
const retailExText = (r) => (r.retailPriceExVat ? `ถอด VAT ${fmtMoney(r.retailPriceExVat)}` : null);
/* ราคาผลิต/กำไร: บรรทัดหลักคือสองตัวที่คนดูคิว ๆ ต้องเทียบ · แจกแจงอยู่บรรทัดรอง
   ⚠️ ค่าที่ไม่มีสิทธิ์ถูกตัดตั้งแต่ server (`redactProductMargin`) ⇒ ที่นี่ทดสอบ
   "มีค่าไหม" อย่างเดียว ห้ามตัดสินสิทธิ์ซ้ำที่จอ ไม่งั้นสองชั้นจะเลื่อนออกจากกัน */
const factoryMain = (f) => [
  f.costPrice != null && `ราคาผลิต ${fmtMoney(f.costPrice)}`,
  f.factoryProfit != null && `กำไร ${fmtMoney(f.factoryProfit)}`,
].filter(Boolean).join(" · ");
const factoryParts = (f) => [
  f.materialCost != null && `วัตถุดิบ ${fmtMoney(f.materialCost)}`,
  f.laborCost != null && `ค่าแรง ${fmtMoney(f.laborCost)}`,
  f.shippingCost != null && `ค่าจัดส่ง ${fmtMoney(f.shippingCost)}`,
].filter(Boolean).join(" · ");

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
  /* ⭐ ตัวกรองที่ย้ายมาจากหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29)
     — ลูกค้า + ช่วงวันที่ · ทำงานร่วมกับชิปและช่องค้นหาเป็น **ชุดเดียว**
     ไม่มีตัวกรองชุดที่สองสำหรับ "รายงาน" ให้ตั้งค่าซ้ำแล้วสงสัยว่าอันไหนมีผล */
  const [customerIds, setCustomerIds] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  /* ลิสต์ลูกค้าโหลดเมื่อ **กางตัวกรอง** หรือเปิดโมดัลครั้งแรก — ไม่ใช่ตอนเปิดหน้า
     (508 แถว · เหตุผลเดียวกับ picker ของโมดัล) */
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
      if (customerIds.length && !customerIds.includes(r.customerId)) return false;
      // ช่วงวันที่นับจาก **วันที่สร้าง** เหมือนที่รายงานเดิมใช้ (ตัดเป็นวันก่อนเทียบ)
      const day = (r.createdAt || "").slice(0, 10);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.taxId, r.approvalNumber, r.assignee,
        r.metadata?.productNameTh, r.metadata?.productNameEn,
        r.metadata?.brandNameTh, r.metadata?.brandNameEn]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search, myDept, customerIds, from, to]);

  /* เลือกไว้แล้วตัวกรองขยับ → ที่เลือกอาจไม่อยู่บนจอแล้ว ⇒ ล้างทิ้ง
     ไม่งั้นจะโหลดแถวที่มองไม่เห็นออกไปโดยไม่รู้ตัว */
  useEffect(() => { setSelected(new Set()); }, [filter, search, customerIds, from, to]);

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

  /* คอลัมน์ต้นทุน/กำไรขึ้นเฉพาะคนที่ server ส่งค่ามาให้ — ถามจากชุดเต็ม (`regs`)
     ไม่ใช่ `rows` ที่ผ่านตัวกรอง ไม่งั้นคอลัมน์จะโผล่ ๆ หาย ๆ ตามชิปที่กด */
  const showFactory = useMemo(() => regs.some((r) => r.factory), [regs]);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* ── สิ่งที่ปุ่มโหลดจะได้ ────────────────────────────────────────────────
     ตัวกรองของจอ → พารามิเตอร์ที่ server เข้าใจ · คำค้น/การติ๊กเลือก → ids
     (ดูเหตุผลเต็มใน lib/tax/exportUrl.js) */
  const exportParams = useMemo(() => ({
    status: queueStatusParam(filter, ownedStages("registration", myDept)),
    customerId: customerIds,
    from,
    to,
  }), [filter, myDept, customerIds, from, to]);
  const exportIds = useMemo(
    () => queueExportIds({ selected, visibleIds: allIds, searching: !!search.trim() }),
    [selected, allIds, search],
  );

  const selectColumn = {
    key: "_sel",
    label: (
      <input
        type="checkbox"
        checked={allChecked}
        onChange={() => setSelected(allChecked ? new Set() : new Set(allIds))}
        aria-label="เลือกทั้งหมด"
      />
    ),
    sortValue: null,
    align: "center",
    thStyle: { width: 34 },
    // หยุด event ไม่ให้ไหลไปเปิดหน้ารายละเอียด (ทั้งแถวกดได้)
    render: (r) => (
      <span onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`เลือก ${r.fgCode}`} />
      </span>
    ),
  };

  const columns = [
    selectColumn,
    {
      /* `link: true` = เซลล์ทางเข้าของคีย์บอร์ด — DataList ห่อด้วย <Link href เดียวกับ
         แถว> ให้เอง ⇒ บรรทัดแรกต้องเป็น <strong> ที่เป็นลูก **ตรง** ของลิงก์
         ไม่งั้น `.linklike-block` ไม่ขีดเส้นใต้ให้ (ดูหัวไฟล์ components/excise/DataList.js) */
      key: "fgCode", label: "รหัสสินค้า (FG)", link: true,
      render: (r) => (
        <>
          <strong className="font-semibold font-mono">{r.fgCode}</strong>
          <div className="cell-sub">{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
        </>
      ),
    },
    { key: "size", label: "ขนาด", sortValue: (r) => r.volume ?? -1, render: (r) => naText(sizeText(r)) },
    {
      key: "customerName", label: "ลูกค้า",
      render: (r) => (
        <div>
          <div className="muted">{naText(r.customerName)}</div>
          {/* เลขผู้เสียภาษีคือสิ่งที่ต้องตรงกับเอกสารสรรพสามิต — อยู่บนแถวเดียวกับชื่อ */}
          <div className="cell-sub font-mono">{naText(r.taxId)}</div>
        </div>
      ),
    },
    {
      key: "tax", label: "ภาษี/ชิ้น", align: "right",
      sortValue: (r) => r.taxPerUnit || 0,
      render: (r) => <span className="font-mono">{taxText(r)}</span>,
    },
    {
      /* ฐานที่ใช้คิดภาษี — ฝ่าย RA อนุมัติโดยเห็นที่มาของตัวเลข ไม่ใช่ตัวเลขลอย ๆ
         (เดิมเป็นบรรทัดรองใต้ "ภาษี/ชิ้น" และมีแต่ราคารวม VAT) */
      key: "retail", label: "ราคาขายปลีก", align: "right",
      sortValue: (r) => r.retailPriceIncVat ?? -1,
      render: (r) => (
        <div>
          <div className="font-mono">{naText(retailText(r))}</div>
          <div className="cell-sub font-mono">{naText(retailExText(r))}</div>
        </div>
      ),
    },
    ...(showFactory ? [{
      key: "factory", label: "ราคาผลิต / กำไร", align: "right",
      sortValue: (r) => r.factory?.costPrice ?? -1,
      render: (r) => (r.factory ? (
        <div>
          <div className="font-mono">{naText(factoryMain(r.factory) || null)}</div>
          <div className="cell-sub font-mono">{naText(factoryParts(r.factory) || null)}</div>
        </div>
      ) : <span className="cell-quiet">{NA}</span>),
    }] : []),
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
            {/* ⚠️ ขนาดขึ้น **ก่อน** ชื่อสินค้า — ชื่อยาวกว่าการ์ดเสมอบนจอแคบและถูก
                truncate ⇒ อะไรที่ต่อท้ายชื่อจะหายไปกับ "…" ทุกแถว (ต่อท้ายรหัส FG ก็
                ตกบรรทัดเป็น "· 5 ml" ลอย ๆ เพราะรหัสยาวเต็มความกว้างพอดี) */}
            <div className="cell-sub truncate">
              {sizeText(r) ? `${sizeText(r)} · ` : ""}{registrationProduct(r)} ({naText(registrationBrand(r))})
            </div>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className={styles.cardLine}>
          <span className="muted truncate">
            {naText(r.customerName)}
            {r.taxId ? <span className="cell-sub font-mono"> · {r.taxId}</span> : null}
          </span>
          <span className="font-mono">{taxText(r)}</span>
        </div>
        {/* ตัวเลขชุดเดียวกับตาราง — การ์ดกับตารางต้องเล่าเรื่องเดียวกัน ไม่ใช่คนละชุด
            ⚠️ ป้ายอยู่ซ้าย ค่าอยู่ขวาแบบซ้อนสองบรรทัด (ทรงเดียวกับ `cardLine` อื่น) —
            เอาบรรทัดรองไปต่อท้ายบรรทัดเดียวกันแล้วมันตัดบรรทัดเอง ทิ้ง "·" ค้างหัวบรรทัด */}
        {retailText(r) && (
          <div className={styles.cardLine}>
            <span className="cell-sub">ราคาขายปลีก</span>
            <span className={styles.cardStack}>
              <span className="font-mono">{retailText(r)}</span>
              {retailExText(r) && <span className="cell-sub font-mono">{retailExText(r)}</span>}
            </span>
          </div>
        )}
        {r.factory && (
          <div className={styles.cardLine}>
            <span className="cell-sub">ราคาผลิต / กำไร</span>
            <span className={styles.cardStack}>
              <span className="font-mono">{naText(factoryMain(r.factory) || null)}</span>
              {factoryParts(r.factory) && <span className="cell-sub font-mono">{factoryParts(r.factory)}</span>}
            </span>
          </div>
        )}
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

  const customerName = customerIds.length === 1
    ? customerNameIn(customers.find((c) => c.id === customerIds[0]))
    : (customerIds.length > 1 ? `ลูกค้า ${customerIds.length} ราย` : undefined);

  const headerRight = (
    <>
      <span className="ui-badge">
        {selected.size ? `เลือก ${selected.size}/${rows.length} รายการ` : `${regs.length} รายการ`}
      </span>
      <ReportExportActions
        type="registration"
        params={exportParams}
        ids={exportIds}
        rowCount={rows.length}
        printMeta={{ from, to, customerName }}
      />
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
          searchPlaceholder="ค้นหา FG / ลูกค้า / เลขผู้เสียภาษี / ผู้ยื่น / เลขอนุมัติ..."
        >
          <FilterPopover
            count={customerIds.length}
            onOpen={() => setPickerReady(true)}
            onClear={() => setCustomerIds([])}
            groups={[{
              key: "customer", label: "ลูกค้า", icon: Building2,
              /* ป้ายต้องผ่านกติกาสองภาษา — ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้ตัวเลือกว่างเปล่า
                 (ป้ายที่นี่เป็นชื่อเปล่า ไม่ใช่ "รหัส · ชื่อ" แบบ dropdown เลือกลูกค้า) */
              options: customers.map((c) => ({ value: c.id, label: customerNameIn(c) })),
              selected: customerIds,
              onChange: setCustomerIds,
            }]}
          />
          <label className={styles.rangeLabel}>
            จาก <DateInput value={from} onChange={setFrom} />
          </label>
          <label className={styles.rangeLabel}>
            ถึง <DateInput value={to} onChange={setTo} />
          </label>
        </FilterBar>
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/tax/registrations/${r.id}`}
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
