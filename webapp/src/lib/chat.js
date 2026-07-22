// แจ้งเตือน Google Chat ผ่าน incoming webhook — เฟส 1+2 ของ GOOGLE_CHAT_PLAN.md
// กติกาเหล็ก: การแจ้งเตือนห้ามทำให้ operation หลักพัง
//   - ไม่มี webhook ของ space นั้น (ตาราง+env) = ข้ามเงียบ ๆ (ระบบทำงานปกติ)
//   - ส่งหลังตอบ response แล้วด้วย after() — ไม่เพิ่ม latency ให้ API
//   - กลืน error ทุกชนิด (log อย่างเดียว) — ห้าม throw กลับไปหา caller
//
// แหล่ง webhook URL (เฟส 2): ตาราง chat_webhooks ก่อน (migration 0099, แก้ผ่านหน้า
// /settings/chat-webhooks) — มี row ของ key = ยึดตาราง (enabled=false คือปิดจริง)
// ไม่มี row → fallback env เดิม (CHAT_WEBHOOK_*)
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const SPACE_ENV = {
  approvals: 'CHAT_WEBHOOK_APPROVALS', // space หัวหน้า/ผู้อนุมัติ (AE Supervisor)
  sales: 'CHAT_WEBHOOK_SALES', // space ทีมขาย
  pm: 'CHAT_WEBHOOK_PM', // space โครงการ (ใช้ในเฟส 3 daily digest)
  rd: 'CHAT_WEBHOOK_RD', // space ฝ่าย RD (ข้อสอบถามใหม่จากฝ่ายขาย)
  leads: 'CHAT_WEBHOOK_LEADS', // space คิวลีด (แจ้งจุดส่งมอบ + ลีดค้างเช้า)
  // ระบบขอราคาผลิต (2026-07-22) — เพิ่ม space ใหม่ได้โดยไม่ต้อง migration:
  // ตาราง chat_webhooks (mig 0099) ไม่มี CHECK บน key และแถวถูกสร้างตอนผู้ดูแล
  // กดบันทึก URL ครั้งแรก. รายการ space ที่ระบบรู้จักคุมด้วย CHAT_SPACES ข้างล่างนี้
  // (ตาราง chat_webhook_settings ที่เคยมี CHECK ถูกถอนไปแล้วใน mig 0134)
  pc: 'CHAT_WEBHOOK_PC', // space ฝ่ายจัดซื้อ (ขอราคาบรรจุภัณฑ์)
  executive: 'CHAT_WEBHOOK_EXECUTIVE', // space ผู้บริหาร (ใบขอราคารออนุมัติ)
};

// รายการ space มาตรฐาน — ใช้ร่วมกันทั้ง validation ฝั่ง API และหน้า UI ตั้งค่า
export const CHAT_SPACES = [
  { key: 'approvals', label: 'ผู้อนุมัติ', hint: 'ของรออนุมัติ (ลูกค้า/สินค้า/ใบเสนอราคา) — คนใน space ควรเป็น Senior AE ขึ้นไป' },
  { key: 'sales', label: 'ทีมขาย', hint: 'ผลอนุมัติ, ดีลชนะ (Won), forecast review, คำตอบข้อสอบถามจาก RD' },
  { key: 'pm', label: 'โครงการ (PM)', hint: 'สรุปงานใกล้ครบกำหนดประจำวัน (เริ่มใช้เฟส daily digest)' },
  { key: 'rd', label: 'ฝ่าย RD', hint: 'ข้อสอบถามใหม่/ถามต่อจากฝ่ายขาย — คนใน space คือฝ่าย RD' },
  { key: 'leads', label: 'คิวลีด', hint: 'ลีดใหม่รอคัดกรอง · คัดแล้วรอกระจาย · มอบให้ AE — คนใน space คือทีมขายที่ทำคิวลีด (SLA 1 วันทำการ)' },
  { key: 'pc', label: 'ฝ่ายจัดซื้อ (PC)', hint: 'คำขอราคาบรรจุภัณฑ์จากฝ่ายขาย — คนใน space คือฝ่ายจัดซื้อ' },
  { key: 'executive', label: 'ผู้บริหาร', hint: 'ใบขอราคาผลิตที่รออนุมัติ — คนใน space คือผู้บริหารที่อนุมัติราคาผลิต' },
];

