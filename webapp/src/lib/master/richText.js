// ── ข้อความของผู้ใช้ → ชิ้นส่วนที่ render ได้ (pure) ─────────────────────
//
// ⚠️ **ห้ามแปลงเป็น HTML แล้วยัดเข้า `dangerouslySetInnerHTML` เด็ดขาด** — ข้อความ
// มาจากผู้ใช้ทั้งก้อน การ render เป็น HTML คือช่อง XSS ตรง ๆ · ไฟล์นี้จึงคืนเป็น
// **รายการชิ้นส่วน** (`{type, text, …}`) แล้วให้ component ประกอบเป็น element เอง
// ตัวข้อความจึงถูกใส่ผ่าน text node เสมอ ไม่ว่าผู้ใช้จะพิมพ์อะไรมา
//
// ชนิดชิ้นส่วน: `text` (ธรรมดา) · `url` (ลิงก์ภายนอก) · `doc` (รหัสเอกสารในระบบ)
import { DOC_REF_PATTERN, docRefHref, parseDocRef } from '@/lib/master/docRefs';

// URL ที่คนพิมพ์ในแชทงานจริง: มี scheme หรือขึ้นต้น www.
// ⚠️ ตัดวรรคตอนท้ายทิ้ง ("ดูที่ example.com/a." → ลิงก์ไม่ควรกินจุด) และตัดวงเล็บปิด
// ที่ไม่มีคู่เปิด ("(ดู https://x.com/a)" → ไม่กิน `)`)
const URL_PATTERN = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAILING = /[.,;:!?)\]}»"'…]/;

function trimUrl(raw) {
  let url = raw;
  let dropped = '';
  while (url && TRAILING.test(url.slice(-1))) {
    const ch = url.slice(-1);
    // วงเล็บปิดที่มีคู่เปิดอยู่ในลิงก์เอง = ส่วนหนึ่งของ url (wiki_(disambiguation))
    const open = (url.match(/\(/g) || []).length;
    const close = (url.match(/\)/g) || []).length;
    if (ch === ')' && open >= close) break;
    url = url.slice(0, -1);
    dropped = ch + dropped;
  }
  return { url, dropped };
}

// หนีอักขระพิเศษของ regex ในชื่อคน (ชื่อจริงมี "." ได้ เช่น "Threerapong P.")
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * แยกข้อความเป็นชิ้นส่วนที่ render ได้ — ลำดับตัวอักษรเดิมทุกตัว ไม่มีการตัดทิ้ง
 *
 * ⚠️ URL มาก่อนรหัสเอกสารเสมอ: ลิงก์ที่มีคำว่า QT-… อยู่ข้างในต้องไม่ถูกผ่าครึ่ง
 *
 * @param mentionNames ชื่อคนที่ถูก @ ในข้อความนี้ (จาก `meta.mentionNames`) — ต้อง
 *   ส่งมาเพราะชื่อไทยมีช่องว่าง เดาขอบเขตจากข้อความดิบไม่ได้ · ไม่ส่ง = ไม่ไฮไลต์
 */
export function parseRichText(input, { mentionNames = [] } = {}) {
  const text = input == null ? '' : String(input);
  if (!text) return [];

  const hits = [];
  for (const name of mentionNames) {
    const clean = String(name || '').trim();
    if (!clean) continue;
    for (const m of text.matchAll(new RegExp(`@${escapeRe(clean)}`, 'g'))) {
      hits.push({ start: m.index, end: m.index + m[0].length, type: 'mention', text: m[0] });
    }
  }
  for (const m of text.matchAll(URL_PATTERN)) {
    const { url, dropped } = trimUrl(m[0]);
    if (!url) continue;
    hits.push({ start: m.index, end: m.index + url.length, type: 'url', text: url, dropped });
  }
  for (const m of text.matchAll(DOC_REF_PATTERN)) {
    const start = m.index;
    const end = start + m[0].length;
    // อยู่ข้างใน URL ที่จับได้แล้ว = ไม่ใช่การอ้างเอกสาร
    if (hits.some((h) => h.type === 'url' && start < h.end && end > h.start)) continue;
    hits.push({ start, end, type: 'doc', text: m[0].toUpperCase() });
  }
  hits.sort((a, b) => a.start - b.start);

  const parts = [];
  let cursor = 0;
  const pushText = (value) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.type === 'text') last.text += value;
    else parts.push({ type: 'text', text: value });
  };

  for (const hit of hits) {
    if (hit.start < cursor) continue;          // ทับกับชิ้นก่อนหน้า — ข้าม
    pushText(text.slice(cursor, hit.start));
    if (hit.type === 'url') {
      parts.push({
        type: 'url',
        text: hit.text,
        href: hit.text.startsWith('www.') ? `https://${hit.text}` : hit.text,
      });
      if (hit.dropped) pushText(hit.dropped);
    } else if (hit.type === 'mention') {
      parts.push({ type: 'mention', text: hit.text });
    } else {
      parts.push({ type: 'doc', text: hit.text, href: docRefHref(hit.text) });
    }
    cursor = hit.end + (hit.dropped?.length || 0);
  }
  pushText(text.slice(cursor));
  return parts;
}

// มีอะไรให้ทำเป็นลิงก์ไหม — ผู้เรียกใช้เลี่ยงงาน render ที่ไม่จำเป็น
export const hasRichContent = (text, opts) => parseRichText(text, opts).some((p) => p.type !== 'text');

export { parseDocRef };
