export function visibleDocumentActions(actions = []) {
  return actions.filter((action) => action && action.visible !== false);
}

export function normalizeDocumentControlActions({
  primaryAction = null,
  secondaryActions = [],
  dangerActions = [],
} = {}) {
  return {
    primaryAction: primaryAction?.visible === false ? null : primaryAction,
    secondaryActions: visibleDocumentActions(secondaryActions),
    dangerActions: visibleDocumentActions(dangerActions),
  };
}

/* ⭐ **ขั้นที่ประกาศ `state` มาเอง ชนะการนับจาก index** (มติผู้ใช้ 2026-09-01) —
   รางส่วนใหญ่เดินเป็นเส้นตรง "ก่อน index = ผ่านแล้ว" ซึ่งจริงตราบใดที่ทุกขั้นต้อง
   ทำเรียงกัน · แต่รางที่มีขั้นซึ่ง **ค้างได้โดยไม่กั้นขั้นถัดไป** (คำร้อง: แจ้งกำหนดส่ง
   กับการลงมือทำงาน เกิดพร้อมกันได้) จะถูกนับเป็น "ผ่านแล้ว" ทั้งที่ยังไม่มีใครทำ
   ⇒ รางติ๊กถูกให้ขั้นที่ยังไม่เกิด ซึ่งเป็นคำโกหกที่ผู้อ่านตรวจไม่ได้
   ⚠️ ผู้เรียกที่ไม่ส่ง `state` มาได้พฤติกรรมเดิมทุกขั้น — นี่คือทางเลือก ไม่ใช่กฎใหม่ */
export function workflowStepsFromIndex(steps = [], currentIndex = 0, cancelled = false) {
  return steps.map((step, index) => ({
    ...step,
    state: cancelled
      ? "cancelled"
      : step?.state
        || (index < currentIndex ? "done" : index === currentIndex ? "current" : "pending"),
  }));
}
