"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileSpreadsheet, Printer } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import DataList from "@/components/excise/DataList";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";

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
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const p = new URLSearchParams({ type });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (customerId) p.set("customerId", customerId);
    return p.toString();
  }, [type, from, to, customerId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tax/reports?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setReport(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);

  const columns = (report?.columns || []).map((c) => ({
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
  }));

  const customerName = customers.find((c) => c.id === customerId)?.name;
  const downloadXlsx = () => {
    const a = document.createElement("a");
    a.href = `/api/tax/reports?${query}&format=xlsx`;
    a.click();
  };
  const print = () => report && openReportPrintWindow(report, { from, to, customerName });

  const summary = report?.summary;

  return (
    <Workspace
      icon={<BarChart3 size={22} />}
      title="รายงานภาษีสรรพสามิต"
      subtitle="สรุปข้อมูลภาษีตามมุมมองต่าง ๆ พร้อมส่งออก Excel และพิมพ์ PDF"
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
            {REPORT_TABS.map((t) => (
              <button key={t.key} className={type === t.key ? "active" : ""} onClick={() => setType(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="spacer" />
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            จาก <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            ถึง <input type="date" className="premium-input" style={{ height: "var(--ctl-h)" }} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div style={{ width: 200 }}>
            <SearchableSelect
              value={customerId}
              onChange={setCustomerId}
              size="sm"
              placeholder="ทุกลูกค้า"
              options={[{ value: "", label: "ทุกลูกค้า" }, ...customers.map((c) => ({ value: c.id, label: c.name, search: `${c.arCode} ${c.name}` }))]}
            />
          </div>
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
        </div>
      )}

      <DataList
        columns={columns}
        rows={report?.rows || []}
        rowKey={(_, i) => i}
        empty={loading ? "กำลังโหลด..." : "ไม่มีข้อมูลในช่วงที่เลือก"}
        emptyIcon={BarChart3}
      />
    </Workspace>
  );
}
