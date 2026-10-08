"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Images } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";
import StatusNotice from "@/components/ui/StatusNotice";
import { notifyToast } from "@/components/ui/Toast";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { SPEC_ILLUSTRATION_DOC_TYPE, docTypeFileRule } from "@/lib/master/attachmentTypes";
import { ILLUSTRATION_CAPTION_MAX, sortIllustrations } from "@/lib/sales/productSpecIllustrations";
import {
  hiddenIllustrationDeleteOutcome, illustrationReorderPlan, liveIllustrations, retiredIllustrations,
} from "@/lib/sales/productSpecView";
import styles from "./ProductSpecIllustrations.module.css";

// ชนิดไฟล์ที่ภาพประกอบรับ — ป้ายบนจอมาจากกติกาเดียวกับที่ปุ่ม/ลากวาง/POST ใช้ตัดสิน
const specIllustrationRule = docTypeFileRule(SPEC_ILLUSTRATION_DOC_TYPE);

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
 * ⭐ **ภาพที่ซ่อนไว้ลบได้จากการ์ดนี้** (08/10/2569) — ภาพประกอบไม่ขึ้นแผงเอกสารของหน้าสินค้าแล้ว ซึ่งเคยเป็นที่เดียวที่ยังกดลบ
 * ภาพปลดระวางได้ ⇒ คนแก้สเปคเห็นรายการ "ภาพที่ซ่อนไว้" ใต้การ์ด พร้อมปุ่ม "ลบไฟล์" รายภาพ · เส้น DELETE ตัดสินเอง:
 * ยังมีเอกสารที่ยื่นแล้วใช้อยู่ = คงซ่อนไว้ (ตอบ `retired` + ข้อความ) · ไม่มีแล้ว = ลบแถวและปล่อยไฟล์จริง
 * ⚠️ **เห็นปุ่ม ≠ ลบได้เสมอ** — ปุ่มขึ้นตามสิทธิ์แก้สเปค (ทั้งฝ่ายขาย) แต่เส้น DELETE ถามด่านแก้ไฟล์ของสินค้า
 *    (`guardAttachmentWrite`: ทีมที่ดูแลลูกค้าเจ้าของสินค้า/หัวหน้า — ด่านเดียวกับแนบรูป แก้คำบรรยาย สลับลำดับ ของการ์ดนี้
 *    และเท่ากับทางลบเดิมบนหน้าสินค้า) ⇒ คนนอกทีมกดแล้วได้ 403 พร้อมเหตุเป็นคำไทย (`hiddenIllustrationDeleteOutcome`)
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
  const [retiredRows, setRetiredRows] = useState([]);
  /* ภาพซ่อนที่เพิ่งลบจริงจากการ์ดนี้ — ลิสต์เป็นของแผงไฟล์แนบ (ไม่รู้ว่าเราลบไปแล้ว) ⇒ ทับไว้จนกว่าแผงจะโหลดรอบใหม่
     ไม่งั้นแถวที่ลบแล้วเด้งกลับมาทุกครั้งที่แผงแจ้งรายการเดิมซ้ำ */
  const [purgedIds, setPurgedIds] = useState(() => new Set());
  /* ลบภาพซ่อนสำเร็จ = ปุ่มที่กดถูกถอดจากจอ ⇒ โฟกัสคีย์บอร์ดตกไป <body> · คืนให้ปุ่มลบของแถวถัดไป หรือหมายเหตุของการ์ดเมื่อหมดรายการ */
  const hiddenWrapRef = useRef(null);
  const refocusHidden = useRef(false);
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
    setRetiredRows(retiredIllustrations(next));
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
      // ปล่อยเฉพาะของตัวเอง — งานอื่นของการ์ด (สลับลำดับ · ลบภาพซ่อน) ที่ยังวิ่งอยู่ต้องไม่ถูกปลดล็อกตาม
      setBusyId((current) => (current === id ? "" : current));
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
      setBusyId((current) => (current === rows[index].id ? "" : current));
    }
  };

  const hidden = retiredRows.filter((row) => !purgedIds.has(row.id));
  const retired = hidden.length;

  /* ลบไฟล์ของภาพที่ซ่อนไว้ — ผลมีสองแบบและต้องบอกต่างกัน: ยังมีเอกสารใช้อยู่ = ภาพคงซ่อนไว้ (ไม่ใช่ลบไม่สำเร็จ) ·
     ไม่มีแล้ว = ไฟล์ถูกลบจริง แถวหายจากรายการ */
  const removeHidden = async (row) => {
    const name = row.fileName || "ภาพนี้";
    if (!(await confirmAction(`ลบไฟล์ "${name}" ที่ซ่อนไว้? ถ้ายังมีเอกสารที่ยื่นแล้วใช้ภาพนี้อยู่ ระบบจะคงซ่อนไว้ตามเดิม`))) return;
    setBusyId(row.id);
    setError("");
    let outcome;
    try {
      const body = await apiJson(`/api/attachments/${row.id}`, { method: "DELETE", fallbackError: "ลบภาพที่ซ่อนไว้ไม่สำเร็จ" });
      outcome = hiddenIllustrationDeleteOutcome({ body });
    } catch (removeError) {
      outcome = hiddenIllustrationDeleteOutcome({ error: removeError });
    } finally {
      setBusyId((current) => (current === row.id ? "" : current));
    }
    // แถวคงอยู่สองแบบ: ลบไม่สำเร็จ (บอกเหตุบนการ์ด) · ยังมีเอกสารใช้อยู่ (บอกด้วย toast — ไม่ใช่ความผิดพลาด)
    if (outcome.kind === "failed") { setError(outcome.message); return; }
    if (outcome.kind === "kept") { notifyToast.info(outcome.message); return; }
    // ลบจริง หรือหายไปก่อนแล้ว (404) = ออกจากรายการ
    refocusHidden.current = true;
    setPurgedIds((prev) => new Set(prev).add(row.id));
    if (outcome.kind === "gone") notifyToast.info(outcome.message);
    else notifyToast.success(outcome.message);
  };

  useEffect(() => {
    if (!refocusHidden.current || busyId) return;
    refocusHidden.current = false;
    const wrap = hiddenWrapRef.current;
    // ลำดับ: ปุ่มลบของแถวถัดไป → หมายเหตุของการ์ด → ปุ่มแรกของการ์ด (แนบรูป) เมื่อไม่มีภาพเหลือเลยจนหมายเหตุก็ถูกถอด
    //   (เปิดจอดูแล้ว 08/10: ลบภาพซ่อนภาพสุดท้ายของการ์ดที่ไม่มีภาพใช้งานเหลือ โฟกัสตกไป <body>)
    const target = wrap?.querySelector("li button:not([disabled])")
      || wrap?.querySelector("[data-hidden-note]")
      || wrap?.parentElement?.querySelector("button:not([disabled])");
    target?.focus({ preventScroll: true });
  }, [purgedIds, busyId]);

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
                {/* ปุ่มบันทึกล็อกเมื่อการ์ดกำลังทำงานใดอยู่ (เหมือนปุ่มเลื่อน/ลบภาพซ่อน) — งานสองอย่างซ้อนกันแล้วตัวที่จบก่อนจะปลดล็อกอีกตัว */}
                {dirty ? (
                  <Button size="sm" tone="primary" disabled={Boolean(busyId)}
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
        /* ⭐ รับเฉพาะรูป (มติผู้ใช้ 2026-09-22 · "pdf ai ก็ดันแนบได้") — ปุ่ม "แนบรูป" เลือกได้หลายรูป
           ต่อครั้ง · ชนิดที่รับจริงมาจากกติกาของ docType (`DOC_TYPE_FILE_RULES`) ซึ่งลากวาง/Ctrl+V
           และ POST ของเส้นไฟล์แนบถามตัวเดียวกัน */
        photoCapture
        docTypes={[{ key: SPEC_ILLUSTRATION_DOC_TYPE, label: "ภาพประกอบใบสเปคสินค้า" }]}
        onItemsChange={handleItems}
        photoRows={photoRows}
      />

      <div ref={hiddenWrapRef}>
      {count || retired ? (
        <p className={`form-note ${styles.note}`} tabIndex={-1} data-hidden-note="">
          รับเฉพาะ{specIllustrationRule.label}
          · คำบรรยายพิมพ์ใต้ภาพบนกระดาษ · จองไว้สองบรรทัดเสมอเพื่อให้ทุกแถวสูงเท่ากัน
          · ไม่ใส่ก็ได้ กระดาษจะขึ้นแค่เลขลำดับ
          · ลบภาพที่เอกสารซึ่งยื่นแล้วใช้อยู่ = ภาพถูกซ่อนจากหน้านี้ แต่กระดาษเดิมยังเปิดภาพได้
          {retired ? ` (ซ่อนไว้ ${retired} ภาพ)` : ""}
        </p>
      ) : null}

      {/* ภาพที่ซ่อนไว้ — เห็นเฉพาะคนแก้สเปคได้ (คนอื่นเห็นแค่เลขในหมายเหตุข้างบน) · ไม่วาดรูป: ไฟล์พวกนี้ถูกซ่อนจากสเปคโดยตั้งใจ
          ให้แค่ชื่อไฟล์กับทางลบ */}
      {canEdit && retired ? (
        <div className={styles.hidden}>
          <p className={styles.hiddenHead}>ภาพที่ซ่อนไว้ {retired} ภาพ — ลบไฟล์ได้เมื่อไม่มีเอกสารที่ยื่นแล้วใช้อยู่</p>
          <ul className={styles.hiddenList}>
            {hidden.map((row) => (
              <li key={row.id} className={styles.hiddenRow}>
                <span className={`mono ${styles.file}`}>{naText(row.fileName)}</span>
                <Button size="sm" variant="ghost" tone="danger" disabled={Boolean(busyId)}
                  aria-label={`ลบไฟล์ของภาพที่ซ่อนไว้ ${row.fileName || ""}`}
                  onClick={() => removeHidden(row)}>
                  {busyId === row.id ? "กำลังลบ…" : "ลบไฟล์"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
    </DetailCard>
  );
}
