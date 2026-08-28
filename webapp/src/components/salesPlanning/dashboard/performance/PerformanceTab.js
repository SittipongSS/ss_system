"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildMatrix, closedMonths, overlayHistory, ytdMonths, windowForPeriod } from "@/lib/sales/performanceMath";
import { apiCache } from "@/lib/apiCache";
import { SALES_TEAMS } from "@/components/salesPlanning/ui";
import DealDrillDownModal from "@/components/salesPlanning/DealDrillDownModal";
import PeriodBar from "./PeriodBar";
import YearProgressBar from "./YearProgressBar";
import MorningBoard from "./MorningBoard";
import YearHeatmap from "./YearHeatmap";
import DrillSection from "./DrillSection";
import { apiFetch } from "@/lib/apiFetch";

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
  const res = await apiFetch(key);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดภาพรวมไม่สำเร็จ");
  const months = (await res.json()).months || [];
  apiCache.set(key, months);
  return months;
}

function fetchHistory(year) {
  return apiFetch(`/api/sales-planning/history?monthsOf=${encodeURIComponent(year)}`)
    .then((r) => (r.ok ? r.json() : { rows: [] }))
    .catch(() => ({ rows: [] })); // ไม่มีประวัติ = กราฟใช้ยอดระบบล้วน ไม่ใช่ error
}

export default function PerformanceTab({ year }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const [currentHistoryRows, setCurrentHistoryRows] = useState([]);
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
      const [cur, prev, hist, curHist] = await Promise.all([
        fetchYear(year),
        fetchYear(prevYear).catch(() => []), // ปีก่อนไม่มีข้อมูล = กราฟ YoY ว่าง ไม่ใช่ error
        fetchHistory(prevYear),
        // ปีปัจจุบันก็มียอดที่กรอกย้อนหลังได้ (เดือนต้นปีที่ยังไม่ได้ใช้ระบบ) — ไม่โหลด
        // มาทับ เส้น Actual ของเดือนเหล่านั้นจะเป็น 0 ทั้งที่ขายจริง
        fetchHistory(year),
      ]);
      setYearMonths(cur);
      setPrevMonths(prev);
      setHistoryRows(hist.rows || []);
      setCurrentHistoryRows(curHist.rows || []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [year, prevYear]);

  useEffect(() => { load(); }, [load]);

  // เส้น Actual: เริ่มจากยอด won ในระบบ แล้วทับด้วยแถวรายเดือนที่กรอกเองใน
  // sales_history (periodType='month') — ใช้ทั้งปีปัจจุบันและปีก่อน เพราะช่วงที่ยังไม่ได้
  // ใช้ระบบมีได้ทั้งสองปี · เดือนที่ไม่มีแถวกรอกเองยังใช้ยอดจากดีลตามเดิม
  const matrix = useMemo(
    () => overlayHistory(buildMatrix(yearMonths || []), currentHistoryRows),
    [yearMonths, currentHistoryRows],
  );

  const prevMatrix = useMemo(
    () => overlayHistory(buildMatrix(prevMonths || []), historyRows),
    [prevMonths, historyRows],
  );

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

  /* งวดของทั้งแท็บ — คำนวณที่เดียวแล้วส่งลงไป (แถบคุม + แถบความคืบหน้า + ตารางติดตาม)
     งวดต้องอยู่ในปีที่ดูเสมอ (matrix เป็นรายปี) — bp ที่หลุดปี เช่นสลับปีแล้วพารามิเตอร์
     เก่าค้าง ถูกดึงกลับเป็นทั้งปี */
  const win = useMemo(() => {
    const w = windowForPeriod(view.bp);
    return w && w.year === yearNum ? w : windowForPeriod(String(yearNum));
  }, [view.bp, yearNum]);

  const common = { matrix, prevMatrix, year: yearNum, now, closedCount, ytdCount, carry: view.carry, win, loading };

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* ทางเข้าหน้ากรอกยอดย้อนหลังอยู่ที่หน้าวางเป้าที่เดียว (มติผู้ใช้ 2026-07-26) —
          แท็บนี้เป็นหน้าอ่านผล ไม่ใช่หน้ากรอกข้อมูล */}
      <PeriodBar
        year={yearNum}
        win={win}
        onBpChange={(bp) => update({ bp })}
        carry={view.carry}
        onCarryChange={(carry) => update({ carry })}
      />

      <YearProgressBar {...common} />

      <MorningBoard {...common} onDrill={drillTo} onDealDrill={setDealFilter} />

      <YearHeatmap {...common} onDrill={drillTo} />

      <div ref={drillRef}>
        <DrillSection
          {...common}
          scope={view.scope}
          team={view.team}
          person={view.person}
          period={view.period}
          onChange={update}
        />
      </div>

      {dealFilter && <DealDrillDownModal filter={dealFilter} onClose={() => setDealFilter(null)} />}
    </div>
  );
}
