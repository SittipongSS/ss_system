/* ถังลีดรายวัน/รายสัปดาห์ ของกราฟใน "KPI ลีด" (IS-26080023)
 *
 * แยกออกมาจากคอมโพเนนต์เพราะเป็นเลขที่ Marketing เอาไปเทียบกับยอด Spending Ads จริง —
 * ผิดแล้วไม่มีอะไรฟ้อง (กราฟยังวาดสวยเหมือนเดิม) จึงต้องมีเทสต์ทาบกับข้อมูลจริงได้
 *
 * 🔴 สัปดาห์เริ่ม **วันจันทร์** ตามที่ Marketing นับ — คนละเรื่องกับตารางปฏิทินที่ขึ้นต้น
 * วันอาทิตย์ (มติ 2026-07-15) · และหาวันในสัปดาห์จาก **สตริงวัน** เท่านั้น ห้ามผ่าน
 * `new Date(timestamp).getUTCDay()` เพราะ timestamp มี offset +07 แล้ววันจันทร์จะตกไป
 * อยู่สัปดาห์ก่อนทั้งก้อน (เจอจริงตอนสำรวจข้อมูลก่อนทำใบนี้)
 */
import { addDays, weekStartOf } from '@/lib/datePeriods';

const shortLabel = (day) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;

/**
 * @param {object}   input
 * @param {object}   input.byDay  { 'YYYY-MM-DD': จำนวน } — **มีเฉพาะวันที่มีลีด**
 * @param {string[]} input.days   ทุกวันของงวด (รวมวันว่าง) — ไม่ส่ง = ใช้คีย์ของ byDay
 * @param {'day'|'week'} input.unit
 * @returns {{key,label,name,count,withLeads}[]}
 */
export function leadDailyBuckets({ byDay = {}, days = null, unit = 'day' } = {}) {
  const list = Array.isArray(days) && days.length ? days : Object.keys(byDay).sort();
  if (!list.length) return [];
  const countOf = (day) => Number(byDay[day] || 0);

  if (unit !== 'week') {
    return list.map((day) => ({
      key: day,
      label: shortLabel(day),
      name: day,
      count: countOf(day),
      withLeads: countOf(day) > 0 ? 1 : 0,
    }));
  }

  const weeks = new Map();
  for (const day of list) {
    const start = weekStartOf(day);
    if (!start) continue;
    if (!weeks.has(start)) weeks.set(start, { key: start, count: 0, withLeads: 0 });
    const bucket = weeks.get(start);
    bucket.count += countOf(day);
    if (countOf(day) > 0) bucket.withLeads += 1;
  }
  return [...weeks.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((bucket) => ({
      ...bucket,
      label: shortLabel(bucket.key),
      name: `${bucket.key}..${addDays(bucket.key, 6)}`,
    }));
}

/** ยอดรวมของกราฟ — `spanDays` คือจำนวนวันในงวด ไม่ใช่จำนวนวันที่มีลีด
 *  สองค่านี้ต้องแยกกันเสมอ: 24 ลีดใน 3 วัน กับ 24 ลีดใน 7 วัน คนละเรื่องตอนเทียบยอดแอด */
export function leadDailyTotals(buckets, days = null) {
  const count = buckets.reduce((n, b) => n + b.count, 0);
  const withLeads = buckets.reduce((n, b) => n + b.withLeads, 0);
  const spanDays = Array.isArray(days) ? days.length : withLeads;
  return { count, withLeads, spanDays, perDay: withLeads ? +(count / withLeads).toFixed(1) : 0 };
}
