"use client";
// ── แผ่นปิดงานหน้าไซต์ (S-3) ──────────────────────────────────────────────
//
// ⭐ นี่คือจุดที่ข้อมูลจริงเข้าระบบ · ทุกอย่างอยู่ในจอเดียว ไม่ต้องกดข้ามหน้า
// ⚠️ รูปและลายเซ็น **ไม่บังคับ** (มติผู้ใช้ 2026-07-30) — บังคับแล้วช่างจะปิดงาน
//    ไม่ได้ตรงนั้น แล้วไปบันทึกย้อนหลังทีหลัง ทำให้เวลาที่บันทึกผิดทั้งชุด
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SignaturePad from "./SignaturePad";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { ATTACHMENT_KIND_LABELS, VISIT_KIND_LABELS } from "@/lib/service/rounds";
import { VISIT_STATUS_LABELS } from "@/lib/service/visitStatus";
import {
  ASSET_OUTCOMES, ASSET_OUTCOME_LABELS, deriveVisitStatus, normalizeAssetResult, pendingAssets,
} from "@/lib/service/visitAssets";
import { closeFormDefaults, missingEvidence } from "@/lib/service/myVisits";
import styles from "./CloseVisitSheet.module.css";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { fmtNumber, naText } from "@/lib/format";

