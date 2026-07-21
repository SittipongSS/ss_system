"use client";
// ปฏิทินวันหยุดแบบมีเวอร์ชัน (Decision 0012, mig 0132): แก้ไขทำใน "ฉบับร่าง"
// แล้วเผยแพร่ทั้งชุดในครั้งเดียว — ไทม์ไลน์อ่านจากเวอร์ชันที่เผยแพร่เท่านั้น
//
// ข้อยกเว้นจาก Drawer house pattern (มีเหตุผลด้านข้อมูล): การแก้ชุดวันหยุด
// ทำบนปฏิทินทั้งหน้า ไม่ใช่ใน Drawer — ปฏิทินรายเดือน 7 คอลัมน์กว้างเกิน
// Drawer และการคลิกวันบนปฏิทินคือ interaction หลักของหน้านี้ (ux-ui-rulebook:
// "ใช้หน้าแยกเมื่อมี Preview ตารางกว้าง"); Drawer ใช้ดูรายละเอียดเวอร์ชันตามเดิม
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Edit3, Eye,
  FilePlus2, Info, List, ListPlus, Plus, Send, Trash2,
} from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";
import {
  hasPublishableChangeNote, holidayCalendarStatusLabel, isValidHolidayDate, parseHolidayLines,
} from "@/lib/holidayCalendar";
import styles from "./page.module.css";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fmt = (d) => {
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return `${WEEKDAYS_TH[dt.getDay()]} ${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const fmtStamp = (value) => (value ? dateTime.format(new Date(value)) : "-");
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";

function StatusBadge({ status }) {
  const cls = status === "published" ? styles.published : status === "draft" ? styles.draft : styles.archived;
  return <span className={`${styles.badge} ${cls}`}>{holidayCalendarStatusLabel(status)}</span>;
}

export default function HolidaysPage() {
  const canManage = useCan("master:manage");
  const [publishedList, setPublishedList] = useState([]); // ปฏิทินที่เผยแพร่ (ทุก role)
  const [lifecycle, setLifecycle] = useState(null); // { published, draft, versions } (supervisor)
  const [lifecycleError, setLifecycleError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("calendar"); // calendar | list
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [drawer, setDrawer] = useState(null); // { row }
  const [confirm, setConfirm] = useState(null); // { action: 'publish'|'archive' }

  // โหมดแก้ไขฉบับร่าง: ทุกการคลิก/เพิ่ม/ลบเปลี่ยนเฉพาะ state ในหน้า
  // จนกว่าจะกด "บันทึกฉบับร่าง" (ไม่มี auto-save ตามกติกาทั้งเว็บ)
  const [editing, setEditing] = useState(false);
  const [draftEntries, setDraftEntries] = useState([]);
  const [draftNote, setDraftNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [bulkText, setBulkText] = useState("");

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/holidays");
      const d = res.ok ? await res.json() : [];
      setPublishedList(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    if (canManage) {
      try {
        const res = await fetch("/api/holidays/versions", { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "โหลดข้อมูลเวอร์ชันไม่สำเร็จ");
        setLifecycle(d);
        setLifecycleError("");
      } catch (e) {
        setLifecycle(null);
        setLifecycleError(e.message);
      }
    }
    setLoading(false);
  }, [canManage]);
  useEffect(() => { load(); }, [load]);

  // ชุดที่กำลังแสดง: โหมดแก้ไข = ฉบับร่าง, ปกติ = ฉบับเผยแพร่
  const holidays = editing ? draftEntries : publishedList;
  const holidayMap = useMemo(() => {
    const m = new Map();
    for (const h of holidays) m.set(h.date, h.name || "");
    return m;
  }, [holidays]);
  const byYear = useMemo(() => {
    const m = {};
    for (const h of holidays) (m[(h.date || "").slice(0, 4)] ??= []).push(h);
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [holidays]);

  const draft = lifecycle?.draft || null;
  const published = lifecycle?.published || null;

  // สรุปความต่างร่าง vs เผยแพร่ — ให้เห็นก่อนกดเผยแพร่ว่าจะเปลี่ยนอะไร
  const draftDiff = useMemo(() => {
    if (!draft) return null;
    const pubDates = new Set((published?.holidays || []).map((h) => h.date));
    const draftDates = new Set((draft.holidays || []).map((h) => h.date));
    let added = 0; let removed = 0;
    for (const d of draftDates) if (!pubDates.has(d)) added++;
    for (const d of pubDates) if (!draftDates.has(d)) removed++;
    return { added, removed };
  }, [draft, published]);

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const created = await request("/api/holidays/draft", { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้าง Version ${created.versionNumber} ฉบับร่างแล้ว` });
      await load();
      openEdit(created);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (row = draft) => {
    if (!row) return;
    setDraftEntries((row.holidays || []).map((h) => ({ date: h.date, name: h.name || "" })));
    setDraftNote(row.changeNote || "");
    setDirty(false);
    setBulkText("");
    setEditing(true);
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("ยกเลิกการแก้ไข? การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป")) return;
    setEditing(false);
    setDirty(false);
  };

  const saveDraft = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await request(`/api/holidays/draft/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidays: draftEntries, changeNote: draftNote, expectedUpdatedAt: draft.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setEditing(false);
      setDirty(false);
      setToast({ kind: "success", msg: `บันทึก Version ${saved.versionNumber} ฉบับร่างแล้ว (${(saved.holidays || []).length} วัน)` });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const transitionDraft = async () => {
    if (!draft || !confirm) return;
    const action = confirm.action;
    setBusy(true);
    try {
      await request(`/api/holidays/draft/${draft.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: draft.updatedAt }),
      }, action === "publish" ? "เผยแพร่ปฏิทินวันหยุดไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setEditing(false);
      setToast({
        kind: "success",
        msg: action === "publish" ? `เผยแพร่ Version ${draft.versionNumber} แล้ว` : `เก็บ Version ${draft.versionNumber} เป็นประวัติแล้ว`,
      });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  // ── แก้ไขชุดวันหยุดใน state (เฉพาะโหมดแก้ไข) ──
  const addEntries = (entries) => {
    let added = 0; let skipped = 0;
    setDraftEntries((prev) => {
      const seen = new Set(prev.map((h) => h.date));
      const next = [...prev];
      for (const entry of entries) {
        if (seen.has(entry.date)) { skipped++; continue; }
        seen.add(entry.date);
        next.push({ date: entry.date, name: (entry.name || "").trim() });
        added++;
      }
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
    if (added) setDirty(true);
    return { added, skipped };
  };
  const removeEntry = (date) => {
    setDraftEntries((prev) => prev.filter((h) => h.date !== date));
    setDirty(true);
  };

  // คลิกวันบนปฏิทิน (โหมดแก้ไข): วันหยุด→ลบ, วันทำการ→เพิ่ม (เสาร์-อาทิตย์ข้าม)
  const onDayClick = (iso, isWeekend) => {
    if (!editing || isWeekend) return;
    if (holidayMap.has(iso)) {
      if (window.confirm(`ลบวันหยุด ${fmt(iso)}${holidayMap.get(iso) ? ` (${holidayMap.get(iso)})` : ""} ออกจากฉบับร่าง?`)) removeEntry(iso);
    } else {
      const nm = window.prompt(`เพิ่มวันหยุด ${fmt(iso)}\nชื่อวันหยุด (เว้นว่างได้):`, "");
      if (nm !== null) addEntries([{ date: iso, name: nm }]);
    }
  };

  const submitAddForm = (e) => {
    e.preventDefault();
    if (!isValidHolidayDate(formDate)) { setToast({ kind: "error", msg: "กรุณาเลือกวันที่ให้ถูกต้อง" }); return; }
    const { added } = addEntries([{ date: formDate, name: formName }]);
    if (!added) { setToast({ kind: "error", msg: "วันหยุดนี้มีอยู่ในฉบับร่างแล้ว" }); return; }
    setFormDate("");
    setFormName("");
  };

  // วางทั้งชุด (ทางลัดกรอกวันหยุดปีใหม่): บรรทัดละ "YYYY-MM-DD ชื่อวันหยุด"
  const submitBulk = () => {
    const { entries, errors } = parseHolidayLines(bulkText);
    if (errors.length) { setToast({ kind: "error", msg: errors[0] }); return; }
    if (!entries.length) { setToast({ kind: "error", msg: "ยังไม่มีบรรทัดที่อ่านได้" }); return; }
    const { added, skipped } = addEntries(entries);
    setBulkText("");
    setToast({ kind: "success", msg: `เพิ่ม ${added} วันเข้าฉบับร่าง${skipped ? ` (ข้าม ${skipped} วันที่ซ้ำ)` : ""}` });
  };

  // ── ปฏิทิน ──
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = first.getDay(); // 0=อา.
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < startPad; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);
  const monthHolidayCount = useMemo(
    () => holidays.filter((h) => h.date.startsWith(`${cursor.y}-${pad(cursor.m + 1)}`)).length,
    [holidays, cursor],
  );
  const goMonth = (delta) => setCursor((c) => {
    const m = c.m + delta;
    if (m < 0) return { y: c.y - 1, m: 11 };
    if (m > 11) return { y: c.y + 1, m: 0 };
    return { y: c.y, m };
  });

  const selected = drawer?.row;

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><CalendarDays size={22} /></span>{" "}
            วันหยุด (ปฏิทินทำการ)
          </h1>
          <p>วันหยุดบริษัท/นักขัตฤกษ์ที่ระบบใช้นับ &quot;วันทำการ&quot; ของไทม์ไลน์ — จัดการแบบมีเวอร์ชัน แก้ไขในฉบับร่างแล้วเผยแพร่ทั้งชุด</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div className="segmented">
            <button onClick={() => setTab("calendar")} className={tab === "calendar" ? "active" : ""}><CalendarRange size={14} /> ปฏิทิน</button>
            <button onClick={() => setTab("list")} className={tab === "list" ? "active" : ""}><List size={14} /> รายการ</button>
          </div>
          {editing
            ? <span className={`${styles.badge} ${styles.draft}`}>กำลังแก้ไขฉบับร่าง Version {draft?.versionNumber} · {holidays.length} วัน</span>
            : <div className="pill ok">{published ? `Version ${published.versionNumber} · ` : ""}ทั้งหมด {holidays.length} วัน</div>}
        </div>
      </div>

      <div className="info-note">
        <Info size={16} />
        <div>
          เสาร์–อาทิตย์ถือเป็นวันหยุดเสมอโดยอัตโนมัติ — ที่นี่ใส่เฉพาะ<b>วันหยุดเพิ่มเติม</b> (นักขัตฤกษ์/วันหยุดบริษัท)
          {canManage && <> · การแก้ไขทำใน<b>ฉบับร่าง</b>และมีผลเมื่อ<b>เผยแพร่</b>เท่านั้น</>}
          {editing && tab === "calendar" && " · คลิกที่วัน (จันทร์–ศุกร์) เพื่อเพิ่ม/ลบวันหยุดในฉบับร่าง"}
          {" "}การเปลี่ยนแปลงมีผลกับโครงการ<b>ที่สร้าง/แก้ไขหลังจากนี้</b>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={8} />
      ) : (
        <div className={styles.layout}>
          {canManage && lifecycleError && (
            <div className="glass-panel" role="alert" style={{ padding: "14px 16px", borderColor: "var(--red)", color: "var(--red)" }}>
              {lifecycleError}
            </div>
          )}

          {canManage && draft && !editing && (
            <section className={`glass-panel ${styles.draftPanel}`} aria-label="ฉบับร่างที่กำลังแก้ไข">
              <Edit3 size={20} aria-hidden="true" />
              <div className={styles.draftCopy}>
                <strong>Version {draft.versionNumber} กำลังเป็นฉบับร่าง ({(draft.holidays || []).length} วัน{draftDiff ? ` · เพิ่ม ${draftDiff.added} / ลบ ${draftDiff.removed} เทียบกับฉบับเผยแพร่` : ""})</strong>
                <p>บันทึกล่าสุด {fmtStamp(draft.updatedAt)} · ชุดวันหยุดยังไม่มีผลกับไทม์ไลน์จนกว่าจะยืนยันเผยแพร่</p>
              </div>
              <div className={styles.draftActions}>
                <button type="button" className="btn ghost" onClick={() => setConfirm({ action: "archive" })} disabled={busy}>
                  <Archive size={15} /> เก็บฉบับร่าง
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirm({ action: "publish" })}
                  disabled={busy || !hasPublishableChangeNote(draft)}
                  title={!hasPublishableChangeNote(draft) ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}
                >
                  <Send size={15} /> เผยแพร่
                </button>
                <button type="button" className="btn btn-accent" onClick={() => openEdit()} disabled={busy}>
                  <Edit3 size={15} /> แก้ไขฉบับร่าง
                </button>
              </div>
            </section>
          )}

          {editing && (
            <section className={`glass-panel ${styles.editBar}`} aria-label="บันทึกฉบับร่าง">
              <label>
                หมายเหตุการเปลี่ยนแปลง <b>*</b>
                <input
                  type="text"
                  className="premium-input"
                  value={draftNote}
                  maxLength={500}
                  placeholder="เช่น เพิ่มวันหยุดนักขัตฤกษ์ปี 2027 ตามประกาศ ครม."
                  onChange={(e) => { setDraftNote(e.target.value); setDirty(true); }}
                />
              </label>
              <div className={styles.editBarActions}>
                <button type="button" className="btn ghost" onClick={cancelEdit} disabled={busy}>ยกเลิก</button>
                <button type="button" className="btn btn-accent" onClick={saveDraft} disabled={busy || !dirty}>
                  {busy ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
                </button>
              </div>
            </section>
          )}

          {tab === "calendar" ? (
            <div className="glass-panel" style={{ padding: "18px 20px" }}>
              {/* month nav */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <button onClick={() => goMonth(-1)} className="btn-icon" aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า"><ChevronLeft size={16} /></button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "17px", fontWeight: 700 }}>{MONTHS_TH[cursor.m]} {cursor.y}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{monthHolidayCount} วันหยุดในเดือนนี้</div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })} className="btn sm">วันนี้</button>
                  <button onClick={() => goMonth(1)} className="btn-icon" aria-label="เดือนถัดไป" title="เดือนถัดไป"><ChevronRight size={16} /></button>
                </div>
              </div>

              {/* weekday header */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px", marginBottom: "6px" }}>
                {WEEKDAYS_TH.map((w, i) => (
                  <div key={w} style={{ textAlign: "center", fontSize: "12px", fontWeight: 600, color: i === 0 || i === 6 ? "var(--red)" : "var(--text-3)", padding: "4px 0" }}>{w}</div>
                ))}
              </div>

              {/* day grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={`e${i}`} />;
                  const iso = toISO(cursor.y, cursor.m, d);
                  const dow = new Date(cursor.y, cursor.m, d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const hol = holidayMap.has(iso);
                  const holName = holidayMap.get(iso);
                  const isToday = iso === todayISO;
                  const clickable = editing && !isWeekend;
                  const bg = hol ? "color-mix(in srgb, var(--red) 14%, transparent)" : isWeekend ? "var(--panel-2)" : "var(--panel)";
                  const borderColor = isToday ? "var(--accent)" : hol ? "color-mix(in srgb, var(--red) 40%, transparent)" : "var(--border)";
                  return (
                    <div
                      key={iso}
                      onClick={() => onDayClick(iso, isWeekend)}
                      title={hol ? (holName || "วันหยุด") : isWeekend ? "วันหยุดสุดสัปดาห์" : clickable ? "คลิกเพื่อเพิ่มวันหยุดในฉบับร่าง" : ""}
                      style={{
                        minHeight: "74px", borderRadius: "10px", padding: "6px 8px",
                        background: bg, border: `${isToday ? "2px" : "1px"} solid ${borderColor}`,
                        cursor: clickable ? "pointer" : "default", display: "flex", flexDirection: "column", gap: "2px",
                        transition: "all 0.15s", position: "relative",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: isToday ? 700 : 500, color: isWeekend && !hol ? "var(--text-3)" : hol ? "var(--red)" : "var(--text)" }}>{d}</span>
                      {hol && <span style={{ fontSize: "10.5px", color: "var(--red)", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{holName || "วันหยุด"}</span>}
                      {isWeekend && !hol && <span style={{ fontSize: "10px", color: "var(--text-3)" }}>หยุด</span>}
                    </div>
                  );
                })}
              </div>

              {/* legend */}
              <div style={{ display: "flex", gap: "16px", marginTop: "14px", fontSize: "11.5px", color: "var(--text-3)", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "color-mix(in srgb, var(--red) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)" }} /> วันหยุดนักขัตฤกษ์/บริษัท</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--panel-2)", border: "1px solid var(--border)" }} /> เสาร์-อาทิตย์ (หยุดประจำ)</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "12px", height: "12px", borderRadius: "3px", border: "2px solid var(--accent)" }} /> วันนี้</span>
              </div>
            </div>
          ) : (
            <>
              {editing && (
                <div className="glass-panel" style={{ padding: "16px 18px" }}>
                  <form onSubmit={submitAddForm} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>วันที่ <span className="text-[var(--red)]">*</span></label>
                      <DateInput value={formDate} onChange={setFormDate} style={{ width: "180px" }} />
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: "200px" }}>
                      <label>ชื่อวันหยุด</label>
                      <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="เช่น วันสงกรานต์, หยุดบริษัท" className="premium-input w-full" maxLength={200} />
                    </div>
                    <button type="submit" className="btn btn-primary flex items-center gap-1.5" style={{ height: "38px" }}>
                      <Plus size={16} /> เพิ่มเข้าฉบับร่าง
                    </button>
                  </form>
                  {/* ทางลัดกรอกวันหยุดทั้งปี: วางรายการจากประกาศ ครม. แล้วเพิ่มทีเดียว */}
                  <div className={styles.bulkPanel}>
                    <p><ListPlus size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> เพิ่มทั้งชุด (เช่น วันหยุดปีใหม่ทั้งปี): วางบรรทัดละ <code>YYYY-MM-DD ชื่อวันหยุด</code></p>
                    <textarea
                      className="premium-input"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={"2027-01-01 วันขึ้นปีใหม่\n2027-04-13 วันสงกรานต์"}
                    />
                    <div className={styles.bulkActions}>
                      <button type="button" className="btn" onClick={submitBulk} disabled={!bulkText.trim()}>
                        <ListPlus size={15} /> เพิ่มทั้งชุดเข้าฉบับร่าง
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {holidays.length === 0 ? (
                <EmptyState icon={CalendarDays}>ยังไม่มีวันหยุดใน{editing ? "ฉบับร่าง" : "ระบบ"}</EmptyState>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {byYear.map(([year, items]) => (
                    <div key={year} className="glass-panel" style={{ padding: "16px 18px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>ปี {year} <span style={{ color: "var(--text-3)", fontWeight: 400 }}>({items.length} วัน)</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
                        {items.map((h) => (
                          <div key={h.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 600, fontFamily: "monospace" }}>{fmt(h.date)}</div>
                              <div style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name || "-"}</div>
                            </div>
                            {editing && (
                              <button className="btn-icon danger" onClick={() => { if (window.confirm(`ลบวันหยุด ${fmt(h.date)}${h.name ? ` (${h.name})` : ""} ออกจากฉบับร่าง?`)) removeEntry(h.date); }} aria-label="ลบวันหยุด" title="ลบ" style={{ flexShrink: 0 }}><Trash2 size={15} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {canManage && lifecycle && (
            <section className={`glass-panel ${styles.historyPanel}`} aria-labelledby="holiday-version-history-title">
              {/* ปุ่มสร้างฉบับร่าง = ปุ่มเพิ่มของเนื้อหาเวอร์ชัน — ขวาสุดของ card header ตามกติกา Page Header */}
              <header className={styles.panelHeader}>
                <div>
                  <h2 id="holiday-version-history-title">ประวัติเวอร์ชัน</h2>
                  <p>Published และ Archived เป็นหลักฐานถาวรและแก้ไขไม่ได้</p>
                </div>
                {!draft && (
                  <button type="button" className="btn btn-accent" onClick={createDraft} disabled={busy}>
                    <FilePlus2 size={16} /> สร้างฉบับร่าง
                  </button>
                )}
              </header>
              <div className={`premium-table-wrapper ${styles.historyTable}`}>
                <table className="premium-table">
                  <thead><tr><th>Version</th><th>สถานะ</th><th style={{ textAlign: "right" }}>จำนวนวัน</th><th>หมายเหตุ</th><th>ผู้ดำเนินการ</th><th>วันที่</th><th aria-label="การทำงาน" /></tr></thead>
                  <tbody>
                    {(lifecycle.versions || []).map((row) => (
                      <tr key={row.id}>
                        <td><strong>Version {row.versionNumber}</strong></td>
                        <td><StatusBadge status={row.status} /></td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(row.holidays || []).length}</td>
                        <td>{row.changeNote || "-"}</td>
                        <td>{actorOf(row)}</td>
                        <td>{fmtStamp(row.publishedAt || row.archivedAt || row.updatedAt)}</td>
                        <td><button type="button" className="btn ghost sm" onClick={() => setDrawer({ row })}><Eye size={14} /> ดูรายละเอียด</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.historyCards}>
                {(lifecycle.versions || []).map((row) => (
                  <article key={row.id} className={styles.card}>
                    <div className={styles.cardHead}><strong>Version {row.versionNumber} · {(row.holidays || []).length} วัน</strong><StatusBadge status={row.status} /></div>
                    <p>{row.changeNote || "ไม่มีหมายเหตุ"}</p>
                    <small>{actorOf(row)} · {fmtStamp(row.publishedAt || row.archivedAt || row.updatedAt)}</small>
                    <button type="button" className="btn ghost" onClick={() => setDrawer({ row })}><Eye size={15} /> ดูรายละเอียด</button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <RecordDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={`ปฏิทินวันหยุด Version ${selected?.versionNumber || "-"}`}
        subtitle="เวอร์ชันที่เผยแพร่หรือเก็บถาวรจะแก้ไขไม่ได้"
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        footer={<button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>}
      >
        {selected && (
          <div className={styles.drawerBody}>
            <section className={styles.drawerSection}>
              <h4>ข้อมูลเวอร์ชัน</h4>
              <div className={styles.detailGrid}>
                <div><span>จำนวนวันหยุด</span><strong>{(selected.holidays || []).length} วัน</strong></div>
                <div><span>สถานะ</span><strong>{holidayCalendarStatusLabel(selected.status)}</strong></div>
                <div className={styles.full}><span>หมายเหตุ</span><strong>{selected.changeNote || "-"}</strong></div>
                <div><span>สร้างโดย</span><strong>{selected.createdByName || "ระบบ"}</strong></div>
                <div><span>สร้างเมื่อ</span><strong>{fmtStamp(selected.createdAt)}</strong></div>
                <div><span>ดำเนินการล่าสุดโดย</span><strong>{actorOf(selected)}</strong></div>
                <div><span>เวลาล่าสุด</span><strong>{fmtStamp(selected.publishedAt || selected.archivedAt || selected.updatedAt)}</strong></div>
              </div>
            </section>
            {[...new Set((selected.holidays || []).map((h) => h.date.slice(0, 4)))].sort().map((year) => (
              <section key={year} className={styles.drawerSection}>
                <h4>ปี {year} ({(selected.holidays || []).filter((h) => h.date.startsWith(year)).length} วัน)</h4>
                <div className={styles.drawerHolidayList}>
                  {(selected.holidays || []).filter((h) => h.date.startsWith(year)).map((h) => (
                    <div key={h.date}><code>{fmt(h.date)}</code><span>{h.name || "-"}</span></div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title="ยืนยันเผยแพร่ปฏิทินวันหยุด"
        description={`Version ${draft?.versionNumber || "-"} (${(draft?.holidays || []).length} วัน${draftDiff ? ` · เพิ่ม ${draftDiff.added} / ลบ ${draftDiff.removed}` : ""}) จะเป็นปฏิทินที่ระบบใช้นับวันทำการ`}
        detail="Published version เดิมจะถูกเก็บถาวร มีผลกับไทม์ไลน์ที่สร้าง/คำนวณใหม่หลังจากนี้ — โครงการเดิมไม่ถูกคำนวณย้อนหลัง"
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <ConfirmDialog
        open={confirm?.action === "archive"}
        title="เก็บฉบับร่างเป็นประวัติ"
        description={`Version ${draft?.versionNumber || "-"} จะถูกปิดและแก้ไขต่อไม่ได้`}
        detail="ปฏิทินวันหยุดเวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง"
        confirmLabel="เก็บฉบับร่าง"
        tone="danger"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
