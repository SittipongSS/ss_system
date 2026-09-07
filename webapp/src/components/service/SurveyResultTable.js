"use client";
// ── ตารางสรุปผลประเมินของหัวหน้า TS (เฟส 3 · จอ 07) ─────────────────────
//
// ⭐ **ช่างส่งข้อเท็จจริงมาจากหน้างาน หัวหน้าตัดสินสองอย่าง**: จะติดตั้งจุดไหนบ้าง
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ (มติผู้ใช้ 2026-08-29)
//   ⇒ ตารางนี้มี **สองคอลัมน์ที่ต้องกรอก ไม่ใช่คอลัมน์เดียว** · ที่เหลืออ่านอย่างเดียว
//
// ⚠️ **จำนวนจุด ≠ จำนวนแพ็คเกจ** — `service-field-operations` §2.4 บันทึกไว้แล้วว่า
//   "จำนวนเครื่องต่อแพ็คเกจแกว่ง" · หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้
//   ⇒ **ห้ามผูกสองเลขนี้เข้าหากันอัตโนมัติ และห้ามเตือนว่า "ไม่เท่ากัน"**
import { useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { TableShell } from "@/components/ui/Table";
import {
  packageNeedsNote, surveyDocCounts, surveyResultMissing, surveyZoneSize, suggestedPackages,
} from "@/lib/service/survey";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyResultTable.module.css";

/* ป้ายบอกว่าเคาะต่างจากสูตรแค่ไหน — **ไม่ใช่คำเตือน** สูตรเป็นข้อเสนอ ไม่ใช่คำสั่ง */
function deltaText(qty, suggested) {
  if (!suggested || !(qty > 0)) return null;
  if (qty === suggested) return { tone: "ok", text: "ตรงกับสูตร" };
  const diff = qty - suggested;
  return { tone: "warn", text: diff > 0 ? `สูงกว่าสูตร ${diff}` : `ต่ำกว่าสูตร ${-diff}` };
}

export default function SurveyResultTable({ zones = [], filesByZone = {}, canDecide = false, busyZone, onDecide }) {
  const [drafts, setDrafts] = useState({});
  const draftOf = (zone) => drafts[zone.id] ?? { packageNote: zone.packageNote || "" };
  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));

  return (
    <TableShell minWidth={960}>
      <table>
        <thead>
          <tr>
            <th>พื้นที่</th>
            <th>ขนาด (ม.)</th>
            <th className="a-right">ลบ.ม.</th>
            <th className="a-right">สูตร</th>
            <th>จุดติดตั้ง</th>
            <th>แพ็คเกจ/เดือน</th>
            <th>รูป</th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => {
            const cut = zone.status === "cut";
            const size = surveyZoneSize(zone.parts);
            const suggested = suggestedPackages(size.volumeCbm);
            const files = filesByZone[zone.id] || [];
            const docs = surveyDocCounts(files);
            const miss = surveyResultMissing(zone, files);
            const spots = Array.isArray(zone.spots) ? zone.spots : [];
            const picked = spots.filter((s) => s?.selected === true).length;
            const delta = deltaText(Number(zone.packageQty), suggested);
            const needNote = packageNeedsNote(zone);
            const draft = draftOf(zone);
            const busy = busyZone === zone.id;

            const bump = (by) => {
              const next = Math.max(1, (Number(zone.packageQty) || suggested || 1) + by);
              onDecide(zone.id, { packageQty: next, packageNote: draft.packageNote || zone.packageNote || undefined });
            };

            return (
              <tr key={zone.id} className={cut ? styles.cut : undefined}>
                <td>
                  <b>{zone.zoneName}</b>
                  <span className={styles.sub}>
                    {/* ⚠️ "เพิ่มหน้างาน" ต้องอ่านออกจาก `status` ไม่ใช่จาก `!zoneId` — พื้นที่ที่
                        ช่างเพิ่มได้รหัส ZN ทันที ส่วนพื้นที่ใหม่ของ SA รอถึงตอนกดส่งใบ */}
                    {[zone.floor ? `ชั้น ${zone.floor}` : null,
                      zone.status === "added" ? "ช่างเพิ่มหน้างาน" : null,
                      zone.zoneId ? null : "พื้นที่ใหม่"]
                      .filter(Boolean).join(" · ") || naText(null)}
                  </span>
                </td>

                {cut ? (
                  /* ⚠️ พื้นที่ที่ตัดออกยังต้องอยู่ในตาราง — SA ต้องเห็นว่าอะไรหายไปและเพราะอะไร
                     (ของที่หายจากสิ่งที่เขาจะเสนอราคา คือของที่ลูกค้าจะถาม) */
                  <td colSpan={6} className={styles.cutCell}>
                    ตัดออกหน้างาน — {naText(zone.cutReason)}
                    <span className={styles.sub}>ไม่นับรวมในผลที่ส่งให้ฝ่ายขาย · พื้นที่ยังอยู่ในทะเบียน ประเมินใหม่ได้</span>
                  </td>
                ) : (
                  <>
                    <td className={styles.dims}>
                      {(zone.parts || []).map((p, i) => (
                        <span key={p.id || i}>
                          {fmtNumber(p.widthM)} × {fmtNumber(p.lengthM)} × {fmtNumber(p.heightM)}
                        </span>
                      ))}
                      {size.parts > 1 ? <span className={styles.sub}>{size.parts} ส่วน</span> : null}
                    </td>
                    <td className="a-right mono">{fmtNumber(size.volumeCbm)}</td>
                    <td className="a-right mono">{suggested ?? naText(null)}</td>

                    {/* ── จุดติดตั้ง — ติ๊กจากที่ช่างแจ้งมา ────────────────── */}
                    <td>
                      {spots.length === 0 ? (
                        <span className={styles.warnText}>ช่างยังไม่แจ้งจุดสักจุด</span>
                      ) : (
                        <>
                          {/* ชุดตัวเลือกเล็กตายตัวต้องกางให้เห็น ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล) */}
                          <div className={styles.spots}>
                            {spots.map((s) => (
                              <button
                                key={s.id} type="button" className={styles.spotChip}
                                data-on={s.selected ? "1" : undefined}
                                disabled={!canDecide || busy}
                                aria-pressed={s.selected ? "true" : "false"}
                                onClick={() => onDecide(zone.id, {
                                  selectedSpotIds: spots
                                    .filter((x) => (x.id === s.id ? !x.selected : x.selected))
                                    .map((x) => x.id),
                                })}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                          <span className={styles.sub}>เลือก {picked} / {spots.length}</span>
                        </>
                      )}
                    </td>

                    {/* ── แพ็คเกจ — สูตรเสนอ หัวหน้าเคาะ ─────────────────── */}
                    <td>
                      <div className={styles.stepper}>
                        <button type="button" aria-label="ลดแพ็คเกจ" disabled={!canDecide || busy} onClick={() => bump(-1)}>
                          <Minus size={13} aria-hidden="true" />
                        </button>
                        <b>{naText(zone.packageQty)}</b>
                        <button type="button" aria-label="เพิ่มแพ็คเกจ" disabled={!canDecide || busy} onClick={() => bump(1)}>
                          <Plus size={13} aria-hidden="true" />
                        </button>
                      </div>
                      {delta ? <span className={styles.delta} data-tone={delta.tone}>{delta.text}</span> : null}
                      {!zone.packageQty && suggested && canDecide ? (
                        <Button size="sm" variant="quiet" disabled={busy}
                          onClick={() => onDecide(zone.id, { packageQty: suggested })}>
                          ใช้ {suggested} ที่สูตรบอก
                        </Button>
                      ) : null}
                      {/* 🔴 ทับสูตรแล้วต้องบอกเหตุผล — ของที่ต่างจากที่ SA จะเสนอราคา
                          คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */}
                      {needNote && (
                        <div className={styles.noteBox}>
                          <span className={styles.req}>ต้องบอกเหตุผล</span>
                          <Input
                            value={draft.packageNote} disabled={!canDecide || busy} maxLength={500} autoComplete="off"
                            placeholder="ทำไมถึงต่างจากสูตร"
                            onChange={(e) => setDraft(zone.id, { packageNote: e.target.value })}
                            onBlur={() => {
                              const next = (draft.packageNote || "").trim();
                              if (next && next !== (zone.packageNote || "")) onDecide(zone.id, { packageNote: next });
                            }}
                          />
                        </div>
                      )}
                    </td>

                    <td className={styles.docs}>
                      <span>{docs.wide}</span> / <span data-low={docs.plan === 0 ? "1" : undefined}>{docs.plan}</span> / <span>{docs.spot}</span>
                      <span className={styles.sub}>กว้าง / ผัง / จุด</span>
                      {/* เหตุผลที่ยังส่งไม่ได้ต้องเป็นตัวหนังสือบนแถวที่ติด ไม่ใช่กองรวมข้างล่าง */}
                      {[...miss.field, ...miss.result].length > 0 && (
                        <span className={styles.rowMiss}>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {[...miss.field, ...miss.result].join(" · ")}
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}
