"use client";
import { TableScroll } from "@/components/ui/Table";
// คำร้องข้ามฝ่าย (mig 0173) — คำร้องของฉัน / คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/requests (คิวของฝ่ายตน / คำร้องของฉัน) — หน้าแม่
// เป็นเจ้าของข้อมูลและตัวนับบนแท็บ พาเนลนี้เลือกแสดงตาม scope ที่ส่งมา
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { fmtDate } from "@/lib/format";
import styles from "./requestForm.module.css";
import StatusBadge from "@/components/ui/StatusBadge";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES, requestProgress } from "@/lib/deptRequests";
import {
  QUEUE_COUNT_META, groupQueueRows, queueCounts, requestNextStep,
} from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";
import { requestKindLabel } from "@/lib/master/requestTypes";

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [],
  // 🐞 **เคยรับทะเบียน 9 ชุด (materials · products · projects · deals · salesOrders ·
  // scents · formulas · productTypes · mentionPeople) แล้วไม่ได้ใช้สักตัว** — ตกค้าง
  // จากตอนที่ฟอร์มเปิดคำร้องยังเป็นโมดัลอยู่ในพาเนลนี้ · หน้าแม่จึงยิง 8 endpoint
  // ทุกครั้งที่เปิดคิว เพื่อส่งของที่ไม่มีใครอ่านต่อ ⇒ ถอดทั้งชุด
  // ⚠️ `reload` ยังรับไว้ — ผู้เรียกใช้หลังกดสร้าง/แก้เพื่อดึงใหม่ · ที่ถอดคือ
  // **ปุ่มรีเฟรชบนจอ** ซึ่งทั้งระบบไม่มีที่อื่น และหน้าที่ต้องกดเองแปลว่าข้อมูลไม่สด
  // โดยปริยาย ⇒ ผู้ใช้จะกดทุกครั้งเพราะไม่กล้าเชื่อสิ่งที่เห็น
  loading = false, loadError = "", reload, newRequestDefaults = null,
  // ⭐ คิวของฝ่าย (`/rd/requests`) เป็นที่ **ตอบ** ไม่ใช่ที่เปิดคำร้อง — ปุ่มเปิดอยู่ฝั่ง
  // ผู้ขอที่ `/requests` ที่เดียว · โผล่สองที่แล้วต้องมี `returnTo` สองชุดที่ต้องดูแล
  showNewRequest = true,
}) {
  // ⭐ prefill ส่งผ่าน query — หน้าเต็มรับได้ตรง ๆ ต่างจากโมดัลที่ต้องส่ง props
  // ผ่านทุกจุดที่เปิดมัน · `returnTo` พากลับมาที่คิวหลังกดยกเลิก
  const newRequestQuery = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(newRequestDefaults || {})) if (v) q.set(k, v);
    q.set("returnTo", "/requests");
    return `?${q.toString()}`;
  })();
  const router = useRouter();
  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const counts = queueCounts(rows, { todayIso: today });
  const groups = groupQueueRows(rows, { todayIso: today });

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
  return (
    <>
      {showNewRequest && (
      <div className="toolbar">
        <span className="spacer" />
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        {/* ⚠️ **เปลือกเดียว** — ฟอร์มย้ายไป /requests/new ทั้งก้อน · ครอบ RequestForm
            ไว้สองที่จะได้แถบปุ่มกับข้อความ blocker สองชุดที่ต้องดูแลให้ตรงกัน
            (โรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้)
            หน้าเต็มคือเงื่อนไขของการแนบไฟล์ตอนเปิดคำร้อง ซึ่งโมดัลทำไม่ได้ */}
        <button
          type="button" className="btn btn-accent"
          onClick={() => router.push(`/requests/new${newRequestQuery}`)}
        >
          <Plus size={14} /> เปิดคำร้อง
        </button>
      </div>
      )}

      {/* ⭐ แถบตัวเลข 4 ตัว — ตัวที่ 4 "รอฝ่ายขายทำต่อ" คือของใหม่ทั้งหมดของหน้านี้
          วันนี้คิวนับทุกใบที่ยัง open เป็นงานค้างของฝ่าย ทั้งที่ครึ่งหนึ่งรอผู้ขอไปรับของ/
          ส่งลูกค้าอยู่ ⇒ ตัวเลขสูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
          แยกออกมาแล้วตัวเลขที่เหลือถึงจะเป็นงานของฝ่ายจริง ๆ

          🐞 **เคยอยู่ข้างในสาขา "มีแถว"** ⇒ ลิสต์ว่างแล้วแถบหายทั้งแถว · **0 ก็เป็น
          ข้อมูล** — "ยังไม่รับเรื่อง 0 · เลยกำหนด 0" บอกว่างานไม่ค้าง ซึ่งเป็นสิ่งที่
          หัวหน้าเปิดมาดูเพื่อจะรู้ · ซ่อนตอนว่างทำให้แยกไม่ออกระหว่าง "ไม่มีงานค้าง"
          กับ "หน้ายังโหลดไม่เสร็จ" (ผู้ใช้เจอเองบนจอ) */}
      {!loading && !loadError && (
        <div className={styles.counts}>
          {QUEUE_COUNT_META.map((meta) => (
            <span key={meta.key} className={styles.count} data-tone={meta.tone}>
              {meta.label} <strong>{counts[meta.key]}</strong>
            </span>
          ))}
        </div>
      )}

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
                {/* ⭐ ก้าวถัดไป — มาจาก requestNextStep ตัวเดียวกับที่แถบตัวเลขใช้
                    ⇒ ตัวเลขข้างบนกับคอลัมน์นี้ขัดกันไม่ได้เชิงโครงสร้าง */}
                <th className={styles.colNext}>ก้าวถัดไป</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={styles.colUpdated}>อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {/* ⭐ แถวคั่นกลุ่ม — ทำให้ลำดับที่ compareRequestUrgency จัดไว้
                  **มองเห็นได้** · เรียงถูกแล้วแต่คนอ่านไม่รู้ว่าเส้นแบ่งอยู่ตรงไหน
                  ⚠️ จัดกลุ่มจริงที่ groupQueueRows ไม่ใช่แทรกเส้นตอนคีย์เปลี่ยน
                  (ตัวเรียงไม่ได้เรียงตามลำดับกลุ่มเป๊ะ ๆ จะได้หัวข้อซ้ำกลางตาราง) */}
              {groups.map((g) => (
                <Fragment key={g.group}>
                  <tr className={styles.groupRow}>
                    <td colSpan={8}>{g.label} · {g.rows.length}</td>
                  </tr>
                  {g.rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                const next = requestNextStep(ask);
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
                    {/* ⚠️ สามโทน: ตาคุณ / รออีกฝั่ง / จบแล้ว — **สีสงวนให้ความเร่งด่วน
                        และเจ้าของก้าว** ไม่ใช่ให้ชนิดคำร้อง (ชนิดใช้ป้ายข้อความ) */}
                    <td className={styles.smallCell}>
                      {next
                        ? (
                          <span className={`ui-badge ${styles.nextStep}`} data-owner={next.owner}>
                            {next.label}
                          </span>
                        )
                        : <span className={styles.muted}>—</span>}
                    </td>
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

    </>
  );
}
