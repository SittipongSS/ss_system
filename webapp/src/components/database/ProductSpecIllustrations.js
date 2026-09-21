"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Images } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { SPEC_ILLUSTRATION_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { ILLUSTRATION_CAPTION_MAX, sortIllustrations } from "@/lib/sales/productSpecIllustrations";
import { illustrationReorderPlan, isRetiredIllustration, liveIllustrations } from "@/lib/sales/productSpecView";
import styles from "./ProductSpecIllustrations.module.css";

/**
 * ภาพประกอบรายละเอียดสินค้า (แผ่นที่ 3 ของกระดาษ FM-SA-04)
 *
 * ⭐ **มติผู้ใช้ 2026-09-17: "ภาพประกอบอยู่กับสเปคสินค้า"** ⇒ ไฟล์แนบกับ **ตัวสินค้า**
 * (`entityType="product"` · `docType="spec_illustration"`) ⇒ ได้ด่านสิทธิ์กับโฟลเดอร์ Drive ของ
 * สินค้ามาทั้งชุด โดยไม่ต้องต่อ entity แนบไฟล์ใหม่ (เช็กลิสต์ที่ `lib/sales/salesAttachmentAccess.js`)
 *
 * ⭐ **มติผู้ใช้ 2026-09-21: รูปกับคำบรรยายอยู่บรรทัดเดียวกัน** (`photoRows` ของแผงไฟล์แนบ)
 *
 * ⚠️ **คำบรรยายกับลำดับอยู่ที่ `metadata` ของไฟล์** — เอกสารที่ยังเป็นร่างพิมพ์ชุดวันนี้เสมอ ·
 * เอกสารที่ยื่นแล้วถือ **ภาพนิ่งของตัวเอง** (`illustrationIds` + คำบรรยายใน snapshot ตอนยื่น · mig 0370)
 * ⇒ แก้ที่นี่ไม่ย้อนไปเปลี่ยนกระดาษที่ยื่น/อนุมัติแล้ว
 *
 * ⭐ **รูปห้ามหาย** (มติ 21/09/2569): ลบรูปที่เอกสารซึ่งยื่นแล้วอ้างอยู่ ⇒ เส้นลบของไฟล์แนบ
 * **ปลดระวาง** (`metadata.retiredAt`) แทนการลบไฟล์ · จอนี้ซ่อนรูปที่ปลดระวางแล้ว แต่กระดาษเก่า
 * ยังเปิดรูปได้ ⇒ ตัวคัด `liveIllustrations` ใช้ทั้งตอนนับและตอนวาด
 *
 * ⚠️ **ห้ามก๊อปแถว `attachments` ให้ชี้ไฟล์เดียวกันสองแถว** — `DELETE` ของเส้นไฟล์แนบ
 * เรียก `releaseAttachmentFile` ซึ่งปล่อยตัวไฟล์จริง ⇒ ลบแถวหนึ่งแล้วอีกแถวเหลือ
 * ตัวชี้ที่ไฟล์หายไป
 *
 * @param onDirtyChange `(dirty: boolean) => void` — มีคำบรรยายที่พิมพ์ค้างไม่บันทึก ⇒ หน้าที่วาง
 *   การ์ดนี้เอาไปรวมกับตัวกันออกจากหน้า (🐞 ของที่พิมพ์ค้างเคยหายเงียบตอนกดลิงก์ออก)
 */
