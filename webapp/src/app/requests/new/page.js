"use client";
// ── เปิดคำร้อง — เป็น "หน้า" ไม่ใช่โมดัล ────────────────────────────────
//
// ⭐ **เหตุผลไม่ใช่ความกว้าง** (`Modal size="xl"` = 1040px มีอยู่แล้ว พอสำหรับตาราง)
// แต่เป็นสองข้อนี้:
//
//   1 **ขั้นทบทวนก่อนเลขที่ออก** — หน้านี้จบที่ "บันทึกร่าง" แล้วส่งที่หน้ารายละเอียด
//     ⇒ ได้จังหวะแนบไฟล์ (`AttachmentsPanel` ต้องมี `entityId` ก่อน) และตรวจของ
//     ก่อนกดส่งซึ่งย้อนไม่ได้ · โมดัลเดินสามขั้นรวดในการกดครั้งเดียว จึงไม่มีจังหวะนั้น
//     ⚠️ **ไม่ใช่ว่าโมดัลแนบไฟล์ไม่ได้** — `createAndSendRequest` อัปไฟล์ที่ค้างใน
//     ฟอร์มให้หลังสร้างใบ · ที่ต่างคือ "ได้ดูก่อนส่งไหม" ไม่ใช่ "แนบได้ไหม"
//   2 **prefill จากหน้าดีล** — `/requests/new?kind=product_dev&dealId=…`
//     โมดัลต้องส่ง props ผ่านทุกจุดที่เปิดมัน = เพิ่มทางที่ต้องดูแล
//
// ⚠️ **ห้ามทำทั้งสองเปลือก** — ครอบ `RequestForm` ตัวเดียวกันได้ก็จริง แต่จะได้แถบปุ่ม
// กับข้อความ blocker สองชุดที่ต้องคอยดูแลให้ตรงกัน ซึ่งเป็นโรคเดียวกับที่กฎ
// AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ ⇒ โมดัลในคิวถูกถอดออกพร้อมกับ PR นี้
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import { createRequestDraft, requestFormBlocker } from "@/lib/master/requestCreate";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";

const asArray = (d) => (Array.isArray(d) ? d : []);

