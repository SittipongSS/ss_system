"use client";
// ── กล่องดูเอกสาร Google ในหน้า ─────────────────────────────────────────
// ที่เดียวของทั้งระบบ — ทั้งกล่องไฟล์แนบ (AttachmentsPanel) และแท็บเอกสารของ
// ดีล/โครงการ (EntityDocumentsPanel) เรียกตัวนี้ตัวเดียวกัน
//
// ⚠️ **อ่านอย่างเดียวเสมอ** — Google ไม่ให้ฝังตัวแก้ไข (`/edit` ส่ง X-Frame-Options
// มาบล็อก) ฝังได้แค่ `/preview` ⇒ ปุ่มออกไปแก้ต้องเด่นและอยู่ตลอด ไม่ใช่ลิงก์เล็ก ๆ
//
// ⚠️ iframe ข้ามโดเมน = หน้าแม่อ่านข้างในไม่ได้เลย **พังแล้วเงียบสนิท** ทั้ง onError
// และ contentDocument ตรวจไม่ได้ ⇒ คำอธิบายสาเหตุที่พบบ่อยสุด (ไม่ได้ล็อกอิน Google
// ในเบราว์เซอร์นี้ — คนละระบบกับ login ของแอป) ต้องค้างไว้ตลอด ไม่ใช่โผล่ตอนพัง
import { ExternalLink } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import styles from "./GoogleDocViewer.module.css";

export default function GoogleDocViewer({ open, title, previewUrl, editUrl, onClose }) {
  return (
    <Modal open={!!open && !!previewUrl} onClose={onClose} title={title || "เอกสาร"} size="lg" closeOnOverlay>
      {previewUrl && (
        <div>
          <div className={styles.bar}>
            <span className={styles.badge}>อ่านอย่างเดียว</span>
            {editUrl && (
              <Button
                as="a" href={editUrl} target="_blank" rel="noreferrer" size="sm"
                icon={<ExternalLink size={13} aria-hidden="true" />}
              >
                แก้ใน Google
              </Button>
            )}
          </div>
          <iframe src={previewUrl} title={title || "เอกสาร"} loading="lazy" className={styles.frame} />
          <p className={styles.hint}>
            กรอบว่าง? ต้องล็อกอินบัญชี Google ของบริษัทในเบราว์เซอร์นี้ก่อน — กด “แก้ใน Google” เพื่อเปิดแท็บใหม่
          </p>
        </div>
      )}
    </Modal>
  );
}
