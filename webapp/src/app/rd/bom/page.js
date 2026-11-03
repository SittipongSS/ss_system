"use client";
// ── รอลง BOM — FG ที่ฝ่ายขายส่งมาให้ RD ลง BOM ใน Express (mig 0419 · มติเจ้าของ 03/11/2026) ──
//
// ⭐ **หน่วยของหน้านี้คือสินค้า** — สถานะอยู่บนแถวสินค้า (`bomStatus`) · ปุ่มส่ง/ดึงกลับของฝ่ายขายอยู่ที่หน้า FG
// ⭐ ใครใน RD ก็รับเรื่องได้ (มติข้อ 9) — คนกดรับ ชื่อติดแถว
// ⚠️ ไม่เขียนกติกาใหม่ — ทางเดินสถานะ/ข้อความเหตุมาจาก `lib/master/productBom.js` ตัวเดียวกับ API
// ⚠️ ด่านจอ = `canAccessRd` ตัวเดียวกับเมนู + API อ่าน + ฝั่ง RD ของ API เขียน
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Layers, Inbox, Undo2 } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Segmented from "@/components/ui/Segmented";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";
import Input from "@/components/ui/Input";
import AccessDenied from "@/components/ui/AccessDenied";
import SkeletonRows from "@/components/ui/Skeleton";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, fmtNumber, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment, useRole } from "@/lib/roleContext";
import { canAccessRd } from "@/lib/permissions";
import { accessState } from "@/lib/accessGate";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { BOM_CODE_MAX, BOM_NOTE_MAX } from "@/lib/master/productBom";
import { REJECTION_REASON_MAX } from "@/lib/master/approval";
import { BOM_BOARD_TABS, bomBoardTotals, bomTabRows, bomWaitingDays } from "@/lib/rd/bomBoard";
import styles from "./page.module.css";

const FORMULA_KIND_LABEL = { formula: "สูตร", scent: "กลิ่น", set: "สูตรในชุด" };