export default function NewRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // prefill จากลิงก์ — มาจากหน้าดีลไหนก็เติมดีลนั้นให้ ไม่ต้องเลือกซ้ำ
  const defaults = useMemo(() => ({
    kind: searchParams.get("kind") || "",
    dealId: searchParams.get("dealId") || "",
    projectId: searchParams.get("projectId") || "",
  }), [searchParams]);
  // ⚠️ กลับไปที่เดิมหลังบันทึก — แพตเทิร์นเดียวกับ pm/tasks · ค่าที่ไม่ใช่เส้นทาง
  // ภายในถูกทิ้ง (open redirect จากโดเมนของเราเองคือของจริงที่เคยหลุดมาแล้ว)
  const back = searchParams.get("returnTo");
  const returnTo = back && back.startsWith("/") && !back.startsWith("//") ? back : "/requests";

  const [form, setForm] = useState(() => emptyRequestForm(defaults));
  // ⭐ สองขั้น: เลือกฝ่าย+หัวข้อให้จบ → กดแล้วค่อยกางฟอร์มของหัวข้อนั้น
  // มาจากลิงก์ที่ระบุหัวข้อมาแล้ว (เช่นจากหน้าดีล) = ข้ามขั้นแรกไปเลย ไม่ต้องกดซ้ำ
  // สิ่งที่ผู้ใช้เพิ่งเลือกไว้แล้ว
  const [revealed, setRevealed] = useState(!!defaults.kind);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deals, setDeals] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [mentionPeople, setMentionPeople] = useState([]);

  useEffect(() => {
    const grab = (url, set) => fetch(url, { cache: "no-store" })
      .then((r) => r.json()).then((d) => set(asArray(d))).catch(() => {});
    grab("/api/master/materials", setMaterials);
    grab("/api/products", setProducts);
    grab("/api/pm/projects", setProjects);
    grab("/api/sales-planning/deals", setDeals);
    grab("/api/sales-planning/sales-orders", setSalesOrders);
    grab("/api/master/scents", setScents);
    grab("/api/master/formulas", setFormulas);
    // รายชื่อกรองด้วยด่านของเธรดคำร้องมาจาก server แล้ว (ห้ามกรองเองที่ client —
    // @คนที่เปิดคำร้องไม่ได้ = เขาได้แจ้งเตือนที่กดแล้วเจอ 404)
    grab("/api/sa/requests/mentionable", setMentionPeople);
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
  }, []);

  // ปุ่มส่งเปิดเมื่อกรอกครบ — **ด่านเดียวกับข้อความที่ฟอร์มแสดง**
  // ห้ามเขียนเงื่อนไขเพิ่มที่นี่: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางแบบไม่บอกเหตุผล
  const blocker = requestFormBlocker(form);

  // ⭐ **บันทึกร่างอย่างเดียว ไม่ส่ง** — เลขที่ออกตอนกดส่งที่หน้ารายละเอียด
  // สองขั้นนี้แยกกันเพราะการออกเลขที่ย้อนไม่ได้ (trigger ทำให้ `docNo` immutable)
  // และเพราะไฟล์แนบต้องมีคำร้องให้เกาะก่อน ⇒ ร่างคือสิ่งที่ทำให้แนบไฟล์เป็นไปได้
  const saveDraft = async () => {
    setSaving(true);
    const productName = products.find((p) => p.id === form.productId)?.name || null;
    const { id, error } = await createRequestDraft(form, { productName });
    if (error) {
      setToast({ kind: "error", msg: error });
      setSaving(false);
      return;
    }
    if (id) router.push(`/requests/${id}`);
  };

  return (
    <Workspace
      icon={<ClipboardList size={22} />}
      title="เปิดคำร้อง"
      subtitle="คำร้องจะถูกสร้างเป็นร่างก่อน — เลขที่จะออกตอนกดส่ง"
      back={{ href: returnTo, label: "กลับ" }}
    >
      <div className={styles.form}>
        <RequestForm
          value={form} onChange={setForm} disabled={saving}
          materials={materials} products={products}
          projects={projects} deals={deals} salesOrders={salesOrders}
          scents={scents} formulas={formulas} productTypes={productTypes}
          mentionPeople={mentionPeople}
          // ไฟล์แนบและ @ อยู่ที่หน้ารายละเอียด — ที่เดียวที่ทั้งสองอย่างทำงานจริง
          deferAttachments
          // เหตุผลที่ยังบันทึกไม่ได้ย้ายไปอยู่ติดปุ่ม (ด่านตัวเดียวกัน คนละที่วาง)
          showBlocker={false}
          revealed={revealed}
          // ⭐ ปุ่มคุมหัวข้ออยู่ติดช่องหัวข้อ ไม่ใช่แถบปุ่มล่าง · สลับป้ายตามขั้น
          // ⚠️ "เปลี่ยนหัวข้อ" **ล้างฟอร์มทิ้ง** เหลือแค่ฝ่าย/หัวข้อ — ค่าเดิมค้างอยู่คือ
          // ของที่ถูกส่งไปกับคำร้องหัวข้อใหม่โดยไม่มีใครเห็น · และตอนกางฟอร์มแล้ว
          // ดรอปดาวน์ถูกล็อก ⇒ **ทางเดียวที่เปลี่ยนได้คือกดปุ่มนี้** เปลี่ยนโดยไม่ตั้งใจไม่ได้
          topicAction={revealed ? {
            // บอกให้ครบว่าปลดล็อกอะไร — ปุ่มปลดทั้งฝ่ายและหัวข้อ ไม่ใช่หัวข้ออย่างเดียว
            label: "เปลี่ยนฝ่าย/หัวข้อ",
            onClick: () => {
              setForm(emptyRequestForm({ ...defaults, dept: form.dept, kind: form.kind }));
              setRevealed(false);
            },
          } : {
            // ⭐ ป้ายบอก **สิ่งที่จะได้** ไม่ใช่สิ่งที่ปุ่มทำ — "แสดงฟอร์ม" ไม่ได้บอกว่า
            // ฟอร์มอะไร · ใส่ชื่อหัวข้อลงไปเลยจะเห็นตั้งแต่ยังไม่กดว่ากำลังจะกรอกอะไร
            label: form.kind ? `กรอกฟอร์ม${requestKindLabel(form.kind)}` : "กรอกฟอร์ม",
            disabled: !form.kind,
            onClick: () => setRevealed(true),
          }}
        />

        {/* ⚠️ แถบล่างเหลือเฉพาะปุ่มที่ทำอะไรกับ **ทั้งใบ** — ปุ่มคุมหัวข้อย้ายไปอยู่
            ติดช่องหัวข้อแล้ว · ขั้นที่ยังไม่กางฟอร์มไม่มีปุ่มบันทึก เพราะยังไม่มีอะไร
            ให้บันทึกนอกจากฝ่ายกับหัวข้อ */}
        <div className={`action-bar ${styles.actions}`}>
          {revealed && blocker && <span className={styles.blocker}>⚠ {blocker}</span>}
          <Button variant="quiet" disabled={saving} onClick={() => router.push(returnTo)}>
            ยกเลิก
          </Button>
          {revealed && (
            <Button tone="accent" disabled={saving || !!blocker} onClick={saveDraft}>
              บันทึกร่าง
            </Button>
          )}
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
