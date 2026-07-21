"use client";
// ปฏิทินวันหยุด — ข้อมูลปฏิบัติการ แก้ตรงบนตารางเดิม (Decision 0012 ฉบับแก้ไขครั้งที่ 2:
// ไม่ใช้ชั้นร่าง/เผยแพร่) — ทุกการเพิ่ม/ลบยืนยันผ่าน ConfirmDialog ก่อนเสมอ (no-auto-save)
import { useState, useEffect, useMemo } from "react";
import { CalendarDays, Plus, Trash2, Info, ChevronLeft, ChevronRight, List, CalendarRange } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateInput from "@/components/ui/DateInput";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fmt = (d) => {
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return `${WEEKDAYS_TH[dt.getDay()]} ${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};

export default function HolidaysPage() {
  const canManage = useCan("master:manage");
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("calendar"); // calendar | list
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  // การเขียนทุกครั้งผ่าน dialog นี้: { type: 'add'|'delete', date, name }
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const load = async () => {
    try {
      const res = await fetch("/api/holidays");
      const d = res.ok ? await res.json() : [];
      setHolidays(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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

  // ── API helpers ──
  const addHoliday = async (d, nm) => {
    const res = await fetch("/api/holidays", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: d, name: nm || "" }),
    });
    if (res.ok) { const h = await res.json(); setHolidays((p) => [...p, h].sort((a, b) => a.date.localeCompare(b.date))); return true; }
    setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "เพิ่มไม่สำเร็จ" });
    return false;
  };
  const removeHoliday = async (d) => {
    const res = await fetch(`/api/holidays/${d}`, { method: "DELETE" });
    if (res.ok) { setHolidays((p) => p.filter((x) => x.date !== d)); return true; }
    setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ" });
    return false;
  };

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    if (pending.type === "add") {
      if (await addHoliday(pending.date, pending.name)) {
        setToast({ kind: "success", msg: `เพิ่มวันหยุด ${fmt(pending.date)} แล้ว` });
        setDate(""); setName("");
      }
    } else if (await removeHoliday(pending.date)) {
      setToast({ kind: "success", msg: `ลบวันหยุด ${fmt(pending.date)} แล้ว` });
    }
    setBusy(false);
    setPending(null);
  };

  const submitForm = (e) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setToast({ kind: "error", msg: "กรุณาเลือกวันที่" }); return; }
    setPending({ type: "add", date, name });
  };

  // คลิกวันบนปฏิทิน (supervisor): วันหยุด→ลบ, วันทำการ→เพิ่ม (เสาร์-อาทิตย์หยุดอยู่แล้ว ข้าม)
  // prompt = กรอกชื่อเท่านั้น — การบันทึกจริงยังต้องผ่าน ConfirmDialog อีกชั้น
  const onDayClick = (iso, isWeekend) => {
    if (!canManage || isWeekend) return;
    if (holidayMap.has(iso)) {
      setPending({ type: "delete", date: iso, name: holidayMap.get(iso) });
    } else {
      const nm = prompt(`เพิ่มวันหยุด ${fmt(iso)}\nชื่อวันหยุด (เว้นว่างได้):`, "");
      if (nm !== null) setPending({ type: "add", date: iso, name: nm });
    }
  };

  // สร้างเซลล์ปฏิทิน (รวมช่องว่างต้นเดือน)
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="segmented">
            <button onClick={() => setTab("calendar")} className={tab === "calendar" ? "active" : ""}><CalendarRange size={14} /> ปฏิทิน</button>
            <button onClick={() => setTab("list")} className={tab === "list" ? "active" : ""}><List size={14} /> รายการ</button>
          </div>
          <div className="pill ok">ทั้งหมด {holidays.length} วัน</div>
        </div>
      </div>

      <div className="info-note">
        <Info size={16} />
        <div>เสาร์–อาทิตย์ถือเป็นวันหยุดเสมอโดยอัตโนมัติ — ที่นี่ใส่เฉพาะ<b>วันหยุดเพิ่มเติม</b> (นักขัตฤกษ์/วันหยุดบริษัท){canManage && tab === "calendar" && " · คลิกที่วัน (จันทร์–ศุกร์) เพื่อเพิ่ม/ลบวันหยุด"} การเปลี่ยนแปลงมีผลกับโครงการ<b>ที่สร้าง/แก้ไขหลังจากนี้</b></div>
      </div>

      {loading ? (
        <SkeletonRows rows={8} />
      ) : tab === "calendar" ? (
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
              const clickable = canManage && !isWeekend;
              const bg = hol ? "color-mix(in srgb, var(--red) 14%, transparent)" : isWeekend ? "var(--panel-2)" : "var(--panel)";
              const borderColor = isToday ? "var(--accent)" : hol ? "color-mix(in srgb, var(--red) 40%, transparent)" : "var(--border)";
              return (
                <div
                  key={iso}
                  onClick={() => onDayClick(iso, isWeekend)}
                  title={hol ? (holName || "วันหยุด") : isWeekend ? "วันหยุดสุดสัปดาห์" : clickable ? "คลิกเพื่อเพิ่มวันหยุด" : ""}
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
          {canManage && (
            <form onSubmit={submitForm} className="glass-panel" style={{ padding: "16px 18px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>วันที่ <span className="text-[var(--red)]">*</span></label>
                <DateInput value={date} onChange={setDate} style={{ width: "180px" }} />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: "200px" }}>
                <label>ชื่อวันหยุด</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น วันสงกรานต์, หยุดบริษัท" className="premium-input w-full" />
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary flex items-center gap-1.5" style={{ height: "38px" }}>
                <Plus size={16} /> เพิ่มวันหยุด
              </button>
            </form>
          )}

          {holidays.length === 0 ? (
            <EmptyState icon={CalendarDays}>ยังไม่มีวันหยุดในระบบ</EmptyState>
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
                        {canManage && (
                          <button className="btn-icon danger" onClick={() => setPending({ type: "delete", date: h.date, name: h.name })} aria-label="ลบวันหยุด" title="ลบ" style={{ flexShrink: 0 }}><Trash2 size={15} /></button>
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

      <ConfirmDialog
        open={!!pending}
        tone={pending?.type === "delete" ? "danger" : "default"}
        title={pending?.type === "delete" ? "ยืนยันลบวันหยุด" : "ยืนยันเพิ่มวันหยุด"}
        description={pending
          ? pending.type === "delete"
            ? `ลบวันหยุด ${fmt(pending.date)}${pending.name ? ` (${pending.name})` : ""} ออกจากปฏิทินทำการ?`
            : `เพิ่มวันหยุด ${fmt(pending.date)}${pending.name ? ` (${pending.name})` : ""} ลงปฏิทินทำการ?`
          : ""}
        detail={pending?.type === "delete"
          ? "ลบแล้ววันนี้กลับเป็นวันทำการทันทีและกู้คืนไม่ได้ — ไทม์ไลน์โครงการที่สร้าง/แก้ไขหลังจากนี้จะนับวันนี้เป็นวันทำการ"
          : "มีผลกับไทม์ไลน์โครงการที่สร้าง/แก้ไขหลังจากนี้"}
        confirmLabel={pending?.type === "delete" ? "ลบวันหยุด" : "เพิ่มวันหยุด"}
        busy={busy}
        onConfirm={runPending}
        onClose={() => { if (!busy) setPending(null); }}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
