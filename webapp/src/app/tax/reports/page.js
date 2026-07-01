"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, FileSpreadsheet, Printer, FolderArchive, CircleDot, Building2, ChevronDown, Check } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import DataList from "@/components/excise/DataList";
import FilterPopover from "@/components/ui/FilterPopover";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import { REGISTRATION_FILTERS, FILING_FILTERS } from "@/lib/excise/workflow";
import { ATTACHMENT_TYPES } from "@/lib/master/attachmentTypes";

// ประเภทเอกสารที่เลือกรวมใน ZIP ได้ — เอกสารทะเบียน + แผนที่บริษัท (เอกสารลูกค้า
// ที่ผูกกับทะเบียน ไม่ใช่การ์ดของทะเบียนเอง จึงเติมเป็นตัวเลือกพิเศษท้ายลิสต์).
const ZIP_DOC_TYPES = [
  ...ATTACHMENT_TYPES.registration,
  { key: "address_map", label: "แผนที่บริษัท (เอกสารลูกค้า)" },
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
        <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div className="glass-panel" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40, width: "min(90vw, 300px)", padding: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)", marginBottom: "6px" }}>เลือกประเภทเอกสารที่จะรวมใน ZIP</div>
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
                    fontSize: "13px", border: "none",
                    background: checked ? "var(--accent-soft)" : "transparent",
                    color: checked ? "var(--accent)" : "var(--text)",
                  }}
                >
                  <span style={{ width: "16px", height: "16px", borderRadius: "4px", border: checked ? "none" : "1.5px solid var(--border)", background: checked ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {checked && <Check size={12} color="#fff" strokeWidth={3} />}
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
];

export default function ReportsPage() {
  const { data: customers } = useApiList("/api/customers");
  const [type, setType] = useState("registration");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("all");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set()); // row ids to download
  const [zipDocTypes, setZipDocTypes] = useState(() => new Set(ZIP_ALL_KEYS)); // doc types to include in ZIP

  const statusFilters = type === "registration" ? REGISTRATION_FILTERS : FILING_FILTERS;

  const query = useMemo(() => {
    const p = new URLSearchParams({ type });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (customerId) p.set("customerId", customerId);
    if (status && status !== "all") p.set("status", status);
    return p.toString();
  }, [type, from, to, customerId, status]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tax/reports?${query}`)
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
      if (c.num) return <span className="font-mono">{v == null ? "-" : Number(v).toLocaleString("th-TH")}</span>;
      if (c.multiline) {
        const [main, ...rest] = String(v ?? "-").split("\n");
        return (
          <div>
            <div>{main}</div>
            {rest.map((line, i) => (
              <div key={i} style={{ fontSize: 11.5, color: "var(--text-3)" }}>{line}</div>
            ))}
          </div>
        );
      }
      return v ?? "-";
    },
  }))];

  const customerName = customers.find((c) => c.id === customerId)?.name;
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
    const res = await fetch(`/api/tax/reports?${query}${idsParam}`);
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
              <button key={t.key} className={type === t.key ? "active" : ""} onClick={() => { setType(t.key); setStatus("all"); }}>{t.label}</button>
            ))}
          </div>
          <div className="spacer" />
          <FilterPopover
            count={(status && status !== "all" ? 1 : 0) + (customerId ? 1 : 0)}
            onClear={() => { setStatus("all"); setCustomerId(""); }}
            groups={[
              {
                key: "status", label: "สถานะ", icon: CircleDot, single: true,
                options: statusFilters.filter((f) => f.key !== "all").map((f) => ({ value: f.key, label: f.label })),
                selected: status && status !== "all" ? [status] : [],
                onChange: (arr) => setStatus(arr[0] || "all"),
              },
              {
                key: "customer", label: "ลูกค้า", icon: Building2, single: true,
                options: customers.map((c) => ({ value: c.id, label: c.name })),
                selected: customerId ? [customerId] : [],
                onChange: (arr) => setCustomerId(arr[0] || ""),
              },
            ]}
          />
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            จาก <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            ถึง <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      }
    >
      {summary && report?.rows?.length > 0 && (
        <div className="glass-panel flex items-center gap-6 flex-wrap mb-4" style={{ padding: "12px 16px" }}>
          <span style={{ fontWeight: 600 }}>{summary._label}</span>
          {summary.qty != null && (
            <span style={{ fontSize: 13 }}>จำนวนรวม: <strong className="font-mono">{Number(summary.qty).toLocaleString("th-TH")}</strong></span>
          )}
          {summary.tax != null && (
            <span style={{ fontSize: 13 }}>ยอดภาษีรวม: <strong className="font-mono" style={{ color: "var(--red)" }}>{fmtMoney(summary.tax)}</strong></span>
          )}
          {typeof summary.status === "string" && <span style={{ fontSize: 13, color: "var(--text-3)" }}>{summary.status}</span>}
          {selected.size > 0 && <span style={{ fontSize: 13, color: "var(--accent)", marginLeft: "auto" }}>เลือกไว้ {selected.size} รายการ (โหลด/พิมพ์เฉพาะที่เลือก)</span>}
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
