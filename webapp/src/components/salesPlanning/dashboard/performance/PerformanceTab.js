"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCan, useRole } from "@/lib/roleContext";
import { buildMatrix, closedMonths, ytdMonths } from "@/lib/sales/performanceMath";
import { apiCache } from "@/lib/apiCache";
import { SALES_TEAMS } from "@/components/salesPlanning/ui";
import DealDrillDownModal from "@/components/salesPlanning/DealDrillDownModal";
import YearProgressBar from "./YearProgressBar";
import MorningBoard from "./MorningBoard";
import YearHeatmap from "./YearHeatmap";
import DrillSection from "./DrillSection";

// แท็บ "ผลงานขาย" (/sa/dashboard?tab=performance) — แทน "KPI ดีล" เดิม (2026-07-18).
// ดีไซน์จากไฟล์ HTML ของผู้ใช้: บอร์ดประชุมเช้า + ทบยอด + heatmap + เจาะรายคน/ทีม.
// คณิตทั้งหมดอยู่ใน lib/sales/performanceMath (pure, มีเทสต์) — ไฟล์นี้ทำแค่
// โหลดข้อมูล + ถือ state + ประกอบชิ้นส่วน.
//
// state หลักเก็บใน URL params → คัดลอกลิงก์/แชร์มุมมองได้ และการ์ดในแดชบอร์ดของฉัน
// ลิงก์เข้ามาแบบเจาะตัวเองได้ (?tab=performance&scope=person&person=<id>)

// ดึง dashboard ปีหนึ่ง ๆ แบบ stale-while-revalidate (แพตเทิร์นเดียวกับ load() เดิมของหน้า /sa)
async function fetchYear(year) {
  const key = `/api/sales-planning/dashboard?year=${encodeURIComponent(year)}`;
  const res = await fetch(key);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดภาพรวมไม่สำเร็จ");
  const months = (await res.json()).months || [];
  apiCache.set(key, months);
  return months;
}

