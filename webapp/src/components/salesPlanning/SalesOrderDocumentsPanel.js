"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Paperclip } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
export { installmentFilesKey } from "@/lib/sales/salesOrderDocuments";
import styles from "./SalesOrderDocumentsPanel.module.css";

/**
 * เอกสารของใบสั่งขาย — ตัวโหลดที่หน้า SO ถือไว้ (ตัวเลขบนหัวแท็บต้องรู้ก่อนเปิดแท็บ)
 *
 * ⚠️ โหลดใหม่เมื่อ `orderKey` ขยับ (สถานะ/เวลาแก้ของใบ) — อนุมัติ/ยกเลิกบนหน้าเดียวกันแล้ว
 *   ด่านแนบ (`attach`) ต้องตามทัน ไม่งั้นปุ่มแนบค้างบนใบที่ยกเลิกไปแล้วจน F5
 * ⚠️ รอบหลังไม่ล้าง `data` ระหว่างโหลด — ล้างแล้วแผงคืน skeleton ⇒ `AttachmentsPanel` ถูกถอดแล้ว
 *   ติดตั้งใหม่ ⇒ ยิง `onItemsChange` ตอน mount ⇒ โหลดอีก วนไม่จบ (บั๊กเดียวกับแท็บเอกสารของดีล)
 */
export function useSalesOrderDocuments(orderId, orderKey) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const loadedAt = useRef(0);
  const load = useCallback(async () => {
    if (!orderId) return;
    loadedAt.current = Date.now();
    try {
      const next = await apiJson(`/api/sales-planning/sales-orders/${encodeURIComponent(orderId)}/documents`, {
        cache: "no-store", fallbackError: "โหลดเอกสารของใบนี้ไม่สำเร็จ",
      });
      setData(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "โหลดเอกสารของใบนี้ไม่สำเร็จ");
    }
  }, [orderId]);
  useEffect(() => { load(); }, [load, orderKey]);
  useRevalidateOnFocus(load);
  /* เปิดแท็บ = ดึงใหม่ถ้าของในมือเก่ากว่า `ms` — ไฟล์สัญญาที่แนบบนแท็บสัญญาไม่ขยับ `orderKey` ของใบ
     ⚠️ มีคอกกั้นเวลา: เปิดหน้าด้วย `?tab=documents` ตรง ๆ ตัวโหลดข้างบนเพิ่งยิงไป ไม่ต้องยิงซ้ำ */
  const refreshIfStale = useCallback((ms = 5000) => {
    if (Date.now() - loadedAt.current > ms) load();
  }, [load]);
  return { data, error, reload: load, refreshIfStale };
}



/**
 * แท็บ "เอกสาร" ของใบสั่งขาย (มติเจ้าของ 25/09/2569)
 *
 * ⭐ กลุ่มแรก "แนบเพิ่มหลังออกใบ" เป็นกลุ่มเดียวที่แนบ/ลบได้ — ของที่ลูกค้าส่งมาทีหลัง
 *   กลุ่มที่เหลือ **อ่านอย่างเดียว** และบอกว่าจัดการที่ไหน (ยืนยันคำสั่งซื้อตรึงตอนอนุมัติ ·
 *   หลักฐานงวดอยู่แท็บการชำระ · ไฟล์สัญญาอยู่แท็บสัญญา) — ไม่เปิดทางแก้ที่สองให้ของที่มีบ้านแล้ว
 * ⭐ ลบได้เฉพาะไฟล์ที่ตัวเองแนบ (แอดมินลบได้ทุกไฟล์) — API ตัดสินจริง ที่นี่คือไม่ยื่นปุ่มที่จะเจอ 403
 * ⚠️ ใบยกเลิก/ถูก Rev. แทน = ไม่มีปุ่มแนบ แต่บอกเหตุไว้เหนือกล่อง (ui-visibility-rule: ติดด่าน = บอกเหตุ)
 *
 * @param docs ผลของ `useSalesOrderDocuments` ที่หน้า SO ถือไว้
 * @param onOpenTab `(key) => void` — ปุ่ม "ไปแท็บ…" ของกลุ่มที่จัดการที่แท็บอื่น
 * @param tabKeys แท็บที่ใบนี้มีจริง (แท็บสัญญามีเฉพาะใบสายบริการ) — ไม่มีแท็บ = ไม่มีปุ่มพาไป
 */
