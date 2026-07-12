"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, Target, TrendingUp } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useCan, useRole } from "@/lib/roleContext";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import {
  DEFAULT_GROWTH_CAP,
  projectTarget,
  splitByProportion,
  seasonalProfile,
  distributeBySeasonal,
  normalizeToPercent,
} from "@/lib/salesForecast";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";

const TEAM_LABELS = { ODM: "New ODM", KA: "Key Account", SV: "Services" };
const thisYearNum = () => Number(thisMonth().slice(0, 4));
const fmt = (n) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
const pct = (n) => `${(Number(n || 0) * 100).toFixed(0)}%`;
const sum = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);

const STEPS = [
  { n: 1, label: "ประวัติย้อนหลัง", hint: "เป้า vs ขายจริง" },
  { n: 2, label: "เป้าคาดการณ์", hint: "ระบบช่วยคำนวณ" },
  { n: 3, label: "แบ่งลงทีม", hint: "ตามสัดส่วนที่ทำได้" },
  { n: 4, label: "แบ่งคน + รายเดือน", hint: "ยืนยันวางเป้า" },
];

export default function SalesTargetPlanPage() {
  const router = useRouter();
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const isSuper = role === "admin" || role === "ae_supervisor";

  // Plan year is selectable — default to the current year so the earliest year
  // still open for planning is first; the head can switch to next year after.
  const [targetYear, setTargetYear] = useState(() => thisYearNum());
  const historyYears = useMemo(
    () => [targetYear - 3, targetYear - 2, targetYear - 1].map(String),
    [targetYear],
  );
  const targetYearOptions = useMemo(() => {
    const cy = thisYearNum();
    return [cy, cy + 1, cy + 2];
  }, []);

  const [step, setStep] = useState(1);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  // Step 1 — company target/actual per history year, and per-team actual for the
  // most recent history year (drives the team split ratio in step 3).
  const [companyHist, setCompanyHist] = useState({}); // { [year]: { target, actual } }
  const [teamHist, setTeamHist] = useState({}); // { [team]: actual } — latest year
  const [systemActuals, setSystemActuals] = useState({}); // { [year]: {total, byTeam, byOwner, byMonth} }

  // Step 2 — chosen final target for the plan year.
  const [finalTarget, setFinalTarget] = useState(0);
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", action: null, isDanger: false, confirmLabel: "ยืนยัน" });
  const [cap] = useState(DEFAULT_GROWTH_CAP);

  // Step 3 — target amount per team.
  const [teamTargets, setTeamTargets] = useState({}); // { [team]: amount }

  // Step 4 — per-person amount within each team, and the 12-month season shape.
  const [personTargets, setPersonTargets] = useState({}); // { [ownerId]: amount }
  const [monthPct, setMonthPct] = useState(Array(12).fill(100 / 12));

  const latestHistYear = historyYears[historyYears.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [histRes, usersRes] = await Promise.all([
        fetch(`/api/sales-planning/history?years=${historyYears.join(",")}`),
        fetch("/api/pm/assignable-users"),
      ]);
      if (!histRes.ok) throw new Error((await histRes.json()).error || "โหลดประวัติไม่สำเร็จ");
      const { rows, systemActuals: sys } = await histRes.json();
      setSystemActuals(sys || {});
      setUsers(usersRes.ok ? await usersRes.json() : []);

      // Seed company + team history from saved rows, falling back to won-deal actuals.
      const company = {};
      for (const y of historyYears) {
        const saved = (rows || []).find((r) => r.period === y && !r.team && !r.ownerId);
        const sysTotal = Number(sys?.[y]?.total || 0);
        company[y] = {
          target: saved ? Number(saved.targetAmount || 0) : 0,
          actual: saved ? Number(saved.actualAmount || 0) : Math.round(sysTotal),
          source: saved ? saved.source : (sysTotal > 0 ? "system" : "manual"),
        };
      }
      setCompanyHist(company);

      const teams = {};
      for (const t of SALES_TEAMS) {
        const saved = (rows || []).find((r) => r.period === latestHistYear && r.team === t && !r.ownerId);
        const sysT = Number(sys?.[latestHistYear]?.byTeam?.[t] || 0);
        teams[t] = saved ? Number(saved.actualAmount || 0) : Math.round(sysT);
      }
      setTeamHist(teams);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [historyYears, latestHistYear]);

  useEffect(() => { load(); }, [load]);

  // ---- Derived: projection from company history ----
  const projection = useMemo(() => {
    const hist = historyYears.map((y) => ({
      year: Number(y),
      target: Number(companyHist[y]?.target || 0),
      actual: Number(companyHist[y]?.actual || 0),
    }));
    return projectTarget(hist, { cap });
  }, [historyYears, companyHist, cap]);

  // Seed the final target with the base suggestion once projection is known.
  useEffect(() => {
    if (projection.hasData && !finalTarget) setFinalTarget(projection.base);
  }, [projection, finalTarget]);

  // ---- Step 3: team split preview (by last-year team actual) ----
  const teamWeights = useMemo(
    () => SALES_TEAMS.map((t) => ({ key: t, weight: Number(teamHist[t] || 0) })),
    [teamHist],
  );
  const suggestedTeamSplit = useMemo(
    () => splitByProportion(finalTarget, teamWeights),
    [finalTarget, teamWeights],
  );

  const seedTeamTargets = useCallback(() => {
    const next = {};
    for (const { key, amount } of suggestedTeamSplit) next[key] = amount;
    setTeamTargets(next);
  }, [suggestedTeamSplit]);

  // ---- Step 4: per-person split + seasonal ----
  const teamMembers = useMemo(() => {
    const map = {};
    for (const t of SALES_TEAMS) {
      map[t] = users.filter((u) => TARGET_OWNER_ROLES.includes(u.role) && u.team === t);
    }
    return map;
  }, [users]);

  const seedPersonTargets = useCallback(() => {
    const next = {};
    for (const t of SALES_TEAMS) {
      const members = teamMembers[t] || [];
      const weights = members.map((m) => ({
        key: m.id,
        weight: Number(systemActuals?.[latestHistYear]?.byOwner?.[m.id] || 0),
      }));
      const parts = splitByProportion(Number(teamTargets[t] || 0), weights);
      for (const { key, amount } of parts) next[key] = amount;
    }
    setPersonTargets(next);
  }, [teamMembers, teamTargets, systemActuals, latestHistYear]);

  const seedSeason = useCallback(() => {
    const byMonth = systemActuals?.[latestHistYear]?.byMonth;
    const prof = seasonalProfile(byMonth || []);
    setMonthPct(normalizeToPercent(prof.map((f) => f * 100)));
  }, [systemActuals, latestHistYear]);

  const seasonSumPct = sum(monthPct);

  // ---- Navigation with per-step seeding ----
  const goNext = async () => {
    setError("");
    setInfo("");
    if (step === 1) {
      await saveHistory();
      if (!finalTarget && projection.hasData) setFinalTarget(projection.base);
      setStep(2);
    } else if (step === 2) {
      seedTeamTargets();
      setStep(3);
    } else if (step === 3) {
      seedPersonTargets();
      seedSeason();
      setStep(4);
    }
  };
  const goBack = () => { setError(""); setInfo(""); setStep((s) => Math.max(1, s - 1)); };

  // Switching plan year restarts the wizard — history/projection/splits all change.
  const changeYear = (y) => {
    if (y === targetYear) return;
    if (step > 1) { setConfirmState({ open: true, title: "เปลี่ยนปี?", message: "เปลี่ยนปีจะเริ่มขั้นตอนใหม่ตั้งแต่ต้น จะเปลี่ยนไหม?", action: () => { setConfirmState(p=>({...p, open:false})); setTargetYear(y); setStep(1); setError(""); setInfo(""); setFinalTarget(0); setTeamTargets({}); setPersonTargets({}); setMonthPct(Array(12).fill(100/12)); }, confirmLabel: "เปลี่ยนปี" }); return; }
    setTargetYear(y);
    setStep(1);
    setError("");
    setInfo("");
    setFinalTarget(0);
    setTeamTargets({});
    setPersonTargets({});
    setMonthPct(Array(12).fill(100 / 12));
  };

  // ---- Persistence ----
  const saveHistory = async () => {
    const items = [];
    for (const y of historyYears) {
      const c = companyHist[y] || {};
      items.push({ period: y, periodType: "year", team: null, ownerId: null, targetAmount: c.target || 0, actualAmount: c.actual || 0, source: c.source || "manual" });
    }
    for (const t of SALES_TEAMS) {
      items.push({ period: latestHistYear, periodType: "year", team: t, ownerId: null, targetAmount: 0, actualAmount: Number(teamHist[t] || 0), source: "manual" });
    }
    const res = await fetch("/api/sales-planning/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกประวัติไม่สำเร็จ");
  };

  // Write the full plan into sales_targets: for every node (company / each team /
  // each AE) distribute its annual amount across 12 months by the season shape,
  // one bulk call per node (each ≤ 12 items, within the endpoint's cap).
  const confirmPlan = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const profile = monthPct.map((p) => p / 100);
      const months = monthsForYear(String(targetYear));
      const writeNode = async ({ team, ownerId, ownerName, annual }) => {
        const monthAmounts = distributeBySeasonal(annual, profile);
        const items = months.map((period, i) => ({
          period,
          periodType: "month",
          team: team || null,
          ownerId: ownerId || null,
          ownerName: ownerName || null,
          targetAmount: monthAmounts[i],
        }));
        const res = await fetch("/api/sales-planning/targets/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "วางเป้าไม่สำเร็จ");
      };

      // Company-wide (SA) anchor.
      await writeNode({ team: null, ownerId: null, annual: Number(finalTarget || 0) });
      // Teams.
      for (const t of SALES_TEAMS) {
        await writeNode({ team: t, ownerId: null, annual: Number(teamTargets[t] || 0) });
      }
      // AEs.
      for (const t of SALES_TEAMS) {
        for (const m of teamMembers[t] || []) {
          await writeNode({ team: t, ownerId: m.id, ownerName: m.name, annual: Number(personTargets[m.id] || 0) });
        }
      }
      setInfo("วางเป้าเรียบร้อย กำลังพาไปหน้าตารางเป้า…");
      setTimeout(() => router.push("/sa/targets"), 900);
    } catch (e) {
      setError(e.message || "วางเป้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!canTarget || !isSuper) {
    return (
      <Workspace icon={<Target size={22} />} title="วางแผนเป้าหมาย" back={{ href: "/sa/targets", label: "กลับ" }}>
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>
          เฉพาะ AE Supervisor / admin ใช้ตัวช่วยวางเป้าได้
        </div>
        <ConfirmDialog {...confirmState} onClose={() => setConfirmState(p => ({ ...p, open: false }))} />
    </Workspace>
    );
  }

  return (
    <Workspace
      icon={<Sparkles size={22} />}
      title="ตัวช่วยวางเป้าหมายขาย"
      subtitle={`วางเป้าปี ${targetYear} — กรอกประวัติ → ระบบคาดการณ์ → แบ่งทีม → แบ่งคนและรายเดือน`}
      back={{ href: "/sa/targets", label: "ตารางเป้า" }}
      headerRight={
        <select
          className="premium-select"
          value={targetYear}
          onChange={(e) => changeYear(Number(e.target.value))}
          disabled={saving}
          aria-label="ปีที่วางเป้า"
          style={{ width: 150 }}
        >
          {targetYearOptions.map((y) => <option key={y} value={y}>วางเป้าปี {y}</option>)}
        </select>
      }
    >
      <div className="flex flex-col gap-4" style={{ paddingBottom: 20 }}>
        <StepNav step={step} />

        {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>}
        {info && <div className="glass-panel" style={{ padding: "12px 14px", borderColor: "var(--green)", color: "var(--green)" }}>{info}</div>}

        <div className="glass-panel" style={{ padding: 20 }} aria-busy={loading}>
          {step === 1 && (
            <Step1History
              years={historyYears}
              companyHist={companyHist}
              setCompanyHist={setCompanyHist}
              teamHist={teamHist}
              setTeamHist={setTeamHist}
              latestYear={latestHistYear}
              systemActuals={systemActuals}
            />
          )}
          {step === 2 && (
            <Step2Projection
              projection={projection}
              cap={cap}
              finalTarget={finalTarget}
              setFinalTarget={setFinalTarget}
              targetYear={targetYear}
            />
          )}
          {step === 3 && (
            <Step3TeamSplit
              finalTarget={finalTarget}
              teamHist={teamHist}
              latestYear={latestHistYear}
              suggested={suggestedTeamSplit}
              teamTargets={teamTargets}
              setTeamTargets={setTeamTargets}
              reseed={seedTeamTargets}
            />
          )}
          {step === 4 && (
            <Step4PersonSeason
              targetYear={targetYear}
              teamMembers={teamMembers}
              teamTargets={teamTargets}
              personTargets={personTargets}
              setPersonTargets={setPersonTargets}
              monthPct={monthPct}
              setMonthPct={setMonthPct}
              seasonSumPct={seasonSumPct}
              reseedPeople={seedPersonTargets}
              reseedSeason={seedSeason}
            />
          )}
        </div>

        {/* Footer nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn" onClick={goBack} disabled={step === 1 || saving}>
            <ArrowLeft size={16} aria-hidden="true" /> ย้อนกลับ
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {step < 4 ? (
              <button type="button" className="btn btn-primary" onClick={goNext} disabled={loading || saving}
                style={{ fontWeight: 700, padding: "10px 24px" }}>
                ถัดไป <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={confirmPlan} disabled={saving}
                style={{ fontWeight: 800, padding: "10px 28px", minWidth: 200 }}>
                <Check size={18} aria-hidden="true" /> {saving ? "กำลังวางเป้า…" : "ยืนยันวางเป้า"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Workspace>
  );
}

function StepNav({ step }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STEPS.map((s) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <div key={s.n} className="glass-panel" style={{
            flex: "1 1 160px", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
            borderColor: active ? "var(--accent)" : done ? "var(--green)" : "var(--border)",
            opacity: active || done ? 1 : 0.7,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center", flexShrink: 0,
              background: active ? "var(--accent)" : done ? "var(--green)" : "color-mix(in srgb, var(--text) 10%, transparent)",
              color: active || done ? "#fff" : "var(--text-3)", fontWeight: 800, fontSize: 13,
            }}>
              {done ? <Check size={15} /> : s.n}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{s.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoneyInput({ value, onChange, disabled, placeholder, align = "right" }) {
  return (
    <FormattedNumberInput
      min={0}
      step={1000}
      className="premium-input mono"
      value={value === 0 ? "" : value}
      placeholder={placeholder ?? "0"}
      disabled={disabled}
      onChange={(val) => onChange(Math.max(0, val || 0))}
      onFocus={(e) => e.target.select()}
      style={{ width: "100%", textAlign: align, padding: "6px 8px" }}
    />
  );
}

function Step1History({ years, companyHist, setCompanyHist, teamHist, setTeamHist, latestYear, systemActuals }) {
  const setC = (y, field, v) => setCompanyHist((h) => ({ ...h, [y]: { ...h[y], [field]: v, source: field === "actual" ? "mixed" : (h[y]?.source || "manual") } }));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>1 · ประวัติ เป้า vs ขายจริง (ระดับบริษัท)</h3>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          กรอกยอดของแต่ละปี — ปีที่ระบบมีดีลปิดแล้วจะเติมยอด “ขายจริง” ให้อัตโนมัติ (แก้ทับได้)
        </p>
      </div>
      <div className="fz-box">
        <table className="fz-table premium-glass-table w-full text-sm">
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: 90 }}>ปี</th>
              <th className="num" style={{ minWidth: 140 }}>เป้า</th>
              <th className="num" style={{ minWidth: 140 }}>ขายจริง</th>
              <th className="num" style={{ minWidth: 90 }}>% ทำได้</th>
              <th style={{ minWidth: 90, textAlign: "center" }}>ที่มา</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const row = companyHist[y] || {};
              const attain = row.target > 0 ? Math.round((Number(row.actual || 0) / Number(row.target)) * 100) : null;
              const hasSystem = Number(systemActuals?.[y]?.total || 0) > 0;
              return (
                <tr key={y} className="premium-row">
                  <td style={{ fontWeight: 700 }}>{y}</td>
                  <td className="num"><MoneyInput value={Number(row.target || 0)} onChange={(v) => setC(y, "target", v)} /></td>
                  <td className="num"><MoneyInput value={Number(row.actual || 0)} onChange={(v) => setC(y, "actual", v)} /></td>
                  <td className="num mono" style={{ color: attain == null ? "var(--text-3)" : attain >= 100 ? "var(--green)" : "var(--amber)", fontWeight: 700 }}>
                    {attain == null ? "–" : `${attain}%`}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="ui-badge" style={{ color: hasSystem ? "var(--teal)" : "var(--text-3)" }}>
                      {hasSystem ? "ระบบ" : "กรอกเอง"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>สัดส่วนยอดขายจริงรายทีม (ปี {latestYear})</h3>
        <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 10 }}>
          ใช้เป็นสัดส่วนตั้งต้นในการแบ่งเป้าลงทีม (ขั้นที่ 3)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {SALES_TEAMS.map((t) => (
            <div key={t} className="glass-panel" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{TEAM_LABELS[t]} <span style={{ color: "var(--text-3)" }}>({t})</span></div>
              <MoneyInput value={Number(teamHist[t] || 0)} onChange={(v) => setTeamHist((h) => ({ ...h, [t]: v }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
          รวมทีม {fmt(sum(SALES_TEAMS.map((t) => teamHist[t])))} · บริษัทปี {latestYear} {fmt(companyHist[latestYear]?.actual)}
        </div>
      </div>
    </div>
  );
}

function Step2Projection({ projection, cap, finalTarget, setFinalTarget, targetYear }) {
  if (!projection.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <h3 style={{ fontWeight: 800, fontSize: 16 }}>2 · เป้าคาดการณ์ปี {targetYear}</h3>
        <div className="glass-panel" style={{ padding: 14, color: "var(--text-3)" }}>
          ยังไม่มีข้อมูล “ขายจริง” ย้อนหลังพอให้คำนวณ — กรอกเป้าปี {targetYear} เองได้เลย
        </div>
        <div style={{ maxWidth: 260 }}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>เป้าจริงปี {targetYear}</label>
          <MoneyInput value={finalTarget} onChange={setFinalTarget} />
        </div>
      </div>
    );
  }
  const cards = [
    { key: "conservative", label: "ปลอดภัย", amount: projection.conservative, color: "var(--teal)", hint: `+${pct(projection.dampedGrowth / 2)} จากยอดล่าสุด` },
    { key: "base", label: "แนะนำ", amount: projection.base, color: "var(--accent)", hint: `+${pct(projection.dampedGrowth)} (จำกัดเพดาน ${pct(cap)})` },
    { key: "stretch", label: "ท้าทาย", amount: projection.stretch, color: "var(--violet)", hint: `แนวโน้มเต็ม +${pct(projection.rawGrowth)}` },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>2 · เป้าคาดการณ์ปี {targetYear}</h3>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          จากยอดขายจริงล่าสุด {fmt(projection.lastActual)} · โต YoY เฉลี่ย {pct(projection.rawGrowth)}
          {projection.attainment != null && <> · ปีก่อนทำได้ {Math.round(projection.attainment * 100)}% ของเป้า</>}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {cards.map((c) => {
          const active = Number(finalTarget) === c.amount;
          return (
            <button key={c.key} type="button" onClick={() => setFinalTarget(c.amount)} className="glass-panel interactive-card"
              style={{ padding: 16, textAlign: "left", borderColor: active ? c.color : "var(--border)", borderWidth: active ? 2 : 1, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.color, fontWeight: 800, fontSize: 13 }}>
                <TrendingUp size={15} /> {c.label}
              </div>
              <div className="mono tabular-nums" style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{fmt(c.amount)}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{c.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="glass-panel" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderColor: "var(--accent)" }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>เป้าจริงปี {targetYear}</div>
        <div style={{ width: 200 }}><MoneyInput value={finalTarget} onChange={setFinalTarget} /></div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>เลือกจากการ์ดด้านบน หรือพิมพ์ตัวเลขของคุณเอง</div>
      </div>
    </div>
  );
}

function Step3TeamSplit({ finalTarget, teamHist, latestYear, suggested, teamTargets, setTeamTargets, reseed }) {
  const totalActual = sum(SALES_TEAMS.map((t) => teamHist[t]));
  const allocated = sum(SALES_TEAMS.map((t) => teamTargets[t]));
  const remaining = Number(finalTarget || 0) - allocated;
  return (
    <div className="flex flex-col gap-5">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>3 · แบ่งเป้า {fmt(finalTarget)} ลงทีม</h3>
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>
            สัดส่วนตั้งต้นจากยอดขายจริงปี {latestYear} — ปรับจำนวนเงินได้ตามต้องการ
          </p>
        </div>
        <button type="button" className="btn" onClick={reseed}><RotateCcw size={15} aria-hidden="true" /> คำนวณสัดส่วนใหม่</button>
      </div>

      <div className="fz-box">
        <table className="fz-table premium-glass-table w-full text-sm">
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: 150 }}>ทีม</th>
              <th className="num" style={{ minWidth: 130 }}>ขายจริงปี {latestYear}</th>
              <th className="num" style={{ minWidth: 80 }}>สัดส่วน</th>
              <th className="num" style={{ minWidth: 130 }}>แนะนำ</th>
              <th className="num" style={{ minWidth: 150 }}>เป้าที่ตั้ง</th>
            </tr>
          </thead>
          <tbody>
            {SALES_TEAMS.map((t) => {
              const actual = Number(teamHist[t] || 0);
              const share = totalActual > 0 ? actual / totalActual : 1 / SALES_TEAMS.length;
              const sug = suggested.find((s) => s.key === t)?.amount || 0;
              return (
                <tr key={t} className="premium-row">
                  <td style={{ fontWeight: 700 }}>{TEAM_LABELS[t]} <span style={{ color: "var(--text-3)" }}>({t})</span></td>
                  <td className="num mono">{fmt(actual)}</td>
                  <td className="num mono" style={{ color: "var(--text-3)" }}>{pct(share)}</td>
                  <td className="num mono" style={{ color: "var(--text-3)" }}>{fmt(sug)}</td>
                  <td className="num"><MoneyInput value={Number(teamTargets[t] || 0)} onChange={(v) => setTeamTargets((h) => ({ ...h, [t]: v }))} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800 }}>
              <td>รวม</td>
              <td className="num mono">{fmt(totalActual)}</td>
              <td></td>
              <td className="num mono">{fmt(finalTarget)}</td>
              <td className="num mono" style={{ color: remaining === 0 ? "var(--green)" : remaining < 0 ? "var(--red)" : "var(--amber)" }}>
                {fmt(allocated)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <GapBanner target={Number(finalTarget || 0)} allocated={allocated} label="แบ่งลงทีมแล้ว" />
    </div>
  );
}

function Step4PersonSeason({ targetYear, teamMembers, teamTargets, personTargets, setPersonTargets, monthPct, setMonthPct, seasonSumPct, reseedPeople, reseedSeason }) {
  const setMonth = (i, v) => setMonthPct((arr) => arr.map((x, j) => (j === i ? Math.max(0, v) : x)));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>4 · แบ่งรายคน + กระจายรายเดือน</h3>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          สัดส่วนคนตั้งต้นจากยอดที่แต่ละคนทำได้ · รายเดือนกระจายตามฤดูกาลของปีก่อน — ปรับได้ทั้งคู่
        </p>
      </div>

      {/* Per-person split */}
      <div className="flex flex-col gap-3">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h4 style={{ fontWeight: 800, fontSize: 14 }}>เป้ารายบุคคล</h4>
          <button type="button" className="btn sm" onClick={reseedPeople} style={{ marginLeft: "auto" }}><RotateCcw size={14} aria-hidden="true" /> คำนวณสัดส่วนใหม่</button>
        </div>
        {SALES_TEAMS.map((t) => {
          const members = teamMembers[t] || [];
          const teamTot = Number(teamTargets[t] || 0);
          const alloc = sum(members.map((m) => personTargets[m.id]));
          return (
            <div key={t} className="glass-panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 800 }}>{TEAM_LABELS[t]}</span>
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>เป้าทีม {fmt(teamTot)}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: alloc === teamTot ? "var(--green)" : alloc > teamTot ? "var(--red)" : "var(--amber)" }}>
                  แบ่งแล้ว {fmt(alloc)}{alloc !== teamTot && ` (${alloc > teamTot ? "เกิน" : "เหลือ"} ${fmt(Math.abs(teamTot - alloc))})`}
                </span>
              </div>
              {members.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {members.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.name}{m.role === "senior_ae" && <span style={{ color: "var(--text-3)", fontSize: 11 }}> · หัวหน้า</span>}
                      </span>
                      <div style={{ width: 120 }}><MoneyInput value={Number(personTargets[m.id] || 0)} onChange={(v) => setPersonTargets((h) => ({ ...h, [m.id]: v }))} /></div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: "var(--text-3)", fontSize: 12 }}>ยังไม่มี AE ในทีมนี้</div>}
            </div>
          );
        })}
      </div>

      {/* Seasonal distribution */}
      <div className="flex flex-col gap-3">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h4 style={{ fontWeight: 800, fontSize: 14 }}>สัดส่วนรายเดือน (ฤดูกาล)</h4>
          <span style={{ fontSize: 12, color: Math.abs(seasonSumPct - 100) < 0.5 ? "var(--green)" : "var(--amber)", fontWeight: 700 }}>
            รวม {seasonSumPct.toFixed(1)}%
          </span>
          <button type="button" className="btn sm" onClick={reseedSeason} style={{ marginLeft: "auto" }}><RotateCcw size={14} aria-hidden="true" /> ใช้ฤดูกาลปีก่อน</button>
        </div>
        <div className="fz-box">
          <table className="fz-table premium-glass-table w-full text-sm">
            <thead>
              <tr>
                <th style={{ textAlign: "left", minWidth: 70 }}></th>
                {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 62 }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="premium-row">
                <td style={{ fontWeight: 700, color: "var(--text-3)", fontSize: 12 }}>%</td>
                {monthPct.map((p, i) => (
                  <td key={i} className="num" style={{ padding: "3px 4px" }}>
                    <FormattedNumberInput min={0} step={0.5} className="premium-input mono"
                      value={Number(p.toFixed(1))}
                      onChange={(v) => setMonth(i, v || 0)}
                      onFocus={(e) => e.target.select()}
                      style={{ width: "100%", textAlign: "right", padding: "4px 4px", fontSize: 12 }} />
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--text-3)", fontSize: 12 }}>บริษัท</td>
                {distributeBySeasonal(sum(SALES_TEAMS.map((t) => teamTargets[t])), monthPct.map((p) => p / 100)).map((v, i) => (
                  <td key={i} className="num mono" style={{ fontSize: 11, color: "var(--text-3)", padding: "3px 4px" }}>{fmt(v)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-3)" }}>
          เป้าแต่ละเดือน = เป้าทั้งปีของแต่ละคน/ทีม × % เดือนนั้น (เดือน ธ.ค. รับเศษปัด) · กด “ยืนยันวางเป้า” เพื่อบันทึกลงตารางเป้าปี {targetYear}
        </p>
      </div>
    </div>
  );
}

function GapBanner({ target, allocated, label }) {
  if (target <= 0 && allocated <= 0) return null;
  const remaining = target - allocated;
  const over = remaining < 0;
  const done = remaining === 0 && target > 0;
  const color = over ? "var(--red)" : done ? "var(--green)" : "var(--amber)";
  const text = over ? `เกินเป้ารวม ${fmt(-remaining)}` : done ? "ครบพอดี" : `ยังเหลือ ${fmt(remaining)}`;
  return (
    <div className="glass-panel" style={{ padding: "10px 14px", borderColor: color, color, fontWeight: 700, fontSize: 13 }}>
      {label} {fmt(allocated)} / {fmt(target)} · {text} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>(เตือนเท่านั้น ไม่บังคับให้เท่ากัน)</span>
    </div>
  );
}
