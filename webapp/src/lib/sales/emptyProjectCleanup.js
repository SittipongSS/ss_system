import { confirmAction } from '@/components/ui/ConfirmDialog';
import { apiFetch } from "@/lib/apiFetch";

// ── ลบดีลใบสุดท้ายแล้ว โครงการเหลือโครงเปล่า ───────────────────────────────
// เฟส B ตั้งใจ "ลบดีลไม่ลบโครงการ" เพราะโครงการเป็นเอนทิตีอิสระที่อาจมีดีลใหม่มาผูก
// แทน — แต่ถ้าไม่ถามเลย โครงเปล่าจะค้างในรายการโดยไม่มีใครสังเกต (prod 2026-07-30
// เจอค้าง 3 ใบ: 0 ดีล 0 ขั้นตอน) ซึ่งผู้ใช้อ่านว่า "ลบดีลแล้วแต่ไทม์ไลน์ยังอยู่".
// จึงถามตรงจุดที่เพิ่งลบ ตอนที่ผู้ใช้ยังอยู่กับเรื่องนี้ — ไม่ตัดสินใจแทน.
//
// ใช้ร่วมกันทั้งหน้ารายการดีลและหน้ารายละเอียดดีล (กฎโปรเจกต์: ทางเรียกหลายทาง
// ต้องใช้ตัวเดียวกัน ไม่งั้นข้อความ/พฤติกรรมเพี้ยนหากันในภายหลัง).
//
// ไม่โยน error — คืน { deleted, error } ให้ผู้เรียกเลือกเองว่าจะแสดงตรงไหน เพราะ
// ดีลถูกลบไปแล้ว ณ จุดนี้ การลบโครงการพลาดไม่ควรทำให้ผู้ใช้เข้าใจว่าลบดีลไม่สำเร็จ.
export async function offerDeleteEmptyProject(emptyProject) {
  if (!emptyProject?.id) return { deleted: false, error: null };

  const label = `${emptyProject.code}${emptyProject.name ? ` · ${emptyProject.name}` : ''}`;
  // ขั้นตอนที่เหลือ = งานกลางที่ไม่ได้ผูกดีลใบไหน — ลบโครงการจะพาชุดนี้ไปด้วย
  // ต้องบอกจำนวนก่อน ไม่ใช่ให้รู้ตัวตอนมันหายไปแล้ว
  const tasksNote = emptyProject.tasksLeft
    ? `\n\n⚠ ในโครงการยังมีขั้นตอนเหลือ ${emptyProject.tasksLeft} ขั้นตอน (งานกลางที่ไม่ได้ผูกดีลใบไหน) — จะถูกลบไปด้วย`
    : '\n\nตอนนี้ไม่เหลือทั้งดีลและขั้นตอนในไทม์ไลน์แล้ว';

  const confirmed = await confirmAction(
    `ลบดีลแล้ว — โครงการ ${label} ไม่เหลือดีลผูกอยู่${tasksNote}\n\n`
    + 'ลบโครงการนี้ทิ้งด้วยไหม? (ถ้าต้องการเก็บไว้รอผูกดีลใหม่ ให้กดยกเลิก)',
  );
  if (!confirmed) return { deleted: false, error: null };

  try {
    const res = await apiFetch(`/api/pm/projects/${emptyProject.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      return { deleted: false, error: payload.error || 'ลบโครงการเปล่าไม่สำเร็จ' };
    }
    return { deleted: true, error: null };
  } catch (error) {
    return { deleted: false, error: error?.message || 'ลบโครงการเปล่าไม่สำเร็จ' };
  }
}
