"use client";
// ── ไลน์ผลิต + กำลังผลิตรายวัน (mig 0186 · PR-1) ─────────────────────────
//
// ⭐ ก่อนหน้านี้ **โรงงานไม่มีตัวตนในระบบเลย** — ขั้น "ผลิตสินค้า" บนไทม์ไลน์เป็น
// แท่งลอย ๆ ที่ไม่ผูกกับไลน์ไหน กำลังผลิตไม่ถูกนับ หน้านี้คือชั้น "กำลัง" ที่
// ตารางผลิต (PR-2/PR-3) จะเอาไปเทียบกับคิวงานจริง
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, Factory, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateInput from "@/components/ui/DateInput";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import ProductionLineModal from "@/components/pm/ProductionLineModal";
import { LINE_KIND_LABELS, capacityOn } from "@/lib/pm/productionLines";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import { canEditProduction } from "@/lib/permissions";
import styles from "./page.module.css";

const todayIso = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export default function ProductionLinesPage() {
  const role = useRole();
  const team = useTeam();
  const department = useDepartment();
  // ⚠️ cap อย่างเดียวไม่พอ — `staff` ถือ production:edit ทั้ง PC/PD/WH/QC/TS
  // ฝ่ายคือตัวกั้นจริง (เหมือนที่ server ทำใน requireProduction)
  const canEdit = useMemo(() => canEditProduction({ role, team, department }), [role, team, department]);

  const [lines, setLines] = useState([]);
  const [capacityDays, setCapacityDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);

  const [formLine, setFormLine] = useState(undefined); // undefined = ปิด · null = สร้าง · row = แก้
  const [pendingDelete, setPendingDelete] = useState(null);
  const [expanded, setExpanded] = useState(null);       // lineId ที่กางแผงกำลังรายวัน
  const [dayForm, setDayForm] = useState({ date: todayIso(), capacityPerDay: "0", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/production/lines");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไลน์ผลิตไม่สำเร็จ");
      setLines(Array.isArray(data?.lines) ? data.lines : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีไลน์" — โหลดพังกับยังไม่ตั้งค่า
      // หน้าตาเหมือนกันจนแยกไม่ออก (บทเรียนจากหน้าปฏิทินวันหยุด)
      setLoadError(e.message || "โหลดข้อมูลไลน์ผลิตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadDays = useCallback(async (lineId) => {
    try {
      const res = await fetch(`/api/production/lines/${lineId}/capacity`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดวันปรับกำลังไม่สำเร็จ");
      setCapacityDays(Array.isArray(data) ? data : []);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
  }, []);

  const toggleExpand = (lineId) => {
    if (expanded === lineId) { setExpanded(null); return; }
    setExpanded(lineId);
    setCapacityDays([]);
    setDayForm({ date: todayIso(), capacityPerDay: "0", reason: "" });
    loadDays(lineId);
  };

  const saveLine = async (form) => {
    const editing = !!formLine;
    const url = editing ? `/api/production/lines/${formLine.id}` : "/api/production/lines";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกไลน์ ${data.code} แล้ว` : `เพิ่มไลน์ ${data.code} แล้ว` });
    await load();
  };

  const removeLine = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/production/lines/${pendingDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: `ลบไลน์ ${pendingDelete.code} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveDay = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/production/lines/${expanded}/capacity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dayForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      setDayForm({ date: todayIso(), capacityPerDay: "0", reason: "" });
      await loadDays(expanded);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const removeDay = async (date) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/production/lines/${expanded}/capacity/${date}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      await loadDays(expanded);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const today = useMemo(() => todayIso(), []);
  const expandedLine = lines.find((l) => l.id === expanded) || null;

  return (
    <Workspace
      icon={<Factory size={20} aria-hidden="true" />}
      title="ไลน์ผลิต"
      subtitle="กำลังผลิตต่อวันของแต่ละไลน์ — ฐานของตารางผลิต"
      headerRight={canEdit ? (
        <Button tone="primary" onClick={() => setFormLine(null)} icon={<Plus size={15} aria-hidden="true" />}>
          เพิ่มไลน์
        </Button>
      ) : null}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading || loadError ? (
        // โหลดพัง = โชว์เฉพาะข้อความผิดพลาด · ห้ามวาดหัวตารางเปล่าค้างไว้
        // เพราะตารางว่างอ่านได้ว่า "ยังไม่มีไลน์" ซึ่งคนละเรื่องกับ "โหลดไม่ได้"
        loading ? <SkeletonRows rows={4} /> : null
      ) : lines.length === 0 ? (
        <EmptyState icon={Factory} dashed={canEdit} onClick={canEdit ? () => setFormLine(null) : undefined}>
          {canEdit
            ? "ยังไม่มีไลน์ผลิตในระบบ — กดเพื่อเพิ่มไลน์แรก"
            : "ยังไม่มีไลน์ผลิตในระบบ"}
        </EmptyState>
      ) : (
        <TableShell>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อไลน์</th>
                <th>ประเภท</th>
                <th className={styles.numCol}>กำลัง/วันทำการ</th>
                <th>สถานะ</th>
                <th>วันที่กำลังไม่ปกติ</th>
                {canEdit && <th aria-label="การทำงาน" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={line.isActive === false ? styles.inactive : undefined}>
                  <td className="mono">{line.code}</td>
                  <td>{line.name}</td>
                  <td>{LINE_KIND_LABELS[line.kind] || line.kind}</td>
                  <td className={styles.numCol}>
                    {/* ยังไม่กรอกกำลัง ≠ กำลัง 0 — ต้องอ่านออกจากตารางทันทีว่าอันไหนคืออะไร */}
                    {line.capacityPerDay == null
                      ? <span className={styles.unknown}>ยังไม่ระบุ</span>
                      : `${Number(line.capacityPerDay).toLocaleString("th-TH")} ${line.unit || ""}`}
                  </td>
                  <td>
                    {line.isActive === false
                      ? <span className="ui-badge">ปิดใช้งาน</span>
                      : <span className="ui-badge">ใช้งาน</span>}
                  </td>
                  <td>
                    <Button tone="neutral" variant="quiet" onClick={() => toggleExpand(line.id)} icon={<CalendarOff size={14} aria-hidden="true" />}>
                      {expanded === line.id ? "ปิดแผง" : "จัดการ"}
                    </Button>
                  </td>
                  {canEdit && (
                    <td>
                      <div className={styles.rowActions}>
                        <Button iconOnly tone="neutral" variant="quiet" aria-label={`แก้ไขไลน์ ${line.code}`} onClick={() => setFormLine(line)} icon={<Pencil size={14} aria-hidden="true" />} />
                        <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบไลน์ ${line.code}`} onClick={() => setPendingDelete(line)} icon={<Trash2 size={14} aria-hidden="true" />} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {/* ── แผงกำลังผลิตรายวันของไลน์ที่กางอยู่ ───────────────────────────── */}
      {expandedLine && (
        <WorkspaceSection
          className={styles.dayPanel}
          icon={<CalendarOff size={18} aria-hidden="true" />}
          title={`วันที่กำลังไม่ปกติ · ${expandedLine.code}`}
          subtitle="ซ่อมบำรุง เพิ่มกะ หรือปิดไลน์เฉพาะวัน · 0 = ปิดไลน์วันนั้น · ตั้งในเสาร์-อาทิตย์/วันหยุดได้ เพื่อเปิดกะพิเศษ"
        >
          {canEdit && (
            <div className={styles.dayForm}>
              <label className={styles.dayField}>
                <span>วันที่</span>
                {/* DateInput ส่ง iso string กลับมาตรง ๆ ไม่ใช่ event */}
                <DateInput value={dayForm.date} onChange={(iso) => setDayForm((f) => ({ ...f, date: iso }))} />
              </label>
              <label className={styles.dayField}>
                <span>กำลังผลิตวันนั้น</span>
                <Input type="number" min="0" step="any" value={dayForm.capacityPerDay} onChange={(e) => setDayForm((f) => ({ ...f, capacityPerDay: e.target.value }))} />
              </label>
              <label className={`${styles.dayField} ${styles.reasonField}`}>
                <span>เหตุผล</span>
                <Input value={dayForm.reason} onChange={(e) => setDayForm((f) => ({ ...f, reason: e.target.value }))} placeholder="ซ่อมบำรุงประจำปี" maxLength={200} />
              </label>
              <Button tone="primary" onClick={saveDay} disabled={busy}>บันทึกวัน</Button>
            </div>
          )}

          {capacityDays.length === 0 ? (
            <p className={styles.hint}>ยังไม่มีวันที่กำลังไม่ปกติ — ทุกวันทำการใช้กำลังมาตรฐานของไลน์</p>
          ) : (
            <TableShell>
              <table>
                <thead>
                  <tr><th>วันที่</th><th className={styles.numCol}>กำลัง</th><th>เหตุผล</th>{canEdit && <th aria-label="การทำงาน" />}</tr>
                </thead>
                <tbody>
                  {capacityDays.map((day) => (
                    <tr key={day.id} className={day.date < today ? styles.past : undefined}>
                      <td className="mono">{day.date}</td>
                      <td className={styles.numCol}>
                        {Number(day.capacityPerDay) === 0
                          ? <span className={styles.closed}>ปิดไลน์</span>
                          : `${Number(day.capacityPerDay).toLocaleString("th-TH")} ${expandedLine.unit || ""}`}
                      </td>
                      <td>{day.reason || "-"}</td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบค่ากำลังวันที่ ${day.date}`} onClick={() => removeDay(day.date)} disabled={busy} icon={<Trash2 size={14} aria-hidden="true" />} />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}

          {/* ตัวอย่างผลลัพธ์จริงของวันนี้ — ให้เห็นทันทีว่ากติกาข้างบนรวมกันแล้วได้เท่าไร */}
          <p className={styles.hint}>
            กำลังของไลน์นี้ในวันนี้ ({today}):{" "}
            <strong>
              {(() => {
                const map = new Map(capacityDays.map((d) => [d.date, Number(d.capacityPerDay)]));
                const value = capacityOn(expandedLine, today, map);
                if (value === null) return "ยังไม่ระบุ";
                if (value === 0) return "ปิด";
                return `${value.toLocaleString("th-TH")} ${expandedLine.unit || ""}`;
              })()}
            </strong>
          </p>
        </WorkspaceSection>
      )}

      <ProductionLineModal
        open={formLine !== undefined}
        line={formLine}
        onClose={() => setFormLine(undefined)}
        onSave={saveLine}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title="ลบไลน์ผลิต"
        message={pendingDelete ? `ลบไลน์ ${pendingDelete.code} (${pendingDelete.name}) ออกจากระบบ?` : ""}
        detail="ถ้าไลน์นี้เคยใช้วางคิวผลิตแล้ว ให้ปิดใช้งานแทนการลบ เพื่อไม่ให้ประวัติหาย"
        confirmLabel="ลบไลน์"
        busy={busy}
        onConfirm={removeLine}
        onClose={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