// cache รายการ webhook จากตาราง ~60 วิ — event ถี่ ๆ ไม่ต้อง query ทุกครั้ง
let cache = { at: 0, rows: null };

export function invalidateChatWebhookCache() {
  cache = { at: 0, rows: null };
}

async function webhookUrlFor(spaceKey) {
  try {
    const now = Date.now();
    if (!cache.rows || now - cache.at > 60_000) {
      const { data, error } = await getSupabaseAdmin().from('chat_webhooks').select('key, url, enabled');
      if (!error) cache = { at: now, rows: data || [] };
    }
    const row = (cache.rows || []).find((r) => r.key === spaceKey);
    if (row) return row.enabled && row.url ? row.url : null;
  } catch {
    // ตารางยังไม่ถูก migrate / DB มีปัญหา → ใช้ env ต่อ
  }
  const envName = SPACE_ENV[spaceKey];
  return envName ? process.env[envName] || null : null;
}

// การ์ดรูปแบบเดียวทั้งระบบ: หัวข้อ + รายการ label/value + ปุ่มลิงก์กลับเข้าระบบ
// rows ที่ value ว่างถูกตัดทิ้ง — caller ใส่มาได้เลยไม่ต้องเช็คเอง
// ปุ่มลิงก์ต้องมี APP_BASE_URL (เช่น https://ss-system.vercel.app) ไม่มีก็ตัดปุ่มทิ้ง
export function chatCard({ title, subtitle, rows = [], linkPath, linkLabel = 'เปิดดูในระบบ' }) {
  const widgets = rows
    .filter((r) => r && r.value !== null && r.value !== undefined && r.value !== '')
    .map((r) => ({ decoratedText: { topLabel: r.label, text: String(r.value), wrapText: true } }));
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  if (linkPath && base) {
    widgets.push({
      buttonList: { buttons: [{ text: linkLabel, onClick: { openLink: { url: `${base}${linkPath}` } } }] },
    });
  }
  return {
    cardsV2: [
      {
        cardId: 'ss-notify',
        card: {
          header: { title, ...(subtitle ? { subtitle } : {}) },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

async function postCard(url, card) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(card),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `Google Chat ตอบ HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ส่งแบบรอผล (await ได้) — ใช้กับปุ่ม "ส่งทดสอบ" ในหน้าตั้งค่า ที่ต้องรายงานผลกลับ
// ต่างจาก sendChat ตรงที่ "ไม่มี webhook" ถือเป็น error (ผู้ใช้กดทดสอบเองต้องรู้ผล)
export async function sendChatNow(spaceKey, card) {
  const url = await webhookUrlFor(spaceKey);
  if (!url) return { ok: false, error: 'ยังไม่ได้ตั้ง webhook ของ space นี้ (หรือถูกปิดใช้อยู่)' };
  return postCard(url, card);
}

// ส่งแบบ fire-and-forget — จุดเกี่ยวใน API ทั้งหมดใช้ตัวนี้
// spaceKey: 'approvals' | 'sales' | 'pm' | 'rd' | 'leads'
export function sendChat(spaceKey, card) {
  const deliver = async () => {
    try {
      const url = await webhookUrlFor(spaceKey);
      if (!url) return; // ไม่ตั้งค่า = ปิดแจ้งเตือนเงียบ ๆ
      const result = await postCard(url, card);
      if (!result.ok) console.error(`chat notify (${spaceKey}) failed:`, result.error);
    } catch (e) {
      console.error(`chat notify (${spaceKey}) failed:`, e?.message || e);
    }
  };

  try {
    after(deliver);
  } catch {
    // after() ใช้ได้เฉพาะใน request scope — เผื่อถูกเรียกจาก cron/สคริปต์ก็ส่งตรง ๆ
    deliver();
  }
}
