"use client";
import { TableScroll, TableGroupRow } from "@/components/ui/Table";
// ปฏิทินวันหยุด — ข้อมูลปฏิบัติการ แก้ตรงบนตารางเดิม (Decision 0012 ฉบับแก้ไขครั้งที่ 2:
// ไม่ใช้ชั้นร่าง/เผยแพร่) — เพิ่มผ่าน Modal ทางเดียว ส่วนการลบยืนยันผ่าน ConfirmDialog (no-auto-save)
import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { AlertTriangle, CalendarDays, Plus, Trash2, Info, ChevronLeft, ChevronRight, List, CalendarRange, CalendarPlus } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import Modal from "@/components/Modal";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import Toast from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import HolidayImportModal from "@/components/master/HolidayImportModal";
import { useCan } from "@/lib/roleContext";
import { primeCache } from "@/lib/apiCache";
import { defaultHolidayYear, missingHolidayYears } from "@/lib/master/holidayCoverage";
import MonthGrid from "@/components/ui/MonthGrid";
import styles from "./page.module.css";
import { naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dateParts = (iso) => {
  const dt = new Date(`${iso}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const fmt = (iso) => {
  const dt = dateParts(iso);
  if (!dt) return iso;
  return `${WEEKDAYS_TH[dt.getDay()]} ${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};
const fmtLong = (iso) => {
  const dt = dateParts(iso);
  if (!dt) return iso;
  return `${dt.getDate()} ${MONTHS_TH[dt.getMonth()]} ${dt.getFullYear()}`;
};

export default function HolidaysPage() {
  const canManage = useCan("master:manage");
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("calendar"); // calendar | list
  // ปีที่แท็บรายการกำลังโชว์: null = ยังไม่เลือกเอง (ใช้ปีตั้งต้น) · "all" = ทุกปี
  const [listYear, setListYear] = useState(null);
  // ปีที่พับไว้ในตาราง (หัวกลุ่มรายปี) — ป้ายจำนวนยังนับวันทั้งหมด ไม่ใช่แถวที่กางอยู่
  const [collapsedYears, setCollapsedYears] = useState(() => new Set());
  // ฟอร์มเพิ่ม: null = ปิด; { date, name, lockDate } = เปิด Modal
  const [addForm, setAddForm] = useState(null);
  // การลบผ่าน dialog ยืนยัน: { date, name }
  const [pendingDelete, setPendingDelete] = useState(null);
  // นำเข้าจากปฏิทิน Google: null = ปิด, ตัวเลขปี = เปิดโดยตั้งปีนั้นไว้ให้
  const [importYear, setImportYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/holidays");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดปฏิทินวันหยุดไม่สำเร็จ");
      setHolidays(Array.isArray(data) ? data : []);
    } catch (error) {
      // เดิมกลืน error แล้วโชว์ "ยังไม่มีวันหยุดในระบบ" — ปฏิทินว่างเพราะโหลดพัง
      // กับปฏิทินที่ยังไม่ได้ตั้ง หน้าตาเหมือนกันจนแยกไม่ออก
      setLoadError(error.message || "โหลดปฏิทินวันหยุดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const holidayMap = useMemo(() => {
    const map = new Map();
    for (const holiday of holidays) map.set(holiday.date, holiday.name || "");
    return map;
  }, [holidays]);

  // ปีล่าสุดอยู่บนสุด — ปีที่กำลังใช้งานสำคัญกว่าปีที่ผ่านไปแล้ว
  const byYear = useMemo(() => {
    const map = {};
    for (const holiday of holidays) (map[(holiday.date || "").slice(0, 4)] ??= []).push(holiday);
    return Object.entries(map)
      .map(([year, items]) => [year, items.slice().sort((a, b) => a.date.localeCompare(b.date))])
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [holidays]);

  // ปีที่โชว์อยู่จริง — ยังไม่ได้เลือกเอง = ปีปัจจุบัน (ถอยไปปีล่าสุดที่มีข้อมูลถ้าปีนี้ยังว่าง)
  const activeYear = listYear ?? defaultHolidayYear(holidays, now);
  const visibleYears = useMemo(
    () => (activeYear === "all" ? byYear : byYear.filter(([year]) => year === activeYear)),
    [byYear, activeYear],
  );

  // ปีที่ยังไม่มีวันหยุดเลยทั้งที่ควรมีแล้ว → ไทม์ไลน์ที่ข้ามไปปีนั้นจะนับวันหยุดเป็นวันทำการ
  const missingYears = useMemo(
    () => missingHolidayYears(holidays, now, tab === "calendar" ? cursor.y : null),
    [holidays, now, tab, cursor.y],
  );

  // หน้าอื่น (ปฏิทินผู้บริหาร/ไทม์ไลน์ดีล) อ่าน /api/holidays ผ่าน cachedFetchJson ที่
  // จำไว้ 2 นาที — ไม่ prime ที่นี่ ผู้ใช้แก้วันหยุดเสร็จแล้วเดินไปหน้าอื่นจะยังเห็นของเก่า
  const applyHolidays = useCallback((next) => {
    setHolidays(next);
    primeCache("/api/holidays", next);
  }, []);

  const addHoliday = async (date, name) => {
    const res = await apiFetch("/api/holidays", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name: name || "" }),
    });
    if (res.ok) {
      const saved = await res.json();
      applyHolidays([...holidays, saved].sort((a, b) => a.date.localeCompare(b.date)));
      return true;
    }
    setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "เพิ่มไม่สำเร็จ" });
    return false;
  };

  const removeHoliday = async (date) => {
    const res = await apiFetch(`/api/holidays/${date}`, { method: "DELETE" });
    if (res.ok) {
      applyHolidays(holidays.filter((holiday) => holiday.date !== date));
      return true;
    }
    setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ" });
    return false;
  };

  // เพิ่มแล้ว Modal ค้างไว้ เคลียร์ช่องให้กรอกวันถัดไปต่อได้ทันที (กรอกทั้งปีรวดเดียว)
  const submitAdd = async (event) => {
    event.preventDefault();
    if (!addForm || !/^\d{4}-\d{2}-\d{2}$/.test(addForm.date)) {
      setToast({ kind: "error", msg: "กรุณาเลือกวันที่" });
      return;
    }
    setBusy(true);
    if (await addHoliday(addForm.date, addForm.name)) {
      setToast({ kind: "success", msg: `เพิ่มวันหยุด ${fmt(addForm.date)} แล้ว` });
      if (addForm.lockDate) setAddForm(null); // มาจากการคลิกวันบนปฏิทิน = จบเป็นรายวัน
      else setAddForm({ date: "", name: "", lockDate: false });
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    if (await removeHoliday(pendingDelete.date)) {
      setToast({ kind: "success", msg: `ลบวันหยุด ${fmt(pendingDelete.date)} แล้ว` });
    }
    setBusy(false);
    setPendingDelete(null);
  };

  // คลิกวันบนปฏิทิน: วันหยุด → ยืนยันลบ, วันทำการ → เปิดฟอร์มเพิ่มโดยล็อกวันที่ไว้
  const onDayClick = (iso) => {
    if (!canManage) return;
    if (holidayMap.has(iso)) setPendingDelete({ date: iso, name: holidayMap.get(iso) });
    else setAddForm({ date: iso, name: "", lockDate: true });
  };

  const monthHolidayCount = useMemo(
    () => holidays.filter((holiday) => holiday.date.startsWith(`${cursor.y}-${pad(cursor.m + 1)}`)).length,
    [holidays, cursor],
  );

  const goMonth = (delta) => setCursor((current) => {
    const month = current.m + delta;
    if (month < 0) return { y: current.y - 1, m: 11 };
    if (month > 11) return { y: current.y + 1, m: 0 };
    return { y: current.y, m: month };
  });

  const openAdd = () => setAddForm({ date: "", name: "", lockDate: false });

  const toggleYear = (year) => setCollapsedYears((current) => {
    const next = new Set(current);
    if (next.has(year)) next.delete(year); else next.add(year);
    return next;
  });

  /* ป้ายจำนวน = วันหยุดที่มองเห็นในมุมมองนั้น (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ)
     ปฏิทิน = วันหยุดของเดือนที่เปิดอยู่ · รายการ = วันหยุดของปีที่เลือก (ทุกปี = ทั้งหมด) */
  const listHolidayCount = visibleYears.reduce((n, [, items]) => n + items.length, 0);
  const shownCount = tab === "calendar" ? monthHolidayCount : listHolidayCount;
  const importYearGuess = tab === "calendar"
    ? cursor.y
    : Number(!activeYear || activeYear === "all" ? now.getFullYear() : activeYear);

  return (
    <Workspace
      icon={<CalendarDays size={22} />}
      title="วันหยุด (ปฏิทินทำการ)"
      subtitle={'วันหยุดบริษัท/นักขัตฤกษ์ที่ระบบใช้นับ "วันทำการ" ของไทม์ไลน์โครงการ'}
    >

      <div className="info-note">
        <Info size={16} />
        <div>เสาร์–อาทิตย์ถือเป็นวันหยุดเสมอโดยอัตโนมัติ — ที่นี่ใส่เฉพาะ<b>วันหยุดเพิ่มเติม</b> (นักขัตฤกษ์/วันหยุดบริษัท){canManage && tab === "calendar" && " · คลิกที่วัน (จันทร์–ศุกร์) เพื่อเพิ่ม/ลบวันหยุด"} การเปลี่ยนแปลงมีผลกับโครงการ<b>ที่สร้าง/แก้ไขหลังจากนี้</b></div>
      </div>

      {missingYears.map((year) => (
        <div key={year} className={styles.coverageWarning}>
          <AlertTriangle size={17} />
          <p>
            <strong>ยังไม่มีวันหยุดปี {year} ในระบบ</strong> — ไทม์ไลน์โครงการที่กินเวลาข้ามไปปี {year} จะนับวันหยุดของปีนั้นเป็น<b>วันทำการทั้งหมด</b> กำหนดส่งงานจะเร็วกว่าความจริง
            {canManage && " · กรอกวันหยุดปีนั้นล่วงหน้าก่อนเริ่มวางแผนงานข้ามปี"}
          </p>
          {/* ปุ่มอยู่ตรงจุดที่ผู้ใช้เพิ่งรู้ตัวว่าขาดอะไร ไม่ต้องไปหาเองในแท็บอื่น */}
          {canManage && (
            <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => setImportYear(year)}>
              นำเข้าจาก Google
            </Button>
          )}
        </div>
      ))}

      {/* ⭐ แผงรายการเดียวทั้งสองมุมมอง (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ)
          เดิมตัวสลับมุมมอง + ป้าย "ทั้งหมด N วัน" อยู่หัวหน้า · ปฏิทินเป็น glass-panel ลอย ·
          รายการเป็นการ์ดรายปีหลายใบ + `.toolbar` ลอย ⇒ ตอนนี้หัวแผง (ป้ายจำนวน · ปุ่มเพิ่ม/นำเข้า)
          กับแถบเครื่องมือ (สลับมุมมอง · เลื่อนเดือน หรือเลือกปี) อยู่ที่เดิมทุกมุมมอง
          ตารางรายการเป็นตารางเดียวแบ่งกลุ่มรายปีด้วย TableGroupRow (ทรงเดียวกับโหมดจัดกลุ่มของทะเบียนอื่น)
          ปุ่มเพิ่ม/นำเข้าเป็นของเนื้อหาในแผง (เปลือกตั้งค่า มติ 2026-08-21) */}
      <ListPanel
        icon={<CalendarDays size={17} aria-hidden="true" />}
        title="รายการวันหยุด"
        subtitle={tab === "calendar" ? "วันหยุดของเดือนที่เปิดอยู่บนปฏิทิน" : "เรียงตามวันที่ แบ่งกลุ่มรายปี"}
        count={loading || loadError ? null : `${shownCount} วัน`}
        loading={loading}
        skeletonRows={8}
        actions={canManage ? (
          <>
            <Button icon={<CalendarPlus size={16} />} onClick={() => setImportYear(importYearGuess)}>
              นำเข้าจาก Google
            </Button>
            <button type="button" className="btn btn-accent" onClick={openAdd}><Plus size={16} /> เพิ่มวันหยุด</button>
          </>
        ) : null}
        toolbar={(
          <>
            <Segmented
              ariaLabel="มุมมองวันหยุด"
              options={[
                { value: "calendar", label: "ปฏิทิน", icon: CalendarRange },
                { value: "list", label: "รายการ", icon: List },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === "calendar" ? (
              /* เลื่อนเดือนขยับเฉพาะปฏิทินในแผงนี้ ⇒ อยู่แถบเครื่องมือ
                 ชื่อเดือน + ปุ่มสามตัวเป็น **กลุ่มเดียว** ที่ตัดบรรทัดทั้งก้อน — 🐞 จอ 390 เคยวางเป็นลูกของ
                 .toolbar ทีละตัว ⇒ ปุ่ม "ก่อนหน้า" ค้างท้ายแถวแรก ส่วน "วันนี้/ถัดไป" ตกไปแถวสอง
                 ชื่อเดือนดันปุ่มชิดขวาของกลุ่ม ⇒ ชื่อเดือนยาวไม่เท่ากันก็ไม่ดันปุ่มให้เลื่อนหนีเมาส์ตอนกดซ้ำ */
              <div className={styles.monthNav}>
                <strong className={styles.monthLabel}>{MONTHS_TH[cursor.m]} {cursor.y}</strong>
                <button type="button" onClick={() => goMonth(-1)} className="btn-icon" aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า"><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })} className="btn sm">วันนี้</button>
                <button type="button" onClick={() => goMonth(1)} className="btn-icon" aria-label="เดือนถัดไป" title="เดือนถัดไป"><ChevronRight size={16} /></button>
              </div>
            ) : byYear.length > 0 ? (
              <>
                {/* เลือกปีที่โชว์ (ตั้งต้นปีปัจจุบัน) — ใช้ dropdown ไม่ใช่ปุ่มเรียง เพราะจำนวนปีโตขึ้นทุกปี
                    ตัวเลือกที่กว้างขึ้นเรื่อย ๆ จะเบียดแถวเครื่องมือแตกในอีกไม่กี่ปี */}
                {/* "ปี" อยู่ในข้อความตัวเลือก ไม่ใช่ป้ายแยก — 🐞 จอ 390 ป้ายแยกค้างท้ายแถวแรก ส่วนดรอปดาวน์ตกไปแถวสอง
                    ข้อความ "N ปีในระบบ" ถูกถอดด้วยเหตุเดียวกัน (ห้อยแถวเดี่ยว) — ตัวเลือกในดรอปดาวน์บอกครบทุกปีแล้ว */}
                <Select value={activeYear || ""} onChange={(event) => setListYear(event.target.value)} aria-label="เลือกปีที่แสดง" className={styles.yearPicker}>
                  {byYear.map(([year, items]) => (
                    <option key={year} value={year}>ปี {year} ({items.length} วัน)</option>
                  ))}
                  {byYear.length > 1 && <option value="all">ทุกปี ({holidays.length} วัน)</option>}
                </Select>
              </>
            ) : null}
          </>
        )}
      >
        {loadError ? (
          /* เดิมกลืน error แล้วโชว์ "ยังไม่มีวันหยุด" — ปฏิทินว่างเพราะโหลดพังกับยังไม่ได้ตั้งหน้าตาเหมือนกัน */
          <StatusNotice tone="error" className="mb-4" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>
            {loadError}
          </StatusNotice>
        ) : tab === "calendar" ? (
          <>
            <MonthGrid
              year={cursor.y}
              month={cursor.m}
              todayISO={todayISO}
              holidayOf={(iso) => holidayMap.get(iso) ?? (holidayMap.has(iso) ? "วันหยุด" : undefined)}
              onDayClick={onDayClick}
              /* เสาร์–อาทิตย์หยุดอยู่แล้ว ไม่ต้องเพิ่ม/ลบ — disabled ไม่กินตำแหน่ง tab */
              dayDisabled={({ isWeekend }) => !canManage || isWeekend}
              dayLabel={({ iso, isWeekend, isHoliday, holidayName, isToday }) => {
                const state = isHoliday ? `วันหยุด: ${holidayName || "ไม่ระบุชื่อ"}` : isWeekend ? "วันหยุดสุดสัปดาห์" : "วันทำการ";
                const action = !canManage || isWeekend ? "" : isHoliday ? " · กดเพื่อลบวันหยุด" : " · กดเพื่อเพิ่มวันหยุด";
                return `${fmtLong(iso)}${isToday ? " (วันนี้)" : ""} · ${state}${action}`;
              }}
            >
              {({ isWeekend, isHoliday }) => (
                isWeekend && !isHoliday ? <small className={styles.weekendNote}>หยุด</small> : null
              )}
            </MonthGrid>

            <div className={styles.legend}>
              <span><i className={styles.legendHoliday} /> วันหยุดนักขัตฤกษ์/บริษัท</span>
              <span><i className={styles.legendWeekend} /> เสาร์-อาทิตย์ (หยุดประจำ)</span>
              <span><i className={styles.legendToday} /> วันนี้</span>
            </div>
          </>
        ) : holidays.length === 0 ? (
          <EmptyState plain icon={CalendarDays} dashed={canManage} onClick={canManage ? openAdd : undefined}>
            {canManage ? "ยังไม่มีวันหยุดในระบบ — กดเพื่อเพิ่มวันแรก" : "ยังไม่มีวันหยุดในระบบ"}
          </EmptyState>
        ) : (
          <>
            <TableScroll className={`${styles.tableWrap}`}>
              <table className="premium-table">
                <thead>
                  <tr><th>วันที่</th><th>วัน</th><th>ชื่อวันหยุด</th>{canManage && <th aria-label="การทำงาน" />}</tr>
                </thead>
                <tbody>
                  {visibleYears.map(([year, items]) => {
                    const yearCollapsed = collapsedYears.has(year);
                    return (
                      <Fragment key={year}>
                        <TableGroupRow
                          colSpan={canManage ? 4 : 3}
                          label={`ปี ${year}`}
                          badge={`${items.length} วัน`}
                          collapsed={yearCollapsed}
                          onToggle={() => toggleYear(year)}
                          actions={Number(year) === now.getFullYear() ? <span className={`ui-badge ${styles.currentYear}`}>ปีนี้</span> : null}
                        />
                        {!yearCollapsed && items.map((holiday) => {
                          const dt = dateParts(holiday.date);
                          return (
                            <tr key={holiday.date} className={holiday.date < todayISO ? styles.past : undefined}>
                              <td className={styles.dateCell}>{holiday.date}</td>
                              <td>{dt ? WEEKDAYS_TH[dt.getDay()] : NA}</td>
                              <td>{naText(holiday.name)}</td>
                              {canManage && (
                                <td>
                                  <div className={styles.rowActions}>
                                    <button type="button" className="btn-icon danger" onClick={() => setPendingDelete({ date: holiday.date, name: holiday.name })} aria-label={`ลบวันหยุด ${fmtLong(holiday.date)}`} title="ลบ"><Trash2 size={15} /></button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>

            {/* จอตั้ง ≤768 = การ์ดรายวัน แบ่งกลุ่มรายปีด้วยหัวกลุ่มบรรทัดเดียว (ไม่ใช่การ์ดซ้อนการ์ด) */}
            <div className={styles.cards}>
              {visibleYears.map(([year, items]) => (
                <div key={year} className={styles.cardGroup} role="group" aria-label={`วันหยุดปี ${year}`}>
                  <div className={styles.cardGroupHead}>
                    <strong>ปี {year}</strong>
                    <span className="ui-badge">{items.length} วัน</span>
                    {Number(year) === now.getFullYear() && <span className={`ui-badge ${styles.currentYear}`}>ปีนี้</span>}
                  </div>
                  {items.map((holiday) => (
                    <div key={holiday.date} className={`${styles.card} ${holiday.date < todayISO ? styles.cardPast : ""}`.trim()}>
                      <div>
                        <strong>{fmt(holiday.date)}</strong>
                        <small>{naText(holiday.name)}</small>
                      </div>
                      {canManage && (
                        <button type="button" className="btn-icon danger" onClick={() => setPendingDelete({ date: holiday.date, name: holiday.name })} aria-label={`ลบวันหยุด ${fmtLong(holiday.date)}`} title="ลบ"><Trash2 size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </ListPanel>

      {/* ทางเพิ่มวันหยุดทางเดียวของหน้า — คลิกวันบนปฏิทินก็มาโผล่ที่นี่ (ฟอร์มชุดเดียว) */}
      <Modal open={!!addForm} onClose={() => !busy && setAddForm(null)} title="เพิ่มวันหยุด" size="sm" dismissible={!busy}>
        <form className={styles.addForm} onSubmit={submitAdd}>
          <label>
            วันที่ <b>*</b>
            {addForm?.lockDate
              ? <input className="premium-input" value={fmtLong(addForm.date)} readOnly />
              : <DateInput value={addForm?.date || ""} onChange={(value) => setAddForm((current) => ({ ...current, date: value }))} />}
          </label>
          <label>
            ชื่อวันหยุด
            <input
              type="text"
              className="premium-input"
              value={addForm?.name || ""}
              placeholder="เช่น วันสงกรานต์, หยุดบริษัท"
              onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <p className={styles.addHint}>
            มีผลกับไทม์ไลน์โครงการที่สร้าง/แก้ไขหลังจากนี้
            {!addForm?.lockDate && " · บันทึกแล้วช่องจะว่างให้กรอกวันถัดไปต่อได้เลย"}
          </p>
          <div className={styles.addActions}>
            <button type="button" className="btn ghost" onClick={() => setAddForm(null)} disabled={busy}>ปิด</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มวันหยุด"}</button>
          </div>
        </form>
      </Modal>

      {/* นำเข้าจากปฏิทิน Google — ทางเข้าสองจุด (แบนเนอร์เตือน / หัวแผง) ใช้โมดัลตัวเดียว */}
      <HolidayImportModal
        open={importYear !== null}
        initialYear={importYear}
        onClose={() => setImportYear(null)}
        onDone={({ year, summary, holidays: saved }) => {
          if (Array.isArray(saved)) applyHolidays(saved);
          setImportYear(null);
          setToast({
            kind: "success",
            msg: `นำเข้าวันหยุดปี ${year} แล้ว — เพิ่ม ${summary.inserted} วัน${summary.renamed ? ` · แก้ชื่อ ${summary.renamed} วัน` : ""}`,
          });
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        tone="danger"
        title="ยืนยันลบวันหยุด"
        description={pendingDelete ? `ลบวันหยุด ${fmt(pendingDelete.date)}${pendingDelete.name ? ` (${pendingDelete.name})` : ""} ออกจากปฏิทินทำการ?` : ""}
        detail="ลบแล้ววันนี้กลับเป็นวันทำการทันทีและกู้คืนไม่ได้ — ไทม์ไลน์โครงการที่สร้าง/แก้ไขหลังจากนี้จะนับวันนี้เป็นวันทำการ"
        confirmLabel="ลบวันหยุด"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => { if (!busy) setPendingDelete(null); }}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
