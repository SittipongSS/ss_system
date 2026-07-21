// Shared (client-safe) helpers for versioned Google Chat webhook settings
// (Decision 0012, migration 0133).

export const CHAT_WEBHOOK_URL_PREFIX = 'https://chat.googleapis.com/v1/spaces/';

export const CHAT_WEBHOOK_LIMITS = Object.freeze({
  url: 600,
  changeNote: 500,
});

// Normalize a draft payload { url, enabled, changeNote }. Empty URL is valid:
// it means "no webhook for this space" (enabled=false = ปิดจริง).
export function normalizeChatWebhookInput(input = {}) {
  const errors = [];
  const url = String(input.url || '').trim();
  const changeNote = String(input.changeNote || '').trim();

  // กันพลาดส่งข้อมูลออกนอก Google Chat: บังคับโดเมน webhook ของ Chat เท่านั้น
  if (url && !url.startsWith(CHAT_WEBHOOK_URL_PREFIX)) {
    errors.push(`URL ต้องขึ้นต้นด้วย ${CHAT_WEBHOOK_URL_PREFIX}`);
  }
  if (url.length > CHAT_WEBHOOK_LIMITS.url) {
    errors.push(`URL ต้องไม่เกิน ${CHAT_WEBHOOK_LIMITS.url} ตัวอักษร`);
  }
  if (changeNote.length > CHAT_WEBHOOK_LIMITS.changeNote) {
    errors.push(`หมายเหตุการเปลี่ยนแปลงต้องไม่เกิน ${CHAT_WEBHOOK_LIMITS.changeNote} ตัวอักษร`);
  }

  return {
    value: {
      url: url || null,
      enabled: input.enabled !== false,
      changeNote: changeNote || null,
    },
    errors: [...new Set(errors)],
  };
}

export function chatWebhookStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'เก็บถาวร';
  return 'ฉบับร่าง';
}

export function hasPublishableChangeNote(version) {
  return !!String(version?.changeNote || '').trim();
}

// ปิดท้าย token ใน URL ก่อนแสดง/เก็บ audit — ใครมี URL เต็มก็โพสต์เข้า space ได้
export function maskWebhookUrl(url) {
  return url ? String(url).replace(/token=[^&]+/, 'token=***') : url;
}
