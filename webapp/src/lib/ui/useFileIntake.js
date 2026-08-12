"use client";
// ── ทางเข้าไฟล์ของทั้งระบบ: กดเลือก · ลากมาวาง · วางจากคลิปบอร์ด ────────────
//
// ⭐ **ที่เดียวที่รู้เรื่อง "ผู้ใช้ส่งไฟล์เข้ามาได้ยังไง"** (มติผู้ใช้ 2026-08-12 · IS-26080013
// "ไฟล์แนบอยาก ctrl+V ได้ค่ะ")
//
// 🐞 ตรวจก่อนแก้: ระบบมีจุดแนบไฟล์ 13 จุด **ทุกจุดเขียน `<input type="file">` ของตัวเอง**
// ผลคือความสามารถกระจายไม่เท่ากันโดยไม่มีใครตั้งใจ — วางจากคลิปบอร์ดได้ 2 จุด
// (เธรดอัปเดต · แผงไฟล์แนบเฉพาะโหมด inline) ลากมาวางได้ 2 จุด ที่เหลือกดปุ่มอย่างเดียว
// และตะกร้าไฟล์ของ **ทุกฟอร์มสร้าง** (`ui/PendingFiles`) ไม่มีทั้งสองอย่าง
//
// 🐞 ที่หนักกว่านั้น: จุดที่ "มี" onPaste ก็ผูกไว้กับ `<div>` เฉย ๆ ซึ่ง **ไม่ได้รับ
// event ถ้าไม่มีอะไรในกล่องนั้นโฟกัสอยู่** — เหตุการณ์ paste ยิงที่ element ที่โฟกัส
// ไม่ได้ยิงที่ document แล้วไหลลงมา ⇒ ผู้ใช้จับภาพหน้าจอมาแล้วกด Ctrl+V ทันที
// (ซึ่งเป็นลำดับที่คนทำจริง) จะไม่เกิดอะไรขึ้นเลย ทั้งที่โค้ดมี handler อยู่
//
// ที่นี่จึงดัก paste ที่ระดับ document แล้วค่อยตัดสินว่า "ของกล่องไหน":
//   1. กล่องที่มีโฟกัสอยู่ข้างใน = ของกล่องนั้น (ผู้ใช้เจาะจงแล้ว)
//   2. ไม่มีอะไรโฟกัส = ยกให้กล่อง "ที่ควรได้" ตามลำดับ: โมดัลก่อนพื้นหลัง →
//      `weight` น้อยก่อน → ลำดับใน DOM
//      ⚠️ โมดัลมาก่อนเพราะของข้างหลังโมดัลผู้ใช้มองไม่เห็นด้วยซ้ำ การแปะไฟล์ลงไป
//      เงียบ ๆ คือสิ่งที่เขาจะหาไม่เจอทีหลัง
//      ⚠️ `weight` มีไว้แก้กรณีจริงที่เจอตอนทดสอบ: หน้ารายละเอียดลูกค้ามีกล่องรับไฟล์
//      **สองกล่อง** — แผงเอกสารแนบ กับ ช่องพิมพ์ของเธรดอัปเดต · คนที่กด Ctrl+V ลอย ๆ
//      บนหน้านั้นหมายถึง "แนบเข้าเอกสาร" ไม่ใช่ "แปะลงแชท" (เขากำลังจะพิมพ์แชทก็ต่อ
//      เมื่อเคอร์เซอร์อยู่ในช่องแชทอยู่แล้ว ซึ่งข้อ 1 รับไปก่อนแล้ว) ⇒ เธรดตั้ง
//      `weight: 1` ให้ถอยให้แผงเอกสาร · เดาผิดที่นี่ไม่ใช่เรื่องเล็ก เพราะแผงเอกสาร
//      **อัปขึ้น server ทันที** ไฟล์จะไปโผล่ผิดที่จริง ๆ ไม่ใช่แค่ค้างในฟอร์ม
//   3. โฟกัสอยู่ในช่องพิมพ์ที่ไม่ใช่ของเรา = ไม่แตะ (ปล่อยให้เป็นการวางข้อความตามปกติ)
//
// ⚠️ ด่านขนาดไฟล์อยู่ที่นี่ที่เดียวเหมือนกัน — เดิม `PendingFiles` เช็คเอง ส่วนจุดอื่น
// ไม่เช็คเลย ⇒ ผู้ใช้เพิ่งรู้ว่าไฟล์ใหญ่เกินตอนอัปไม่ผ่านหลังกดบันทึก (เสียรอบหนึ่งรอบ)
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

