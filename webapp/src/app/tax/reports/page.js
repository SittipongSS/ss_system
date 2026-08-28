"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, FileSpreadsheet, Printer, FolderArchive, CircleDot, Building2, ChevronDown, Check } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import { fmtDate, fmtMoney, fmtNumber, naText } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import DataList from "@/components/excise/DataList";
import FilterPopover from "@/components/ui/FilterPopover";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import { REGISTRATION_FILTERS, FILING_FILTERS } from "@/lib/excise/workflow";
import { ATTACHMENT_TYPES } from "@/lib/master/attachmentTypes";
import { apiFetch } from "@/lib/apiFetch";

// ประเภทเอกสารที่เลือกรวมใน ZIP ได้ — เอกสารทะเบียน + แผนที่ที่อยู่ (เอกสารลูกค้า
// ที่ผูกกับทะเบียน ไม่ใช่การ์ดของทะเบียนเอง จึงเติมเป็นตัวเลือกพิเศษท้ายลิสต์).
const ZIP_DOC_TYPES = [
  ...ATTACHMENT_TYPES.registration,
  { key: "address_map", label: "แผนที่ที่อยู่ (เอกสารลูกค้า)" },
];
const ZIP_ALL_KEYS = ZIP_DOC_TYPES.map((t) => t.key);

