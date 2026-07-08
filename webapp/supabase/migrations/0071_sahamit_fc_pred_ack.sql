-- 0071 — SAHAMIT S4: "ดูแล้ว" (acknowledge) ป้ายคาดการณ์การเลื่อน ✨.
-- กดดูแล้ว = ปิดเสียงเตือนช่องนั้น (ป้ายเปลี่ยนเป็น 👁 จาง) จนกว่าจะยกเลิกดูแล้ว.
-- คีย์ที่ (customerId, fgCode, month). รันมือบน Supabase prod ก่อน deploy.

CREATE TABLE IF NOT EXISTS sahamit_fc_pred_ack (
  id          text PRIMARY KEY,
  "customerId" text NOT NULL,
  "fgCode"    text NOT NULL,
  month       text NOT NULL,
  "ackAt"     timestamptz,
  "ackById"   text,
  "ackByName" text,
  UNIQUE ("customerId", "fgCode", month)
);

-- เข้าถึงผ่าน service-role (getSupabaseAdmin) เท่านั้น; เปิด RLS ไม่มี policy
-- = บล็อก anon/authenticated key ทั้งหมด (service-role bypass RLS ตามปกติ).
ALTER TABLE sahamit_fc_pred_ack ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