export default function RdBomPage() {
  const me = useCapUser();
  const department = useDepartment();
  const role = useRole();
  const allowed = useMemo(() => canAccessRd({ ...me, department }), [me, department]);
  const access = accessState(role, allowed);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("queued");
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { mode: 'done' | 'return', row }
  const startRun = useLatestRun();

  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) { setLoading(true); setLoadError(""); }
    try {
      const data = await apiJson("/api/rd/bom-board", { cache: "no-store" });
      if (!isLatest()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setLoadError(e.message);
    }
    if (isLatest()) setLoading(false);
  }, [startRun]);

  useEffect(() => { if (access === "allowed") load(); }, [access, load]);
  useRevalidateOnFocus(load);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า "รอมาแล้ว" จะนับผิดไปหนึ่งวัน
  const today = businessDate();
  const totals = useMemo(() => bomBoardTotals(rows, { todayIso: today }), [rows, today]);
  const shown = useMemo(() => bomTabRows(rows, tab), [rows, tab]);

  /* ยิงปุ่มหนึ่งครั้ง — ตีกลับ 409 (มีคนกดก่อน) = ดึงใหม่ · ⚠️ ล็อกปุ่มของแถวจนตารางใหม่มาถึง (กับดักเดียวกับหน้ารอใส่ราคา) */
  const post = async (row, json, okText) => {
    setBusyId(row.id);
    let saved = false;
    try {
      await apiJson(`/api/products/${row.id}/bom`, { method: "POST", json, fallbackError: "บันทึกสถานะ BOM ไม่สำเร็จ" });
      notifyToast(okText);
      saved = true;
    } catch (e) {
      notifyToast.error(e.message || "บันทึกสถานะ BOM ไม่สำเร็จ");
    }
    try { await load({ background: true }); } finally { setBusyId(null); }
    return saved;
  };

  const accept = async (row) => {
    const ok = await confirmAction({
      title: "รับเรื่องลง BOM",
      description: `รับ ${row.fgCode || "สินค้า"} ${naText(row.nameTh || row.nameEn)} มาลง BOM ใน Express`,
      detail: `ชื่อคุณจะติดแถวนี้ในฐานะคนรับเรื่อง · ฝ่ายขายดึงกลับไม่ได้แล้ว — ต้องแก้ ให้ตีกลับจากหน้านี้`,
      confirmLabel: "รับเรื่อง",
    });
    if (ok) await post(row, { action: "accept" }, "รับเรื่องแล้ว — ย้ายไปแท็บกำลังลง");
  };
  const reopen = async (row) => {
    const ok = await confirmAction({
      title: "ย้อนสถานะเป็นกำลังลง",
      description: `${row.fgCode || "สินค้า"} จะกลับไปอยู่แท็บกำลังลง`,
      detail: "รหัส BOM ที่ใส่ไว้ยังอยู่ · ฝ่ายขายยังแก้สูตร/ปริมาตรไม่ได้จนกว่าจะลงเสร็จหรือตีกลับ",
      confirmLabel: "ย้อนสถานะ",
    });
    if (ok) await post(row, { action: "reopen" }, "ย้อนเป็นกำลังลงแล้ว");
  };

  if (access === "loading") return <SkeletonRows rows={6} />;
  if (access === "denied") {
    return <AccessDenied icon={<Layers size={22} />} title="รอลง BOM" message="หน้านี้เป็นคิวงานของฝ่าย RD" />;
  }

  return (
    <Workspace
      icon={<Layers size={22} />}
      title="รอลง BOM"
      subtitle="FG ที่ฝ่ายขายส่งมาให้ลง BOM ใน Express — รับเรื่อง ลงเสร็จแล้วกดลงเสร็จ ฝ่ายขายเห็นสถานะที่หน้าสินค้า"
    >
      <div className="flex flex-col gap-4">
        {/* ⚠️ 0 ก็เป็นข้อมูล — ซ่อนตอนว่างแยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {!loading && !loadError ? (
          <MetricStrip aria-label="ยอดงานลง BOM ของฝ่าย">
            <Metric label="รอรับเรื่อง" value={`${totals.queued} รายการ`} tone={totals.queued > 0 ? "warning" : undefined} />
            <Metric label="กำลังลง" value={`${totals.in_progress} รายการ`} />
            <Metric label="รอนานสุด" value={totals.maxDays != null ? `${totals.maxDays} วัน` : NA} note="นับจากวันที่ฝ่ายขายส่ง · เฉพาะที่ยังค้าง" />
            <Metric label="ตีกลับ รอฝ่ายขาย" value={`${totals.returned} รายการ`} />
          </MetricStrip>
        ) : null}

        <ListPanel
          icon={<Layers size={17} aria-hidden="true" />}
          title="รายการลง BOM"
          subtitle={tab === "queued" || tab === "in_progress" ? "ส่งก่อนอยู่บนสุด" : "ขยับล่าสุดอยู่บนสุด"}
          count={loading || loadError ? null : `${shown.length} รายการ`}
          loading={loading}
          toolbar={(
            <Segmented
              ariaLabel="สถานะลง BOM"
              value={tab}
              onChange={setTab}
              /* โหลดพัง = ไม่รู้ยอด ⇒ ไม่มีป้าย (เลข 0 จะอ่านว่า "ไม่มีงาน" ทั้งที่อ่านไม่สำเร็จ) */
              options={BOM_BOARD_TABS.map((t) => ({ value: t.key, label: t.label, count: loading || loadError ? null : totals[t.key] }))}
            />
          )}
        >
          {loadError ? (
            <StatusNotice tone="error" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}>
              {loadError}
            </StatusNotice>
          ) : null}
          {!shown.length ? (
            loadError ? null : <EmptyState plain icon={Inbox}>ไม่มีรายการในแท็บนี้</EmptyState>
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>ลูกค้า</th>
                    <th>สูตร / กลิ่น</th>
                    <th className="num">ปริมาตร</th>
                    <th>{tab === "done" ? "ลงเสร็จ" : tab === "returned" ? "ตีกลับ" : "ส่งโดย"}</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <BomRow
                      key={row.id}
                      row={row}
                      today={today}
                      busy={busyId === row.id}
                      onAccept={() => accept(row)}
                      onDone={() => setDialog({ mode: "done", row })}
                      onReturn={() => setDialog({ mode: "return", row })}
                      onReopen={() => reopen(row)}
                    />
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </ListPanel>
      </div>

      {dialog ? (
        <BomDialog
          dialog={dialog}
          busy={busyId === dialog.row.id}
          onClose={() => setDialog(null)}
          onSubmit={async (json, okText) => {
            const saved = await post(dialog.row, json, okText);
            if (saved) setDialog(null);
          }}
        />
      ) : null}
    </Workspace>
  );
}

