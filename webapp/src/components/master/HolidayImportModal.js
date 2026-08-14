"use client";
// นำเข้าวันหยุดจากปฏิทินสาธารณะของ Google — พรีวิว → ติ๊ก/แก้ชื่อ → บันทึก
//
// ทำไมต้องมีขั้นให้คนดูก่อนเสมอ (ไม่ sync อัตโนมัติ): เทียบข้อมูลจริงปี 2026 แล้วพบว่า
// บริษัทหยุด "ไม่เท่ากับ" ปฏิทินราชการ — ไม่หยุดวันพืชมงคล ไม่หยุดตรุษจีน/คริสต์มาส
// แต่หยุด "วันเข้าพรรษา" ที่ Google ไม่มี และตั้งชื่อสั้นกว่าที่ Google ใช้มาก
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, RotateCw } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import SkeletonRows from "@/components/ui/Skeleton";
import styles from "./HolidayImportModal.module.css";
import { naText } from "@/lib/format";

const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
// ใช้ป้ายกลาง (.ui-badge) ไม่ทำรูปทรงเอง — สีสื่อความหมายเดียวกับทั้งระบบ
const ACTION_META = {
  new: { label: "เพิ่มใหม่", tone: "success" },
  renamed: { label: "ชื่อไม่ตรง", tone: "warning" },
  same: { label: "มีอยู่แล้ว", tone: "" },
};