export default function PerformanceTab({ year }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ลิงก์หน้ากรอกยอดรายเดือนปีก่อน — สิทธิ์เดียวกับตัวช่วยวางเป้า (Supervisor/admin)
  const canTarget = useCan("salesplan:target");
  const role = useRole();
  const canEditHistory = canTarget && (role === "admin" || role === "ae_supervisor");

  const yearNum = Number(year);
  const prevYear = String(yearNum - 1);
  const now = useMemo(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIdx: d.getMonth() };
  }, []);
  const closedCount = closedMonths(yearNum, now);
  const ytdCount = ytdMonths(yearNum, now);

  // ---- data ----
  const [yearMonths, setYearMonths] = useState(() => apiCache.get(`/api/sales-planning/dashboard?year=${year}`) || null);
  const [prevMonths, setPrevMonths] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(!yearMonths);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const cached = apiCache.get(`/api/sales-planning/dashboard?year=${year}`);
    if (cached) {
      setYearMonths(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const [cur, prev, hist] = await Promise.all([
        fetchYear(year),
        fetchYear(prevYear).catch(() => []), // ปีก่อนไม่มีข้อมูล = กราฟ YoY ว่าง ไม่ใช่ error
        fetch(`/api/sales-planning/history?monthsOf=${encodeURIComponent(prevYear)}`)
          .then((r) => (r.ok ? r.json() : { rows: [] }))
          .catch(() => ({ rows: [] })),
      ]);
      setYearMonths(cur);
      setPrevMonths(prev);
      setHistoryRows(hist.rows || []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [year, prevYear]);

  useEffect(() => { load(); }, [load]);

  const matrix = useMemo(() => buildMatrix(yearMonths || []), [yearMonths]);

  // Actual ปีก่อน: เริ่มจากยอด won ในระบบ แล้วทับด้วยแถวรายเดือนที่กรอกเอง
  // (sales_history periodType='month') — กรอกได้ระดับบริษัท/ทีม (ownerId null)
  const prevMatrix = useMemo(() => {
    const m = buildMatrix(prevMonths || []);
    for (const row of historyRows) {
      const mi = Number(String(row.period || "").slice(5, 7)) - 1;
      if (mi < 0 || mi > 11 || row.ownerId) continue;
      const amt = Number(row.actualAmount || 0);
      if (!row.team) m.company.actual[mi] = amt;
      else {
        const t = m.teams.find((x) => x.team === row.team);
        if (t) t.actual[mi] = amt;
        else m.teams.push({ team: row.team, target: Array(12).fill(0), forecast: Array(12).fill(0), actual: Object.assign(Array(12).fill(0), { [mi]: amt }) });
      }
    }
    // ทับระดับทีมแล้วยอดบริษัทต้องตาม — ถ้ามีแถวบริษัทกรอกเองใช้ค่านั้นอยู่แล้ว
    return m;
  }, [prevMonths, historyRows]);

  // ---- URL state (แชร์มุมมองได้) ----
  // ค่าเริ่มต้น = มุมมองประชุมเช้า: เดือนปัจจุบัน · เป้าปกติ (ไม่ทบยอด) · รวมทั้งบริษัท
  // — ทบยอดเป็นมุมมองเสริมที่กดเปิดเอง (มติผู้ใช้ 2026-07-18)
  const defaultBp = yearNum === now.year ? `${year}-${String(now.monthIdx + 1).padStart(2, "0")}` : year;
  const [view, setView] = useState(() => ({
    carry: searchParams.get("carry") === "1",
    bp: searchParams.get("bp") || defaultBp,
    scope: ["company", "team", "person"].includes(searchParams.get("scope")) ? searchParams.get("scope") : "company",
    team: searchParams.get("team") || SALES_TEAMS[0],
    person: searchParams.get("person") || "",
    period: ["month", "quarter", "year"].includes(searchParams.get("period")) ? searchParams.get("period") : "month",
  }));
  const update = useCallback((patch) => setView((v) => ({ ...v, ...patch })), []);

  // sync ลง URL แบบ replace (ไม่ดัน history ทุกคลิก, ไม่ scroll) — คง param อื่นเช่น tab
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDel = (k, v, def) => (v && v !== def ? params.set(k, v) : params.delete(k));
    setOrDel("carry", view.carry ? "1" : "", "");
    setOrDel("bp", view.bp, defaultBp);
    setOrDel("scope", view.scope, "company");
    setOrDel("team", view.scope === "team" ? view.team : "", "");
    setOrDel("person", view.scope === "person" ? view.person : "", "");
    setOrDel("period", view.period, "month");
    const next = params.toString();
    if (next !== searchParams.toString()) router.replace(`${pathname}?${next}`, { scroll: false });
  }, [view, searchParams, router, pathname, defaultBp]);

  // คลิกแถวในบอร์ด/heatmap/ตารางสรุป → เจาะคน/ทีมนั้น แล้วเลื่อนลงไปหาส่วนเจาะ
  const drillRef = useRef(null);
  const drillTo = useCallback((patch) => {
    setView((v) => ({ ...v, ...patch }));
    setTimeout(() => drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, []);

  // คลิกช่อง Actual ในบอร์ด → modal รายดีลชุดเดียวกับแดชบอร์ดเดิม (กติกา wonMonth ตรงกัน)
  const [dealFilter, setDealFilter] = useState(null);

  const common = { matrix, prevMatrix, year: yearNum, now, closedCount, ytdCount, carry: view.carry, loading };

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
          {error}
        </div>
      )}

      <YearProgressBar {...common} carryOn={view.carry} onCarryChange={(carry) => update({ carry })} historyHref={canEditHistory ? "/sa/targets/history" : null} />

      <MorningBoard
        {...common}
        bp={view.bp}
        onBpChange={(bp) => update({ bp })}
        onDrill={drillTo}
        onDealDrill={setDealFilter}
      />

      <YearHeatmap {...common} onDrill={drillTo} />

      <div ref={drillRef}>
        <DrillSection
          {...common}
          scope={view.scope}
          team={view.team}
          person={view.person}
          period={view.period}
          onChange={update}
          onDrill={drillTo}
        />
      </div>

      {dealFilter && <DealDrillDownModal filter={dealFilter} onClose={() => setDealFilter(null)} />}
    </div>
  );
}
