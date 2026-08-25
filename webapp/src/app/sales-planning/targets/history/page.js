"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import { AlertTriangle, CalendarRange, Check, Download, History } from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Workspace from "@/components/ui/Workspace";
import StandardMoneyInput from "@/components/ui/MoneyInput";
import { cachedFetchJson } from "@/lib/apiCache";
import { useCan, useRole } from "@/lib/roleContext";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES } from "@/components/salesPlanning/ui";
import { TEAM_LABELS } from "@/lib/permissions";
import {
  buildHistoryRows, historyRowKey, historySaveItems,
  historyYearOptions, isMonthClosed, isMonthEditable, resolveYearTotal,
} from "@/lib/sales/historyEntry";
import { fmtMoney, fmtMoneyCompact, naText } from "@/lib/format";
import styles from "./page.module.css";

// บันทึกยอดขายจริงย้อนหลัง → sales_history · ใช้เติมเส้น Actual และกราฟเทียบการเติบโต
// ในแท็บผลงานขาย
//
// **2026-08-03: เปิดให้กรอกรายทีม/รายคนได้แล้ว "หากมี"** (มติผู้ใช้ — กลับมติ 2026-07-26
// ที่ล็อกไว้ระดับบริษัทอย่างเดียว) · ข้อกังวลเดิมยังอยู่: ทีมขายเพิ่งแบ่งจริง มิ.ย. 2026
// เดือนก่อนหน้านั้นไม่มีเจ้าของทีม จึงคุมด้วยกติกา **ช่องว่าง = ไม่บันทึกแถวนั้น**
// และ **ไม่ pre-fill แถวทีม/คนจากยอดระบบ** (โชว์เป็นตัวเลขใบ้ใต้ช่องแทน) — ไม่งั้น
// กดบันทึกครั้งเดียวจะกลายเป็นการปั๊มตัวเลขที่ระบบเดาให้ ลงเป็นข้อมูล "กรอกเอง" ทั้งตาราง
//
// สิทธิ์เดียวกับตัวช่วยวางเป้า: AE Supervisor / admin เท่านั้น (server บังคับซ้ำ)

const emptyValue = () => ({ months: Array(12).fill(""), yearOverride: null });

export default function SalesHistoryMonthlyPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const isSuper = role === "admin" || role === "ae_supervisor";

  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => historyYearOptions(now), [now]);
  const [year, setYear] = useState(yearOptions[0]);

  const [users, setUsers] = useState([]);
  const [savedRows, setSavedRows] = useState([]);
  const [values, setValues] = useState({ company: emptyValue() });
  const [savedCells, setSavedCells] = useState({}); // key → Set(monthIdx) ที่เคยบันทึกเอง
  const [systemCells, setSystemCells] = useState({}); // key → { [monthIdx]: ยอดที่ระบบรู้ }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(d || [])).catch(() => {});
  }, []);

  /* แถวที่แสดง = บริษัท → ทีม → คนในทีม → คนที่มีข้อมูลค้างแต่ย้าย/ออกไปแล้ว
     ต้องคำนวณจาก savedRows ด้วย ไม่ใช่จากรายชื่อผู้ใช้อย่างเดียว ไม่งั้นตัวเลขของคนที่
     ออกไปแล้วจะยังถูกนับในฐานข้อมูลโดยไม่มีใครเห็นและแก้ไม่ได้ */
  const rowDefs = useMemo(
    () => buildHistoryRows({ teams: SALES_TEAMS, users, savedRows, ownerRoles: TARGET_OWNER_ROLES }),
    [users, savedRows],
  );

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async () => {
    const isLatest = startRun();
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

      // ยอดที่ระบบรู้อยู่แล้ว แยกครบทั้งสามระดับ — บริษัทใช้ pre-fill · ทีม/คนใช้เป็น
      // ตัวเลขใบ้ใต้ช่องเท่านั้น (ดูเหตุผลบนหัวไฟล์)
      const sys = {};
      if (dashRes.ok) {
        for (const month of (await dashRes.json()).months || []) {
          const mi = Number(String(month.month).slice(5, 7)) - 1;
          if (mi < 0 || mi > 11) continue;
          const put = (key, amount) => {
            if (!(Number(amount) > 0)) return;
            (sys[key] ||= {})[mi] = Number(amount);
          };
          put("company", month.totals?.wonValue);
          for (const teamRow of month.byTeam || []) put(historyRowKey({ team: teamRow.team }), teamRow.won);
          // ⚠️ ต้องส่งทีมเข้าไปด้วย — คีย์รายคนผูกกับทีม (คนย้ายทีมมีได้สองแถว)
          for (const ownerRow of month.byOwner || []) put(historyRowKey({ team: ownerRow.team, ownerId: ownerRow.ownerId }), ownerRow.won);
        }
      }
      // เปลี่ยนปีระหว่างรอ — ทั้งตารางต้องมาจากรอบเดียวกัน ไม่งั้นยอดระบบของปีหนึ่ง
      // ไปนั่งอยู่ใต้ช่องกรอกของอีกปี ซึ่งอ่านไม่ออกเลยว่าผิด
      if (!isLatest()) return;
      setSystemCells(sys);

      const nextValues = {};
      const nextSaved = {};
      for (const row of rows || []) {
        const mi = Number(String(row.period).slice(5, 7)) - 1;
        if (mi < 0 || mi > 11) continue;
        const key = historyRowKey({ team: row.team, ownerId: row.ownerId });
        (nextValues[key] ||= emptyValue()).months[mi] = Number(row.actualAmount || 0);
        (nextSaved[key] ||= new Set()).add(mi);
      }
      /* 🔴 **ไม่ pre-fill แถวบริษัทอีกแล้ว** (แก้ 2026-08-24) — ของเดิมเติมยอดที่ระบบรู้
         ลงช่องว่างให้เอง แล้วปุ่ม "บันทึก" ส่งทุกช่องที่ไม่ว่างขึ้นไปเป็น `source: 'manual'`
         ⇒ เปิดหน้านี้วันที่ 10 เพื่อกรอก ม.ค.–พ.ค. แล้วกดบันทึก เดือนที่ระบบรู้อยู่แล้ว
         (รวม **เดือนปัจจุบันที่ยังเดินอยู่**) ถูกตรึงไว้ที่ยอด ณ วันนั้นตลอดไป เพราะ
         แท็บผลงานขายเอาแถวที่กรอกเองไปทับยอดระบบ — ดีลที่ปิดวันที่ 11–31 หายจากรีพอร์ต
         ตอนนี้ยอดระบบเป็น "ตัวเลขใบ้" ใต้ช่องเหมือนแถวทีม/รายคน (กติกาเดียวกันทั้งตาราง)
         ใครจะใช้จริงกดปุ่ม "เติมยอดจากระบบ" ซึ่งเติมเฉพาะเดือนที่ปิดแล้ว */
      nextValues.company ||= emptyValue();

      setSavedRows(rows || []);
      setValues(nextValues);
      setSavedCells(nextSaved);
    } catch (e) {
      if (isLatest()) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [year, startRun]);

  useEffect(() => { load(); }, [load]);

  const valueOf = useCallback((key) => values[key] || emptyValue(), [values]);

  const setMonth = (key, monthIdx, amount) => {
    setValues((prev) => {
      const current = prev[key] || emptyValue();
      const months = current.months.map((x, i) => (i === monthIdx ? amount : x));
      return { ...prev, [key]: { ...current, months } };
    });
  };
  const setYearOverride = (key, amount) => {
    setValues((prev) => ({ ...prev, [key]: { ...(prev[key] || emptyValue()), yearOverride: amount } }));
  };

  /* เติมยอดที่ระบบรู้ลงช่องว่างของแถวบริษัท — เป็นการกดเอง ไม่ใช่ pre-fill เงียบ ๆ
     และ **เฉพาะเดือนที่ปิดแล้ว** เดือนที่ยังเดินอยู่ต้องไม่ถูกตรึง (ดู isMonthClosed) */
  const companyFillable = useMemo(() => {
    const sys = systemCells.company || {};
    const months = (values.company || emptyValue()).months;
    return months.reduce((count, value, mi) => (
      value === "" && isMonthClosed(year, mi, now) && sys[mi] > 0 ? count + 1 : count
    ), 0);
  }, [systemCells, values, year, now]);

  const fillCompanyFromSystem = () => {
    const sys = systemCells.company || {};
    setValues((prev) => {
      const current = prev.company || emptyValue();
      const months = current.months.map((value, mi) => (
        value === "" && isMonthClosed(year, mi, now) && sys[mi] > 0 ? sys[mi] : value
      ));
      return { ...prev, company: { ...current, months } };
    });
  };

  // แถวไหนที่ผลรวมทั้งปีไม่ตรงกับผลรวมรายเดือน — เตือนแต่ไม่บล็อก
  const mismatches = useMemo(() => rowDefs
    .map((row) => {
      const value = valueOf(row.key);
      const { mismatch } = resolveYearTotal({ months: value.months, override: value.yearOverride });
      return mismatch ? row : null;
    })
    .filter(Boolean), [rowDefs, valueOf]);

  const save = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const items = historySaveItems({ rows: rowDefs, values, year, now });
      if (!items.length) throw new Error("ยังไม่มีตัวเลขให้บันทึก");
      const res = await fetch("/api/sales-planning/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      setInfo(`บันทึกยอดปี ${year} แล้ว (${items.length} รายการ) — แท็บผลงานขายอัปเดตทันที`);
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

  const rowLabel = (row) => {
    if (row.scope === "company") return { title: "ทั้งบริษัท", sub: "รวมทุกทีม" };
    if (row.scope === "team") return { title: `ทีม ${TEAM_LABELS[row.team] || row.team}`, sub: "รวมทั้งทีม" };
    if (row.detached?.gone) return { title: row.ownerName, sub: "ออกจากระบบแล้ว" };
    if (row.detached) return { title: row.ownerName, sub: `ย้ายไปทีม ${TEAM_LABELS[row.detached.movedTo] || naText(row.detached.movedTo)} แล้ว` };
    return { title: row.ownerName, sub: null };
  };

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
          <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ยอดขายจริง ปี {year}</h2>
          <div className="spacer" />
          {companyFillable > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={fillCompanyFromSystem}
              disabled={saving || loading}
              title="เติมยอดที่ระบบรู้ลงช่องว่างของแถวทั้งบริษัท เฉพาะเดือนที่ปิดแล้ว — เดือนที่ยังเดินอยู่ต้องพิมพ์เอง"
            >
              <Download size={15} aria-hidden="true" /> เติมยอดจากระบบ ({companyFillable} เดือน)
            </Button>
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading}>
            <Check size={15} aria-hidden="true" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
        <p style={{ margin: "0 0 14px", color: "var(--text-3)", fontSize: "var(--fs-6)" }}>
          แถว<b>ทั้งบริษัท</b>เป็นแถวหลัก · แถวทีมและรายคน<b>กรอกเฉพาะปีที่แยกตัวเลขได้จริง</b> —
          ทีมขายเพิ่งแบ่งจริงเมื่อ มิ.ย. 2026 เดือนก่อนหน้านั้นการแยกทีมย้อนหลังคือการเดา ·
          <b>ช่องว่าง = ไม่บันทึกแถวนั้น</b> ต่างจากใส่ 0 ที่แปลว่าขายไม่ได้เลย ·
          ป้าย <span className="ui-badge" style={{ color: "var(--teal)" }}>กรอกเอง</span> = เคยบันทึกไว้แล้ว ·
          ตัวเลขจาง ๆ ใต้ช่อง = ยอดที่ระบบรู้ <b>ไม่เติมให้อัตโนมัติ</b> (กด &ldquo;เติมยอดจากระบบ&rdquo; หรือพิมพ์เอง) ·
          ⚠️ ยอดที่กรอกจะ<b>ทับ</b>ยอดระบบบนแท็บผลงานขายถาวร — เดือนที่ยังเดินอยู่จึงไม่ควรกรอก
          เพราะดีลที่ปิดหลังจากนั้นจะไม่ขึ้นรีพอร์ตอีก ·
          กด &ldquo;บันทึก&rdquo; ถึงมีผล
        </p>

        <div className="premium-glass-table table-responsive">
          {/* family="editable" ตามของเดิม — ไม่ใช้ "matrix" (คอลัมน์แรกแช่แข็ง) เพราะ
              audit:ui จำกัดไว้เฉพาะไฟล์ในลิสต์ ไฟล์ที่ 10 ทำ CI แดงทันที */}
          <TableScroll surface="embedded" family="editable"><table className="w-full text-sm" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>ระดับ</th>
                {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 92 }}>{m}</th>)}
                <th className="num" style={{ minWidth: 130 }}>รวมทั้งปี</th>
              </tr>
            </thead>
            <tbody>
              {rowDefs.map((row) => {
                const value = valueOf(row.key);
                const { total, mismatch } = resolveYearTotal({ months: value.months, override: value.yearOverride });
                const saved = savedCells[row.key];
                const sys = systemCells[row.key] || {};
                const label = rowLabel(row);
                return (
                  <tr key={row.key} className={`premium-row ${styles[`scope_${row.scope}`]}`}>
                    <td className={styles.label}>
                      {/* เยื้องที่กล่องข้างใน ไม่ใช่ padding ของ <td> — เซลล์ตารางมีกฎ
                          padding แบบย่อของตัวเองที่ชนะ longhand ของ CSS module (วัดแล้ว) */}
                      <div className={styles.labelBox}>
                        <strong>{label.title}</strong>
                        {label.sub && <span className={styles.sub}>{label.sub}</span>}
                      </div>
                    </td>
                    {MONTH_LABELS.map((monthLabel, mi) => {
                      const editable = isMonthEditable(year, mi, now);
                      const isSaved = saved?.has(mi);
                      return (
                        <td key={monthLabel} className={`num ${styles.cell}`}>
                          <StandardMoneyInput
                            value={value.months[mi] ?? ""}
                            disabled={!editable}
                            onChange={(parsed) => setMonth(row.key, mi, parsed ?? "")}
                            aria-label={`${label.title} ${monthLabel}`}
                            className={styles.input}
                          />
                          <span className={`${styles.hint} ${isSaved ? styles.hintSaved : ""}`}>
                            {/* ทุกแถวใช้กติกาเดียวกันแล้ว — ยอดระบบเป็นตัวเลขใบ้ ไม่ใช่ค่าที่เติมให้ */}
                            {!editable ? "ยังไม่ถึง"
                              : isSaved ? "กรอกเอง"
                                : sys[mi] > 0 ? `ระบบ ${fmtMoneyCompact(sys[mi])}` : ""}
                          </span>
                        </td>
                      );
                    })}
                    {/* ยอดรวมทั้งปีแก้เองได้ — บางปีรู้แค่ยอดรวม ไม่มีตัวเลขรายเดือน */}
                    <td className={`num ${styles.cell}`}>
                      <StandardMoneyInput
                        value={value.yearOverride ?? total}
                        onChange={(parsed) => setYearOverride(row.key, parsed ?? "")}
                        aria-label={`${label.title} รวมทั้งปี ${year}`}
                        className={`${styles.input} ${styles.inputTotal}`}
                      />
                      <span className={`${styles.hint} ${mismatch ? styles.hintWarn : ""}`}>
                        {mismatch ? "ไม่ตรงผลรวมรายเดือน" : value.yearOverride == null ? "ผลรวมรายเดือน" : "กรอกเอง"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></TableScroll>
        </div>

        {mismatches.length > 0 && (
          <p style={{ margin: "12px 0 0", color: "var(--amber)", fontSize: "var(--fs-6)", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <span>
              {mismatches.length} แถวมียอดรวมทั้งปีไม่ตรงกับผลรวมรายเดือน —{" "}
              {mismatches.map((row) => rowLabel(row).title).join(" · ")}{" "}
              (เช่น {rowLabel(mismatches[0]).title}: กรอก {fmtMoney(resolveYearTotal({ months: valueOf(mismatches[0].key).months, override: valueOf(mismatches[0].key).yearOverride }).total)} ·
              ผลรวมรายเดือน {fmtMoney(resolveYearTotal({ months: valueOf(mismatches[0].key).months }).total)})
              — บันทึกได้ตามปกติถ้าตั้งใจ (เช่นปีที่รู้แค่ยอดรวม) ระบบจะเก็บทั้งสองค่าตามที่กรอก
            </span>
          </p>
        )}
      </section>
    </Workspace>
  );
}
