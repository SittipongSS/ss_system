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

// ⭐ ป้ายขั้นฉบับสายเอกสาร (ม-85) — ชุดกลาง (`ROW_STAGE_LABELS`) เล่าสายพัฒนา
// ("รอไปรับ" · "เสร็จ" · "ไม่ได้ใช้") ซึ่งอ่านผิดความหมายกับเอกสาร:
// ready คือฝ่าย **ส่งเอกสารแล้ว** · done คือ **ได้รับแล้ว** · declined คือ **ปฏิเสธ**
// เขียนทับเฉพาะสามตัวนี้ ตัวอื่นใช้ชุดกลางเหมือนเดิม
const DOC_STAGE_LABELS = {
  ready: 'ส่งเอกสารแล้ว',
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
        // ⚠️ ป้ายมาจากทะเบียนคำศัพท์ ไม่ใช่ `label` ที่ประทับไว้ตอนเปิด — ชนิดที่
        // ไม่รู้จักคืนค่าดิบ (ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก)
        name: item.docType ? docTypeLabel(item.docType) : (item.label || '—'),
        spec: item.spec || null,
        stage,
        stageLabel: DOC_STAGE_LABELS[stage] || ROW_STAGE_LABELS[stage] || stage,
        stageTone: ROW_STAGE_TONES[stage] || 'neutral',
        // ⭐ "ได้รับแล้ว" = แถวจบแบบได้ของ · "ปฏิเสธ" = จบแบบไม่ได้ของ
        // สองอย่างนี้ **จบเหมือนกันแต่คนละความหมาย** — รวมกันเมื่อไร ใบที่ฝ่าย
        // ปฏิเสธทั้งใบจะอ่านเหมือนได้ครบ
        received: stage === 'done',
        refused: stage === 'declined',
        settled: isRowSettled(item),
        declineReason: item.declineReason || null,
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
