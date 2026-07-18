# Permission Action Inventory

สถานะ: Living document
เป้าหมาย: เก็บ Resource และ Action จากฟังก์ชันจริง เพื่อนำไปรื้อ Permission ในเฟสสุดท้าย

เอกสารนี้ไม่ใช่ Permission model ฉบับสุดท้าย และไม่อนุญาตให้ขยายสิทธิ์จากของเดิม

## หลักการระหว่างทาง

- ใช้ Role/Capability เดิมเป็น temporary gate
- เพิ่ม owner check หรือ admin check ขั้นต่ำสำหรับข้อมูลอ่อนไหว
- ห้ามสร้าง Role ใหม่ก่อน Permission phase เว้นแต่เป็นเหตุด้านความปลอดภัยที่หยุดงานจริง
- ทุก Phase PR ต้องเพิ่มหรือแก้รายการในตารางนี้
- บันทึกขอบเขตข้อมูลที่คาดว่าจะต้องมี แม้ยังไม่ตัดสินใจชื่อ Capability

## Inventory เริ่มต้น

| Resource | Actions ที่พบ/วางแผน | Scopes ที่ต้องพิจารณา | Temporary gate | เฟส |
|---|---|---|---|---|
| account_profile | view, update | own | signed-in + owner | 1 |
| account_password | change | own | signed-in + current password | 1 |
| product_category | view, create, update, deactivate, reactivate, inspect_usage | all | signed-in read / `master:manage` write | 2 |
| product_category_import | download_template, export, preview, commit, view_history | all | `master:manage` | 3 |
| organization_settings | view, edit_draft, publish, archive | all | admin/`master:manage` | 4 |
| document_form_metadata | view, edit_draft, publish, archive | all | admin/`master:manage` | 4/7 |
| signature | view_status, upload, replace, revoke | own | signed-in + owner | 5 |
| signature_admin | view_status, revoke_emergency | all | ยังไม่ตัดสินใจ | 5/8 |
| document_template | view, preview, edit_draft, publish, archive | module/all | admin เดิม | 6/7 |
| issued_document | view, print, download_pdf, verify | own/team/department/all | workflow เดิม | 7 |
| user_access | view, invite, update_role, update_scope, deactivate | all | `users:view`/`users:manage` | 8 |
| audit_log | view, export | own/team/department/all | `audit:view` | 8 |

## คำถามสำหรับ Permission phase

- Action ใดต้องแยก View กับ Export
- Action ใดใช้ Own, Team, Department หรือ All
- ผู้ดูแลข้อมูลหลักควรเป็น Role หรือ grantable capability
- Template publisher และ Template editor ควรเป็นคนละสิทธิ์หรือไม่
- Emergency revoke ลายเซ็นต้องใช้ two-person approval หรือไม่
- เอกสารลูกค้าและเอกสารภายในใช้ scope ต่างกันอย่างไร
- RLS, API authorization และ UI gating จะใช้ policy source เดียวกันอย่างไร

## Migration checklist เบื้องต้น

- [ ] ทำ role-action-resource matrix จาก Inventory ที่ครบแล้ว
- [ ] Map ผู้ใช้เดิมไปสิทธิ์ใหม่โดยไม่เพิ่มสิทธิ์เงียบ ๆ
- [ ] รองรับ compatibility กับ capability เดิมในช่วงเปลี่ยนผ่าน
- [ ] ทดสอบ privilege escalation และ cross-scope access
- [ ] Audit การเปลี่ยน Role/Capability/Scope
- [ ] Staged rollout และ rollback plan
