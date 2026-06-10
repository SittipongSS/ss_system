// Week-grid helpers for the ISO Timeline document (ported from ss-cj).
// กริด เดือน → สัปดาห์ (W1–W5): W1=1–7, W2=8–14, W3=15–21, W4=22–28, W5=29–31.
// ช่อง Gantt ระบายอัตโนมัติจาก start/finish ของแต่ละ task; ผู้ใช้ override ได้ (cellsOverride).

const DAY_MS = 1000 * 60 * 60 * 24;

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const weekOfDay = (day) => Math.min(5, Math.floor((day - 1) / 7) + 1);

export const cellKey = (year, month0, week) => `${year}-${month0}-W${week}`;

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

// สร้างคอลัมน์สัปดาห์ทั้งหมดในช่วง [startMs, endMs]
export function buildWeekColumns(startMs, endMs) {
  const months = [];
  const columns = [];
  if (!startMs || !endMs || isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
    return { months, columns };
  }

  const s = new Date(startOfDay(startMs));
  const e = new Date(startOfDay(endMs));

  const monthMap = new Map();
  let guard = 0;
  for (let t = s.getTime(); t <= e.getTime() && guard < 4000; t += DAY_MS, guard++) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m0 = d.getMonth();
    const w = weekOfDay(d.getDate());
    const mKey = `${y}-${m0}`;
    if (!monthMap.has(mKey)) {
      monthMap.set(mKey, {
        key: mKey,
        label: `${THAI_MONTHS_SHORT[m0]} ${String(y).slice(2)}`,
        year: y, month0: m0, weekSet: new Set(),
      });
    }
    monthMap.get(mKey).weekSet.add(w);
  }

  for (const m of monthMap.values()) {
    const weeks = Array.from(m.weekSet).sort((a, b) => a - b);
    months.push({ key: m.key, label: m.label, year: m.year, month0: m.month0, weeks });
    weeks.forEach((w) => columns.push({ key: cellKey(m.year, m.month0, w), week: w, monthKey: m.key }));
  }
  return { months, columns };
}

// เซ็ตของ cellKey ที่ task ครอบคลุมโดยอัตโนมัติ (จาก start→finish)
export function autoCellsForTask(task) {
  const set = new Set();
  const sMs = new Date(task.startDate).getTime();
  const fMs = new Date(task.finishDate).getTime();
  if (isNaN(sMs) || isNaN(fMs)) return set;
  const s = startOfDay(sMs);
  const f = startOfDay(Math.max(fMs, sMs));
  let guard = 0;
  for (let t = s; t <= f && guard < 4000; t += DAY_MS, guard++) {
    const d = new Date(t);
    set.add(cellKey(d.getFullYear(), d.getMonth(), weekOfDay(d.getDate())));
  }
  return set;
}

// เซ็ต cellKey ที่ "ระบาย" จริง (เคารพ cellsOverride ถ้ามี)
export function filledCellsForTask(task) {
  if (Array.isArray(task.cellsOverride)) return new Set(task.cellsOverride);
  return autoCellsForTask(task);
}