// ปุ่มดาวน์โหลด ZIP + popover เลือกประเภทเอกสารที่จะรวมมาด้วย
function ZipDownloadButton({ disabled, selectedTypes, onChange, onDownload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (key) => {
    onChange((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary flex items-center gap-1.5"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="เลือกประเภทเอกสารที่จะดาวน์โหลด แบ่งโฟลเดอร์ตามรายการสินค้า"
      >
        <FolderArchive size={16} /> ไฟล์แนบ (ZIP)
        <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--motion-medium)" }} />
      </button>

      {open && (
        <div className="glass-panel" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: "var(--z-inline-menu)", width: "min(90vw, 300px)", padding: "10px" }}>
          <div style={{ fontSize: "var(--fs-5)", fontWeight: "var(--fw-semibold)", color: "var(--text-2)", marginBottom: "6px" }}>เลือกประเภทเอกสารที่จะรวมใน ZIP</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "260px", overflowY: "auto" }}>
            {ZIP_DOC_TYPES.map((t) => {
              const checked = selectedTypes.has(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggle(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", width: "100%",
                    padding: "7px 8px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
                    fontSize: "var(--fs-7)", border: "none",
                    background: checked ? "var(--accent-soft)" : "transparent",
                    color: checked ? "var(--accent)" : "var(--text)",
                  }}
                >
                  <span style={{ width: "16px", height: "16px", borderRadius: "4px", border: checked ? "none" : "1.5px solid var(--border)", background: checked ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {checked && <Check size={12} color="var(--accent-fg)" strokeWidth={3} />}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn ghost sm" onClick={() => onChange(new Set(ZIP_ALL_KEYS))}>เลือกทั้งหมด</button>
            <button
              type="button"
              className="btn btn-primary sm"
              disabled={selectedTypes.size === 0}
              onClick={() => { onDownload(); setOpen(false); }}
            >
              ดาวน์โหลด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const REPORT_TABS = [
  { key: "registration", label: "การขึ้นทะเบียน" },
  { key: "filing", label: "การยื่นภาษี" },
  // 🐞 สินค้าที่ไม่มีราคาขายปลีก = ภาษีคิดออกมา 0 (พบ 17 ตัวตอนตรวจระบบ 2026-08-16)
  // — ที่รวมให้ตามไปเติมราคา ก่อนที่ใบยื่นจะออกไปพร้อมยอดที่ขาด
  { key: "missingRetailPrice", label: "ขาดราคาขายปลีก" },
];

export default function ReportsPage() {
  const { data: customers } = useApiList("/api/customers");
  const [type, setType] = useState("registration");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // ตัวกรองเป็น multi-select ทั้งคู่ (มติผู้ใช้ 2026-07-18) — ว่าง = ทั้งหมด
  const [customerIds, setCustomerIds] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set()); // row ids to download
  const [zipDocTypes, setZipDocTypes] = useState(() => new Set(ZIP_ALL_KEYS)); // doc types to include in ZIP

  // รายงาน "ขาดราคาขายปลีก" ไม่มีสถานะเอกสารให้กรอง (เป็นทะเบียนสินค้า ไม่ใช่ใบ)
  const statusFilters = type === "missingRetailPrice"
    ? []
    : (type === "registration" ? REGISTRATION_FILTERS : FILING_FILTERS);

  const query = useMemo(() => {
    const p = new URLSearchParams({ type });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (customerIds.length) p.set("customerId", customerIds.join(","));
    if (statuses.length) p.set("status", statuses.join(","));
    return p.toString();
  }, [type, from, to, customerIds, statuses]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/api/tax/reports?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setReport(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);

  // Reset selection whenever the report data changes (filters/type/period).
  useEffect(() => { setSelected(new Set()); }, [query]);

  const allIds = useMemo(() => (report?.rows || []).map((r) => r.id), [report]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds));
  const idsParam = selected.size ? `&ids=${encodeURIComponent([...selected].join(","))}` : "";

  const selectCol = {
    key: "_sel",
    label: <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="เลือกทั้งหมด" />,
    sortValue: null,
    align: "center",
    thStyle: { width: 34 },
    render: (row) => (
      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} aria-label="เลือกแถวนี้" />
    ),
  };

  const columns = [selectCol, ...(report?.columns || []).map((c) => ({
    key: c.key,
    label: c.label,
    align: c.money || c.num ? "right" : "left",
    sortValue: (row) => row[c.key],
    render: (row) => {
      const v = row[c.key];
      if (c.money) return <span className="font-mono">{v == null ? "-" : fmtMoney(v)}</span>;
      if (c.date) return fmtDate(v);
      if (c.num) return <span className="font-mono">{v == null ? "-" : fmtNumber(v)}</span>;
      if (c.multiline) {
        const [main, ...rest] = String(naText(v)).split("\n");
        return (
          <div>
            <div>{main}</div>
            {rest.map((line, i) => (
              <div key={i} style={{ fontSize: "var(--fs-4)", color: "var(--text-3)" }}>{line}</div>
            ))}
          </div>
        );
      }
      return naText(v);
    },
  }))];

  // หัวเอกสารพิมพ์: เลือกลูกค้ารายเดียวโชว์ชื่อ หลายรายโชว์จำนวน (ชื่อรายแถวมีในตารางอยู่แล้ว)
  const customerName = customerIds.length === 1
    ? customers.find((c) => c.id === customerIds[0])?.name
    : (customerIds.length > 1 ? `ลูกค้า ${customerIds.length} ราย` : undefined);
  const downloadXlsx = () => {
    const a = document.createElement("a");
    a.href = `/api/tax/reports?${query}&format=xlsx${idsParam}`;
    a.click();
  };
  const downloadZip = () => {
    const docTypesParam = zipDocTypes.size < ZIP_ALL_KEYS.length
      ? `&docTypes=${encodeURIComponent([...zipDocTypes].join(","))}`
      : "";
    const a = document.createElement("a");
    a.href = `/api/tax/reports?${query}&format=zip${idsParam}${docTypesParam}`;
    a.click();
  };
  const print = async () => {
    if (!report) return;
    // No selection → print the loaded report as-is. With a selection, re-fetch so
    // the totals row reflects only the printed rows (server recomputes summary by ids).
    if (!selected.size) {
      openReportPrintWindow(report, { from, to, customerName });
      return;
    }
    const res = await apiFetch(`/api/tax/reports?${query}${idsParam}`);
    if (!res.ok) return;
    const data = await res.json();
    openReportPrintWindow(data, { from, to, customerName });
  };

  const summary = report?.summary;

  return (
    <Workspace
      icon={<BarChart3 size={22} />}
      title="รายงานภาษีสรรพสามิต"
      subtitle="สรุปข้อมูลภาษีตามมุมมองต่าง ๆ พร้อมส่งออก Excel และพิมพ์ PDF"
      headerRight={
        <>
          {type === "registration" && (
            <ZipDownloadButton
              disabled={!report?.rows?.length}
              selectedTypes={zipDocTypes}
              onChange={setZipDocTypes}
              onDownload={downloadZip}
            />
          )}
          <button className="btn btn-secondary flex items-center gap-1.5" onClick={print} disabled={!report?.rows?.length}>
            <Printer size={16} /> พิมพ์ / PDF
          </button>
          <button className="btn btn-primary flex items-center gap-1.5" onClick={downloadXlsx} disabled={!report?.rows?.length}>
            <FileSpreadsheet size={16} /> ดาวน์โหลด Excel
          </button>
        </>
      }
      toolbar={
        <div className="toolbar">
          <div className="segmented">
            {REPORT_TABS.map((t) => (
              <button key={t.key} className={type === t.key ? "active" : ""} onClick={() => { setType(t.key); setStatuses([]); }}>{t.label}</button>
            ))}
          </div>
          <div className="spacer" />
          <FilterPopover
            count={statuses.length + customerIds.length}
            onClear={() => { setStatuses([]); setCustomerIds([]); }}
            groups={[
              {
                key: "status", label: "สถานะ", icon: CircleDot,
                options: statusFilters.filter((f) => f.key !== "all").map((f) => ({ value: f.key, label: f.label })),
                selected: statuses,
                onChange: setStatuses,
              },
              {
                key: "customer", label: "ลูกค้า", icon: Building2,
                options: customers.map((c) => ({ value: c.id, label: c.name })),
                selected: customerIds,
                onChange: setCustomerIds,
              },
            ]}
          />
          <label className="flex items-center gap-1.5" style={{ fontSize: "var(--fs-6)", color: "var(--text-3)" }}>
            จาก <DateInput style={{ height: "var(--ctl-h)" }} value={from} onChange={setFrom} />
          </label>
          <label className="flex items-center gap-1.5" style={{ fontSize: "var(--fs-6)", color: "var(--text-3)" }}>
            ถึง <DateInput style={{ height: "var(--ctl-h)" }} value={to} onChange={setTo} />
          </label>
        </div>
      }
    >
      {summary && report?.rows?.length > 0 && (
        <div className="glass-panel flex items-center gap-6 flex-wrap mb-4" style={{ padding: "12px 16px" }}>
          <span style={{ fontWeight: "var(--fw-semibold)" }}>{summary._label}</span>
          {summary.qty != null && (
            <span style={{ fontSize: "var(--fs-7)" }}>จำนวนรวม: <strong className="font-mono">{fmtNumber(summary.qty)}</strong></span>
          )}
          {summary.tax != null && (
            <span style={{ fontSize: "var(--fs-7)" }}>ยอดภาษีรวม: <strong className="font-mono" style={{ color: "var(--red)" }}>{fmtMoney(summary.tax)}</strong></span>
          )}
          {typeof summary.status === "string" && <span style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>{summary.status}</span>}
          {selected.size > 0 && <span style={{ fontSize: "var(--fs-7)", color: "var(--accent)", marginLeft: "auto" }}>เลือกไว้ {selected.size} รายการ (โหลด/พิมพ์เฉพาะที่เลือก)</span>}
        </div>
      )}

      <DataList
        columns={columns}
        rows={report?.rows || []}
        rowKey={(r) => r.id}
        empty={loading ? "กำลังโหลด..." : "ไม่มีข้อมูลในช่วงที่เลือก"}
        emptyIcon={BarChart3}
      />
    </Workspace>
  );
}
