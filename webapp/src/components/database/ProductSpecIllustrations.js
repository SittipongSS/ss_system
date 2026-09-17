"use client";
import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Images } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { apiFetch } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { SPEC_ILLUSTRATION_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { sortIllustrations } from "@/lib/sales/productSpecIllustrations";
import styles from "./ProductSpecIllustrations.module.css";

/**
 * ภาพประกอบรายละเอียดสินค้า (แผ่นที่ 3 ของกระดาษ FM-SA-04)
 *
 * ⭐ **มติผู้ใช้ 2026-09-17: "ภาพประกอบอยู่กับสเปคสินค้า"** ⇒ ไฟล์แนบกับ **ตัวสินค้า**
 * (`entityType="product"` · `docType="spec_illustration"`) ไม่ใช่กับฉบับสเปก
 * ⇒ อัปครั้งเดียวใช้ได้ทุกฉบับ และได้ด่านสิทธิ์กับโฟลเดอร์ Drive ของสินค้ามาทั้งชุด
 * โดยไม่ต้องต่อ entity แนบไฟล์ใหม่ 5 จุด (เช็กลิสต์ที่ `lib/sales/salesAttachmentAccess.js`)
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
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const handleItems = useCallback((next, meta) => {
    setItems(next.filter((row) => row.docType === SPEC_ILLUSTRATION_DOC_TYPE));
    setLoaded(Boolean(meta?.loaded));
  }, []);

  const rows = useMemo(() => sortIllustrations(items), [items]);

  const save = async (id, metadata) => {
    setBusyId(id);
    setError("");
    try {
      const res = await apiFetch(`/api/attachments/${id}`, {
        method: "PATCH", json: { metadata }, fallbackError: "บันทึกคำบรรยายไม่สำเร็จ",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "บันทึกคำบรรยายไม่สำเร็จ");
      setItems((prev) => prev.map((row) => (row.id === id
        ? { ...row, metadata: { ...(row.metadata || {}), ...metadata } }
        : row)));
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
  const swap = async (index, direction) => {
    const target = rows[index + direction];
    const current = rows[index];
    if (!target || !current) return;
    const currentOrder = index;
    const targetOrder = index + direction;
    setBusyId(current.id);
    setError("");
    try {
      for (const [row, order] of [[current, targetOrder], [target, currentOrder]]) {
        const res = await apiFetch(`/api/attachments/${row.id}`, {
          method: "PATCH", json: { metadata: { sortOrder: order } }, fallbackError: "สลับลำดับไม่สำเร็จ",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "สลับลำดับไม่สำเร็จ");
        }
      }
      setItems((prev) => prev.map((row) => {
        if (row.id === current.id) return { ...row, metadata: { ...(row.metadata || {}), sortOrder: targetOrder } };
        if (row.id === target.id) return { ...row, metadata: { ...(row.metadata || {}), sortOrder: currentOrder } };
        return row;
      }));
    } catch (swapError) {
      setError(swapError.message || "สลับลำดับไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  return (
    <DetailCard
      icon={Images}
      eyebrow="ILLUSTRATIONS"
      title="ภาพประกอบรายละเอียดสินค้า"
      meta={loaded
        ? `${rows.length} ภาพ — พิมพ์ต่อท้ายเอกสาร สองภาพต่อแถว`
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
      />

      {rows.length ? (
        <div className={styles.captions}>
          <div className={styles.captionsHead}>คำบรรยายที่จะพิมพ์ใต้ภาพ</div>
          <TableScroll family="editable" surface="embedded">
            <table>
              <thead>
                <tr>
                  <th className={`num ${styles.colNo}`}>ที่</th>
                  <th className={styles.colFile}>ไฟล์</th>
                  <th>คำบรรยาย</th>
                  {canEdit ? <th className={styles.colOrder}>ลำดับ</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const caption = drafts[row.id] ?? row.metadata?.caption ?? "";
                  const dirty = drafts[row.id] !== undefined
                    && drafts[row.id] !== (row.metadata?.caption ?? "");
                  return (
                    <tr key={row.id}>
                      <td className="num">{index + 1}</td>
                      <td className={`mono ${styles.file}`}>{naText(row.fileName)}</td>
                      <td>
                        {canEdit ? (
                          <div className={styles.captionCell}>
                            <Input
                              value={caption}
                              maxLength={200}
                              placeholder="เช่น กล่องแบบใหม่ เปิดขึ้น"
                              onChange={(event) => setDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                            />
                            {dirty ? (
                              <Button size="sm" tone="primary" disabled={busyId === row.id}
                                onClick={() => save(row.id, { caption: caption.trim() })}>
                                {busyId === row.id ? "กำลังบันทึก…" : "บันทึก"}
                              </Button>
                            ) : null}
                          </div>
                        ) : naText(row.metadata?.caption)}
                      </td>
                      {canEdit ? (
                        <td>
                          <div className={styles.orderCell}>
                            <Button iconOnly variant="ghost" size="sm" aria-label={`เลื่อนขึ้น ${row.fileName || index + 1}`}
                              disabled={index === 0 || Boolean(busyId)}
                              onClick={() => swap(index, -1)} icon={<ArrowUp size={14} />} />
                            <Button iconOnly variant="ghost" size="sm" aria-label={`เลื่อนลง ${row.fileName || index + 1}`}
                              disabled={index === rows.length - 1 || Boolean(busyId)}
                              onClick={() => swap(index, 1)} icon={<ArrowDown size={14} />} />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <p className={`form-note ${styles.note}`}>
            คำบรรยายพิมพ์ใต้ภาพบนกระดาษ · จองไว้สองบรรทัดเสมอเพื่อให้ทุกแถวสูงเท่ากัน
            · ไม่ใส่ก็ได้ กระดาษจะขึ้นแค่เลขลำดับ
          </p>
        </div>
      ) : null}
    </DetailCard>
  );
}
