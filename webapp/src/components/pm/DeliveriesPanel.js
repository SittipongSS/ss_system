"use client";
// ── ของเข้า PM/RM ของโครงการ (mig 0176) ─────────────────────────────────
//
// ⭐ ที่มา (คำขอตั้งต้นของผู้ใช้): "ขอเช็คสถานะติดตามการเข้าของ PM และ RM เพื่อ
// ติดตามกำหนดการผลิต" · ก่อนหน้านี้ไทม์ไลน์มีแค่ milestone เดียว 45 วัน
// "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" ที่ไม่มีอะไรอยู่ข้างใน
//
// ⚠️ ปุ่ม "กางจากใบขอราคาผลิต" คือทางหลัก — บรรทัดวัสดุของใบที่อนุมัติแล้วคือ
// รายการที่ต้องสั่งจริงอยู่แล้ว ให้ PC พิมพ์ซ้ำทีละแถวคือทางที่ข้อมูลจะไม่ตรงกัน
// ตั้งแต่วันแรก · กดซ้ำไม่ได้แถวซ้ำ (unique ที่ระดับ DB)
import { useState } from "react";
import Link from "next/link";
import { PackageCheck, Plus, RefreshCw, Send, Trash2, Wand2 } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { fmtDate } from "@/lib/format";
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS } from "@/lib/materialPrices";
import { deliveryRollup, openDeliveriesToChase } from "@/lib/pm/deliveries";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import styles from "./DeliveriesPanel.module.css";
import Textarea from "@/components/ui/Textarea";
import { businessDate } from "@/lib/businessDate";

const EMPTY_FORM = { kind: "PM", label: "", qty: "", unit: "", poRef: "", salesOrderId: "", dueDate: "", note: "" };

