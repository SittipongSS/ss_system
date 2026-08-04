"use client";
import { TableScroll } from "@/components/ui/Table";
// คำร้องข้ามฝ่าย (mig 0173) — คำร้องของฉัน / คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/requests (คิวของฝ่ายตน / คำร้องของฉัน) — หน้าแม่
// เป็นเจ้าของข้อมูลและตัวนับบนแท็บ พาเนลนี้เลือกแสดงตาม scope ที่ส่งมา
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, RefreshCw, Plus } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import { fmtDate } from "@/lib/format";
import styles from "./requestForm.module.css";
import StatusBadge from "@/components/ui/StatusBadge";
import { createAndSendRequest, requestFormBlocker } from "@/lib/master/requestCreate";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES, requestProgress } from "@/lib/deptRequests";
import { requestKindLabel } from "@/lib/master/requestTypes";

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [], materials = [], products = [],
  // ทะเบียน/รายการที่ฟอร์มอ้าง — โครงการ+ดีล (บังคับทุกชนิด) · กลิ่น (F) · สูตร (FB)
  projects = [], deals = [], salesOrders = [], scents = [], formulas = [],
  productTypes = [], mentionPeople = [],
  loading = false, loadError = "", reload, newRequestDefaults = null,
}) {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // ── เปิดคำร้อง = สามสเต็ปในปุ่มเดียว ─────────────────────────────────────
  //
  // ⭐ ปุ่มเดียว "ส่งคำร้อง" ไม่ใช่ "สร้างร่าง" แล้วให้ไปกดส่งอีกหน้า (มติ 2026-08-03
  // ให้ทำงานคล้ายเธรด — ไม่มีใครร่างโพสต์ในเธรดไว้แล้วกลับมากดส่งทีหลัง) · ที่สำคัญ
  // กว่านั้น: ไฟล์แนบกับ @mention จะแขวนอยู่บนร่างที่ไม่มีใครเห็น ถ้าหยุดแค่ร่าง
  //
  // กลไกร่างยังอยู่ข้างใน เพราะสองอย่างต้องมี id ของคำร้องก่อน:
  //   1 POST     → ได้ร่าง + id (ยังไม่กินเลขที่)
  //   2 upload   → ไฟล์แนบเกาะ id นั้น
  //   3 PATCH ส่ง → ออกเลขที่ + ลงเธรดคำร้อง/เธรดดีล + ยิงแจ้งเตือนคนที่ถูก @
  // ⚠️ ล้มกลางทางแล้ว **ไม่ rollback ร่างทิ้ง** — ของที่พิมพ์มายังอยู่ พาไปหน้า
  // รายละเอียดให้กดส่งเองได้ ดีกว่าลบแล้วให้พิมพ์ใหม่ทั้งใบ
  const create = async () => {
    setSaving(true);
    const productName = products.find((p) => p.id === form.productId)?.name || null;
    const { id, error } = await createAndSendRequest(form, { productName });
    if (error) {
      setToast({ kind: "error", msg: error });
      setSaving(false);
    }
    // มีร่างค้างแล้ว = พาไปทำต่อที่หน้ารายละเอียด ไม่ให้ของที่พิมพ์หาย
    if (id) router.push(`/requests/${id}`);
  };

  // ปุ่มส่งเปิดเมื่อกรอกครบ — ด่านเดียวกับข้อความที่ฟอร์มแสดง (requestFormBlocker)
  // ห้ามเขียนเงื่อนไขเพิ่มที่นี่: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางแบบไม่บอกเหตุผล
  const formReady = !requestFormBlocker(form);

  return (
    <>
      <div className="toolbar">
        <span className="spacer" />
        <button type="button" className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        <button
          type="button" className="btn btn-accent"
          onClick={() => setForm(emptyRequestForm(newRequestDefaults || {}))}
        >
          <Plus size={14} /> เปิดคำร้อง
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className={`glass-panel ${styles.loadError}`}>{loadError}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {scope === "queue"
            ? `ไม่มีคำร้องรอฝ่าย ${dept || "คุณ"} ตอบ`
            : "ยังไม่มีคำร้องของคุณ — กด \"เปิดคำร้อง\" เพื่อเริ่ม"}
        </EmptyState>
      ) : (
        <TableScroll>
          <table className="premium-table">
            <thead>
              <tr>
                <th className={styles.colDoc}>เลขที่</th>
                <th className={styles.colKind}>ชนิด</th>
                <th>เรื่อง / ลูกค้า</th>
                <th className={styles.colDept}>ถึงฝ่าย</th>
                <th className={styles.colProgress}>ความคืบหน้า</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={styles.colUpdated}>อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                return (
                  <tr
                    key={ask.id} className={styles.rowLink}
                    onClick={() => router.push(`/requests/${ask.id}`)}
                  >
                    <td className={styles.docCell}>
                      {ask.docNo || "ร่าง"}
                      {ask.urgent && (
                        <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>
                      )}
                    </td>
                    <td className={styles.kindCell}>{requestKindLabel(ask.kind)}</td>
                    <td>
                      {/* ชนิดที่ไม่มีบรรทัดสื่อความด้วยหัวเรื่อง — ชนิดขอราคาสื่อด้วยลูกค้า/สูตร */}
                      <div>{ask.title || ask.customerName
                        || <span className={styles.muted}>ราคากลาง</span>}</div>
                      {ask.title && ask.customerName && (
                        <div className={styles.subText}>{ask.customerName}</div>
                      )}
                      {ask.formulaCode && (
                        <div className={styles.subText}>สูตร {ask.formulaCode}</div>
                      )}
                    </td>
                    <td className={styles.smallCell}>{ask.dept}</td>
                    <td className={styles.smallCell}>
                      {p.total > 0
                        ? `${p.done}/${p.total} ตอบแล้ว`
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td>
                      <StatusBadge
                        tone={REQUEST_STATUS_TONES[ask.status] || "neutral"}
                        label={REQUEST_STATUS_LABELS[ask.status] || ask.status}
                      />
                    </td>
                    <td className={styles.smallCell}>{fmtDate(ask.updatedAt || ask.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg" dismissible={!saving}
        title="เปิดคำร้องข้ามฝ่าย"
      >
        {form && (
          <>
            <RequestForm
              value={form} onChange={setForm} disabled={saving}
              materials={materials} products={products}
              projects={projects} deals={deals} salesOrders={salesOrders}
              scents={scents} formulas={formulas} productTypes={productTypes}
              mentionPeople={mentionPeople}
            />
            <div className={`glass-panel ${styles.formNote}`}>
              กดส่งแล้วระบบจะออกเลขที่ · แจ้งฝ่าย {form.dept || "ปลายทาง"} ·
              และลงเรื่องนี้ในเธรดของดีลที่เลือกไว้ให้เอง
            </div>
            <div className={`action-bar ${styles.formActions}`}>
              <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={create} disabled={saving || !formReady}>
                ส่งคำร้อง
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
