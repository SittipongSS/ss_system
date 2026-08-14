"use client";
// ── แท็บเอกสารของดีล — รวม 6 แหล่งไว้ที่เดียว (P5b) ──────────────────────
//
// ⭐ ไฟล์ของดีลวันนี้กระจายอยู่หลายที่โดยไม่มีหน้าไหนเห็นครบ — คนที่ถามว่า
// "เอกสารของดีลนี้มีอะไรบ้าง" ต้องเปิด 4–5 จอแล้วจำเอาเอง
//
// ⚠️ วางใน `components/salesPlanning/` **ไม่ใช่ dir ใหม่** — scripts/uiLegacyBudget.mjs
// map dir → module ⇒ dir ใหม่จะได้งบชั้นเก่าของตัวเองที่ไม่มีใครดูแล
import { useCallback, useEffect, useState } from "react";
import { Paperclip, ExternalLink, Eye } from "lucide-react";
import GoogleDocViewer from "@/components/GoogleDocViewer";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { DOCUMENT_SOURCES } from "@/lib/sales/entityDocuments";
import { fmtDate } from "@/lib/format";
import styles from "./entityDocuments.module.css";

// รับ `dealId` (แท็บบนหน้าดีล) หรือ `projectId` (แท็บบนหน้าโครงการ · ม-88) —
// โหมดโครงการรวมของทุกดีลข้างใน และบรรทัดรองบอกว่าแถวไหนมาจากดีลไหน
export default function EntityDocumentsPanel({ dealId, projectId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // แถวเอกสารร่วมที่กำลังเปิดดูในหน้า — null = ปิดอยู่
  const [viewing, setViewing] = useState(null);

  const reload = useCallback(() => {
    if (!dealId && !projectId) return;
    setLoading(true); setError("");
    const query = dealId
      ? `dealId=${encodeURIComponent(dealId)}`
      : `projectId=${encodeURIComponent(projectId)}`;
    fetch(`/api/sales-planning/documents/all?${query}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "โหลดเอกสารไม่สำเร็จ");
        return d;
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dealId, projectId]);
  useEffect(() => { reload(); }, [reload]);

  // แนบไฟล์แล้วต้องเห็นในลิสต์ทันที · ข้ามครั้งแรก (AttachmentsPanel ยิงตอน mount
  // ด้วย) ไม่งั้นจะดึงซ้ำเปล่า ๆ ทุกครั้งที่เปิดแท็บ
  const [seeded, setSeeded] = useState(false);
  const onAttachmentsChange = useCallback(() => {
    if (!seeded) { setSeeded(true); return; }
    reload();
  }, [seeded, reload]);

  // 🐞 **ลูปยิง API ไม่หยุด** (เจอ 2026-08-14 · มีมาก่อนงานเอกสารร่วม) — เดิมเป็น
  // `if (loading)` เฉย ๆ ⇒ ทุกครั้งที่ reload() ตั้ง loading=true แผงนี้คืน skeleton
  // แล้ว `AttachmentsPanel` ข้างล่าง **ถูกถอดออกจากต้นไม้** · พอโหลดเสร็จมันติดตั้ง
  // ใหม่ → ยิง onItemsChange ตอน mount → parent reload() → loading=true → ถอดอีก
  // วนไม่จบ (วัดได้ ~500 request/วินาที ค้างไว้ตลอดเวลาที่เปิดแท็บนี้)
  //
  // ⇒ skeleton เฉพาะ**รอบแรก**ที่ยังไม่มีข้อมูลเลย · รอบถัดไปคงลิสต์เดิมไว้ให้อ่าน
  // ระหว่างโหลด ซึ่งทั้งตัดลูปและอ่านง่ายกว่าจอกระพริบเป็น skeleton ทุกครั้งที่แนบไฟล์
  if (loading && !data) return <SkeletonRows rows={4} />;
  if (error) return <StatusNotice tone="error">{error}</StatusNotice>;

  const rows = data?.rows || [];
  const progress = data?.progress || { arrived: 0, waiting: 0 };

  return (
    <div className={styles.wrap}>
      {/* ⭐ ตัวเลขนี้เป็นไปได้ก็เพราะระบบรู้จัก "ของที่ยังไม่มา" — นับแต่ไฟล์ที่มีแล้ว
          จะได้ 100% เสมอ ซึ่งอ่านแล้วเหมือนครบทั้งที่ไม่ครบ */}
      <div className={styles.progress}>
        มาแล้ว <strong>{progress.arrived}</strong>
        {progress.waiting > 0 && <> · รอ <strong className={styles.waiting}>{progress.waiting}</strong></>}
      </div>

      {!rows.length && (
        <EmptyState icon={Paperclip}>
          {dealId ? "ดีลนี้" : "โครงการนี้"}ยังไม่มีเอกสารและไม่มีรายการที่รออยู่
        </EmptyState>
      )}

      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.row} data-awaiting={row.source === "awaiting" ? "" : undefined}>
            <div className={styles.main}>
              <div className={styles.title}>{row.title}</div>
              <div className={styles.meta}>
                {DOCUMENT_SOURCES[row.source]?.label || row.source}
                {row.note ? ` · ${row.note}` : ""}
                {row.at ? ` · ${fmtDate(row.at)}` : ""}
              </div>
            </div>
            <div className={styles.actions}>
              {/* ⭐ เอกสารร่วมได้ปุ่มเพิ่มมาหนึ่งตัว เพราะมันทำได้สองอย่างจริง ๆ:
                  ดูในหน้า (อ่าน) กับไปแก้ที่ Google · แถวอื่นทำได้อย่างเดียวคือเปิด
                  ⚠️ ปุ่ม "ดู" เป็นการ**อ่าน** จึงอยู่ในลิสต์นี้ได้ ไม่ขัดกับกติกาว่า
                  ลิสต์บนไม่มีปุ่มทำลาย — ปุ่มลบยังอยู่ในกล่องล่างที่เดียว */}
              {row.previewUrl && (
                <Button
                  size="sm" variant="quiet"
                  onClick={() => setViewing(row)}
                  icon={<Eye size={13} aria-hidden="true" />}
                >
                  ดู
                </Button>
              )}
              {row.href && (
                <Button
                  as="a" href={row.href} size="sm" variant="quiet"
                  target={row.source === "awaiting" ? undefined : "_blank"}
                  icon={<ExternalLink size={13} aria-hidden="true" />}
                >
                  {/* ⚠️ ฉบับที่ออกจริงเป็น HTML ไม่ใช่ PDF — ห้ามเขียน "ดาวน์โหลด"
                      ผู้ใช้จะรอไฟล์ที่ไม่มีวันมา · ของที่ยังไม่มาพาไปดูคำร้อง
                      ไม่ใช่ให้เปิดใบใหม่ (คำร้องเปิดไปแล้ว จะได้ใบซ้ำ) */}
                  {row.source === "awaiting" ? "ดูคำร้อง" : row.previewUrl ? "แก้" : "เปิดดู"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* ⭐ ที่แนบไฟล์เข้าดีลโดยตรง (P5c) — แหล่งที่ 1 ของแผงนี้
          ⚠️ ต่อครบ 5 จุดแล้ว (ดู lib/sales/salesAttachmentAccess.js) · ขาดจุดไหนก็
          หลุดเงียบจุดนั้น: ไฟล์ไม่ขึ้น · อัปไม่ได้ · ใครก็ลบได้ · พรีวิวไม่ขึ้น
          ⚠️ โหมดโครงการ (ม-88) ไม่มีกล่องนี้ — ไฟล์แนบเข้า **ดีล** รายใบ
          โครงการเป็นแค่ที่รวม แนบตรงนี้จะไม่รู้ว่าเข้าดีลไหน */}
      {/* ⭐ โครงการแนบ **เอกสารร่วมอย่างเดียว** (เฟส 2) — ร่างสเปก โน้ตประชุม ตาราง
          เทียบราคา ที่เป็นของทั้งโครงการจริง ๆ · ไม่เปิดอัปไฟล์นิ่งเพราะไฟล์หลักฐาน
          (PO · มัดจำ) ต้องผูกดีลรายใบ ไม่งั้นไม่รู้ว่าเป็นหลักฐานของดีลไหน
          — เหตุผลเดียวกับที่โหมดนี้ไม่เคยมีกล่องแนบไฟล์มาก่อน */}
      {projectId && (
      <div className={styles.upload}>
        <div className="toolbar-label">เอกสารร่วมของโครงการ</div>
        <AttachmentsPanel
          entityType="project"
          entityId={projectId}
          canEdit
          inlineUpload
          googleDocs
          fileUploads={false}
          onItemsChange={onAttachmentsChange}
        />
      </div>
      )}

      {dealId && (
      <div className={styles.upload}>
        <div className="toolbar-label">แนบเอกสารเข้าดีลนี้</div>
        <AttachmentsPanel
          entityType="deal"
          entityId={dealId}
          canEdit
          inlineUpload
          // เอกสารร่วม (Google Doc/Sheet) — ร่างสเปก ตารางเทียบราคา ที่หลายคนแก้พร้อมกัน
          // ⚠️ ปุ่มสร้างอยู่ที่นี่ที่เดียว แม้เอกสารจะไปโผล่ในลิสต์รวมด้านบนด้วย —
          // ลิสต์บนตั้งใจให้อ่านอย่างเดียวทั้งแถบ (ของส่วนใหญ่ในนั้นลบไม่ได้อยู่แล้ว
          // เช่นใบเสนอราคาที่ออกไปแล้ว) ⇒ ปุ่มลบอยู่กล่องนี้ที่เดียวเหมือนไฟล์แนบ
          googleDocs
          // ⚠️ `onItemsChange` คือ callback จริงของแผงนี้ (ไม่ใช่ onChanged) — แจ้ง
          // รายการปัจจุบันทุกครั้งที่เปลี่ยน ⇒ ใช้เป็นสัญญาณให้ดึงยอดรวมใหม่
          // ขาดไปแล้วคนจะกดแนบซ้ำเพราะลิสต์ด้านบนยังไม่ขยับ (นึกว่าไม่ติด)
          onItemsChange={onAttachmentsChange}
        />
      </div>
      )}

      <GoogleDocViewer
        open={!!viewing}
        title={viewing?.title}
        previewUrl={viewing?.previewUrl}
        editUrl={viewing?.href}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
