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
import { docTypeLabel } from '@/lib/requests/docTypes';

// รูปร่างบรรทัดที่เป็น "เอกสาร" — RD ขอ IFRA/COA/MSDS · บัญชีขอใบวางบิล/ใบกำกับ
// (คนละคำศัพท์ กฎเดียวกัน — ดู docVocabulary)
const DOC_SHAPES = ['document', 'billing_doc'];

export function documentBoard(items = []) {
  return (items || [])
    .filter((i) => DOC_SHAPES.includes(i?.lineKind))
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
        stageLabel: ROW_STAGE_LABELS[stage] || stage,
        stageTone: ROW_STAGE_TONES[stage] || 'neutral',
        // ⭐ "ได้รับแล้ว" = แถวจบแบบได้ของ · "ให้ไม่ได้" = จบแบบไม่ได้ของ
        // สองอย่างนี้ **จบเหมือนกันแต่คนละความหมาย** — รวมกันเมื่อไร ใบที่ฝ่ายตอบว่า
        // ให้ไม่ได้ทั้งใบจะอ่านเหมือนได้ครบ
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