export default function DeliveriesPanel({
  projectId,
  deliveries = [],
  // ใบสั่งขายของโครงการ ให้ผูกรายแถว (mig 0177) — ของเข้าติดตามเพื่อตอบว่า
  // "ใบสั่งขายใบไหนเริ่มผลิตได้" ไม่ใช่แค่ว่าของมาถึงหรือยัง
  salesOrders = [],
  // ดีลของโครงการ = "รอบ" การสั่ง (SCENT → NPD → RE-ORDER × N)
  // ⭐ พาเนลนี้อยู่ระดับโครงการจึงโชว์ **ทุกรอบ** ตามคอนเซป "โครงการคือศูนย์รวม
  // ข้อมูลดีล" — แต่ต้องบอกให้ชัดว่าแถวไหนของรอบไหน ไม่งั้นพอ RE-ORDER สะสม
  // จะอ่านไม่ออกว่าของกองนี้เป็นของรอบเก่าที่จบไปแล้วหรือรอบที่กำลังทำ
  // (ป้ายบน milestone ในไทม์ไลน์นับเฉพาะรอบนั้น — คนละหน้าที่กัน)
  deals = [],
  canEdit = false,
  onChanged,
  onError,
}) {
  const dealLabel = (id) => {
    const d = deals.find((x) => x.id === id);
    if (!d) return null;
    return d.dealType ? `${d.dealType}` : (d.title || null);
  };
  const soLabel = (id) => salesOrders.find((s) => s.id === id)?.orderNumber || null;
  const soOptions = [
    { value: "", label: "— ยังไม่ผูก —" },
    ...salesOrders.map((s) => ({ value: s.id, label: s.orderNumber })),
  ];
  const [busy, setBusy] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const today = businessDate();
  const sum = deliveryRollup(deliveries, today);
  // จำนวนที่ "ขอให้อัปเดตได้" — ยังไม่มา และยังไม่มีคำร้องค้างอยู่
  const chaseable = openDeliveriesToChase(deliveries).length;

  const call = async (path, init, okMsg) => {
    setBusy(path);
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/deliveries${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      await onChanged?.(okMsg || d.message || null);
      return d;
    } catch (e) {
      onError?.(e.message);
      return null;
    } finally { setBusy(""); }
  };

  // ขอให้ PC อัปเดตกำหนดทั้งชุด — เปิดคำร้องชนิด material_eta ให้ในคลิกเดียว
  // (endpoint เดียวจบ: เปิด + ส่งเข้าคิว + ติดธงบนแถวที่ขอ — ดู request-update/route.js)
  const requestUpdate = async () => {
    const d = await call("/request-update", { method: "POST" });
    if (!d) return;
    onChanged?.(`ส่งคำร้อง ${d.docNo} ถึงฝ่ายจัดซื้อแล้ว (${d.asked} รายการ)`);
  };

  const generate = async () => {
    const d = await call("/generate", { method: "POST" });
    if (!d) return;
    // กางซ้ำ = ไม่มีอะไรใหม่ ซึ่งไม่ใช่ error — บอกตามจริงว่าข้ามไปกี่แถว
    onChanged?.(d.created
      ? `กางรายการของเข้า ${d.created} รายการ${d.skipped ? ` (ข้ามที่มีอยู่แล้ว ${d.skipped})` : ""}`
      : d.message || "ไม่มีรายการใหม่");
  };

  const patchRow = (row, patch) => call(`/${row.id}`, {
    method: "PATCH", body: JSON.stringify(patch),
  });

  const removeRow = async (row) => {
    if (!(await confirmAction(`ลบรายการของเข้า "${row.label}"?`))) return;
    await call(`/${row.id}`, { method: "DELETE" }, "ลบรายการแล้ว");
  };

  const submitAdd = async () => {
    const d = await call("", { method: "POST", body: JSON.stringify(form) }, "เพิ่มรายการแล้ว");
    if (d) { setAddOpen(false); setForm(EMPTY_FORM); }
  };

  return (
    <section>
      <div className={styles.head}>
        <PackageCheck size={17} aria-hidden="true" />
        <h2 className={styles.title}>ของเข้า (PM / RM)</h2>
        <div className={styles.summary}>
          <StatusBadge
            size="sm"
            tone={sum.complete ? "success" : sum.late ? "danger" : "info"}
            label={`มาแล้ว ${sum.arrived}/${sum.total}`}
          />
          {sum.late > 0 && <StatusBadge size="sm" tone="danger" label={`เลยกำหนด ${sum.late}`} />}
          {sum.lastDue && (
            <StatusBadge size="sm" tone="neutral" label={`ครบเมื่อ ${fmtDate(sum.lastDue)}`} />
          )}
        </div>
        <div className={styles.spacer} />
        {canEdit && (
          <>
            {/* ขอให้ PC อัปเดต — โผล่เฉพาะตอนมีของค้างที่ยังไม่ได้ขอ ไม่งั้นกดแล้ว
                ได้ error เปล่า ๆ (server กันขอซ้ำอยู่แล้ว แต่ปุ่มไม่ควรหลอกให้กด) */}
            {chaseable > 0 && (
              <Button
                size="sm" onClick={requestUpdate} disabled={!!busy}
                icon={<Send size={14} aria-hidden="true" />}
                title={`เปิดคำร้องถึงฝ่ายจัดซื้อให้อัปเดตกำหนด ${chaseable} รายการ`}
              >
                ขอให้ PC อัปเดตกำหนด ({chaseable})
              </Button>
            )}
            <Button
              size="sm" onClick={generate} disabled={!!busy}
              icon={<Wand2 size={14} aria-hidden="true" />}
            >
              กางจากใบขอราคาผลิต
            </Button>
            <Button
              size="sm" tone="accent" onClick={() => setAddOpen(true)} disabled={!!busy}
              icon={<Plus size={14} aria-hidden="true" />}
            >
              เพิ่มรายการ
            </Button>
          </>
        )}
        <Button
          size="sm" variant="quiet" onClick={() => onChanged?.()} disabled={!!busy}
          icon={<RefreshCw size={14} aria-hidden="true" />}
          aria-label="รีเฟรช"
        />
      </div>

      {!deliveries.length ? (
        <EmptyState icon={PackageCheck}>
          ยังไม่มีรายการของเข้า
          {canEdit ? ' — กด "กางจากใบขอราคาผลิต" เพื่อดึงบรรทัดวัสดุของใบที่อนุมัติแล้วมาทั้งชุด' : ""}
        </EmptyState>
      ) : (
        <TableScroll>
          <table>
            <thead>
              <tr>
                <th>วัสดุ</th>
                <th>ชนิด</th>
                <th className={styles.numCol}>จำนวน</th>
                <th>PR / PO</th>
                <th className={styles.soCol}>ใบสั่งขาย</th>
                <th className={styles.dateCol}>กำหนดถึง</th>
                <th className={styles.dateCol}>มาถึงจริง</th>
                {canEdit && <th className={styles.actionsCol} />}
              </tr>
            </thead>
            <tbody>
              {deliveries.map((row) => {
                const late = !row.arrivedAt && row.dueDate && String(row.dueDate) < today;
                return (
                  <tr key={row.id} className={late ? styles.late : undefined}>
                    <td>
                      {row.label}
                      {/* บอกรอบของแถว — พาเนลนี้รวมทุกรอบของโครงการไว้ด้วยกัน */}
                      {deals.length > 1 && dealLabel(row.dealId) && (
                        <span className={styles.round}>{dealLabel(row.dealId)}</span>
                      )}
                      {/* ขอให้ PC อัปเดตไปแล้ว — ลิงก์ไปคำร้องเพื่อคุยต่อในเธรดที่นั่น
                          (แถวนี้จะไม่ถูกขอซ้ำจนกว่าจะเคลียร์) */}
                      {row.requestId && !row.arrivedAt && (
                        <Link className={styles.asked} href={`/requests/${row.requestId}`}>
                          ขออัปเดตแล้ว
                        </Link>
                      )}
                      {row.note && <div className={styles.hint}>{row.note}</div>}
                    </td>
                    <td>{MATERIAL_KIND_LABELS[row.kind] || row.kind}</td>
                    <td className={`mono ${styles.numCol}`}>
                      {/* จำนวนว่าง = ยังไม่รู้ยอด **ห้ามแสดงเป็น 0** */}
                      {row.qty == null
                        ? <span className={styles.muted}>—</span>
                        : `${Number(row.qty).toLocaleString("th-TH")} ${row.unit || ""}`}
                    </td>
                    <td className="mono">{row.poRef || <span className={styles.muted}>—</span>}</td>
                    {/* ผูก SO = บอกว่าของชุดนี้สั่งมาเพื่อผลิตใบไหน · ว่างได้ เพราะของ
                        long-lead สั่งก่อนออก SO ได้จริง */}
                    <td>
                      {canEdit && salesOrders.length ? (
                        <Select
                          compact value={row.salesOrderId || ""} disabled={!!busy}
                          /* ⚠️ Select รับ `aria-label` ไม่ใช่ `ariaLabel` (ต่างจาก DateInput)
                             ใส่ผิดแล้วมันหลุดไปเป็น DOM attribute ที่ไม่มีอยู่จริง */
                          aria-label={`ใบสั่งขายของ ${row.label}`}
                          options={soOptions}
                          onChange={(e) => patchRow(row, { salesOrderId: e.target.value || null })}
                        />
                      ) : (
                        <span className="mono">
                          {soLabel(row.salesOrderId) || <span className={styles.muted}>—</span>}
                        </span>
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <DateInput
                          compact value={row.dueDate || ""} disabled={!!busy}
                          ariaLabel={`กำหนดถึง ${row.label}`}
                          onChange={(v) => patchRow(row, { dueDate: v || null })}
                        />
                      ) : (row.dueDate ? fmtDate(row.dueDate) : <span className={styles.muted}>—</span>)}
                    </td>
                    <td>
                      {canEdit ? (
                        <DateInput
                          compact value={row.arrivedAt || ""} disabled={!!busy}
                          ariaLabel={`มาถึงจริง ${row.label}`}
                          onChange={(v) => patchRow(row, { arrivedAt: v || null })}
                        />
                      ) : (row.arrivedAt ? fmtDate(row.arrivedAt) : <span className={styles.muted}>ยังไม่มา</span>)}
                    </td>
                    {canEdit && (
                      <td>
                        <div className={styles.rowActions}>
                          <Button
                            iconOnly tone="danger" variant="ghost" onClick={() => removeRow(row)}
                            disabled={!!busy} aria-label={`ลบ ${row.label}`}
                            icon={<Trash2 size={14} aria-hidden="true" />}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} size="md" title="เพิ่มรายการของเข้า">
        <div className={styles.formGrid}>
          <div className="form-group">
            <label htmlFor="mdl-kind">ชนิดวัสดุ</label>
            <Select
              id="mdl-kind" value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              options={MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="mdl-label">ชื่อวัสดุ</label>
            <Input
              id="mdl-label" maxLength={200} value={form.label}
              placeholder="เช่น ขวดแก้ว 200ml ฝาไม้"
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="mdl-qty">จำนวน (ว่าง = ยังไม่รู้ยอด)</label>
            <Input
              id="mdl-qty" mono inputMode="decimal" value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="mdl-unit">หน่วย</label>
            <Input
              id="mdl-unit" maxLength={30} value={form.unit}
              placeholder="ชิ้น / กก."
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="mdl-po">เลข PR / PO</label>
            <Input
              id="mdl-po" mono maxLength={100} value={form.poRef}
              onChange={(e) => setForm({ ...form, poRef: e.target.value })}
            />
          </div>
          {salesOrders.length > 0 && (
            <div className="form-group">
              <label htmlFor="mdl-so">ใบสั่งขายที่สั่งของชุดนี้เพื่อไปผลิต</label>
              <Select
                id="mdl-so" value={form.salesOrderId}
                onChange={(e) => setForm({ ...form, salesOrderId: e.target.value })}
                options={soOptions}
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="mdl-due">กำหนดถึง</label>
            <DateInput
              id="mdl-due" value={form.dueDate}
              onChange={(v) => setForm({ ...form, dueDate: v || "" })}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="mdl-note">หมายเหตุ</label>
          <Textarea variant="data"
            id="mdl-note" rows={2} maxLength={1000} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className={`action-bar ${styles.formActions}`}>
          <Button variant="quiet" onClick={() => setAddOpen(false)} disabled={!!busy}>ยกเลิก</Button>
          <Button tone="accent" onClick={submitAdd} disabled={!!busy || !form.label.trim()}>
            เพิ่มรายการ
          </Button>
        </div>
      </Modal>
    </section>
  );
}
