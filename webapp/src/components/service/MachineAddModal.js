"use client";
// ── โมดัลเพิ่มเครื่อง (mig 0344 · ม็อก machine-add) ───────────────────────
//
// ⭐ **แทน "รับเครื่องเข้าคลัง"** — ผู้ใช้ทักว่าทางเข้าเดิมเข้าใจผิด: การขึ้นทะเบียน
//   คือการบอกว่า **บริษัทได้เครื่องมา** (รุ่นอะไร สีอะไร รับเข้าวันไหน สถานะอะไร)
//   ไม่ใช่การย้ายของเข้าสถานที่ ⇒ ไม่ต้องมีคลังก่อนถึงจะเพิ่มเครื่องได้
//
// ⭐ **โมดัลไม่โชว์รหัสล่วงหน้า** (มติผู้ใช้ 2026-09-03) — เลขรันนับรวมทั้งบริษัท
//   ถ้ามีคนกดบันทึกพร้อมกัน เลขที่พรีวิวไว้จะไม่ใช่เลขที่ได้จริง
//   ⇒ **พรีวิวคือคำสัญญาที่ระบบรักษาไม่ได้** · รหัสขึ้นตอนสร้างเสร็จ
//   (ต่างจากโมดัลรับเข้าคลังเดิมที่พรีวิวได้ เพราะมันเดาเลขจากรุ่นซึ่งชนกันยากกว่า)
//
// ⭐ **หนึ่งครั้ง = หนึ่งเครื่อง** — ไม่มีช่องจำนวน · รับของล็อตเดียวกันใช้ปุ่ม
//   "เพิ่มอีกตัว" หลังบันทึก ซึ่งคงชนิด/รุ่น/สี/วันที่รับเข้าไว้ให้ (มติผู้ใช้)
//
// 🔑 ปุ่มปิดตามด่านตัวเดียวกับ API (`machineAddError`) และเหตุผลขึ้นเป็นตัวหนังสือ
import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Textarea from "@/components/ui/Textarea";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { assetKindOptions, modelColours, modelOptions } from "@/lib/service/assetModels";
import {
  MACHINE_ADD_STATUSES, MACHINE_STATUS_HINTS, SITE_RULE_BY_STATUS,
  machineAddCarryOver, machineAddDefaults, machineAddError,
} from "@/lib/service/machineAdd";
import { ASSET_STATUS_LABELS } from "@/lib/service/sites";
import { businessDate } from "@/lib/businessDate";
import styles from "./MachineAddModal.module.css";

