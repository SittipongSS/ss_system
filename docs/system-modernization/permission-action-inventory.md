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
| account_profile | view, update | own | signed-in; API ผูก target จาก session เท่านั้น | 1 |
| account_password | change | own | signed-in + current password; API ผูก target จาก session เท่านั้น | 1 |
| product_category | view, create, update, deactivate, reactivate, inspect_usage | all | signed-in read / AE Supervisor + Admin จัดการผ่าน `canManageProductCategories` | 2 |
| product_category_import | download_template, export, preview, commit, view_history | all | AE Supervisor + Admin ผ่าน `canManageProductCategories` | 3 |
| organization_settings | view, edit_draft, publish, archive | all | admin/`master:manage` | 4A |
| workflow_timeline_template | view, preview, edit_draft, publish, archive | module/all | ยังไม่ตัดสินใจ; ห้ามขยายสิทธิ์ก่อน Phase 8 | 4B |
| document_form_metadata | view, edit_draft, publish, archive | all | Admin + AE Supervisor ผ่าน `canManageDocumentStandards` | 6A |
| signature | view_status, upload, replace, revoke | own | signed-in + owner | 5 |
| signature_evidence | create_on_approval, view_status | own approval / scoped document | ผู้อนุมัติเดิมของ Quotation หรือ Sale Order และต้องมี Active Signature | 5B |
| signature_admin | view_status, revoke_emergency | all | ยังไม่ตัดสินใจ | 5/8 |
| document_template | view, preview, edit_draft, publish, archive | module/all | Preview: Admin + AE Supervisor ผ่าน `canManageDocumentStandards`; edit/publish/archive: admin เดิม | 6B/7 |
| commercial_preset | view, preview, edit_draft, publish, archive, resolve | document/team/deal/service/all | Admin + AE Supervisor ผ่าน temporary `canManageCommercialPresets`; consumer resolver เป็น server-only และยังไม่ต่อ Production ใน 7A | 7A/8 |
| issued_document | view, print, download_pdf, verify | own/team/department/all | workflow เดิม | 7 |
| user_access | view, invite, update_role, update_scope, deactivate | all | `users:view`/`users:manage` | 8 |
| audit_log | view, export | own/team/department/all | `audit:view` | 8 |

## หลักฐานจาก Phase 1

- `GET /api/account/profile` อ่านเฉพาะบัญชีที่กำลังลงชื่อเข้าใช้
- `PATCH /api/account/profile` รับเฉพาะชื่อ นามสกุล และเบอร์โทรศัพท์ แล้วเขียนเฉพาะ `user_metadata`
- Client ไม่ส่ง user ID และ API ไม่รับ target user จาก request body จึงแก้บัญชีอื่นไม่ได้
- Role, team, department, extra capabilities และสถานะบัญชีเป็นข้อมูลอ่านอย่างเดียวในหน้า Account
- การแก้ Profile บันทึก Audit ด้วย `entityType: user`; การเปลี่ยนรหัสผ่านไม่บันทึกรหัสผ่านหรือ secret ลง Audit
- การจัดสิทธิ์ใหม่ยังเลื่อนไป Phase 8 ตามเดิม ไม่มี Role หรือ Capability ใหม่ใน Phase 1

## หลักฐานจาก Phase 5A

- `GET/POST/DELETE /api/account/signature` derive owner จาก session และไม่รับ target user ID
- File proxy ตรวจทั้ง `userId`, signature root, version และ owner-scoped storage path ก่อนคืน private PNG
- Signed-in user จัดการได้เฉพาะลายเซ็นของตนเอง; Phase 5A ไม่เพิ่ม Role หรือ Capability ใหม่
- Admin view/revoke ของผู้อื่นยังไม่ implement และคงไว้เป็น decision ของ Phase 8
- Version/event history และ storage object เดิมไม่ถูกลบเมื่อ Replace หรือ Revoke

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
