// ── ดึงไฟล์ ICS ของปฏิทินวันหยุด (ส่วนที่แตะเครือข่าย) ────────────────
// แยกจาก lib/master/holidayImport.js เพื่อให้ตรรกะ parse/diff ที่นั่นเทสต์ได้โดยไม่ลาก
// fetch/env เข้ามา — ไฟล์นี้จึงไม่มีเทสต์โดยเจตนา (ทดสอบด้วยการเปิดหน้าจริง)
//
// ปฏิทินวันหยุดไทยของ Google เปิดสาธารณะ ไม่ต้อง auth — ไม่เกี่ยวกับ WIF/service account
// ที่ใช้กับ Google Drive เลย ฟีเจอร์นี้จึงทำงานเหมือนกันทั้งเครื่อง dev / preview / prod

const DEFAULT_CALENDAR_ID = 'th.th#holiday@group.v.calendar.google.com';
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function holidayIcsUrl() {
  const direct = (process.env.GOOGLE_HOLIDAY_ICS_URL || '').trim();
  if (direct) return direct;
  // calendarId มี '#' และ '@' — ต่อ string ดิบไม่ได้ ต้อง encode ทั้งก้อน
  const calendarId = (process.env.GOOGLE_HOLIDAY_CALENDAR_ID || '').trim() || DEFAULT_CALENDAR_ID;
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

// คืนเนื้อไฟล์ ICS · โยน Error ที่มี .status ให้ route แปลงเป็น HTTP ได้ตรง ๆ
export async function fetchHolidayIcs() {
  const url = holidayIcsUrl();
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw fail(
      timedOut ? 'ดึงปฏิทิน Google ไม่ทันเวลา ลองใหม่อีกครั้ง' : 'เชื่อมต่อปฏิทิน Google ไม่สำเร็จ',
      timedOut ? 504 : 502,
    );
  }
  if (!res.ok) throw fail(`ปฏิทิน Google ตอบกลับผิดพลาด (${res.status})`, 502);

  // ถ้าโดน redirect ไปหน้า login/error จะได้ HTML กลับมา — ตรวจก่อนเพื่อไม่ให้ parser
  // กลืนขยะแล้วรายงานว่า "ปีนี้ไม่มีวันหยุด" ทั้งที่ความจริงคือดึงข้อมูลไม่ได้
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/calendar')) {
    throw fail('ปฏิทิน Google ตอบกลับเป็นข้อมูลที่อ่านไม่ได้', 502);
  }
  const declaredSize = Number(res.headers.get('content-length') || 0);
  if (declaredSize > MAX_BYTES) throw fail('ไฟล์ปฏิทินใหญ่เกินกว่าที่รองรับ', 502);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw fail('ไฟล์ปฏิทินใหญ่เกินกว่าที่รองรับ', 502);
  return text;
}