// ป้ายบอกว่า element นี้เป็นกล่องรับไฟล์ — ใช้หากล่องเจ้าของ paste ข้ามคอมโพเนนต์
// โดยไม่ต้องมี context provider คร่อมทั้งแอป
const ZONE_ATTR = "data-file-intake";
// ลำดับความเป็นเจ้าของตอนไม่มีใครโฟกัส — น้อย = ได้ก่อน (ดูเหตุผลข้อ 2 หัวไฟล์)
const WEIGHT_ATTR = "data-file-intake-weight";

const isVisible = (el) => !!el && !!el.offsetParent && el.getClientRects().length > 0;

/**
 * กล่องไหน "เป็นเจ้าของ" การวางครั้งนี้ เมื่อไม่มีอะไรโฟกัสอยู่ (กติกาข้อ 2 หัวไฟล์)
 * แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้เทสต์ได้ — ลำดับนี้ตัดสินว่าไฟล์ไปโผล่ที่ไหน
 * และบางปลายทาง **อัปขึ้น server ทันที** จึงเป็นตรรกะที่พังเงียบไม่ได้
 * @param {Array<{inDialog: boolean, weight: number}>} pool ตามลำดับที่อยู่ใน DOM
 * @returns {number} index ของเจ้าของ · -1 ถ้าไม่มีใครเข้าเกณฑ์
 */
export function pickIntakeOwner(pool = []) {
  if (!pool.length) return -1;
  const dialogs = pool.filter((z) => z.inDialog);
  const candidates = dialogs.length ? dialogs : pool;
  const best = Math.min(...candidates.map((z) => z.weight || 0));
  return pool.indexOf(candidates.find((z) => (z.weight || 0) === best));
}

/* ช่องพิมพ์ที่ "กินคลิปบอร์ดเอง" — วางข้อความลง textarea ต้องเป็นการวางข้อความ
   ไม่ใช่จู่ ๆ ไปแนบไฟล์ให้ · ยกเว้นช่องที่อยู่ในกล่องรับไฟล์เอง (เช่นช่องพิมพ์ข้อความ
   ของเธรดอัปเดต ซึ่งตั้งใจให้แปะรูปลงไปตรง ๆ ได้) */
const isForeignTextField = (el, zone) => {
  if (!el || (zone && zone.contains(el))) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
};

const filesFromClipboard = (event) => Array.from(event.clipboardData?.items || [])
  .filter((item) => item.kind === "file")
  .map((item) => item.getAsFile())
  .filter(Boolean);

/**
 * @param {object} options
 * @param {(files: File[]) => void} options.onFiles     ไฟล์ที่ผ่านด่านแล้ว (อย่างน้อย 1 ไฟล์)
 * @param {(message: string) => void} [options.onOversize]  ไฟล์ที่ใหญ่เกิน — ผู้เรียกโชว์เอง
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.multiple]
 * @param {string}  [options.accept]     ค่าตั้งต้น = ชนิดไฟล์แนบมาตรฐานของระบบ
 * @param {number}  [options.maxBytes]
 * @returns {{open: () => void, dragOver: boolean, inputProps: object, zoneProps: object}}
 */
