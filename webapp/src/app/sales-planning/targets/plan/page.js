"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, Target, TrendingUp } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import StandardMoneyInput from "@/components/ui/MoneyInput";
import { useCan, useRole } from "@/lib/roleContext";
import { userTeams, TEAM_LABELS } from "@/lib/permissions";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { MONTH_LABELS, SALES_TEAMS, TARGET_OWNER_ROLES, monthsForYear, thisMonth } from "@/components/salesPlanning/ui";
import { cachedFetchJson } from "@/lib/apiCache";
import {
  DEFAULT_GROWTH_CAP,
  projectTarget,
  splitByProportion,
  seasonalProfile,
  distributeBySeasonal,
  normalizeToPercent,
} from "@/lib/salesForecast";
import { planNodes, summarizeOverwrite } from "@/lib/sales/targetPlanWrite";
import { apiFetch } from "@/lib/apiFetch";


const thisYearNum = () => Number(thisMonth().slice(0, 4));
const fmt = (n) => fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => fmtPercent(Number(n || 0) * 100);
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
  // ช่วงที่กดยืนยันแล้วแต่ยังไม่เริ่มเขียน (กำลังอ่านเป้าเดิม / รอคนตอบโมดัล) — ปุ่มต้องกดซ้ำไม่ได้
  const [preparing, setPreparing] = useState(false);

  // Step 1 — company target/actual per history year, and per-team actual for the
  // most recent history year (drives the team split ratio in step 3).
  const [companyHist, setCompanyHist] = useState({}); // { [year]: { target, actual } }
  const [teamHist, setTeamHist] = useState({}); // { [team]: actual } — latest year
  const [systemActuals, setSystemActuals] = useState({}); // { [year]: {total, byTeam, byOwner, byMonth} }

  // Step 2 — chosen final target for the plan year.
  const [finalTarget, setFinalTarget] = useState(0);
  const [cap] = useState(DEFAULT_GROWTH_CAP);

  // Step 3 — target amount per team.
  const [teamTargets, setTeamTargets] = useState({}); // { [team]: amount }

  // Step 4 — per-person amount within each team, and the 12-month season shape.
  const [personTargets, setPersonTargets] = useState({}); // { [ownerId]: amount }
  const [monthPct, setMonthPct] = useState(Array(12).fill(100 / 12));

  const latestHistYear = historyYears[historyYears.length - 1];

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setError("");
    try {
      const [histRes, users] = await Promise.all([
        apiFetch(`/api/sales-planning/history?years=${historyYears.join(",")}`),
        cachedFetchJson("/api/pm/assignable-users").catch(() => []),
      ]);
      if (!histRes.ok) throw new Error((await histRes.json()).error || "โหลดประวัติไม่สำเร็จ");
      const { rows, systemActuals: sys } = await histRes.json();
      if (!isLatest()) return; // ชุดปีที่อ้างอิงเปลี่ยนระหว่างรอ — ทิ้งรอบเก่าทั้งก้อน
      setSystemActuals(sys || {});
      setUsers(users || []);

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
      if (isLatest() && !opts?.background) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [historyYears, latestHistYear, startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

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
      map[t] = users.filter((u) => TARGET_OWNER_ROLES.includes(u.role) && userTeams(u).includes(t));
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
  const changeYear = async (y) => {
    if (y === targetYear) return;
    if (step > 1 && !(await confirmAction("เปลี่ยนปีจะเริ่มขั้นตอนใหม่ตั้งแต่ต้น จะเปลี่ยนไหม?"))) return;
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
    /* 🪤 **ห้ามส่ง `targetAmount` ในแถวทีม** — ขั้นนี้กรอกแค่ *ยอดขายจริง* ของทีม
       ปีล่าสุด ไม่ได้ถามเป้าเลย · API เขียนคอลัมน์ที่ "ส่งมาจริง" เท่านั้น
       (`Object.hasOwn` ใน api/sales-planning/history) ⇒ ของเดิมที่ส่ง `targetAmount: 0`
       ติดมาด้วย = เป้ารายปีของทีมที่เคยบันทึกไว้ถูกล้างเป็น 0 ทุกครั้งที่กด "ถัดไป"
       จากขั้น 1 · กติกาเดียวกับที่ `lib/sales/historyEntry` เขียนเตือนไว้ (แก้ 2026-08-24) */
    for (const t of SALES_TEAMS) {
      items.push({ period: latestHistYear, periodType: "year", team: t, ownerId: null, actualAmount: Number(teamHist[t] || 0), source: "manual" });
    }
    const res = await fetch("/api/sales-planning/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกประวัติไม่สำเร็จ");
  };

  /* ชื่อเรียกโหนดในข้อความเตือน — ชื่อจากบัญชีจริงก่อนเสมอ ส่วน `ownerName` ที่ค้าง
     ในแถวเป็นสำเนา ณ ตอนวางเป้า (ของจริงบน prod มีแถวที่ยังเป็นนามสกุลเดิม) */
  const nodeLabel = useCallback((node) => {
    if (node.ownerId) return users.find((u) => u.id === node.ownerId)?.name || node.ownerName || node.ownerId;
    if (node.team) return `ทีม ${TEAM_LABELS[node.team] || node.team}`;
    return "SA รวมทั้งฝ่าย";
  }, [users]);

  // รายชื่อยาว ๆ ในโมดัลอ่านไม่ไหว — ตัดที่ 8 แล้วบอกว่าเหลืออีกกี่แถว
  const nameList = useCallback((rows) => {
    const names = rows.map(nodeLabel);
    return names.length > 8 ? `${names.slice(0, 8).join(" · ")} และอีก ${names.length - 8} แถว` : names.join(" · ");
  }, [nodeLabel]);

  /* Write the full plan into sales_targets: for every node (company / each team /
     each AE) distribute its annual amount across 12 months by the season shape,
     one bulk call per node (each ≤ 12 items, within the endpoint's cap).

     🔴 **สองด่านที่เพิ่มเข้ามา 2026-08-24** (ของเดิมเขียนทับทั้งปีเงียบ ๆ):
     1. เขียนเฉพาะโหนดที่มียอดจริง — ยอด 0 = ไม่แตะ ไม่ใช่เขียนศูนย์ทับ
        (เหตุผลเต็มอยู่บนหัว `lib/sales/targetPlanWrite`)
     2. อ่านเป้าที่มีอยู่ของปีนั้นสด ๆ แล้วถามก่อนทับ พร้อมบอกด้วยว่าแถวไหน
        "ไม่ถูกแตะ" — แถวพวกนั้นยังนับเข้ายอดรวมทีมอยู่ ต้องไปเคลียร์เองที่ตารางเป้า */
  const confirmPlan = async () => {
    /* 🪤 ต้องกันตั้งแต่ก่อนอ่านของเดิม ไม่ใช่ตอน `setSaving(true)` ซึ่งอยู่หลังโมดัล —
       ระหว่างรอ GET + รอคนตอบโมดัล ปุ่มยังกดได้ ⇒ กดรัวสองที = เดินสองรอบ ยิง GET ซ้ำ
       และ ConfirmProvider เก็บคำขอเดียว ใบแรกถูกทับโดยไม่ถูก resolve (promise ค้างถาวร) */
    if (saving || preparing) return;
    setError("");
    setInfo("");

    const nodes = planNodes({
      finalTarget,
      teams: SALES_TEAMS,
      teamTargets,
      teamMembers,
      personTargets,
    });
    if (!nodes.length) {
      setError("ยังไม่มียอดให้วาง — ทุกช่องเป็น 0 (โหนดที่ยอด 0 ระบบจะไม่เขียนทับของเดิม)");
      return;
    }

    // อ่านของเดิม "ตอนกด" ไม่ใช่ตอนเปิดหน้า — หัวหน้าอาจเปิดค้างไว้ข้ามวัน
    let existingRows = [];
    let readFailed = false;
    setPreparing(true);
    try {
      const res = await apiFetch(`/api/sales-planning/targets?year=${encodeURIComponent(targetYear)}`);
      if (res.ok) existingRows = await res.json();
      else readFailed = true;
    } catch {
      readFailed = true;
    } finally {
      setPreparing(false);
    }
    const { overwrite, keep } = summarizeOverwrite({ existingRows, nodes, year: targetYear });

    /* 🔴 อ่านของเดิมไม่ได้ ≠ ไม่มีของเดิม — ของเดิมเดินผ่านไปเขียนทับเงียบ ๆ เพราะ
       `existingRows` ว่างทำให้ทั้ง overwrite และ keep ว่างตาม ⇒ ด่านที่เพิ่งเพิ่มมา
       หายไปทั้งด่านในเคสที่มันควรทำงานที่สุด (token หมดอายุระหว่างเปิดหน้าค้างข้ามวัน
       ซึ่งเป็นเหตุผลที่ย้ายมาอ่านตอนกดตั้งแต่แรก) */
    if (readFailed) {
      const okBlind = await confirmAction({
        title: `วางเป้าปี ${targetYear}`,
        description: `อ่านเป้าเดิมของปี ${targetYear} ไม่สำเร็จ — ตรวจไม่ได้ว่าจะเขียนทับอะไรบ้าง`,
        detail: `ยืนยันแล้วจะเขียน ${nodes.length} แถวตามแผนนี้ทับของเดิมทันที โดยไม่มีรายการให้ดูก่อน\nถ้าไม่แน่ใจ ให้ปิดหน้านี้ เข้าใหม่ แล้วลองอีกครั้ง`,
        confirmLabel: "ยืนยันทั้งที่ตรวจไม่ได้",
        tone: "danger",
      });
      if (!okBlind) return;
    } else if (overwrite.length || keep.length) {
      const lines = [];
      if (overwrite.length) {
        lines.push(`เขียนทับ ${overwrite.length} แถว (เป้าเดิมรวม ${fmt(sum(overwrite.map((r) => r.amount)))}): ${nameList(overwrite)}`);
      }
      if (keep.length) {
        lines.push(`คงไว้ ${keep.length} แถวที่ไม่ได้อยู่ในแผนนี้ (ยอด 0 หรือคนที่ย้าย/ออกไปแล้ว) — เป้าเดิมรวม ${fmt(sum(keep.map((r) => r.amount)))} ยังนับเข้ายอดรวมอยู่ ถ้าจะล้างต้องไปแก้เป็น 0 เองที่ตารางเป้า: ${nameList(keep)}`);
      }
      const okToWrite = await confirmAction({
        title: `วางเป้าปี ${targetYear} ทับของเดิม`,
        description: `ปี ${targetYear} มีเป้าวางไว้อยู่แล้ว — ยืนยันแล้วจะเขียน ${nodes.length} แถวตามแผนนี้`,
        detail: lines.join("\n"),
        confirmLabel: "ยืนยันวางเป้า",
        tone: overwrite.length ? "danger" : "default",
      });
      if (!okToWrite) return;
    }

    setSaving(true);
    const done = [];
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

      // ยิงทีละโหนด (บริษัท → ทีม → คน) — ไม่มี transaction ครอบ ถ้าพังกลางทาง
      // ต้องบอกให้ได้ว่าอันไหนลงไปแล้ว ไม่งั้นหัวหน้าไม่รู้ว่าต้องกดซ้ำหรือไปแก้มือ
      for (const node of nodes) {
        await writeNode(node);
        done.push(node);
      }
      setInfo("วางเป้าเรียบร้อย กำลังพาไปหน้าตารางเป้า…");
      setTimeout(() => router.push("/sa/targets"), 900);
    } catch (e) {
      const base = e.message || "วางเป้าไม่สำเร็จ";
      setError(done.length
        ? `${base} — วางไปแล้ว ${done.length}/${nodes.length} แถว (${nameList(done)}) ที่เหลือยังไม่ถูกเขียน กดยืนยันซ้ำได้`
        : base);
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
        <Select
          className="premium-select"
          value={targetYear}
          onChange={(e) => changeYear(Number(e.target.value))}
          disabled={saving}
          aria-label="ปีที่วางเป้า"
          style={{ width: 150 }}
        >
          {targetYearOptions.map((y) => <option key={y} value={y}>วางเป้าปี {y}</option>)}
        </Select>
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
          {step > 1 && (
            <button type="button" className="btn" onClick={goBack} disabled={saving}>
              <ArrowLeft size={16} aria-hidden="true" /> ย้อนกลับ
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {step < 4 ? (
              <button type="button" className="btn btn-primary" onClick={goNext} disabled={loading || saving}
                style={{ fontWeight: "var(--fw-bold)", padding: "10px 24px" }}>
                ถัดไป <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={confirmPlan} disabled={saving || preparing}
                style={{ fontWeight: "var(--fw-bold)", padding: "10px 28px", minWidth: 200 }}>
                <Check size={18} aria-hidden="true" /> {saving ? "กำลังวางเป้า…" : preparing ? "กำลังตรวจของเดิม…" : "ยืนยันวางเป้า"}
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
              color: active || done ? "var(--accent-fg)" : "var(--text-3)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)",
            }}>
              {done ? <Check size={15} /> : s.n}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)", whiteSpace: "nowrap" }}>{s.label}</div>
              <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", whiteSpace: "nowrap" }}>{s.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoneyInput({ value, onChange, disabled, placeholder, align = "right" }) {
  return (
    <StandardMoneyInput
      className="mono"
      value={value === 0 ? "" : value}
      placeholder={placeholder ?? "0"}
      disabled={disabled}
      onChange={(next) => onChange(Math.max(0, next || 0))}
      onFocus={(e) => e.target.select()}
      style={{ width: "100%", textAlign: align, padding: "6px 8px" }}
    />
  );
}

function TwoDecimalInput({ value, onChange, disabled, suffix, min = 0 }) {
  return (
    <div className="target-decimal-input">
      <StandardMoneyInput
        value={Number(value || 0)}
        disabled={disabled}
        onChange={(next) => onChange(Math.max(min, Number(next || 0)))}
        onFocus={(e) => e.target.select()}
        aria-label={suffix ? `ค่า ${suffix}` : "ค่า"}
        style={{ width: "100%", textAlign: "right", padding: suffix ? "6px 28px 6px 8px" : "6px 8px" }}
      />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </div>
  );
}

function ValueModeToggle({ value, onChange, ariaLabel }) {
  return (
    <div className="segmented target-value-toggle" role="group" aria-label={ariaLabel}>
      <button type="button" aria-pressed={value === "amount"} onClick={() => onChange("amount")}>มูลค่า</button>
      <button type="button" aria-pressed={value === "percent"} onClick={() => onChange("percent")}>%</button>
    </div>
  );
}

function Step1History({ years, companyHist, setCompanyHist, teamHist, setTeamHist, latestYear, systemActuals }) {
  const setC = (y, field, v) => setCompanyHist((h) => ({ ...h, [y]: { ...h[y], [field]: v, source: field === "actual" ? "mixed" : (h[y]?.source || "manual") } }));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-10)", marginBottom: 4 }}>1 · ประวัติ เป้า vs ขายจริง (ระดับบริษัท)</h3>
        <p style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
          กรอกยอดของแต่ละปี — ปีที่ระบบมีดีลปิดแล้วจะเติมยอด “ขายจริง” ให้อัตโนมัติ (แก้ทับได้)
        </p>
      </div>
      <div className="fz-box">
        <TableScroll surface="embedded" family="editable"><table className="fz-table premium-glass-table w-full text-sm">
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
              const attain = row.target > 0 ? (Number(row.actual || 0) / Number(row.target)) * 100 : null;
              const hasSystem = Number(systemActuals?.[y]?.total || 0) > 0;
              return (
                <tr key={y} className="premium-row">
                  <td style={{ fontWeight: "var(--fw-bold)" }}>{y}</td>
                  <td className="num"><MoneyInput value={Number(row.target || 0)} onChange={(v) => setC(y, "target", v)} /></td>
                  <td className="num"><MoneyInput value={Number(row.actual || 0)} onChange={(v) => setC(y, "actual", v)} /></td>
                  <td className="num mono" style={{ color: attain == null ? "var(--text-3)" : attain >= 100 ? "var(--green)" : "var(--amber)", fontWeight: "var(--fw-bold)" }}>
                    {attain == null ? "–" : fmtPercent(attain)}
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
        </table></TableScroll>
      </div>

      <div>
        <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)", marginBottom: 4 }}>สัดส่วนยอดขายจริงรายทีม (ปี {latestYear})</h3>
        <p style={{ color: "var(--text-3)", fontSize: "var(--fs-7)", marginBottom: 10 }}>
          ใช้เป็นสัดส่วนตั้งต้นในการแบ่งเป้าลงทีม (ขั้นที่ 3)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {SALES_TEAMS.map((t) => (
            <div key={t} className="glass-panel" style={{ padding: 12 }}>
              <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)", marginBottom: 6 }}>{TEAM_LABELS[t]} <span style={{ color: "var(--text-3)" }}>({t})</span></div>
              <MoneyInput value={Number(teamHist[t] || 0)} onChange={(v) => setTeamHist((h) => ({ ...h, [t]: v }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
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
        <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-10)" }}>2 · เป้าคาดการณ์ปี {targetYear}</h3>
        <div className="glass-panel" style={{ padding: 14, color: "var(--text-3)" }}>
          ยังไม่มีข้อมูล “ขายจริง” ย้อนหลังพอให้คำนวณ — กรอกเป้าปี {targetYear} เองได้เลย
        </div>
        <div style={{ maxWidth: 260 }}>
          <label style={{ fontSize: "var(--fs-7)", fontWeight: "var(--fw-bold)" }}>เป้าจริงปี {targetYear}</label>
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
        <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-10)", marginBottom: 4 }}>2 · เป้าคาดการณ์ปี {targetYear}</h3>
        <p style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
          จากยอดขายจริงล่าสุด {fmt(projection.lastActual)} · โต YoY เฉลี่ย {pct(projection.rawGrowth)}
          {projection.attainment != null && <> · ปีก่อนทำได้ {fmtPercent(projection.attainment * 100)} ของเป้า</>}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {cards.map((c) => {
          const active = Number(finalTarget) === c.amount;
          return (
            <button key={c.key} type="button" onClick={() => setFinalTarget(c.amount)} className="glass-panel interactive-card"
              style={{ padding: 16, textAlign: "left", borderColor: active ? c.color : "var(--border)", borderWidth: active ? 2 : 1, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.color, fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)" }}>
                <TrendingUp size={15} /> {c.label}
              </div>
              <div className="mono tabular-nums" style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-bold)", marginTop: 8 }}>{fmt(c.amount)}</div>
              <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", marginTop: 4 }}>{c.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="glass-panel" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderColor: "var(--accent)" }}>
        <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)" }}>เป้าจริงปี {targetYear}</div>
        <div style={{ width: 200 }}><MoneyInput value={finalTarget} onChange={setFinalTarget} /></div>
        <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>เลือกจากการ์ดด้านบน หรือพิมพ์ตัวเลขของคุณเอง</div>
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
          <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-10)", marginBottom: 4 }}>3 · แบ่งเป้า {fmt(finalTarget)} ลงทีม</h3>
          <p style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
            สัดส่วนตั้งต้นจากยอดขายจริงปี {latestYear} — ปรับจำนวนเงินได้ตามต้องการ
          </p>
        </div>
        <button type="button" className="btn" onClick={reseed}><RotateCcw size={15} aria-hidden="true" /> คำนวณสัดส่วนใหม่</button>
      </div>

      <div className="fz-box">
        <TableScroll surface="embedded" family="editable"><table className="fz-table premium-glass-table target-team-table w-full text-sm">
          <colgroup>
            <col style={{ width: "27%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "24%" }} />
          </colgroup>
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
                  <td style={{ fontWeight: "var(--fw-bold)" }}>{TEAM_LABELS[t]} <span style={{ color: "var(--text-3)" }}>({t})</span></td>
                  <td className="num mono">{fmt(actual)}</td>
                  <td className="num mono" style={{ color: "var(--text-3)" }}>{pct(share)}</td>
                  <td className="num mono" style={{ color: "var(--text-3)" }}>{fmt(sug)}</td>
                  <td className="num"><MoneyInput value={Number(teamTargets[t] || 0)} onChange={(v) => setTeamTargets((h) => ({ ...h, [t]: v }))} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: "var(--fw-bold)" }}>
              <td>รวม</td>
              <td className="num mono">{fmt(totalActual)}</td>
              <td className="num mono">{fmtPercent(100)}</td>
              <td className="num mono">{fmt(finalTarget)}</td>
              <td className="num mono" style={{ color: remaining === 0 ? "var(--green)" : remaining < 0 ? "var(--red)" : "var(--amber)" }}>
                {fmt(allocated)}
              </td>
            </tr>
          </tfoot>
        </table></TableScroll>
      </div>
      <GapBanner target={Number(finalTarget || 0)} allocated={allocated} label="แบ่งลงทีมแล้ว" />
    </div>
  );
}

function Step4PersonSeason({ targetYear, teamMembers, teamTargets, personTargets, setPersonTargets, monthPct, setMonthPct, seasonSumPct, reseedPeople, reseedSeason }) {
  const [personMode, setPersonMode] = useState("amount");
  const [seasonMode, setSeasonMode] = useState("percent");
  const setMonth = (i, v) => setMonthPct((arr) => arr.map((x, j) => (j === i ? Math.max(0, v) : x)));
  const annualTarget = sum(SALES_TEAMS.map((t) => teamTargets[t]));
  const monthlyValues = monthPct.map((p) => annualTarget * (Number(p || 0) / 100));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-10)", marginBottom: 4 }}>4 · แบ่งรายคน + กระจายรายเดือน</h3>
        <p style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>
          สัดส่วนคนตั้งต้นจากยอดที่แต่ละคนทำได้ · รายเดือนกระจายตามฤดูกาลของปีก่อน — ปรับได้ทั้งคู่
        </p>
      </div>

      {/* Per-person split */}
      <div className="flex flex-col gap-3">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h4 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-8)" }}>เป้ารายบุคคล</h4>
          <ValueModeToggle value={personMode} onChange={setPersonMode} ariaLabel="รูปแบบกรอกเป้ารายบุคคล" />
          <button type="button" className="btn sm" onClick={reseedPeople} style={{ marginLeft: "auto" }}><RotateCcw size={14} aria-hidden="true" /> คำนวณสัดส่วนใหม่</button>
        </div>
        {SALES_TEAMS.map((t) => {
          const members = teamMembers[t] || [];
          const teamTot = Number(teamTargets[t] || 0);
          const alloc = sum(members.map((m) => personTargets[m.id]));
          return (
            <div key={t} className="glass-panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: "var(--fw-bold)" }}>{TEAM_LABELS[t]}</span>
                <span style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>เป้าทีม {fmt(teamTot)}</span>
                <span style={{ marginLeft: "auto", fontSize: "var(--fs-5)", fontWeight: "var(--fw-bold)", color: alloc === teamTot ? "var(--green)" : alloc > teamTot ? "var(--red)" : "var(--amber)" }}>
                  แบ่งแล้ว {fmt(alloc)}{alloc !== teamTot && ` (${alloc > teamTot ? "เกิน" : "เหลือ"} ${fmt(Math.abs(teamTot - alloc))})`}
                </span>
              </div>
              {members.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {members.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "var(--fs-7)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.name}{m.role === "senior_ae" && <span style={{ color: "var(--text-3)", fontSize: "var(--fs-3)" }}> · หัวหน้า</span>}
                      </span>
                      <div style={{ width: 142 }}>
                        {personMode === "amount" ? (
                          <MoneyInput value={Number(personTargets[m.id] || 0)} onChange={(v) => setPersonTargets((h) => ({ ...h, [m.id]: v }))} />
                        ) : (
                          <TwoDecimalInput
                            value={teamTot > 0 ? (Number(personTargets[m.id] || 0) / teamTot) * 100 : 0}
                            suffix="%"
                            onChange={(v) => setPersonTargets((h) => ({ ...h, [m.id]: Number((teamTot * v / 100).toFixed(2)) }))}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>ยังไม่มี AE ในทีมนี้</div>}
            </div>
          );
        })}
      </div>

      {/* Seasonal distribution */}
      <div className="flex flex-col gap-3">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h4 style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-8)" }}>สัดส่วนรายเดือน (ฤดูกาล)</h4>
          <ValueModeToggle value={seasonMode} onChange={setSeasonMode} ariaLabel="รูปแบบกรอกสัดส่วนรายเดือน" />
          <span style={{ fontSize: "var(--fs-5)", color: Math.abs(seasonSumPct - 100) < 0.5 ? "var(--green)" : "var(--amber)", fontWeight: "var(--fw-bold)" }}>
            รวม {seasonMode === "percent" ? fmtPercent(seasonSumPct) : fmt(annualTarget * seasonSumPct / 100)}
          </span>
          <button type="button" className="btn sm" onClick={reseedSeason} style={{ marginLeft: "auto" }}><RotateCcw size={14} aria-hidden="true" /> ใช้ฤดูกาลปีก่อน</button>
        </div>
        <div className="fz-box">
          <TableScroll surface="embedded" family="editable"><table className="fz-table premium-glass-table w-full text-sm">
            <thead>
              <tr>
                <th style={{ textAlign: "left", minWidth: 70 }}></th>
                {MONTH_LABELS.map((m) => <th key={m} className="num" style={{ minWidth: 62 }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="premium-row">
                <td style={{ fontWeight: "var(--fw-bold)", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{seasonMode === "percent" ? "%" : "มูลค่า"}</td>
                {monthPct.map((p, i) => (
                  <td key={i} className="num" style={{ padding: "3px 4px" }}>
                    {seasonMode === "percent" ? (
                      <TwoDecimalInput value={p} suffix="%" onChange={(v) => setMonth(i, v)} />
                    ) : (
                      <TwoDecimalInput
                        value={monthlyValues[i]}
                        onChange={(v) => setMonth(i, annualTarget > 0 ? (v / annualTarget) * 100 : 0)}
                      />
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ fontWeight: "var(--fw-bold)", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>บริษัท</td>
                {distributeBySeasonal(sum(SALES_TEAMS.map((t) => teamTargets[t])), monthPct.map((p) => p / 100)).map((v, i) => (
                  <td key={i} className="num mono" style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", padding: "3px 4px" }}>{fmt(v)}</td>
                ))}
              </tr>
            </tbody>
          </table></TableScroll>
        </div>
        <p style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
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
    <div className="glass-panel" style={{ padding: "10px 14px", borderColor: color, color, fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)" }}>
      {label} {fmt(allocated)} / {fmt(target)} · {text} <span style={{ color: "var(--text-3)", fontWeight: "var(--fw-medium)" }}>(เตือนเท่านั้น ไม่บังคับให้เท่ากัน)</span>
    </div>
  );
}
