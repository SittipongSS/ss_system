"use client";
// ── การ์ด "จุดที่ TS ไม่พบหน้างาน" บนหน้าใบสั่งขายย้อนหลัง ──────────────────────
//   (มติ 16/09/2026 ข้อ 23 ส่วน ข1 · mig 0362 · ม็อก mockups/legacy-so/index.html จอ 05)
//
// ⭐ **ฝ่ายขายตัดสินที่เอกสารของตัวเอง** — TS แจ้งว่าหาจุดไม่เจอ แล้วเรื่องมาจบที่นี่
//   สองทาง ไม่มีทางไหนถูกเลือกไว้ก่อน:
//     ① แก้ชื่อจุดแล้วส่งกลับ TS — ชื่อในชีตไม่ตรงหน้างาน (เคสส่วนใหญ่ ชีตตรงจริงแค่ 25%)
//     ② ปิดจุดนี้ ไม่ต้องผูก (เก็บยอด) — จุดหายไปจริง สาขาปิด/ลูกค้าเลิกใช้
//
// ⚠️ **ทั้งสองทางไม่แตะเงิน** (ข้อ 23.1) — ยอดใบและงวดชำระเท่าเดิมทุกบาท เพราะเงินก้อนนี้
//   เก็บไปแล้วตามสัญญาเดิม · การถอดบรรทัดออกจากใบแล้วคิดเงินหัวใบใหม่คือ ข2 ยังไม่ทำ
//   ⇒ ม็อกวาดปุ่มที่สาม "ถอดออกจากใบ" ไว้ **อย่าเติมปุ่มนั้นที่นี่** จนกว่าตัวคิดเงินจะมี
//
// ⚠️ ทุกปุ่มผ่านโมดัลที่**บอกผลลัพธ์ก่อนกด** (กติกาของระบบ: การตัดสินทุกครั้งมีโมดัลบอกผล)
import { useState } from "react";
import { Lock, MapPinOff, Pencil } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";
import StatusBadge from "@/components/ui/StatusBadge";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { installationPointError } from "@/lib/sales/historicalOrders";
import {
  SITE_NOTE_MAX, lineAwaitingSiteDecision, noteLength, siteNotFoundOf,
} from "@/lib/sales/siteNotFound";
import { fmtDateTime, fmtMoney, fmtNumber, naText } from "@/lib/format";

