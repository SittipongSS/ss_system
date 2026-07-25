"use client";
// ปฏิทินวันหยุด — ข้อมูลปฏิบัติการ แก้ตรงบนตารางเดิม (Decision 0012 ฉบับแก้ไขครั้งที่ 2:
// ไม่ใช้ชั้นร่าง/เผยแพร่) — เพิ่มผ่าน Modal ทางเดียว ส่วนการลบยืนยันผ่าน ConfirmDialog (no-auto-save)
import { useState, useEffect, useMemo, useCallback } from "react";
import { AlertTriangle, CalendarDays, Plus, Trash2, Info, ChevronLeft, ChevronRight, List, CalendarRange } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateInput from "@/components/ui/DateInput";
import Modal from "@/components/Modal";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";
import { missingHolidayYears } from "@/lib/master/holidayCoverage";
import styles from "./page.module.css";

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
  // ฟอร์มเพิ่ม: null = ปิด; { date, name, lockDate } = เปิด Modal
  const [addForm, setAddForm] = useState(null);
  // การลบผ่าน dialog ยืนยัน: { date, name }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/holidays");
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

  // ปีที่ยังไม่มีวันหยุดเลยทั้งที่ควรมีแล้ว → ไทม์ไลน์ที่ข้ามไปปีนั้นจะนับวันหยุดเป็นวันทำการ
  const missingYears = useMemo(
    () => missingHolidayYears(holidays, now, tab === "calendar" ? cursor.y : null),
    [holidays, now, tab, cursor.y],
  );

  const addHoliday = async (date, name) => {
    const res = await fetch("/api/holidays", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name: name || "" }),
    });
    if (res.ok) {
      const saved = await res.json();
      setHolidays((prev) => [...prev, saved].sort((a, b) => a.date.localeCompare(b.date)));
      return true;
    }
    setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "เพิ่มไม่สำเร็จ" });
    return false;
  };

  const removeHoliday = async (date) => {
    const res = await fetch(`/api/holidays/${date}`, { method: "DELETE" });
    if (res.ok) {
      setHolidays((prev) => prev.filter((holiday) => holiday.date !== date));
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

  const cells = useMemo(() => {
    const startPad = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = Array.from({ length: startPad }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) arr.push(day);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

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

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><CalendarDays size={22} /></span>{" "}
            วันหยุด (ปฏิทินทำการ)
          </h1>
          <p>วันหยุดบริษัท/นักขัตฤกษ์ที่ระบบใช้นับ &quot;วันทำการ&quot; ของไทม์ไลน์โครงการ</p>
        </div>
        <div className={styles.headerRight}>
          <div className="segmented">
            <button type="button" onClick={() => setTab("calendar")} className={tab === "calendar" ? "active" : ""}><CalendarRange size={14} /> ปฏิทิน</button>
            <button type="button" onClick={() => setTab("list")} className={tab === "list" ? "active" : ""}><List size={14} /> รายการ</button>
          </div>
          <div className="pill ok">ทั้งหมด {holidays.length} วัน</div>
        </div>
      </div>

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
        </div>
      ))}

      {loading ? (
        <SkeletonRows rows={8} />
      ) : loadError ? (
        <section className={`glass-panel ${styles.errorPanel}`} role="alert">
          <AlertTriangle size={26} />
          <p>{loadError}</p>
          <button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button>
        </section>
      ) : tab === "calendar" ? (
        <div className={`glass-panel ${styles.calendarPanel}`}>
          <div className={styles.monthNav}>
            <button type="button" onClick={() => goMonth(-1)} className="btn-icon" aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า"><ChevronLeft size={16} /></button>
            <div className={styles.monthTitle}>
              <strong>{MONTHS_TH[cursor.m]} {cursor.y}</strong>
              <small>{monthHolidayCount} วันหยุดในเดือนนี้</small>
            </div>
            <div>
              <button type="button" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })} className="btn sm">วันนี้</button>
              <button type="button" onClick={() => goMonth(1)} className="btn-icon" aria-label="เดือนถัดไป" title="เดือนถัดไป"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className={styles.weekHead} aria-hidden="true">
            {WEEKDAYS_TH.map((day, index) => (
              <span key={day} className={index === 0 || index === 6 ? styles.weekend : undefined}>{day}</span>
            ))}
          </div>

          <div className={styles.dayGrid}>
            {cells.map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} className={styles.dayBlank} />;
              const iso = toISO(cursor.y, cursor.m, day);
              const dow = new Date(cursor.y, cursor.m, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isHoliday = holidayMap.has(iso);
              const holidayName = holidayMap.get(iso);
              const isToday = iso === todayISO;
              // เสาร์–อาทิตย์หยุดอยู่แล้ว ไม่ต้องเพิ่ม/ลบ — ปุ่ม disabled ไม่กินตำแหน่ง tab
              const clickable = canManage && !isWeekend;
              const state = isHoliday ? `วันหยุด: ${holidayName || "ไม่ระบุชื่อ"}` : isWeekend ? "วันหยุดสุดสัปดาห์" : "วันทำการ";
              const action = !clickable ? "" : isHoliday ? " · กดเพื่อลบวันหยุด" : " · กดเพื่อเพิ่มวันหยุด";
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onDayClick(iso)}
                  aria-label={`${fmtLong(iso)}${isToday ? " (วันนี้)" : ""} · ${state}${action}`}
                  title={isHoliday ? (holidayName || "วันหยุด") : isWeekend ? "วันหยุดสุดสัปดาห์" : clickable ? "คลิกเพื่อเพิ่มวันหยุด" : ""}
                  className={[
                    styles.day,
                    isHoliday && styles.holidayDay,
                    isWeekend && !isHoliday && styles.weekendDay,
                    isToday && styles.today,
                  ].filter(Boolean).join(" ")}
                >
                  <strong>{day}</strong>
                  {isHoliday && <small>{holidayName || "วันหยุด"}</small>}
                  {isWeekend && !isHoliday && <small>หยุด</small>}
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span><i className={styles.legendHoliday} /> วันหยุดนักขัตฤกษ์/บริษัท</span>
            <span><i className={styles.legendWeekend} /> เสาร์-อาทิตย์ (หยุดประจำ)</span>
            <span><i className={styles.legendToday} /> วันนี้</span>
          </div>
        </div>
      ) : holidays.length === 0 ? (
        <EmptyState icon={CalendarDays} dashed={canManage} onClick={canManage ? openAdd : undefined}>
          {canManage ? "ยังไม่มีวันหยุดในระบบ — กดเพื่อเพิ่มวันแรก" : "ยังไม่มีวันหยุดในระบบ"}
        </EmptyState>
      ) : (
        <>
          {/* ปุ่มเพิ่มขวาสุดของแถบเครื่องมือ ตามกติกา Page Header — filled ตัวเดียวของหน้า */}
          <div className="toolbar">
            <span className={styles.listSummary}>ทั้งหมด {holidays.length} วัน · {byYear.length} ปี</span>
            <span className="spacer" />
            {canManage && (
              <button type="button" className="btn btn-accent" onClick={openAdd}><Plus size={16} /> เพิ่มวันหยุด</button>
            )}
          </div>

          <div className={styles.yearList}>
            {byYear.map(([year, items]) => (
              <section key={year} className={`glass-panel ${styles.yearPanel}`} aria-labelledby={`holiday-year-${year}`}>
                <header className={styles.yearHeader}>
                  <h2 id={`holiday-year-${year}`}>ปี {year}</h2>
                  <span className="ui-badge">{items.length} วัน</span>
                  {Number(year) === now.getFullYear() && <span className={`ui-badge ${styles.currentYear}`}>ปีนี้</span>}
                </header>

                <div className={`premium-table-wrapper ${styles.tableWrap}`}>
                  <table className="premium-table">
                    <thead>
                      <tr><th>วันที่</th><th>วัน</th><th>ชื่อวันหยุด</th>{canManage && <th aria-label="การทำงาน" />}</tr>
                    </thead>
                    <tbody>
                      {items.map((holiday) => {
                        const dt = dateParts(holiday.date);
                        return (
                          <tr key={holiday.date} className={holiday.date < todayISO ? styles.past : undefined}>
                            <td className={styles.dateCell}>{holiday.date}</td>
                            <td>{dt ? WEEKDAYS_TH[dt.getDay()] : "-"}</td>
                            <td>{holiday.name || "-"}</td>
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
                    </tbody>
                  </table>
                </div>

                <div className={styles.cards}>
                  {items.map((holiday) => (
                    <div key={holiday.date} className={`${styles.card} ${holiday.date < todayISO ? styles.cardPast : ""}`.trim()}>
                      <div>
                        <strong>{fmt(holiday.date)}</strong>
                        <small>{holiday.name || "-"}</small>
                      </div>
                      {canManage && (
                        <button type="button" className="btn-icon danger" onClick={() => setPendingDelete({ date: holiday.date, name: holiday.name })} aria-label={`ลบวันหยุด ${fmtLong(holiday.date)}`} title="ลบ"><Trash2 size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

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
            <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มวันหยุด"}</button>
          </div>
        </form>
      </Modal>

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
