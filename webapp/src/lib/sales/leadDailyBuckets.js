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
    if (!weeks.has(start)) weeks.set(start, { key: start, count: 0, withLeads: 0, first: day, last: day });
    const bucket = weeks.get(start);
    bucket.count += countOf(day);
    if (countOf(day) > 0) bucket.withLeads += 1;
    if (day < bucket.first) bucket.first = day;
    if (day > bucket.last) bucket.last = day;
  }
  return [...weeks.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((bucket) => ({
      ...bucket,
      /* 🐞 ช่วงในป้ายต้องเป็น **วันที่อยู่ในงวดจริง** ไม่ใช่จันทร์–อาทิตย์เต็มสัปดาห์:
         โหมดรายเดือน สัปดาห์หัวท้ายคาบเกี่ยวเดือนอื่นเสมอ · ป้าย "27/07 – 02/08" ที่ขึ้น
         0 ทำให้อ่านว่าสัปดาห์นั้นไม่มีลีดเลย ทั้งที่ 29–31 ก.ค. มี แต่อยู่นอกงวดที่เลือก
         (เจอตอนตรวจด้วยตา 2026-08-13) · `partial` บอกว่าถังนี้ไม่เต็มสัปดาห์ */
      partial: bucket.first !== bucket.key || bucket.last !== addDays(bucket.key, 6),
      label: shortLabel(bucket.first),
      name: `${bucket.first}..${bucket.last}`,
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