export default function ProductSpecIllustrations({ productId, canEdit = false, onDirtyChange }) {
  const [count, setCount] = useState(0);
  const [retired, setRetired] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState({});
  /* ค่าที่เพิ่งบันทึกสำเร็จ — ทับค่าที่แผงไฟล์แนบถืออยู่จนกว่ามันจะโหลดรอบใหม่
     🪤 ลิสต์รูปเป็นของแผง ไม่ใช่ของเรา ⇒ ถ้าไม่ทับ: กดบันทึกคำบรรยายแล้วช่องเด้งกลับ
        เป็นค่าเก่า และกดสลับลำดับแล้วแถวไม่ขยับ ทั้งที่ฐานเปลี่ยนไปแล้วทั้งสองกรณี */
  const [saved, setSaved] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [liveIds, setLiveIds] = useState(() => new Set());

  const handleItems = useCallback((next, meta) => {
    // ตัวคัดตัวเดียวกับที่จอวาด ⇒ เลขบนหัวการ์ดเท่ากับจำนวนภาพที่จะถูกถ่ายลงเอกสารตอนยื่น
    const live = liveIllustrations(next);
    setCount(live.length);
    setLiveIds(new Set(live.map((row) => row.id)));
    setRetired((next || []).filter((row) => row?.docType === SPEC_ILLUSTRATION_DOC_TYPE && isRetiredIllustration(row)).length);
    setLoaded(Boolean(meta?.loaded));
  }, []);

  // คำบรรยายที่พิมพ์ค้าง = งานที่ยังไม่เข้าระบบ — บอกหน้าที่วางการ์ดให้กันออกจากหน้า
  // ⚠️ นับเฉพาะภาพที่ยังอยู่บนจอ — พิมพ์ค้างแล้วลบภาพทิ้ง ต้องไม่ทำให้ตัวกันออกจากหน้าเตือนค้างตลอด
  const hasDraft = Object.keys(drafts).some((id) => liveIds.has(id));
  useEffect(() => {
    onDirtyChange?.(hasDraft);
    // การ์ดถูกถอด (ลบสเปค) = ไม่มีของค้างให้กันแล้ว — ไม่งั้นตัวกันออกจากหน้าค้างเตือนตลอด
    return () => onDirtyChange?.(false);
  }, [hasDraft, onDirtyChange]);

  const patch = (id, metadata, fallbackError) => apiJson(`/api/attachments/${id}`, {
    method: "PATCH", json: { metadata }, fallbackError,
  });

  const save = async (id, caption) => {
    setBusyId(id);
    setError("");
    try {
      await patch(id, { caption }, "บันทึกคำบรรยายไม่สำเร็จ");
      setSaved((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), caption } }));
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (saveError) {
      setError(saveError.message || "บันทึกคำบรรยายไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  /* เลื่อนขึ้น/ลง — เขียนตามแผนของ `illustrationReorderPlan` (มีเทสต์)
     🐞 ของเดิมเขียนแค่สองแถวที่สลับ ⇒ ภาพเก่าที่ไม่เคยมีลำดับกระโดดไปท้ายลิสต์
     ⚠️ เขียนทีละแถวจากบนลงล่าง — ล้มกลางทางแล้วลำดับที่เห็นยังเป็นลำดับเดิมหรือใหม่ ไม่ใช่มั่ว
        (เหตุผลเต็มอยู่ที่ตัวสร้างแผน) · แถวที่เขียนสำเร็จแล้วทับค่าบนจอทันที */
  const move = async (rows, index, direction) => {
    const plan = illustrationReorderPlan(rows, index, direction);
    if (!plan.length) return;
    setBusyId(rows[index].id);
    setError("");
    try {
      for (const step of plan) {
        await patch(step.id, { sortOrder: step.sortOrder }, "สลับลำดับไม่สำเร็จ");
        setSaved((prev) => ({ ...prev, [step.id]: { ...(prev[step.id] || {}), sortOrder: step.sortOrder } }));
      }
    } catch (moveError) {
      setError(moveError.message || "สลับลำดับไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  /* แถวหนึ่งบรรทัดต่อหนึ่งรูป — ฝั่งขวาของรูปนั้น ๆ
     ⚠️ รูปที่ไม่อยู่ในลิสต์ที่คืนไป **ไม่ถูกวาด** (สัญญาของ `photoRows`) ⇒ รูปที่ปลดระวางหายจากจอ
        ที่นี่ ไม่ต้องแตะแผงไฟล์แนบ
     ⚠️ ลำดับมาจาก `sortIllustrations` ของลิสต์ที่ทับด้วยค่าที่เพิ่งบันทึกแล้ว */
  const photoRows = (photos) => {
    const merged = photos.map((photo) => (saved[photo.id]
      ? { ...photo, metadata: { ...(photo.metadata || {}), ...saved[photo.id] } }
      : photo));
    const rows = sortIllustrations(liveIllustrations(merged));
    return rows.map((row, index) => {
      const stored = row.metadata?.caption ?? "";
      const caption = drafts[row.id] ?? stored;
      const dirty = drafts[row.id] !== undefined && drafts[row.id] !== stored;
      return {
        id: row.id,
        content: (
          <div className={styles.rowBody}>
            <div className={styles.rowHead}>
              <span className={styles.rowNo}>ภาพที่ {index + 1}</span>
              <span className={`mono ${styles.file}`}>{naText(row.fileName)}</span>
              {canEdit ? (
                <div className={styles.orderCell}>
                  <Button iconOnly variant="ghost" size="sm" aria-label={`เลื่อนขึ้น ภาพที่ ${index + 1}`}
                    disabled={index === 0 || Boolean(busyId)}
                    onClick={() => move(rows, index, -1)} icon={<ArrowUp size={14} />} />
                  <Button iconOnly variant="ghost" size="sm" aria-label={`เลื่อนลง ภาพที่ ${index + 1}`}
                    disabled={index === rows.length - 1 || Boolean(busyId)}
                    onClick={() => move(rows, index, 1)} icon={<ArrowDown size={14} />} />
                </div>
              ) : null}
            </div>
            {canEdit ? (
              <div className={styles.captionCell}>
                <Input
                  value={caption}
                  maxLength={ILLUSTRATION_CAPTION_MAX}
                  aria-label={`คำบรรยายภาพที่ ${index + 1}`}
                  placeholder="คำบรรยายที่จะพิมพ์ใต้ภาพ — เช่น กล่องแบบใหม่ เปิดขึ้น"
                  onChange={(event) => {
                    const value = event.target.value;
                    // พิมพ์กลับเป็นค่าเดิม = ไม่มีของค้าง (ไม่งั้นตัวกันออกจากหน้าเตือนทั้งที่ไม่มีอะไรหาย)
                    setDrafts((prev) => {
                      const next = { ...prev };
                      if (value === stored) delete next[row.id];
                      else next[row.id] = value;
                      return next;
                    });
                  }}
                />
                {dirty ? (
                  <Button size="sm" tone="primary" disabled={busyId === row.id}
                    onClick={() => save(row.id, caption.trim())}>
                    {busyId === row.id ? "กำลังบันทึก…" : "บันทึก"}
                  </Button>
                ) : null}
              </div>
            ) : <p className={styles.captionRead}>{naText(stored)}</p>}
          </div>
        ),
      };
    });
  };

  return (
    <DetailCard
      icon={Images}
      eyebrow="ILLUSTRATIONS"
      title="ภาพประกอบรายละเอียดสินค้า"
      meta={loaded
        ? `${count} ภาพ — พิมพ์ต่อท้ายเอกสาร สองภาพต่อแถว`
        : "กำลังอ่านรายการภาพ…"}
    >
      {error ? <div className={styles.notice}><StatusNotice tone="error">{error}</StatusNotice></div> : null}

      {/* จำนวนภาพอยู่บนหัวการ์ดแล้ว — ไม่ต้องให้พาเนลนับซ้ำอีกแถว */}
      <AttachmentsPanel
        entityType="product"
        entityId={productId}
        canEdit={canEdit}
        showCount={false}
        title=""
        inlineUpload
        docTypes={[{ key: SPEC_ILLUSTRATION_DOC_TYPE, label: "ภาพประกอบใบสเปคสินค้า" }]}
        onItemsChange={handleItems}
        photoRows={photoRows}
      />

      {count || retired ? (
        <p className={`form-note ${styles.note}`}>
          คำบรรยายพิมพ์ใต้ภาพบนกระดาษ · จองไว้สองบรรทัดเสมอเพื่อให้ทุกแถวสูงเท่ากัน
          · ไม่ใส่ก็ได้ กระดาษจะขึ้นแค่เลขลำดับ
          · ลบภาพที่เอกสารซึ่งยื่นแล้วใช้อยู่ = ภาพถูกซ่อนจากหน้านี้ แต่กระดาษเดิมยังเปิดภาพได้
          {retired ? ` (ซ่อนไว้ ${retired} ภาพ)` : ""}
        </p>
      ) : null}
    </DetailCard>
  );
}
