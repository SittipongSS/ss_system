"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Check, History } from "lucide-react";
import Select from "@/components/ui/Select";
import Workspace from "@/components/ui/Workspace";
import StandardMoneyInput from "@/components/ui/MoneyInput";
import { useCan, useRole } from "@/lib/roleContext";
import { MONTH_LABELS, SALES_TEAMS, thisMonth } from "@/components/salesPlanning/ui";
import { fmtMoney } from "@/lib/format";

// บันทึกยอดขายรายเดือนของปีก่อนหน้า → sales_history (periodType='month').
// ใช้เติมเส้น "Actual ปีก่อน" และกราฟ YoY ในแท็บผลงานขาย — ระดับบริษัท + รายทีม
// (รายคนไม่รับ: คนย้ายทีม/ลาออกทำให้ตัวเลขเก่าไม่มีเจ้าของชัด ใช้ยอดระบบพอ).
// สิทธิ์เดียวกับตัวช่วยวางเป้า: AE Supervisor / admin เท่านั้น (server บังคับซ้ำ).

const TEAM_LABELS = { ODM: "New ODM", KA: "Key Account", SV: "Services" };
const thisYearNum = () => Number(thisMonth().slice(0, 4));

// แถวกริด: บริษัท (team null) + ทีมมาตรฐาน
const GRID_ROWS = [{ key: "", label: "ทั้งบริษัท", sub: "รวมทุกทีม" }, ...SALES_TEAMS.map((t) => ({ key: t, label: `ทีม ${t}`, sub: TEAM_LABELS[t] || "" }))];

export default function SalesHistoryMonthlyPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const isSuper = role === "admin" || role === "ae_supervisor";

  const yearOptions = useMemo(() => {
    const cy = thisYearNum();
    return [cy - 1, cy - 2, cy - 3].map(String);
  }, []);
  const [year, setYear] = useState(yearOptions[0]);

  // values[rowKey][monthIdx] = จำนวนเงิน · saved = แถวที่เคยบันทึกไว้ (กรอกเอง)
  // system = ยอด won จากระบบ (ใช้ pre-fill เฉพาะช่องที่ยังไม่เคยกรอก)
  const [values, setValues] = useState({});
  const [savedCells, setSavedCells] = useState(new Set());
  const [systemCells, setSystemCells] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const [histRes, dashRes] = await Promise.all([
        fetch(`/api/sales-planning/history?monthsOf=${encodeURIComponent(year)}`),
        fetch(`/api/sales-planning/dashboard?year=${encodeURIComponent(year)}`),
      ]);
      if (!histRes.ok) throw new Error((await histRes.json().catch(() => ({}))).error || "โหลดประวัติไม่สำเร็จ");
      const { rows } = await histRes.json();

      // ยอดระบบ: บริษัท = totals.wonValue, ทีม = byTeam.won ของแต่ละเดือน
      const sys = {};
      if (dashRes.ok) {
        const months = (await dashRes.json()).months || [];
        for (const m of months) {
          const mi = Number(String(m.month).slice(5, 7)) - 1;
          if (mi < 0 || mi > 11) continue;
          sys[`:${mi}`] = Number(m.totals?.wonValue || 0);
          for (const t of m.byTeam || []) sys[`${t.team}:${mi}`] = Number(t.won || 0);
        }
      }
      setSystemCells(sys);

      const next = {};
      const saved = new Set();
      for (const r of GRID_ROWS) next[r.key] = Array(12).fill("");
      // ช่องที่เคยบันทึก = ค่าที่กรอกเอง (ทับยอดระบบ) — ติดป้ายให้รู้ที่มา
      for (const row of rows || []) {
        if (row.ownerId) continue;
        const mi = Number(String(row.period).slice(5, 7)) - 1;
        const key = row.team || "";
        if (mi < 0 || mi > 11 || !(key in next)) continue;
        next[key][mi] = Number(row.actualAmount || 0);
        saved.add(`${key}:${mi}`);
      }
      // ช่องว่างที่ระบบมียอด → pre-fill ให้เห็น (ยังนับเป็น "ระบบ" จนกดบันทึก)
      for (const r of GRID_ROWS) {
        for (let mi = 0; mi < 12; mi += 1) {
          if (next[r.key][mi] === "" && sys[`${r.key}:${mi}`] > 0) next[r.key][mi] = sys[`${r.key}:${mi}`];
        }
      }
      setValues(next);
      setSavedCells(saved);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const setCell = (rowKey, mi, v) => {
    setValues((prev) => ({ ...prev, [rowKey]: prev[rowKey].map((x, i) => (i === mi ? v : x)) }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      // ส่งเฉพาะช่องที่มีค่า (รวมช่อง pre-fill ระบบที่ผู้ใช้เห็นแล้วยอมรับ) ≤ 48 รายการ
      const items = [];
      for (const r of GRID_ROWS) {
        (values[r.key] || []).forEach((v, mi) => {
          if (v === "" || v == null) return;
          items.push({
            period: `${year}-${String(mi + 1).padStart(2, "0")}`,
            periodType: "month",
            team: r.key || null,
            ownerId: null,
            targetAmount: 0,
            actualAmount: Number(v) || 0,
            source: "manual",
          });
        });
      }
      if (!items.length) throw new Error("ยังไม่มีตัวเลขให้บันทึก");
      const res = await fetch("/api/sales-planning/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      setInfo(`บันทึกยอดปี ${year} แล้ว ${items.length} ช่อง — กราฟ YoY ในแท็บผลงานขายอัปเดตทันที`);
      await load();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!canTarget || !isSuper) {
    return (
      <Workspace icon={<History size={22} />} title="ยอดขายรายเดือนปีก่อน" back={{ href: "/sa/targets", label: "กลับ" }}>
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
          เฉพาะ AE Supervisor / admin บันทึกยอดย้อนหลังได้
        </div>
      </Workspace>
    );
  }

  const rowTotal = (rowKey) => (values[rowKey] || []).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Workspace
      icon={<History size={22} />}
      title="ยอดขายรายเดือนปีก่อน"
      subtitle="กรอกยอดขายจริงรายเดือน (จากระบบเดิม/บัญชี) เพื่อให้แท็บผลงานขายเทียบการเติบโต YoY และเส้น Actual ปีก่อนได้แม่น"
      back={{ href: "/sa/dashboard?tab=performance", label: "แท็บผลงานขาย" }}
      headerRight={
        <Select className="premium-select" value={year} onChange={(e) => setYear(e.target.value)} disabled={saving} aria-label="ปี" style={{ width: 130 }}>
          {yearOptions.map((y) => <option key={y} value={y}>ปี {y}</option>)}
        </Select>
      }
      loading={loading}
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", marginBottom: 14, borderColor: "var(--red)", color: "var(--red)" }}>
          {error}
        </div>
      )}
      {info && (
        <div className="glass-panel" role="status" style={{ padding: "12px 14px", marginBottom: 14, borderColor: "var(--green)", color: "var(--green)" }}>
          {info}
        </div>
      )}

      <section className="glass-panel" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
          <CalendarRange size={17} aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ยอดขายจริงรายเดือน ปี {year}</h2>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading}>
            <Check size={15} aria-hidden="true" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
        <p style={{ margin: "0 0 14px", color: "var(--text-3)", fontSize: 12.5 }}>
          ช่องที่มีป้าย <span className="ui-badge" style={{ color: "var(--teal)" }}>กรอกเอง</span> = เคยบันทึกไว้แล้ว ·
          ช่องอื่นเติมจากยอด Won ในระบบ (ถ้ามี) แก้ทับได้ · กด "บันทึก" ถึงมีผล
        </p>

        <div className="premium-glass-table table-responsive">
          <table className="w-full text-sm" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>ระดับ</th>
                {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 92 }}>{m}</th>)}
                <th className="num" style={{ minWidth: 110 }}>รวมปี</th>
              </tr>
            </thead>
            <tbody>
              {GRID_ROWS.map((r) => (
                <tr key={r.key || "company"} className="premium-row" style={r.key === "" ? { background: "var(--panel-2)", fontWeight: 600 } : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <strong>{r.label}</strong>
                    {r.sub && <span style={{ display: "block", color: "var(--text-3)", fontSize: 11.5, fontWeight: 400 }}>{r.sub}</span>}
                  </td>
                  {MONTH_LABELS.map((_, mi) => {
                    const isSaved = savedCells.has(`${r.key}:${mi}`);
                    return (
                      <td key={mi} className="num" style={{ padding: "6px 6px" }}>
                        <StandardMoneyInput
                          value={values[r.key]?.[mi] ?? ""}
                          onChange={(parsed) => setCell(r.key, mi, parsed ?? "")}
                          aria-label={`${r.label} ${MONTH_LABELS[mi]}`}
                          style={{ width: "100%", minWidth: 84, fontSize: 12.5, padding: "6px 8px", textAlign: "right" }}
                        />
                        <span style={{ display: "block", marginTop: 2, fontSize: 10, color: isSaved ? "var(--teal)" : "var(--text-3)", textAlign: "right" }}>
                          {isSaved ? "กรอกเอง" : systemCells[`${r.key}:${mi}`] > 0 ? "ระบบ" : ""}
                        </span>
                      </td>
                    );
                  })}
                  <td className="num mono" style={{ fontWeight: 700 }}>{fmtMoney(rowTotal(r.key))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Workspace>
  );
}
