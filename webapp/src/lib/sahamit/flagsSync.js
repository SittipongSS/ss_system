import { randomUUID } from 'crypto';
import { detectFlags } from './flags';

// SAHAMIT — โหลดข้อมูลลูกค้า → detectFlags → ซิงก์เข้า sahamit_fc_flags แบบ
// "คงการตัดสินของคน". detectFlags เป็น deterministic จาก rounds+pos ดังนั้น sync
// จะปรับให้ตรง โดย:
//   - ธงที่คนเคลียร์แล้ว (status != 'open') คงสถานะ/ผู้เคลียร์ไว้ แต่รีเฟรชตัวเลข
//     (prevQty/newQty/drop/shiftToMonth) ให้เป็นค่าปัจจุบัน
//   - ธง auto ใหม่ที่ยังไม่มี → insert เป็น 'open'
//   - ธง 'open' เดิมที่ไม่อยู่ในชุดที่ควรมีแล้ว → ลบ (stale)
//   - ธงที่คนเคลียร์แล้วแต่ไม่อยู่ในชุดใหม่ → เก็บไว้ (บันทึกประวัติการตัดสิน) เว้นแต่
//     รอบนั้นถูกลบไปแล้ว (roundNo ไม่มีในรอบปัจจุบัน) → ลบทิ้ง
// key = (fgCode, month, roundNo, kind).
const keyOf = (f) => `${f.fgCode}||${f.month}||${f.roundNo}||${f.kind}`;

export async function refreshSahamitFlags(supabase, customerId) {
  const { data: rounds } = await supabase
    .from('sahamit_forecast_rounds').select('*').eq('customerId', customerId);
  const rIds = (rounds || []).map((r) => r.id);
  let fLines = [];
  if (rIds.length) ({ data: fLines } = await supabase.from('sahamit_forecast_lines').select('*').in('roundId', rIds));
  const roundsWithLines = (rounds || []).map((r) => ({ ...r, lines: (fLines || []).filter((l) => l.roundId === r.id) }));

  const { data: pos } = await supabase
    .from('sahamit_pos').select('id,receivedDate').eq('customerId', customerId);
  const pIds = (pos || []).map((p) => p.id);
  let pLines = [];
  if (pIds.length) ({ data: pLines } = await supabase.from('sahamit_po_lines').select('poId,fgCode,qty,status').in('poId', pIds));
  const posWithLines = (pos || []).map((p) => ({ ...p, lines: (pLines || []).filter((l) => l.poId === p.id) }));

  const { data: locks } = await supabase.from('sahamit_fc_locks').select('*').eq('customerId', customerId);

  const desired = detectFlags(roundsWithLines, posWithLines, locks || []);
  const validRoundNos = new Set((rounds || []).map((r) => r.roundNo));
  await syncFlags(supabase, customerId, desired, validRoundNos);
}

// ทำเป็น batch (upsert ครั้งเดียว + delete ครั้งเดียว) — ห้ามวน query ทีละแถว
// เพราะ refreshSahamitFlags ถูกเรียกทุกครั้งที่เซฟ FC/PO; พอธงสะสมหลายสิบตัว การ
// วนทีละแถว = หลายสิบ round-trip ต่อการเซฟ → ช้าจน timeout (เซฟ PO ไม่ได้).
async function syncFlags(supabase, customerId, desired, validRoundNos) {
  const { data: existing } = await supabase
    .from('sahamit_fc_flags').select('*').eq('customerId', customerId);
  const exByKey = new Map((existing || []).map((f) => [keyOf(f), f]));
  const desiredKeys = new Set(desired.map(keyOf));
  const now = new Date().toISOString();

  // upsert ทั้งชุดในครั้งเดียว. สำหรับ key ที่มีอยู่แล้ว: คงสถานะ/ผู้เคลียร์เดิม
  // (status = ของเดิม; ไม่ส่ง resolvedBy/note/customerResponse จึงไม่ถูกทับ) แล้ว
  // รีเฟรชเฉพาะตัวเลข. key ใหม่: status 'open'.
  const rows = desired.map((f) => {
    const ex = exByKey.get(keyOf(f));
    return {
      id: ex?.id || ('FCF-' + randomUUID()),
      customerId, fgCode: f.fgCode, month: f.month, roundNo: f.roundNo, kind: f.kind,
      prevQty: f.prevQty || 0, newQty: f.newQty || 0, drop: f.drop || 0,
      shiftToMonth: f.shiftToMonth || null,
      status: ex?.status || 'open',
      createdAt: ex?.createdAt || now,
    };
  });
  if (rows.length) {
    const { error } = await supabase
      .from('sahamit_fc_flags')
      .upsert(rows, { onConflict: 'customerId,fgCode,month,roundNo,kind' });
    if (error) throw new Error(error.message);
  }

  // ลบธงเดิมที่ไม่อยู่ในชุดใหม่ ในครั้งเดียว: 'open' ลบเสมอ; ที่คนเคลียร์แล้วลบเฉพาะ
  // เมื่อรอบนั้นหายไป (roundNo ไม่มีในรอบปัจจุบัน).
  const toDelete = (existing || [])
    .filter((e) => !desiredKeys.has(keyOf(e)) && (e.status === 'open' || !validRoundNos.has(e.roundNo)))
    .map((e) => e.id);
  if (toDelete.length) {
    await supabase.from('sahamit_fc_flags').delete().in('id', toDelete).eq('customerId', customerId);
  }
}