// อ่านวันในสัปดาห์แบบ UTC — เหตุผลเดียวกับฝั่ง lib: Date ท้องถิ่นเลื่อนวันได้
const dayIndex = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export default function HolidayImportModal({ open, initialYear, onClose, onDone }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(initialYear || thisYear));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [draft, setDraft] = useState({}); // date → { checked, name }
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) setYear(String(initialYear || thisYear));
  }, [open, initialYear, thisYear]);

  const loadPreview = useCallback(async (targetYear) => {
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch("/api/holidays/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(targetYear) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ดึงปฏิทิน Google ไม่สำเร็จ");
      setPreview(data);
      // ติ๊กให้ล่วงหน้าเฉพาะวันหยุดราชการที่ยังไม่มีในระบบ — "วันสำคัญ" (ตรุษจีน/
      // วาเลนไทน์/คริสต์มาส) และการทับชื่อที่คนตั้งเองต้องกดเลือกเอง
      const next = {};
      for (const row of data.rows || []) {
        next[row.date] = { checked: row.action === "new" && row.kind === "public", name: row.name };
      }
      setDraft(next);
    } catch (err) {
      setError(err.message || "ดึงปฏิทิน Google ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadPreview(year);
  }, [open, year, loadPreview]);

  const rows = useMemo(() => preview?.rows || [], [preview]);
  const selected = useMemo(
    () => rows.filter((row) => draft[row.date]?.checked),
    [rows, draft],
  );
  const renamedSelected = useMemo(
    () => selected.filter((row) => row.action === "renamed" || (row.action === "same" && draft[row.date]?.name !== row.name)),
    [selected, draft],
  );
  const allChecked = rows.length > 0 && selected.length === rows.length;

  const toggleAll = () => {
    setDraft((current) => {
      const next = { ...current };
      for (const row of rows) next[row.date] = { ...next[row.date], checked: !allChecked };
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/holidays/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          rows: selected.map((row) => ({ date: row.date, name: draft[row.date]?.name ?? row.name })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      onDone?.({ year: Number(year), summary: data.summary, holidays: data.holidays });
    } catch (err) {
      setError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(thisYear - 1 + i));

  return (
    <>
      <Modal
        open={open}
        onClose={() => !busy && onClose?.()}
        title="นำเข้าวันหยุดจากปฏิทิน Google"
        size="lg"
        dismissible={!busy}
      >
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <span className={styles.toolbarLabel}>ปี</span>
            <Select value={year} onChange={(event) => setYear(event.target.value)} aria-label="เลือกปีที่นำเข้า" className={styles.yearPicker} disabled={loading || busy}>
              {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Button size="sm" icon={<RotateCw size={14} />} onClick={() => loadPreview(year)} disabled={loading || busy}>
              ดึงใหม่
            </Button>
            <span className="spacer" />
            {preview && (
              <span className={styles.summary}>
                เพิ่มใหม่ {preview.summary.new} · ชื่อไม่ตรง {preview.summary.renamed} · มีอยู่แล้ว {preview.summary.same}
              </span>
            )}
          </div>

          <p className={styles.hint}>
            ปฏิทินราชการ<b>ไม่เท่ากับ</b>วันหยุดบริษัท — ติ๊กเฉพาะวันที่บริษัทหยุดจริง และแก้ชื่อให้สั้นแบบที่ใช้กันในระบบได้เลย
            · วันหยุดที่มีอยู่แล้วและไม่มีในปฏิทิน Google จะไม่ถูกแตะ
          </p>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : error ? (
            <div className={styles.errorBox} role="alert">
              <AlertTriangle size={18} />
              <p>{error}</p>
              <Button size="sm" onClick={() => loadPreview(year)} disabled={busy}>ลองอีกครั้ง</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.errorBox}>
              <CalendarDays size={18} />
              <p>ไม่พบวันหยุดของปีนี้ในปฏิทิน Google</p>
            </div>
          ) : (
            <TableScroll className={styles.tableWrap}>
              {/* ตารางเปล่า — TableScroll เป็นคนจัดหัวตาราง/เส้นคั่น/จังหวะแถวให้ทั้งหมด */}
              <table>
                <thead>
                  <tr>
                    <th className={styles.checkCell}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
                    </th>
                    <th>วันที่</th>
                    <th className={styles.dowCell}>วัน</th>
                    <th>ชื่อวันหยุด (แก้ได้)</th>
                    <th>ชื่อในระบบตอนนี้</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const dow = dayIndex(row.date);
                    const weekend = dow === 0 || dow === 6;
                    const meta = ACTION_META[row.action] || ACTION_META.same;
                    const item = draft[row.date] || { checked: false, name: row.name };
                    return (
                      <tr key={row.date} className={item.checked ? undefined : styles.dim}>
                        <td className={styles.checkCell}>
                          <input
                            type="checkbox"
                            checked={item.checked}
                            aria-label={`เลือก ${row.date} ${row.name}`}
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              [row.date]: { ...item, checked: event.target.checked },
                            }))}
                          />
                        </td>
                        <td className={styles.dateCell}>{row.date}</td>
                        <td className={weekend ? styles.weekend : undefined}>{dow === null ? "-" : WEEKDAYS_TH[dow]}</td>
                        <td>
                          <Input
                            value={item.name}
                            maxLength={120}
                            aria-label={`ชื่อวันหยุด ${row.date}`}
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              [row.date]: { ...item, name: event.target.value },
                            }))}
                          />
                        </td>
                        <td className={styles.currentName}>{naText(row.current)}</td>
                        <td>
                          <div className={styles.tags}>
                            <span className={`ui-badge ${meta.tone}`.trim()}>{meta.label}</span>
                            {row.kind === "observance" && <span className="ui-badge">วันสำคัญ ไม่ใช่วันหยุดราชการ</span>}
                            {weekend && <span className="ui-badge">ตรงเสาร์–อาทิตย์อยู่แล้ว</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}

          <div className={styles.actions}>
            <Button variant="quiet" onClick={() => onClose?.()} disabled={busy}>ปิด</Button>
            <Button
              tone="primary"
              disabled={busy || loading || selected.length === 0}
              onClick={() => (renamedSelected.length ? setConfirmOpen(true) : save())}
            >
              {busy ? "กำลังบันทึก…" : `บันทึก ${selected.length} วันที่เลือก`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* เด้งยืนยันเฉพาะตอนที่จะทับชื่อที่คนตั้งไว้เอง — พรีวิวคือด่านทบทวนอยู่แล้ว */}
      <ConfirmDialog
        open={confirmOpen}
        tone="warn"
        title="ยืนยันการทับชื่อวันหยุดเดิม"
        description={`มี ${renamedSelected.length} วันที่ชื่อในระบบจะถูกเขียนทับด้วยชื่อจากรายการนี้`}
        detail={renamedSelected.slice(0, 4).map((row) => `${row.date}: ${row.current} → ${draft[row.date]?.name ?? row.name}`).join(" · ")}
        confirmLabel="บันทึกทับ"
        busy={busy}
        onConfirm={save}
        onClose={() => { if (!busy) setConfirmOpen(false); }}
      />
    </>
  );
}
