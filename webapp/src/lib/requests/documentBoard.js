// ── สรุปทั้งใบของ "ขอเอกสาร" (P5) — logic ล้วน ──────────────────────────
//
// ⭐ **ต่างจากสองหัวข้อพัฒนาตรงคำถามที่ต้องตอบ** — พัฒนากลิ่น/สูตรถามว่า "ของออกมา
// หรือยัง" ส่วนขอเอกสารถามว่า **"ได้ไฟล์แล้วกี่ชิ้น ยังขาดอะไร"** ⇒ ตัวเลขหลักคือ
// *มาแล้ว / รอ* ไม่ใช่ขั้นของแถว
//
// ⚠️ **แถบ "มาแล้ว X · รอ Y" เป็นไปไม่ได้ถ้าไม่รู้จักของที่ยังไม่มา** — นี่คือเหตุผล
// ที่บรรทัดขอเอกสารมีอยู่ตั้งแต่แรก (แผนเดิม §แท็บเอกสาร) · นับจากไฟล์แนบอย่างเดียว
// จะได้ 100% เสมอเพราะของที่ยังไม่มาไม่มีตัวตน
//
// ⚠️ นับจาก `rowStage.js` ที่เดียวเหมือนทุกหัวข้อ ⇒ ขัดกับคิวและปุ่มท้ายเธรดไม่ได้
import { ROW_STAGE_LABELS, ROW_STAGE_TONES, isRowSettled, rowStage } from '@/lib/requests/rowStage';
import { DOC_LINE_KINDS, docTypeLabel } from '@/lib/requests/docTypes';
import { lineShapeVocab } from '@/lib/requests/kinds/lineShapes';
/* ⭐ **รางขั้น + อายุงานเป็นของกลางทุกหัวข้อ** (มติผู้ใช้ 2026-08-25) — สามตาราง
   เคยบอกขั้นด้วยป้ายคำเดี่ยว ๆ ซึ่งตอบได้แค่ "ตอนนี้อยู่ไหน" ไม่ได้บอกว่าเหลืออีกไกล
   แค่ไหน · ประกอบที่นี่ (ตัวสร้างแถว) ไม่ใช่ใน JSX — กฎหลังบั๊กรางซ้ำ #1033 */
import { rowIdleStamps, rowTrackSteps } from '@/lib/requests/rowTrack';

// ⭐ ป้ายขั้นฉบับสายเอกสาร (ม-85) — ชุดกลาง (`ROW_STAGE_LABELS`) เล่าสายพัฒนา
// ("รอไปรับ" · "เสร็จ" · "ไม่ได้ใช้") ซึ่งอ่านผิดความหมายกับเอกสาร:
// ready คือฝ่าย **ส่งเอกสารแล้ว** · done คือ **ได้รับแล้ว** · declined คือ **ปฏิเสธ**
// เขียนทับเฉพาะสามตัวนี้ ตัวอื่นใช้ชุดกลางเหมือนเดิม
// ⚠️ `ready` ตามคำของก้าวที่ทำให้เกิด — ก้าวชื่อ "ส่งงาน" ทุกสายแล้ว (2026-08-15)
// ป้ายจึงเป็น "ส่งงานแล้ว" · ถ้าเปลี่ยนคำปุ่มต้องกลับมาแก้ที่นี่ด้วย ไม่งั้นกดปุ่ม
// คำหนึ่งแล้วได้ป้ายอีกคำ
const DOC_STAGE_LABELS = {
  ready: 'ส่งงานแล้ว',
  done: 'ได้รับแล้ว',
  declined: 'ปฏิเสธ',
};

export function documentBoard(items = []) {
  return (items || [])
    .filter((i) => DOC_LINE_KINDS.includes(i?.lineKind))
    .map((item) => {
      const stage = rowStage(item);
      return {
        id: item.id,
        docType: item.docType || null,
        /* ⚠️ ป้ายมาจากทะเบียนคำศัพท์ ไม่ใช่ `label` ที่ประทับไว้ตอนเปิด — ชนิดที่
           ไม่รู้จักคืนค่าดิบ (ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก)
           🐞 **ต้องถามทะเบียนของรูปร่างนั้น** — เดิมใช้ `docTypeLabel` ซึ่งรู้จักเฉพาะ
           ชุดของ RD ⇒ บรรทัดของบัญชีขึ้นเป็นค่าดิบ `billing_note` บนตารางสรุป
           ทั้งที่การ์ดรายแถวข้างล่างแสดง "ใบวางบิล" ถูกต้อง (เจอตอน UAT ของ B-5) */
        name: item.docType
          ? (lineShapeVocab(item.lineKind)?.label(item.docType) ?? docTypeLabel(item.docType))
          : (item.label || '—'),
        spec: item.spec || null,
        stage,
        stageLabel: DOC_STAGE_LABELS[stage] || ROW_STAGE_LABELS[stage] || stage,
        stageTone: ROW_STAGE_TONES[stage] || 'neutral',
        track: rowTrackSteps(item),
        // ⚠️ ตราเวลาดิบ ไม่ใช่จำนวนวัน — ตัวสร้างแถวไม่มีสิทธิ์รู้ว่า "วันนี้" คือวันไหน
        idle: rowIdleStamps(item),
        // ⭐ "ได้รับแล้ว" = แถวจบแบบได้ของ · "ปฏิเสธ" = จบแบบไม่ได้ของ
        // สองอย่างนี้ **จบเหมือนกันแต่คนละความหมาย** — รวมกันเมื่อไร ใบที่ฝ่าย
        // ปฏิเสธทั้งใบจะอ่านเหมือนได้ครบ
        received: stage === 'done',
        refused: stage === 'declined',
        settled: isRowSettled(item),
        declineReason: item.declineReason || null,
        // ⭐ ผลลัพธ์ของแถว (B-3 · R-6) — เอกสารการเงินจบด้วย **เลขที่** ไม่ใช่แค่ไฟล์
        // ⚠️ ว่างได้เสมอ: แถวที่ยังไม่ถูกส่ง · แถวของ RD ซึ่งไม่มีเลขที่ให้กรอก
        docNumber: item.docNumber || null,
        docDueDate: item.docDueDate || null,
      };
    });
}

export function documentTotals(rows = []) {
  return {
    asked: rows.length,
    received: rows.filter((r) => r.received).length,
    refused: rows.filter((r) => r.refused).length,
    // รอ = ยังเดินอยู่ · ไม่ใช่ "ยังไม่ได้รับ" (ซึ่งจะรวมของที่ฝ่ายตอบว่าให้ไม่ได้)
    waiting: rows.filter((r) => !r.settled).length,
  };
}
