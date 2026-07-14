// แจ้งเตือน Google Chat ผ่าน incoming webhook — เฟส 1 ของ GOOGLE_CHAT_PLAN.md
// กติกาเหล็ก: การแจ้งเตือนห้ามทำให้ operation หลักพัง
//   - ไม่ได้ตั้ง env ของ space นั้น = ข้ามเงียบ ๆ (ระบบทำงานปกติ)
//   - ส่งหลังตอบ response แล้วด้วย after() — ไม่เพิ่ม latency ให้ API
//   - กลืน error ทุกชนิด (log อย่างเดียว) — ห้าม throw กลับไปหา caller
import { after } from 'next/server';

const SPACE_ENV = {
  approvals: 'CHAT_WEBHOOK_APPROVALS', // space หัวหน้า/ผู้อนุมัติ (Senior AE+)
  sales: 'CHAT_WEBHOOK_SALES', // space ทีมขาย
  pm: 'CHAT_WEBHOOK_PM', // space โครงการ (ใช้ในเฟส 3 daily digest)
};

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

// spaceKey: 'approvals' | 'sales' | 'pm'
export function sendChat(spaceKey, card) {
  const envName = SPACE_ENV[spaceKey];
  const url = envName ? process.env[envName] : null;
  if (!url) return;

  const deliver = async () => {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(card),
        signal: AbortSignal.timeout(5000),
      });
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