export default function SiteDecisionCard({ lines = [], onDecide }) {
  const flagged = lines.filter((l) => siteNotFoundOf(l));
  const [dialog, setDialog] = useState(null);   // { kind: "rename" | "close", line }
  const [point, setPoint] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!flagged.length) return null;
  const awaiting = flagged.filter(lineAwaitingSiteDecision);

  const openRename = (line) => {
    setDialog({ kind: "rename", line });
    setPoint(String(line.installationPoint ?? ""));
    setNote("");
    setError("");
  };
  const openClose = (line) => {
    setDialog({ kind: "close", line });
    setNote("");
    setError("");
  };

  const submit = async () => {
    const renaming = dialog.kind === "rename";
    if (renaming) {
      const pointError = installationPointError(point);
      if (pointError) { setError(pointError); return; }
      if (point.trim() === String(dialog.line.installationPoint ?? "").trim()) {
        setError("ชื่อจุดยังเหมือนเดิม — แก้ชื่อก่อนส่งกลับ ไม่งั้น TS จะหาไม่เจอซ้ำรอบเดิม");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await onDecide(renaming
        ? { action: "rename_installation_point", lineId: dialog.line.id, installationPoint: point.trim() }
        : { action: "close_installation_point", lineId: dialog.line.id, note });
      setDialog(null);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DetailCard
        icon={MapPinOff}
        eyebrow="SITE NOT FOUND"
        title={`จุดที่ TS ไม่พบหน้างาน (${fmtNumber(flagged.length)})`}
        meta={awaiting.length
          ? `รอตัดสิน ${fmtNumber(awaiting.length)} จุด — จุดนี้จะไม่ถูกผูกโซนและไม่มีรอบบริการจนกว่าจะตัดสิน`
          : "ตัดสินครบทุกจุดแล้ว"}
      >
        <TableScroll family="list" minWidth={680} cells="stacked">
          <table>
            <thead>
              <tr>
                <th scope="col">จุดติดตั้ง</th>
                <th scope="col">สินค้า</th>
                <th scope="col" className="num">จำนวน</th>
                <th scope="col" className="num">ยอดบรรทัด</th>
                <th scope="col">TS บอกว่า</th>
                <th scope="col" aria-label="การกระทำ" />
              </tr>
            </thead>
            <tbody>
              {flagged.map((line) => {
                const info = siteNotFoundOf(line);
                return (
                  <tr key={line.id}>
                    <th scope="row">{naText(line.installationPoint)}</th>
                    <td className="mono">{naText(line.fgCode)}</td>
                    <td className="num mono">{fmtNumber(line.qty)}</td>
                    {/* ⚠️ ยอดโชว์ไว้ให้เห็นว่า "เก็บยอด" แปลว่าอะไร — ไม่มีปุ่มไหนในการ์ดนี้แตะมัน */}
                    <td className="num mono">{fmtMoney(line.lineTotal)}</td>
                    <td>
                      <strong>{naText(info.reasonLabel)}</strong>
                      {info.note ? ` — ${info.note}` : ""}
                      <span className="cell-sub">
                        {naText(info.byName)} · {fmtDateTime(info.at)}
                      </span>
                      {info.closed ? (
                        <span className="cell-sub">
                          <StatusBadge tone="neutral" size="sm" label="ปิดจุดนี้แล้ว" />
                          {info.closedNote ? ` ${info.closedNote}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {/* กติกาการมองเห็น: ตัดสินไปแล้ว = ไม่มีอะไรให้กด ⇒ ไม่โชว์ปุ่มตาย */}
                      {lineAwaitingSiteDecision(line) ? (
                        <div className="action-bar">
                          <Button size="sm" icon={<Pencil size={14} aria-hidden="true" />}
                            onClick={() => openRename(line)}>
                            แก้ชื่อจุดแล้วส่งกลับ TS
                          </Button>
                          <Button size="sm" tone="neutral" icon={<Lock size={14} aria-hidden="true" />}
                            onClick={() => openClose(line)}>
                            ปิดจุดนี้ ไม่ต้องผูก (เก็บยอด)
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <p className="form-hint">
          ไม่มีทางไหนถูกเลือกไว้ก่อน · <b>ทั้งสองทางไม่แตะยอดใบและงวดชำระ</b> — เงินก้อนนี้เก็บไปแล้วตามสัญญาเดิม
        </p>
      </DetailCard>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "rename" ? "แก้ชื่อจุดแล้วส่งกลับ TS" : "ปิดจุดนี้ ไม่ต้องผูก (เก็บยอด)"}
        size="sm"
        dismissible={!saving}
      >
        {dialog ? (
          <div className="stack">
            {/* ⭐ โมดัลบอกผลลัพธ์ก่อนกด ไม่ใช่หลังกด */}
            <p className="form-hint">
              จุด <b>{naText(dialog.line.installationPoint)}</b> ของใบนี้
              {dialog.kind === "rename"
                ? " — ธงของ TS จะถูกล้าง แล้วจุดนี้กลับเข้าคิวงานเข้าใหม่ให้ TS ไปหาไซต์/โซนต่อ"
                : " — จุดนี้จะไม่กลับเข้าคิวของ TS อีก ไม่มีโซนและไม่มีรอบบริการ"}
              {" · "}<b>ยอดบรรทัด {fmtMoney(dialog.line.lineTotal)} และงวดชำระไม่เปลี่ยน</b>
            </p>
            {dialog.kind === "rename" ? (
              <label className="form-group">
                <span>ชื่อจุดติดตั้งที่ถูกต้อง *</span>
                <Input value={point} onChange={(e) => setPoint(e.target.value)} autoFocus />
                <small>เดิม “{naText(dialog.line.installationPoint)}” · {naText(siteNotFoundOf(dialog.line)?.note)}</small>
              </label>
            ) : (
              <label className="form-group">
                <span>หมายเหตุ</span>
                <Textarea rows={3} value={note} maxLength={SITE_NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ไม่บังคับ — เหตุผลจาก TS ถูกเก็บไว้บนบรรทัดแล้ว" />
                <small>{fmtNumber(noteLength(note))}/{fmtNumber(SITE_NOTE_MAX)}</small>
              </label>
            )}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="action-bar">
              <Button variant="quiet" onClick={() => setDialog(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone={dialog.kind === "rename" ? "primary" : "warning"} onClick={submit} disabled={saving}>
                {saving ? "กำลังบันทึก…" : (dialog.kind === "rename" ? "ส่งกลับ TS" : "ปิดจุดนี้")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