export default function SalesOrderDocumentsPanel({ orderId, docs, meId, isAdmin, onOpenTab, tabKeys = [] }) {
  const { data, error, reload, refreshIfStale } = docs;
  // แผงติดตั้งเมื่อเปิดแท็บ — ของที่เปลี่ยนจากแท็บอื่น (ไฟล์สัญญา) ต้องเห็นตอนเปิด ไม่ใช่รอสลับหน้าต่าง
  useEffect(() => { refreshIfStale?.(); }, [refreshIfStale]);
  /* แนบ/ลบในกล่องแล้วตัวเลขบนหัวแท็บต้องขยับตาม · ข้ามครั้งแรก (กล่องยิงตอน mount) ไม่งั้นดึงซ้ำเปล่า ๆ
     ทุกครั้งที่เปิดแท็บ — แพตเทิร์นเดียวกับแท็บเอกสารของดีล */
  const seeded = useRef(false);
  const onItemsChange = useCallback((_items, meta) => {
    if (meta && meta.loaded === false) return;
    if (!seeded.current) { seeded.current = true; return; }
    reload();
  }, [reload]);
  const canDeleteItem = useCallback((item) => isAdmin || (!!meId && item?.uploadedBy === meId), [isAdmin, meId]);

  if (!data && !error) return <SkeletonRows rows={4} />;
  if (!data) return <StatusNotice tone="error">{error}</StatusNotice>;

  const attach = data.attach || { allowed: false, reason: null };
  const groups = data.groups || [];
  const extraCount = groups.find((g) => g.key === "extra")?.rows?.length || 0;

  return (
    <DetailCard
      icon={Paperclip}
      eyebrow="DOCUMENTS"
      title="เอกสารของใบสั่งขาย"
      meta={data.total ? `${data.total} ไฟล์จากทุกส่วนของใบนี้` : "ยังไม่มีไฟล์ในใบนี้"}
    >
      {/* โหลดรอบหลังพัง = คงของเดิมไว้ให้อ่าน แล้วบอกว่าตัวเลขอาจไม่ล่าสุด */}
      {error ? <StatusNotice tone="warning" className={styles.notice}>{error} — รายการด้านล่างอาจไม่ล่าสุด</StatusNotice> : null}
      <div className={styles.groups}>
        {groups.map((group) => {
          if (group.key === "extra") {
            return (
              <section key={group.key} className={styles.group} aria-labelledby={`so-docs-${group.key}`}>
                <GroupHead group={group} count={extraCount} />
                {/* แอดมินข้ามด่านสถานะได้ (API ปล่อยเหมือนกัน) — บอกด้วยว่าปุ่มที่เห็นมีไว้เก็บกวาด ไม่ใช่ใบนี้ยังรับไฟล์ */}
                {attach.reason ? (
                  <StatusNotice tone="info" className={styles.notice}>
                    {attach.allowed ? `${attach.reason} · ผู้ดูแลระบบยังแนบ/ลบได้ เพื่อเก็บกวาดไฟล์ที่แนบผิดใบเท่านั้น` : attach.reason}
                  </StatusNotice>
                ) : null}
                <AttachmentsPanel
                  entityType="sales_order"
                  entityId={orderId}
                  canEdit={attach.allowed}
                  canDeleteItem={canDeleteItem}
                  inlineUpload
                  showCount={false}
                  onItemsChange={onItemsChange}
                />
                {!attach.allowed && !extraCount ? <p className={styles.empty}>ยังไม่มีเอกสารแนบเพิ่ม</p> : null}
              </section>
            );
          }
          // กลุ่มอ่านอย่างเดียวที่ว่าง = ไม่ต้องกินที่ (ใบสินค้าไม่มีสัญญา · ใบที่ยังไม่มีงวด)
          if (!group.rows.length) return null;
          const canJump = group.manageTab && tabKeys.includes(group.manageTab) && typeof onOpenTab === "function";
          return (
            <section key={group.key} className={styles.group} aria-labelledby={`so-docs-${group.key}`}>
              <GroupHead
                group={group}
                count={group.rows.length}
                action={canJump ? (
                  <Button size="sm" variant="quiet" onClick={() => onOpenTab(group.manageTab)}>
                    ไปแท็บ{group.manageTab === "payment" ? "การชำระ" : "สัญญา"}
                  </Button>
                ) : null}
              />
              <ul className={styles.list}>
                {group.rows.map((row) => (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.main}>
                      <div className={styles.title}>{row.title}</div>
                      {row.note || row.at ? (
                        <div className={styles.meta}>{[row.note, row.at ? fmtDate(row.at) : null].filter(Boolean).join(" · ")}</div>
                      ) : null}
                    </div>
                    {row.href ? (
                      <Button
                        as="a" href={row.href} target="_blank" rel="noopener noreferrer" size="sm" variant="quiet"
                        icon={<ExternalLink size={13} aria-hidden="true" />}
                      >
                        เปิดดู
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </DetailCard>
  );
}

function GroupHead({ group, count, action = null }) {
  return (
    <header className={styles.groupHead}>
      <div className={styles.groupCopy}>
        <h3 id={`so-docs-${group.key}`} className={styles.groupTitle}>
          {group.label}
          <span className={styles.count}>{count} ไฟล์</span>
        </h3>
        {group.note ? <p className={styles.groupNote}>{group.note}</p> : null}
      </div>
      {action}
    </header>
  );
}