export default function CloseVisitSheet({ open, visit, site, onClose, onSubmit }) {
  const [form, setForm] = useState(() => closeFormDefaults(null));
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  // ผลรายเครื่อง: Map<assetId, { outcome, reason, replacedByAssetId }>
  const [results, setResults] = useState({});
  const [draftItem, setDraftItem] = useState({ label: "", qty: "", unit: "", assetId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signing, setSigning] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !visit) return;
    setError("");
    setDraftItem({ label: "", qty: "", unit: "", assetId: "" });
    setForm(closeFormDefaults(visit));
    (async () => {
      try {
        /* GET นัดคืน visit + items + assets + zones + results มาในคำขอเดียว —
           ฟอร์มต้องรู้ว่าไซต์นี้มีอะไรให้ทำบ้างก่อนจะให้ติ๊กรายเครื่องได้ */
        const res = await fetch(`/api/service/visits/${visit.id}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลนัดไม่สำเร็จ");
        setItems(Array.isArray(data?.items) ? data.items : []);
        setAssets(Array.isArray(data?.assets) ? data.assets : []);
        const seed = {};
        for (const row of data?.results || []) {
          seed[row.assetId] = {
            outcome: row.outcome,
            reason: row.reason || "",
            replacedByAssetId: row.replacedByAssetId || "",
          };
        }
        setResults(seed);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [open, visit]);

  /* ⚠️ ต้องอยู่ **เหนือ** `if (!visit) return null` — hook เรียกใต้ early return
     ไม่ได้ (rules-of-hooks) · `addPhoto` ประกาศทีหลังได้ เพราะ callback ถูกเรียก
     ตอนผู้ใช้วางไฟล์ ไม่ใช่ตอน render */
  const intake = useFileIntake({
    disabled: uploading,
    multiple: false,
    accept: "image/*",
    onFiles: ([file]) => addPhoto(file),
    onOversize: setError,
  });

  if (!visit) return null;

  const addItem = async () => {
    const label = draftItem.label.trim();
    if (!label) { setError("ต้องระบุชื่อของที่ใช้"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/service/visits/${visit.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftItem),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      setItems((prev) => [...prev, data]);
      setDraftItem({ label: "", qty: "", unit: "", assetId: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/service/visits/${visit.id}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "ลบไม่สำเร็จ");
      }
      setItems((prev) => prev.filter((row) => row.id !== itemId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // อัปไฟล์ขึ้น Drive ผ่านท่อกลาง — โฟลเดอร์ปลายทางคือของลูกค้าเจ้าของไซต์
  // ⚠️ อย่ากลืน error ของชั้นอัปเป็น "อัปโหลดไม่สำเร็จ" ลอย ๆ — ข้อความจริงบอกได้ว่า
  // ไฟล์ใหญ่เกิน/ชนิดไม่รองรับ/ท่อ Drive ตาย ซึ่งแก้คนละทาง
  const uploadBlob = async (blob, name) => {
    const file = new File([blob], name, { type: blob.type || "image/png" });
    const ref = await uploadFileBytes({
      file, entityType: "service_visit", entityId: visit.id,
    });
    return ref.url || null;
  };

  const addPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadBlob(file, file.name || "photo.jpg");
      if (!url) throw new Error("อัปโหลดสำเร็จแต่ไม่ได้ลิงก์กลับมา");
      // รูปแรก = "ก่อน" · รูปถัดไป = "หลัง" (แก้ชนิดทีหลังได้ที่หน้ารายละเอียด)
      const kind = form.attachments.length === 0 ? "before" : "after";
      setForm((prev) => ({
        ...prev,
        attachments: [...prev.attachments, { url, name: file.name || "รูปหน้างาน", kind }],
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const saveSignature = async (blob) => {
    setSigning(true);
    setError("");
    try {
      const url = await uploadBlob(blob, `signature-${visit.code || visit.id}.png`);
      setForm((prev) => ({ ...prev, customerSignatureUrl: url }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSigning(false);
    }
  };

  const activeAssets = assets.filter((a) => a.status === "active");
  const resultRows = activeAssets
    .map((a) => ({ assetId: a.id, ...(results[a.id] || {}) }))
    .filter((r) => ASSET_OUTCOMES.includes(r.outcome));
  const pending = pendingAssets(assets, resultRows);
  const derived = deriveVisitStatus(resultRows);

  const setOutcome = (assetId, outcome) => setResults((prev) => ({
    ...prev,
    [assetId]: { reason: "", replacedByAssetId: "", ...(prev[assetId] || {}), outcome },
  }));
  const setField = (assetId, field, value) => setResults((prev) => ({
    ...prev, [assetId]: { ...(prev[assetId] || {}), [field]: value },
  }));

  const submit = async () => {
    /* ⚠️ ทุกเครื่องที่ยังใช้งานอยู่ต้องมีคำตอบก่อนปิด — ไม่งั้นสถานะที่สรุปจากลูก
       จะสรุปจากข้อมูลไม่ครบ แล้วใบที่ "ทำไม่ครบ" จะถูกปิดเป็น "เสร็จ" */
    if (pending.length) {
      setError(`ยังไม่ได้ระบุผลของ ${pending.length} รายการ: ${pending.map((a) => a.label).join(" · ")}`);
      return;
    }
    for (const row of resultRows) {
      const { error: invalid } = normalizeAssetResult(row);
      if (invalid) { setError(invalid); return; }
    }
    setBusy(true);
    setError("");
    try {
      /* บันทึกผลรายเครื่อง **ก่อน** ปิดใบ — server สรุปสถานะจากแถวจริงใน DB
         (closeFromAssets) ไม่ใช่จากค่าที่จอส่งมา ⇒ ลำดับนี้สลับไม่ได้ */
      if (activeAssets.length) {
        const res = await fetch(`/api/service/visits/${visit.id}/assets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: resultRows }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "บันทึกผลรายเครื่องไม่สำเร็จ");
      }
      await onSubmit({ ...form, closeFromAssets: activeAssets.length > 0, status: derived });
    } catch (e) {
      setError(e.message || "ปิดงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const missing = missingEvidence(form);

  return (
    <Modal open={open} onClose={onClose} title={`ปิดงาน ${visit.code || ""}`.trim()} size="md">
      <p className={styles.site}>
        {site?.name || visit.siteId}
        {site?.routeZone ? ` · ${site.routeZone}` : ""} · {VISIT_KIND_LABELS[visit.kind] || visit.kind}
      </p>

      {/* ⭐ เวลาที่เข้าจริง **ประทับที่ server** ตอนกดเริ่ม/ปิดงาน (มติ 2026-08-02 ข้อ 5)
          🐞 ของเดิมเป็นช่องกรอกสามช่อง + ปุ่ม "ตอนนี้" ที่อ่าน `d.getHours()` =
          นาฬิกาของเครื่องช่าง — เปลี่ยนโซนเวลาในมือถือแล้วเวลาที่บันทึกเพี้ยนโดยไม่มี
          อะไรจับได้ และช่างที่ยืนอยู่หน้างานก็ไม่ได้พิมพ์เวลาเองอยู่แล้ว (กรอกทีเดียว
          ตอนปิดงาน = เลขที่พิมพ์ย้อนหลัง ไม่ใช่เวลาจริง)
          ⇒ แสดงอย่างเดียว · แก้ย้อนหลังทำได้จากหน้ารายละเอียดนัด และใบจะติดธง
          `actualTimeEdited` ให้เห็นว่าแก้ (ด่าน check:thaitime กันรูปเดิมไว้แล้ว) */}
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>เวลาที่เข้าจริง</h3>
        <p className={styles.note}>
          ระบบจับเวลาให้ตอนคุณกด “เริ่มงาน” และ “บันทึกและปิดงาน” — ไม่ต้องกรอกเอง
        </p>
        <dl className={styles.stamp}>
          <div><dt>วันที่</dt><dd>{naText(form.actualDate)}</dd></div>
          <div><dt>เริ่ม</dt><dd>{naText(String(form.actualStartTime || "").slice(0, 5))}</dd></div>
          <div><dt>เสร็จ</dt><dd>{visit?.actualEndTime ? String(visit.actualEndTime).slice(0, 5) : "จะจับตอนกดปิดงาน"}</dd></div>
        </dl>
      </section>

      {/* ⭐ ปิดงาน **รายเครื่อง** (มติ 2026-08-02 ข้อ 6) — จากใบส่งงานจริง: เครื่อง 4 ตัว
          ทำแล้ว Reed 6 ขวดยังไม่ได้ทำ ⇒ ปิด done ก็โกหก ปิด unable ก็โกหก
          ⚠️ ไม่มีปุ่มให้เลือกสถานะของใบ — ใบสรุปจากลูกเสมอ ถ้าให้เลือกเอง คนจะกด
          "เสร็จ" เพราะเป็นปุ่มที่จบงานเร็วที่สุด แล้ว "ทำไม่ครบ" จะไม่มีวันปรากฏ */}
      {activeAssets.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>
            อุปกรณ์ในไซต์
            <span className={styles.progress}>{resultRows.length} / {activeAssets.length}</span>
          </h3>
          <p className={styles.note}>ติ๊กทีละตัว — สถานะของใบจะสรุปจากตรงนี้เอง</p>
          {activeAssets.map((asset) => {
            const row = results[asset.id] || {};
            return (
              <div key={asset.id} className={styles.assetRow}>
                <div className={styles.assetHead}>
                  <span className={styles.assetName}>
                    {asset.label}
                    <small>
                      {naText([asset.model, asset.serial, asset.qty ? `${fmtNumber(asset.qty)} จุด` : null]
                        .filter(Boolean).join(" · "))}
                    </small>
                  </span>
                  <span className="segmented" role="group" aria-label={`ผลของ ${asset.label}`}>
                    {ASSET_OUTCOMES.map((outcome) => (
                      <button key={outcome} type="button" aria-pressed={row.outcome === outcome}
                        onClick={() => setOutcome(asset.id, outcome)}>
                        {ASSET_OUTCOME_LABELS[outcome]}
                      </button>
                    ))}
                  </span>
                </div>

                {row.outcome === "swapped" && (
                  <label className={styles.assetField}>
                    <span>เปลี่ยนเป็นเครื่องไหน *</span>
                    {/* เลือกได้เฉพาะเครื่องในไซต์เดียวกัน — เพิ่มเครื่องใหม่เข้าไซต์ก่อน
                        แล้วค่อยกลับมาเลือก (server ตรวจซ้ำอีกชั้น) */}
                    <Select value={row.replacedByAssetId || ""}
                      onChange={(e) => setField(asset.id, "replacedByAssetId", e.target.value)}>
                      <option value="">— เลือกเครื่องที่เอามาแทน —</option>
                      {assets.filter((a) => a.id !== asset.id).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}{a.serial ? ` · ${a.serial}` : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}

                {row.outcome && row.outcome !== "done" && (
                  <label className={styles.assetField}>
                    <span>เหตุผล *</span>
                    <Input as="textarea" rows={2} value={row.reason || ""}
                      onChange={(e) => setField(asset.id, "reason", e.target.value)}
                      maxLength={500}
                      placeholder={row.outcome === "swapped"
                        ? "เช่น เครื่องชำรุด ไม่พ่น นำเครื่องสำรองมาเปลี่ยน"
                        : "เช่น ยังอยู่ในขั้นตอนปรับสูตร ทีม RD ขอให้รอรอบหน้า"} />
                  </label>
                )}
              </div>
            );
          })}

          {resultRows.length > 0 && (
            <p className={`${styles.derived} ${derived === "done" ? "" : styles.derivedWarn}`}>
              ใบนี้จะปิดเป็น <b>{VISIT_STATUS_LABELS[derived]}</b>
              {pending.length > 0 && ` · ยังไม่ได้ระบุผลอีก ${pending.length} รายการ`}
            </p>
          )}
        </section>
      )}

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>ของที่ใช้</h3>
        <p className={styles.note}>บันทึกไว้เป็นหลักฐานอย่างเดียว — ระบบไม่ตัดสต็อกและไม่ออกบิลจากรายการนี้</p>
        {items.map((item) => (
          <div key={item.id} className={styles.itemRow}>
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemQty}>
              {item.qty == null ? "—" : `${fmtNumber(item.qty)}${item.unit ? ` ${item.unit}` : ""}`}
            </span>
            <Button iconOnly tone="danger" variant="quiet" size="sm" aria-label={`ลบ ${item.label}`}
              onClick={() => removeItem(item.id)} disabled={busy} icon={<Trash2 size={14} aria-hidden="true" />} />
          </div>
        ))}
        <div className={styles.row}>
          <Input value={draftItem.label} onChange={(e) => setDraftItem((p) => ({ ...p, label: e.target.value }))}
            placeholder="เช่น Forest night" aria-label="ชื่อของที่ใช้" className={styles.grow} />
          <Input type="number" min="0" step="any" value={draftItem.qty}
            onChange={(e) => setDraftItem((p) => ({ ...p, qty: e.target.value }))}
            placeholder="จำนวน" aria-label="จำนวน" className={styles.qtyInput} />
          <Input value={draftItem.unit} onChange={(e) => setDraftItem((p) => ({ ...p, unit: e.target.value }))}
            placeholder="หน่วย" aria-label="หน่วย" className={styles.unitInput} />
          <Button tone="neutral" size="sm" onClick={addItem} disabled={busy}>เพิ่ม</Button>
        </div>
        {/* 🐞 `service_visit_items.assetId` มีในสคีมามาตั้งแต่ mig 0188 และ API รับอยู่แล้ว
            แต่ **จอไม่เคยส่งมาเลย** ⇒ ทุกแถวใน production มี assetId เป็น NULL และ
            เส้นทาง item → asset → zone ที่ mig 0298 เขียนไว้ (และเทสต์ยามปกป้องอยู่)
            ยังไม่เคยมีขาแรก · ไม่บังคับ เพราะของบางอย่างใช้กับทั้งไซต์ ไม่ใช่กับเครื่องใดเครื่องหนึ่ง */}
        {activeAssets.length > 0 && (
          <label className={styles.assetField}>
            <span>ใช้กับเครื่องไหน</span>
            <Select value={draftItem.assetId}
              onChange={(e) => setDraftItem((p) => ({ ...p, assetId: e.target.value }))}>
              <option value="">— ใช้กับทั้งไซต์ / ไม่ระบุ —</option>
              {activeAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
            <small className={styles.note}>ระบุแล้วยอดที่ใช้จะถูกนับเป็นของโซนที่เครื่องนั้นอยู่</small>
          </label>
        )}
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>รูปหน้างาน</h3>
        {/* ลากรูปมาวาง หรือ Ctrl+V ได้ด้วย — ช่างที่ปิดงานจากโน้ตบุ๊กมีภาพอยู่ใน
            คลิปบอร์ดอยู่แล้ว ไม่ได้ถ่ายสดจากมือถือทุกครั้ง (IS-26080013) */}
        <div className={styles.photoRow} {...intake.zoneProps}>
          {form.attachments.map((att) => (
            <a key={att.url} href={att.url} target="_blank" rel="noreferrer noopener" className={styles.photo}>
              {ATTACHMENT_KIND_LABELS[att.kind] || "รูป"}
            </a>
          ))}
          {/* capture="environment" = เปิดกล้องหลังตรง ๆ บนมือถือ ไม่ต้องเลือกจากอัลบั้ม */}
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ""; addPhoto(f); }}
            className={styles.fileInput} aria-label="ถ่ายรูปหน้างาน" />
          <Button tone="neutral" variant="quiet" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
            icon={<Camera size={15} aria-hidden="true" />}>
            {uploading ? "กำลังอัปโหลด…" : "ถ่ายรูป"}
          </Button>
        </div>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>ลายเซ็นผู้รับงาน</h3>
        {form.customerSignatureUrl ? (
          <div className={styles.row}>
            <a href={form.customerSignatureUrl} target="_blank" rel="noreferrer noopener">ดูลายเซ็นที่เซ็นไว้</a>
            <Button tone="neutral" variant="quiet" size="sm"
              onClick={() => setForm((p) => ({ ...p, customerSignatureUrl: null }))}>เซ็นใหม่</Button>
          </div>
        ) : (
          <SignaturePad onSave={saveSignature} onSkip={() => {}} saving={signing} />
        )}
      </section>

      <label className={`${styles.field} ${styles.block}`}>
        <span>สรุปงานที่ทำ</span>
        <Input as="textarea" rows={2} value={form.summary}
          onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} maxLength={2000} />
      </label>

      {/* เตือน ไม่บล็อก — ปุ่มปิดงานยังกดได้ตามปกติ */}
      {missing.length > 0 && (
        <p className={styles.warn}>
          <AlertTriangle size={14} aria-hidden="true" />
          {missing.join(" · ")} — ปิดงานได้ แต่หัวหน้าจะเห็นว่ายังขาด
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* 🐞 ปุ่มสองตัวนี้เคยเป็นลูก **ตรง** ของ `.form-actions` ⇒ พลาดกฎจอสัมผัสของ
          globals.css ที่ผูกไว้กับ `.form-actions-buttons .btn` (สูง --ctl-h-touch 44px
          และแบ่งความกว้างเท่ากันบนจอ ≤680px) · ปุ่มจบงานที่สำคัญที่สุดของโมดูลจึงสูง
          40px บนมือถือหน้างาน และเรียงเป็นคอลัมน์โดย "ยังไม่ปิด" อยู่เหนือปุ่มบันทึก */}
      <div className="form-actions">
        <div className="form-actions-buttons">
          <Button tone="neutral" onClick={onClose} disabled={busy}>ยังไม่ปิด</Button>
          <Button tone="primary" onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกและปิดงาน"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
