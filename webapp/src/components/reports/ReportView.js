"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileSpreadsheet, Printer } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import DataList from "@/components/excise/DataList";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { openReportPrintWindow } from "@/lib/reports/reportPrint";

// Generic report workspace shared by every module's /reports page (tax has its
// own richer page with ZIP export; master + pm use this). Renders the uniform
// report shape: segmented tabs → fetch JSON → DataList + Excel/Print + row pick.
//
// Props:
//   icon, title, subtitle — Workspace header
//   apiPath               — e.g. "/api/pm/reports"
//   tabs                  — [{ key, label }]
//   statusOptions         — { [tabKey]: [{ value, label }] } (optional per-tab)
//   enableCustomerFilter  — show a customer dropdown (filters ?customerId)
export default function ReportView({ icon, title, subtitle, apiPath, tabs, statusOptions = {}, enableCustomerFilter = false }) {
  const { data: customers } = useApiList(enableCustomerFilter ? "/api/customers" : null);
  const [type, setType] = useState(tabs[0]?.key);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("all");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());

  const tabStatusOptions = statusOptions[type] || null;

  const query = useMemo(() => {
    const p = new URLSearchParams({ type });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (enableCustomerFilter && customerId) p.set("customerId", customerId);
    if (tabStatusOptions && status && status !== "all") p.set("status", status);
    return p.toString();
  }, [type, from, to, customerId, status, enableCustomerFilter, tabStatusOptions]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${apiPath}?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setReport(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiPath, query]);

  // Reset selection whenever the data changes (filters/type/period).
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

  const customerName = customers?.find((c) => c.id === customerId)?.name;
  const downloadXlsx = () => {
    const a = document.createElement("a");
    a.href = `${apiPath}?${query}&format=xlsx${idsParam}`;
    a.click();
  };
  const print = () => {
    if (!report) return;
    const rows = selected.size ? report.rows.filter((r) => selected.has(r.id)) : report.rows;
    openReportPrintWindow({ ...report, rows }, { from, to, customerName });
  };

  const summary = report?.summary;

  return (
    <Workspace
      icon={icon || <BarChart3 size={22} />}
      title={title}
      subtitle={subtitle}
      headerRight={
        <>
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
            {tabs.map((t) => (
              <button key={t.key} className={type === t.key ? "active" : ""} onClick={() => { setType(t.key); setStatus("all"); }}>{t.label}</button>
            ))}
          </div>
          <div className="spacer" />
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            จาก <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            ถึง <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {tabStatusOptions && (
            <div style={{ width: 160 }}>
              <SearchableSelect
                value={status}
                onChange={setStatus}
                size="sm"
                placeholder="ทุกสถานะ"
                options={tabStatusOptions}
              />
            </div>
          )}
          {enableCustomerFilter && (
            <div style={{ width: 200 }}>
              <SearchableSelect
                value={customerId}
                onChange={setCustomerId}
                size="sm"
                placeholder="ทุกลูกค้า"
                options={[{ value: "", label: "ทุกลูกค้า" }, ...(customers || []).map((c) => ({ value: c.id, label: c.name, search: `${c.arCode} ${c.name}` }))]}
              />
            </div>
          )}
        </div>
      }
    >
      {summary && report?.rows?.length > 0 && (
        <div className="glass-panel flex items-center gap-6 flex-wrap mb-4" style={{ padding: "12px 16px" }}>
          <span style={{ fontWeight: 600 }}>{summary._label}</span>
          {Object.entries(summary).map(([k, v]) => {
            if (k === "_label" || v == null) return null;
            const col = (report.columns || []).find((c) => c.key === k);
            const label = col?.label || k;
            const display = typeof v === "number" ? (col?.money ? fmtMoney(v) : Number(v).toLocaleString("th-TH")) : v;
            return (
              <span key={k} style={{ fontSize: 13, color: "var(--text-3)" }}>
                {typeof v === "number" ? <>{label}: <strong className="font-mono" style={{ color: "var(--text-1)" }}>{display}</strong></> : display}
              </span>
            );
          })}
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