export function useFileIntake({
  onFiles,
  onOversize,
  disabled = false,
  multiple = true,
  accept = UPLOAD_ACCEPT_ATTR,
  maxBytes = MAX_UPLOAD_BYTES,
  // 0 = กล่อง "แนบไฟล์" ปกติ · 1 = ถอยให้กล่องอื่นก่อน (ช่องพิมพ์ของเธรดอัปเดต)
  weight = 0,
} = {}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const zoneRef = useRef(null);

  /* handler ตัวจริงเก็บใน ref — listener ระดับ document ผูกครั้งเดียวต่อกล่อง
     ถ้าให้ callback ไหลเข้า deps ตรง ๆ listener จะถูกถอด/ผูกใหม่ทุก render
     แล้วมีจังหวะที่ paste ตกพื้น (บั๊กแบบเดียวกับที่ AttachmentsPanel คอมเมนต์ไว้) */
  const handlersRef = useRef({ onFiles, onOversize, disabled, multiple, maxBytes });
  handlersRef.current = { onFiles, onOversize, disabled, multiple, maxBytes };

  const acceptFiles = useCallback((list) => {
    const { onFiles: emit, onOversize: warn, disabled: off, multiple: many, maxBytes: cap } = handlersRef.current;
    if (off) return false;
    const picked = Array.from(list || []);
    if (!picked.length) return false;

    const oversized = picked.filter((file) => file.size > cap);
    if (oversized.length) {
      warn?.(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB: ${oversized.map((f) => f.name).join(", ")}`);
    }
    const ok = picked.filter((file) => file.size <= cap);
    if (!ok.length) return false;

    emit?.(many ? ok : ok.slice(0, 1));
    return true;
  }, []);

  // ── วางจากคลิปบอร์ด: ดักที่ document แล้วตัดสินเจ้าของ (ดูเหตุผลหัวไฟล์) ──
  useEffect(() => {
    if (disabled) return undefined;

    const onPaste = (event) => {
      const zone = zoneRef.current;
      if (!zone || !isVisible(zone)) return;

      const active = document.activeElement;
      const focusedInside = zone.contains(active);
      if (!focusedInside && isForeignTextField(active, zone)) return;

      if (!focusedInside) {
        // ไม่มีใครเจาะจง — เลือกเจ้าของตามกติกาข้อ 2 (โมดัล → weight → ลำดับใน DOM)
        const all = Array.from(document.querySelectorAll(`[${ZONE_ATTR}]`)).filter(isVisible);
        const index = pickIntakeOwner(all.map((el) => ({
          inDialog: !!el.closest(".drawer"),
          weight: Number(el.getAttribute(WEIGHT_ATTR) || 0),
        })));
        if (all[index] !== zone) return;
      }

      const files = filesFromClipboard(event);
      if (files.length && acceptFiles(files)) event.preventDefault();
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [disabled, acceptFiles]);

  const open = useCallback(() => {
    if (!handlersRef.current.disabled) inputRef.current?.click();
  }, []);

  const inputProps = {
    ref: inputRef,
    type: "file",
    accept,
    multiple,
    disabled,
    className: "hidden",
    onChange: (event) => {
      acceptFiles(event.target.files);
      event.target.value = "";   // เลือกไฟล์เดิมซ้ำได้ (ถอดออกแล้วเปลี่ยนใจ)
    },
  };

  const zoneProps = {
    ref: zoneRef,
    [ZONE_ATTR]: "",
    [WEIGHT_ATTR]: String(weight),
    "data-drag-over": dragOver ? "" : undefined,
    onDragOver: disabled ? undefined : (event) => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: disabled ? undefined : (event) => {
      // ลากผ่านลูกข้างในไม่ใช่ "ออกจากกล่อง" — ไม่งั้นกรอบกะพริบตลอดทาง
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setDragOver(false);
    },
    onDrop: disabled ? undefined : (event) => {
      event.preventDefault();
      setDragOver(false);
      acceptFiles(event.dataTransfer?.files);
    },
  };

  return { open, dragOver, inputProps, zoneProps };
}

export default useFileIntake;
