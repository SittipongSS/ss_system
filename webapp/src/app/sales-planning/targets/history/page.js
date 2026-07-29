"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Check, History } from "lucide-react";
import Select from "@/components/ui/Select";
import Workspace from "@/components/ui/Workspace";
import StandardMoneyInput from "@/components/ui/MoneyInput";
import { useCan, useRole } from "@/lib/roleContext";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { historyYearOptions, isMonthEditable, resolveYearTotal } from "@/lib/sales/historyEntry";
import { fmtMoney } from "@/lib/format";

// บันทึกยอดขายจริงย้อนหลัง → sales_history · ใช้เติมเส้น Actual และกราฟเทียบการเติบโต
// ในแท็บผลงานขาย
//
// **ระดับบริษัทอย่างเดียว ไม่แบ่งทีม** (มติผู้ใช้ 2026-07-26): ทีมขายเพิ่งแบ่งจริงเมื่อ
// มิถุนายน 2026 ยอดก่อนหน้านั้นไม่มีเจ้าของทีม ถ้าเปิดให้กรอกรายทีมย้อนหลังก็คือการเดา
// ที่ไปโผล่บนกราฟเหมือนเป็นข้อมูลจริง · รายคนไม่รับด้วยเหตุผลเดียวกัน (คนย้ายทีม/ลาออก)
//
// สิทธิ์เดียวกับตัวช่วยวางเป้า: AE Supervisor / admin เท่านั้น (server บังคับซ้ำ)

export default function SalesHistoryMonthlyPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const isSuper = role === "admin" || role === "ae_supervisor";

  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => historyYearOptions(now), [now]);
  const [year, setYear] = useState(yearOptions[0]);

  const [months, setMonths] = useState(() => Array(12).fill(""));
  const [yearOverride, setYearOverride] = useState(null); // null = ยังไม่แตะ → ตามผลรวมรายเดือน
  const [savedMonths, setSavedMonths] = useState(new Set());
  const [systemMonths, setSystemMonths] = useState({});
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

      // ยอดระบบรายเดือนระดับบริษัท — ใช้ pre-fill เฉพาะช่องที่ยังไม่เคยกรอกเอง
      const sys = {};
      if (dashRes.ok) {
        for (const m of (await dashRes.json()).months || []) {
          const mi = Number(String(m.month).slice(5, 7)) - 1;
          if (mi >= 0 && mi < 12) sys[mi] = Number(m.totals?.wonValue || 0);
        }
      }
      setSystemMonths(sys);

      const next = Array(12).fill("");
      const saved = new Set();
      for (const row of rows || []) {
        if (row.ownerId || row.team) continue; // ระดับบริษัทเท่านั้น
        const mi = Number(String(row.period).slice(5, 7)) - 1;
        if (mi < 0 || mi > 11) continue;
        next[mi] = Number(row.actualAmount || 0);
        saved.add(mi);
      }
      for (let mi = 0; mi < 12; mi += 1) {
        if (next[mi] === "" && sys[mi] > 0) next[mi] = sys[mi];
      }
      setMonths(next);
      setSavedMonths(saved);
      setYearOverride(null); // โหลดใหม่ = กลับไปตามผลรวมรายเดือน
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const { total: yearTotal, mismatch } = resolveYearTotal({ months, override: yearOverride });

  const setMonth = (mi, value) => {
    setMonths((prev) => prev.map((x, i) => (i === mi ? value : x)));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const items = [];
      months.forEach((value, mi) => {
        // เดือนที่ยังมาไม่ถึงไม่ส่งขึ้น server แม้จะมีค่าค้างจาก pre-fill
        if (value === "" || value == null || !isMonthEditable(year, mi, now)) return;
        items.push({
          period: `${year}-${String(mi + 1).padStart(2, "0")}`,
          periodType: "month",
          team: null,
          ownerId: null,
          actualAmount: Number(value) || 0,
          source: "manual",
        });
      });
      // แถวรายปีระดับบริษัท — ตัวช่วยวางเป้าอ่านแถวนี้ · ไม่ส่ง targetAmount เด็ดขาด
      // ไม่งั้นเป้าที่วางไว้ในแถวเดียวกันจะถูกเขียนทับเป็น 0
      if (yearTotal > 0) {
        items.push({
          period: year,
          periodType: "year",
          team: null,
          ownerId: null,
          actualAmount: yearTotal,
          source: "manual",
        });
      }
      if (!items.length) throw new Error("ยังไม่มีตัวเลขให้บันทึก");
      const res = await fetch("/api/sales-planning/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      setInfo(`บันทึกยอดปี ${year} แล้ว — แท็บผลงานขายอัปเดตทันที`);
      await load();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!canTarget || !isSuper) {
    return (
      <Workspace icon={<History size={22} />} title="ยอดขายย้อนหลัง" back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}>
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
          เฉพาะ AE Supervisor / admin บันทึกยอดย้อนหลังได้
        </div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<History size={22} />}
      title="ยอดขายย้อนหลัง"
      subtitle="กรอกยอดขายจริงของช่วงที่ยังไม่ได้ใช้ระบบ (ปีก่อน ๆ และเดือนต้นปีนี้) เพื่อให้แท็บผลงานขายมีเส้น Actual และเทียบการเติบโตได้"
      back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}
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
          <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: 700 }}>ยอดขายจริง ปี {year} · ทั้งบริษัท</h2>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading}>
            <Check size={15} aria-hidden="true" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
        <p style={{ margin: "0 0 14px", color: "var(--text-3)", fontSize: "var(--fs-6)" }}>
          กรอกเป็น<b>ยอดรวมทั้งบริษัท</b>เท่านั้น — ทีมขายเพิ่งแบ่งจริงเมื่อ มิ.ย. 2026 ยอดก่อนหน้านั้นไม่มีเจ้าของทีม ·
          ช่องที่มีป้าย <span className="ui-badge" style={{ color: "var(--teal)" }}>กรอกเอง</span> = เคยบันทึกไว้แล้ว ·
          ช่องอื่นเติมจากยอด Won ในระบบ (ถ้ามี) แก้ทับได้ · กด &ldquo;บันทึก&rdquo; ถึงมีผล
        </p>

        <div className="premium-glass-table table-responsive">
          <TableScroll surface="embedded" family="editable"><table className="w-full text-sm" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>ระดับ</th>
                {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 92 }}>{m}</th>)}
                <th className="num" style={{ minWidth: 130 }}>รวมทั้งปี</th>
              </tr>
            </thead>
            <tbody>
              <tr className="premium-row" style={{ background: "var(--panel-2)", fontWeight: 600 }}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>ทั้งบริษัท</strong>
                  <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-4)", fontWeight: 400 }}>รวมทุกทีม</span>
                </td>
                {MONTH_LABELS.map((label, mi) => {
                  const editable = isMonthEditable(year, mi, now);
                  return (
                    <td key={label} className="num" style={{ padding: "6px 6px" }}>
                      <StandardMoneyInput
                        value={months[mi] ?? ""}
                        disabled={!editable}
                        onChange={(parsed) => setMonth(mi, parsed ?? "")}
                        aria-label={`ทั้งบริษัท ${label}`}
                        style={{ width: "100%", minWidth: 84, fontSize: "var(--fs-6)", padding: "6px 8px", textAlign: "right" }}
                      />
                      <span style={{ display: "block", marginTop: 2, fontSize: "var(--fs-2)", color: savedMonths.has(mi) ? "var(--teal)" : "var(--text-3)", textAlign: "right" }}>
                        {!editable ? "ยังไม่ถึง" : savedMonths.has(mi) ? "กรอกเอง" : systemMonths[mi] > 0 ? "ระบบ" : ""}
                      </span>
                    </td>
                  );
                })}
                {/* ยอดรวมทั้งปีแก้เองได้ — บางปีรู้แค่ยอดรวม ไม่มีตัวเลขรายเดือน */}
                <td className="num" style={{ padding: "6px 6px" }}>
                  <StandardMoneyInput
                    value={yearOverride ?? yearTotal}
                    onChange={(parsed) => setYearOverride(parsed ?? "")}
                    aria-label={`ยอดรวมทั้งปี ${year}`}
                    style={{ width: "100%", minWidth: 110, fontSize: "var(--fs-6)", padding: "6px 8px", textAlign: "right", fontWeight: 700 }}
                  />
                  <span style={{ display: "block", marginTop: 2, fontSize: "var(--fs-2)", textAlign: "right", color: mismatch ? "var(--amber)" : "var(--text-3)" }}>
                    {mismatch ? "ไม่ตรงผลรวมรายเดือน" : yearOverride == null ? "ผลรวมรายเดือน" : "กรอกเอง"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table></TableScroll>
        </div>

        {mismatch && (
          <p style={{ margin: "12px 0 0", color: "var(--amber)", fontSize: "var(--fs-6)", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            ยอดรวมทั้งปีที่กรอก ({fmtMoney(yearTotal)}) ไม่ตรงกับผลรวมรายเดือน ({fmtMoney(resolveYearTotal({ months }).total)}) —
            บันทึกได้ตามปกติถ้าตั้งใจ (เช่นปีที่รู้แค่ยอดรวม) ระบบจะเก็บทั้งสองค่าตามที่กรอก
          </p>
        )}
      </section>
    </Workspace>
  );
}