export default function MachineAddModal({
  open, models = [], sites = [], zones = [], busy, canEdit = false,
  onClose, onSubmit, onSiteChange,
}) {
  const [form, setForm] = useState(() => machineAddDefaults());
  const [error, setError] = useState("");
  // รหัสของตัวที่เพิ่งสร้าง — โชว์หลังบันทึกเท่านั้น (ดูเหตุผลที่หัวไฟล์)
  const [made, setMade] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(machineAddDefaults(businessDate()));
    setError("");
    setMade(null);
  }, [open]);

  const patch = (next) => setForm((f) => ({ ...f, ...next }));

  const kindModels = useMemo(() => modelOptions(models, form.kind), [models, form.kind]);
  const model = useMemo(() => models.find((m) => m.id === form.modelId) || null, [models, form.modelId]);
  const colours = useMemo(() => modelColours(models, form.modelId), [models, form.modelId]);
  const site = useMemo(() => sites.find((s) => s.id === form.siteId) || null, [sites, form.siteId]);

  /* ⚠️ **รุ่นที่เลือกไว้ต้องหลุดเมื่อสลับชนิด** — ไม่งั้นฟอร์มถือรุ่นของชนิดอื่นไว้เงียบ ๆ
     แล้วด่านจะฟ้อง "ชนิดกับรุ่นไม่ตรงกัน" ทั้งที่จอไม่ได้แสดงรุ่นนั้นให้เห็นแล้ว */
  const pickKind = (kind) => patch({ kind, modelId: "", colour: "" });
  /* สีก็เช่นกัน — รุ่นใหม่อาจไม่มีสีที่เลือกไว้ · รุ่นที่มีสีเดียวเลือกให้เลย */
  const pickModel = (modelId) => {
    const next = modelColours(models, modelId);
    patch({ modelId, colour: next.length === 1 ? next[0] : "" });
  };
  const pickSite = (siteId) => {
    patch({ siteId, zoneId: "" });
    onSiteChange?.(siteId);
  };

  const siteRule = SITE_RULE_BY_STATUS[form.status];
  const gate = machineAddError(form, { canEdit, model, site, today: businessDate() });

  const save = async () => {
    setError("");
    try {
      const created = await onSubmit(form);
      // 🔑 รหัสมาจากของที่ server สร้างจริง ไม่ใช่ที่จอเดา
      setMade(created || null);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  const again = () => {
    setForm(machineAddCarryOver(form, businessDate()));
    setMade(null);
    setError("");
  };

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มเครื่อง" size="md">
      {/* ── หลังบันทึก: รหัสที่ได้ + ปุ่มเพิ่มอีกตัว ────────────────────── */}
      {made ? (
        <>
          <div className={styles.done}>
            <div className={styles.doneHead}><Check size={15} aria-hidden="true" /> เพิ่มเครื่องแล้ว</div>
            <div className={styles.doneCode}>{made.code}</div>
            <div className={styles.doneSub}>
              {[made.model, made.colour, ASSET_STATUS_LABELS[made.status]].filter(Boolean).join(" · ")}
            </div>
          </div>
          <p className={styles.hint}>
            รับของมาล็อตเดียวกันหลายเครื่อง กด “เพิ่มอีกตัว” ได้เลย —
            ระบบคง <strong>ชนิด · รุ่น · สี · วันที่รับเข้า</strong> ไว้ให้
          </p>
          <div className="form-action-bar">
            <Button onClick={onClose}>ปิด</Button>
            <Button tone="accent" onClick={again} icon={<Plus size={15} aria-hidden="true" />}>
              เพิ่มอีกตัว
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>ขึ้นทะเบียนเครื่องที่บริษัทได้รับมา — หนึ่งครั้งต่อหนึ่งเครื่อง</p>

          {models.length === 0 ? (
            /* ⚠️ ทางตันต้องบอกทางออก ไม่ใช่แค่บอกว่าว่าง — ทะเบียนรุ่นอยู่คนละหน้า */
            <AlertBanner tone="warning">
              ยังไม่มีรุ่นในทะเบียน — เพิ่มรุ่นและสีของแต่ละรุ่นที่หน้าตั้งค่าของระบบบริการก่อน
            </AlertBanner>
          ) : (
            <>
              <label className="form-field">
                <span>ชนิด <em className={styles.req}>ต้องระบุ</em></span>
                {/* ตัวเลือกน้อย = เรียงให้เห็นทั้งหมด ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรลของระบบ) */}
                <div className={styles.picks}>
                  {assetKindOptions().map((k) => (
                    <Button
                      key={k.value} size="sm"
                      tone={form.kind === k.value ? "accent" : "neutral"}
                      variant={form.kind === k.value ? "filled" : "outline"}
                      onClick={() => pickKind(k.value)}
                    >
                      {k.label}
                    </Button>
                  ))}
                </div>
              </label>

              <label className="form-field">
                <span>รุ่น <em className={styles.req}>ต้องระบุ</em></span>
                {kindModels.length === 0 ? (
                  <small className={styles.hintSm}>
                    ยังไม่มีรุ่นของ{ASSET_KIND_LABELS[form.kind]}ในทะเบียน — เพิ่มที่หน้าตั้งค่าก่อน
                  </small>
                ) : (
                  <div className={styles.picks}>
                    {kindModels.map((m) => (
                      <Button
                        key={m.value} size="sm"
                        tone={form.modelId === m.value ? "accent" : "neutral"}
                        variant={form.modelId === m.value ? "filled" : "outline"}
                        onClick={() => pickModel(m.value)}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </div>
                )}
                <small className={styles.hintSm}>เฉพาะรุ่นของชนิดที่เลือก — มาจากทะเบียนรุ่น</small>
              </label>

              {/* ⭐ สีผูกกับรุ่น — รุ่นที่ไม่แยกสีไม่ต้องมีช่องนี้เลย (มติผู้ใช้) */}
              {colours.length > 0 && (
                <label className="form-field">
                  <span>สี <em className={styles.req}>ต้องระบุ</em></span>
                  <div className={styles.picks}>
                    {colours.map((c) => (
                      <Button
                        key={c} size="sm"
                        tone={form.colour === c ? "accent" : "neutral"}
                        variant={form.colour === c ? "filled" : "outline"}
                        onClick={() => patch({ colour: c })}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </label>
              )}

              <label className="form-field">
                <span>วันที่รับเข้า <em className={styles.req}>ต้องระบุ</em></span>
                <Input
                  type="date" value={form.receivedAt || ""} max={businessDate()}
                  onChange={(e) => patch({ receivedAt: e.target.value })}
                />
                <small className={styles.hintSm}>
                  เดือนในรหัสเครื่องมาจากวันนี้ — ขึ้นทะเบียนย้อนหลังให้ของเก่าได้
                </small>
              </label>

              <label className="form-field">
                <span>สถานะการใช้งาน <em className={styles.req}>ต้องระบุ</em></span>
                <div className={styles.statusRow}>
                  {MACHINE_ADD_STATUSES.map((s) => (
                    <button
                      key={s} type="button"
                      className={styles.statusCard}
                      data-on={form.status === s ? "1" : undefined}
                      onClick={() => patch({ status: s, siteId: "", zoneId: "" })}
                    >
                      <b>{ASSET_STATUS_LABELS[s]}</b>
                      <span>{MACHINE_STATUS_HINTS[s]}</span>
                    </button>
                  ))}
                </div>
                <small className={styles.hintSm}>
                  ของที่เพิ่งรับเข้ามาตั้งต้นที่ <strong>ว่าง</strong> — เปลี่ยนได้ถ้าเป็นของเก่าที่ขึ้นทะเบียนย้อนหลัง
                </small>
              </label>

              {/* ที่อยู่โผล่เฉพาะสถานะที่ต้องมี/มีได้ — "ว่าง" แปลว่ายังไม่มีที่อยู่จริง ๆ */}
              {siteRule !== "none" && (
                <>
                  <label className="form-field">
                    <span>
                      ไซต์ที่ติดตั้ง
                      {siteRule === "required"
                        ? <em className={styles.req}>ต้องระบุ</em>
                        : <span className={styles.opt}>ไม่ระบุก็ได้</span>}
                    </span>
                    <SearchableSelect
                      value={form.siteId}
                      onChange={pickSite}
                      options={sites.map((s) => ({
                        value: s.id,
                        label: s.name,
                        search: `${s.name} ${s.code || ""} ${s.customerName || ""}`,
                      }))}
                      placeholder="เลือกไซต์"
                    />
                  </label>

                  {form.siteId && zones.length > 0 && (
                    <label className="form-field">
                      <span>โซน <span className={styles.opt}>ไม่ระบุก็ได้</span></span>
                      <SearchableSelect
                        value={form.zoneId}
                        onChange={(v) => patch({ zoneId: v })}
                        options={zones.map((z) => ({ value: z.id, label: z.name, search: z.name }))}
                        placeholder="เลือกโซน"
                      />
                    </label>
                  )}
                </>
              )}

              {/* ⭐ "เสีย" เป็นสวิตช์แยก ติ๊กได้ทุกสถานะ — ตรงกับสองแกนที่ mig 0332 สร้างไว้ */}
              <div className={styles.brokenRow}>
                <button
                  type="button" className="ui-switch"
                  data-on={form.broken ? "1" : undefined}
                  aria-pressed={form.broken ? "true" : "false"}
                  onClick={() => patch({ broken: !form.broken })}
                >
                  <i aria-hidden="true" />เครื่องเสีย
                </button>
                <small className={styles.hintSm}>
                  ติ๊กได้ทุกสถานะ — เครื่องที่เสียแต่ยังตั้งอยู่ที่ลูกค้าก็ยังเป็น “ใช้งานอยู่ · เสีย”
                </small>
              </div>

              <label className="form-field">
                <span>หมายเหตุ</span>
                <Textarea value={form.note || ""} onChange={(e) => patch({ note: e.target.value })} rows={2} />
              </label>
            </>
          )}

          {error && <AlertBanner tone="danger">{error}</AlertBanner>}
          {/* เหตุผลที่กดไม่ได้ต้องเป็นตัวหนังสือ ไม่ใช่ tooltip — จอสัมผัสไม่มีทางเห็น */}
          {!error && gate && models.length > 0 && <p className={styles.gate} role="status">{gate}</p>}

          <div className="form-action-bar">
            <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
            <Button tone="primary" onClick={save} disabled={busy || !!gate || !models.length}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
