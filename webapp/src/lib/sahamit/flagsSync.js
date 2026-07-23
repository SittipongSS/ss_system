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

async function syncFlags(supabase, customerId, desired, validRoundNos) {
  const { data: existing } = await supabase
    .from('sahamit_fc_flags').select('*').eq('customerId', customerId);
  const exByKey = new Map((existing || []).map((f) => [keyOf(f), f]));
  const desByKey = new Map(desired.map((f) => [keyOf(f), f]));
  const now = new Date().toISOString();

  // insert/refresh ตามชุดที่ควรมี
  for (const [k, f] of desByKey) {
    const ex = exByKey.get(k);
    if (ex) {
      await supabase.from('sahamit_fc_flags')
        .update({ prevQty: f.prevQty || 0, newQty: f.newQty || 0, drop: f.drop || 0, shiftToMonth: f.shiftToMonth || null })
        .eq('id', ex.id).eq('customerId', customerId);
    } else {
      await supabase.from('sahamit_fc_flags').insert({
        id: 'FCF-' + randomUUID(), customerId, fgCode: f.fgCode, month: f.month, roundNo: f.roundNo,
        prevQty: f.prevQty || 0, newQty: f.newQty || 0, drop: f.drop || 0, kind: f.kind, status: 'open',
        shiftToMonth: f.shiftToMonth || null, createdAt: now,
      });
    }
  }

  // ลบธงเดิมที่ไม่อยู่ในชุดใหม่: 'open' ลบเสมอ; ที่คนเคลียร์แล้วลบเฉพาะเมื่อรอบนั้นหายไป
  for (const [k, ex] of exByKey) {
    if (desByKey.has(k)) continue;
    const roundGone = !validRoundNos.has(ex.roundNo);
    if (ex.status === 'open' || roundGone) {
      await supabase.from('sahamit_fc_flags').delete().eq('id', ex.id).eq('customerId', customerId);
    }
  }
}