/* หนึ่งแถว = FG หนึ่งตัว — รหัสบน·ชื่อล่าง (กติกาแสดง entity ของตาราง) · ลิงก์ไปหน้าสินค้าที่รหัส */
function BomRow({ row, today, busy, onAccept, onDone, onReturn, onReopen }) {
  const waited = bomWaitingDays(row, today);
  return (
    <tr>
      <td>
        <Link className="linklike" href={`/database/products/${row.id}`}>{row.fgCode || NA}</Link>
        <div>{naText(row.nameTh)}</div>
        {row.nameEn ? <div className={styles.sub}>{row.nameEn}</div> : null}
        {row.round > 1 ? <div className={styles.sub}>ส่งรอบที่ {row.round}</div> : null}
      </td>
      <td>
        <div className={styles.code}>{row.customerArCode || NA}</div>
        <div>{naText(row.customerNameTh)}</div>
        {row.customerNameEn ? <div className={styles.sub}>{row.customerNameEn}</div> : null}
      </td>
      <td>
        {row.formula.items.length ? (
          <ul className={styles.items}>
            {row.formula.items.map((item, i) => (
              <li key={`${item.code || ""}-${i}`}>
                {/* สูตรที่ RD ยังไม่ใส่รหัส — โชว์ชื่ออย่างเดียว (ขีดนำหน้าชื่ออ่านเหมือนรายการย่อย) */}
                {item.code ? <><span className={styles.code}>{item.code}</span>{" "}</> : null}{naText(item.name)}
                {item.note ? <div className={styles.sub}>{item.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : <span className={styles.dim}>ไม่มีสูตร</span>}
        {row.formula.items.length ? <div className={styles.sub}>{FORMULA_KIND_LABEL[row.formula.kind]}</div> : null}
      </td>
      <td className="num">
        {row.volume != null ? `${fmtNumber(row.volume)}${row.volumeUnit ? ` ${row.volumeUnit}` : ""}` : NA}
        {row.saleUnit ? <div className={styles.sub}>ต่อ 1 {row.saleUnit}</div> : null}
      </td>
      <td>
        {row.status === "done" ? (
          <>
            <div>{row.bomCode ? <span className={styles.code}>{row.bomCode}</span> : <span className={styles.dim}>ไม่ระบุรหัส</span>}</div>
            <div className={styles.sub}>{[row.doneByName, row.doneAt ? fmtDate(row.doneAt) : null].filter(Boolean).join(" · ")}</div>
            {row.bomNote ? <div className={styles.sub}>{row.bomNote}</div> : null}
          </>
        ) : row.status === "returned" ? (
          <>
            <div>{naText(row.returnReason)}</div>
            <div className={styles.sub}>{[row.returnedByName, row.returnedAt ? fmtDate(row.returnedAt) : null].filter(Boolean).join(" · ")}</div>
          </>
        ) : (
          <>
            <div>{naText(row.sentByName)}</div>
            <div className={styles.sub}>
              {[row.sentAt ? fmtDate(row.sentAt) : null, waited != null ? `รอ ${waited} วัน` : null].filter(Boolean).join(" · ")}
            </div>
            {row.status === "in_progress" && row.acceptedByName ? <div className={styles.sub}>รับโดย {row.acceptedByName}</div> : null}
          </>
        )}
      </td>
      <td>
        <div className={styles.actions}>
          {row.status === "queued" ? (
            <>
              <Button size="sm" tone="primary" icon={<Check size={14} />} disabled={busy} onClick={onAccept}>รับเรื่อง</Button>
              <Button size="sm" variant="quiet" disabled={busy} onClick={onDone}>ลงเสร็จเลย</Button>
              <Button size="sm" variant="quiet" tone="danger" icon={<Undo2 size={14} />} disabled={busy} onClick={onReturn}>ตีกลับ</Button>
            </>
          ) : row.status === "in_progress" ? (
            <>
              <Button size="sm" tone="primary" icon={<Check size={14} />} disabled={busy} onClick={onDone}>ลงเสร็จ</Button>
              <Button size="sm" variant="quiet" tone="danger" icon={<Undo2 size={14} />} disabled={busy} onClick={onReturn}>ตีกลับ</Button>
            </>
          ) : row.status === "done" ? (
            <Button size="sm" variant="quiet" disabled={busy} onClick={onReopen}>ย้อนเป็นกำลังลง</Button>
          ) : <span className={styles.dim}>รอฝ่ายขายแก้แล้วส่งใหม่</span>}
        </div>
      </td>
    </tr>
  );
}

/* โมดัล "ลงเสร็จ" (รหัส BOM ไม่บังคับ · มติข้อ 7) และ "ตีกลับ" (เหตุผลบังคับ · มติข้อ 4) — บอกผลก่อนกดทั้งคู่ */
function BomDialog({ dialog, busy, onClose, onSubmit }) {
  const { mode, row } = dialog;
  const [code, setCode] = useState(row.bomCode || "");
  const [note, setNote] = useState(row.bomNote || "");
  const [reason, setReason] = useState("");
  const done = mode === "done";
  const subject = `${row.fgCode || "สินค้า"} ${naText(row.nameTh || row.nameEn)}`;
  return (
    <Modal open dismissible={!busy} onClose={onClose} size="sm" title={done ? "ลง BOM เสร็จ" : "ตีกลับเรื่องลง BOM"}>
      <p className={styles.hint}>{subject}</p>
      {done ? (
        <>
          <div className="form-group">
            <label htmlFor="bom-code">รหัส BOM ใน Express</label>
            <Input
              id="bom-code" mono value={code} maxLength={BOM_CODE_MAX}
              autoComplete="off" onChange={(e) => setCode(e.target.value)} disabled={busy}
            />
            <small className={styles.hint}>ไม่บังคับ — ใส่ไว้ให้ฝ่ายอื่นอ้างถึงได้จากหน้าสินค้า</small>
          </div>
          <div className="form-group">
            <label htmlFor="bom-note">หมายเหตุ</label>
            <Textarea id="bom-note" value={note} maxLength={BOM_NOTE_MAX} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </div>
          <p className={styles.hint}>
            กดแล้วฝ่ายขายคนที่ส่งได้กระดิ่ง · สูตร/กลิ่นและปริมาตรของสินค้านี้ล็อก (ต้องเปลี่ยน = สร้าง FG ใหม่ หรือแอดมิน) · กดผิดตัวย้อนได้จากแท็บลงเสร็จแล้ว
          </p>
        </>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="bom-reason">เหตุผลที่ตีกลับ <span className="text-[var(--red)]">*</span></label>
            <Textarea id="bom-reason" value={reason} maxLength={REJECTION_REASON_MAX} onChange={(e) => setReason(e.target.value)} disabled={busy} />
          </div>
          <p className={styles.hint}>
            กดแล้วแถวย้ายไปแท็บตีกลับ · ฝ่ายขายคนที่ส่งได้กระดิ่งพร้อมเหตุผล และแก้สูตร/ปริมาตรได้อีกครั้ง
          </p>
        </>
      )}
      <div className="action-bar">
        <Button variant="quiet" disabled={busy} onClick={onClose}>ยกเลิก</Button>
        {done ? (
          <Button tone="primary" disabled={busy} onClick={() => onSubmit({ action: "done", bomCode: code, note }, "บันทึกลง BOM เสร็จแล้ว")}>
            ลงเสร็จ
          </Button>
        ) : (
          <Button tone="danger" disabled={busy || !reason.trim()} onClick={() => onSubmit({ action: "return", reason }, "ตีกลับให้ฝ่ายขายแล้ว")}>
            ตีกลับ
          </Button>
        )}
      </div>
    </Modal>
  );
}
