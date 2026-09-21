"use client";
import { useCallback, useState } from "react";
import { ArrowDown, ArrowUp, Images } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiFetch } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { SPEC_ILLUSTRATION_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { ILLUSTRATION_CAPTION_MAX, sortIllustrations, specIllustrationsOf } from "@/lib/sales/productSpecIllustrations";
import styles from "./ProductSpecIllustrations.module.css";

/**
 * ภาพประกอบรายละเอียดสินค้า (แผ่นที่ 3 ของกระดาษ FM-SA-04)
 *
 * ⭐ **มติผู้ใช้ 2026-09-17: "ภาพประกอบอยู่กับสเปคสินค้า"** ⇒ ไฟล์แนบกับ **ตัวสินค้า**
 * (`entityType="product"` · `docType="spec_illustration"`) ไม่ใช่กับฉบับสเปก
 * ⇒ อัปครั้งเดียวใช้ได้ทุกฉบับ และได้ด่านสิทธิ์กับโฟลเดอร์ Drive ของสินค้ามาทั้งชุด
 * โดยไม่ต้องต่อ entity แนบไฟล์ใหม่ 5 จุด (เช็กลิสต์ที่ `lib/sales/salesAttachmentAccess.js`)
 *
 * ⭐ **มติผู้ใช้ 2026-09-21: รูปกับคำบรรยายอยู่บรรทัดเดียวกัน** (`photoRows` ของแผงไฟล์แนบ)
 * 🐞 ของเดิมเป็นตะแกรงรูป **แล้วมีตารางคำบรรยายแยกอยู่ข้างล่าง** ⇒ คนกรอกต้องเทียบชื่อไฟล์
 *   (`BC71BBB9-A19B-…jpg`) เองว่าแถวไหนคู่กับรูปไหน · รูปเดียวยังพอเดา สิบรูปคือเดาผิด
 *
 * ⚠️ **คำบรรยายกับลำดับอยู่ที่ `metadata` ของไฟล์** — กระดาษที่พิมพ์สดจึงเป็นภาพชุด
 * วันนี้เสมอ · ฉบับที่ออกไปแล้วยังอ่านเหมือนวันที่ส่งไปผ่าน snapshot ของ `issued_documents`
 * ซึ่งเป็นกลไกเดียวกับ QT/SO (ไม่ใช่การก๊อปลิสต์รูปเข้าแต่ละฉบับ)
 *
 * ⚠️ **ห้ามก๊อปแถว `attachments` ให้ชี้ไฟล์เดียวกันสองแถว** — `DELETE` ของเส้นไฟล์แนบ
 * เรียก `releaseAttachmentFile` ซึ่งปล่อยตัวไฟล์จริง ⇒ ลบแถวหนึ่งแล้วอีกแถวเหลือ
 * ตัวชี้ที่ไฟล์หายไป
 */
export default function ProductSpecIllustrations({ productId, canEdit = false }) {
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState({});
  /* ค่าที่เพิ่งบันทึกสำเร็จ — ทับค่าที่แผงไฟล์แนบถืออยู่จนกว่ามันจะโหลดรอบใหม่
     🪤 ลิสต์รูปเป็นของแผง ไม่ใช่ของเรา ⇒ ถ้าไม่ทับ: กดบันทึกคำบรรยายแล้วช่องเด้งกลับ
        เป็นค่าเก่า และกดสลับลำดับแล้วแถวไม่ขยับ ทั้งที่ฐานเปลี่ยนไปแล้วทั้งสองกรณี */
  const [saved, setSaved] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const handleItems = useCallback((next, meta) => {
    // ตัวคัดตัวเดียวกับที่เอกสารใช้ ⇒ เลขบนหัวการ์ดเท่ากับจำนวนภาพที่พิมพ์ออกจริง
    setCount(specIllustrationsOf(next).length);
    setLoaded(Boolean(meta?.loaded));
  }, []);

  const patch = async (id, metadata, fallback) => {
    const res = await apiFetch(`/api/attachments/${id}`, { method: "PATCH", json: { metadata } });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || fallback);
    }
  };

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

  /* สลับที่กับเพื่อนบ้าน — เขียน `sortOrder` ของสองแถวเท่านั้น
     ⚠️ ไม่ใช่เขียนใหม่ทั้งลิสต์: แถวที่ไม่ได้ขยับไม่ควรถูกแตะ เพราะทุกการเขียนคือ
     หนึ่งคำขอที่พังแยกกันได้ ⇒ ลิสต์จะค้างครึ่งทางแบบที่อธิบายให้คนกดไม่ได้ */
  const swap = async (rows, index, direction) => {
    const current = rows[index];
    const target = rows[index + direction];
    if (!current || !target) return;
    const currentOrder = index;
    const targetOrder = index + direction;
    setBusyId(current.id);
    setError("");
    try {
      for (const [row, order] of [[current, targetOrder], [target, currentOrder]]) {
        await patch(row.id, { sortOrder: order }, "สลับลำดับไม่สำเร็จ");
        setSaved((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), sortOrder: order } }));
      }
    } catch (swapError) {
      setError(swapError.message || "สลับลำดับไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  /* แถวหนึ่งบรรทัดต่อหนึ่งรูป — ฝั่งขวาของรูปนั้น ๆ
     ⚠️ ลำดับมาจาก `sortIllustrations` ของลิสต์ที่ทับด้วยค่าที่เพิ่งบันทึกแล้ว */
  const photoRows = (photos) => {
    const rows = sortIllustrations(photos.map((photo) => (saved[photo.id]
      ? { ...photo, metadata: { ...(photo.metadata || {}), ...saved[photo.id] } }
      : photo)));
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
                    onClick={() => swap(rows, index, -1)} icon={<ArrowUp size={14} />} />
                  <Button iconOnly variant="ghost" size="sm" aria-label={`เลื่อนลง ภาพที่ ${index + 1}`}
                    disabled={index === rows.length - 1 || Boolean(busyId)}
                    onClick={() => swap(rows, index, 1)} icon={<ArrowDown size={14} />} />
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
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
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
      {error ? <p className={styles.error} role="status">{error}</p> : null}

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

      {count ? (
        <p className={`form-note ${styles.note}`}>
          คำบรรยายพิมพ์ใต้ภาพบนกระดาษ · จองไว้สองบรรทัดเสมอเพื่อให้ทุกแถวสูงเท่ากัน
          · ไม่ใส่ก็ได้ กระดาษจะขึ้นแค่เลขลำดับ
        </p>
      ) : null}
    </DetailCard>
  );
}
