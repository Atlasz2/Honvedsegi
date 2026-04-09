from __future__ import annotations
from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _date_overlap, _get_current_user, _parse_iso_date, _utc_now
from ..models import DutyModel, EventModel, ExerciseModel, TrainingModel, UserModel

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_title(template: str) -> str:
    return {
        "overview": "Összesített műveleti riport",
        "operations": "Műveleti naptár riport",
        "duties": "Szolgálati kivonat",
        "events": "Eseménynaptár riport",
        "focus": "Részletes fókusz riport",
    }.get(template, template)


def _report_filename_base(template: str, focus_type: str | None = None) -> str:
    return {
        "overview": "osszesitett-muveleti-riport",
        "operations": "muveleti-naptar-riport",
        "duties": "szolgalati-kivonat",
        "events": "esemenynaptar-riport",
        "focus": f"fokusz-riport-{focus_type or 'elem'}",
    }.get(template, "riport")


def _serialize_report_item(item: Any, item_type: str) -> dict[str, Any]:
    if item_type == "duty":
        return {
            "id": item.id, "itemType": item_type, "type": item.type,
            "personId": item.person_id, "personName": item.person_name,
            "startDate": item.start_date, "endDate": item.end_date,
            "location": item.location or "-", "status": item.status,
            "previewRow": f"- {item.start_date} -> {item.end_date} | {item.type} | {item.person_name} | {item.location or '-'} | {item.status}",
        }
    assigned = getattr(item, "assigned", None) or []
    payload = {
        "id": item.id, "itemType": item_type, "name": item.name,
        "type": getattr(item, "type", "-") or "-",
        "startDate": item.start_date, "endDate": item.end_date,
        "location": item.location or "-", "status": item.status,
        "maxPersonnel": getattr(item, "max_personnel", 0), "assignedCount": len(assigned),
        "previewRow": f"- {item.start_date} -> {item.end_date} | {item.name} | {item.location or '-'} | {item.status}",
    }
    if hasattr(item, "organizer"):
        payload["organizer"] = getattr(item, "organizer", "") or "-"
    return payload


def _serialize_focus(item: Any, focus_type: str, focus_id: str) -> dict[str, Any]:
    if focus_type == "duty":
        return {
            "type": focus_type, "id": focus_id, "headline": f"Szolgalat: {item.type}",
            "description": "", "participants": [],
            "details": [
                {"label": "Idoszak", "value": f"{item.start_date} - {item.end_date}"},
                {"label": "Szemely", "value": item.person_name},
                {"label": "Helyszin", "value": item.location or "-"},
                {"label": "Statusz", "value": item.status},
            ],
        }
    assigned = getattr(item, "assigned", None) or []
    participants = [
        {"personName": e.get("personName") or e.get("person_name") or "-",
         "detail": e.get("role") or e.get("attendance") or "-"}
        for e in assigned[:250]
    ]
    details = [
        {"label": "Tipus", "value": getattr(item, "type", "-") or "-"},
        {"label": "Idoszak", "value": f"{item.start_date} - {item.end_date}"},
        {"label": "Helyszin", "value": item.location or "-"},
        {"label": "Statusz", "value": item.status},
        {"label": "Max. letszam", "value": str(getattr(item, "max_personnel", 0))},
        {"label": "Hozzarendelve", "value": f"{len(assigned)} fo"},
    ]
    if hasattr(item, "organizer"):
        details.insert(4, {"label": "Szervezo", "value": getattr(item, "organizer", "") or "-"})
    return {
        "type": focus_type, "id": focus_id, "headline": f"Megnevezes: {item.name}",
        "description": getattr(item, "description", "") or "",
        "participants": participants, "details": details,
    }


def _build_report_data(
    db: Session, date_from: str | None, date_to: str | None,
    template: str, focus_type: str | None, focus_id: str | None,
) -> dict[str, Any]:
    allowed_templates = {"overview", "operations", "duties", "events", "focus"}
    allowed_focus = {"exercise", "training", "event", "duty"}
    if template not in allowed_templates:
        raise HTTPException(status_code=400, detail="Nem tamogatott riportminta")
    if focus_type and focus_type not in allowed_focus:
        raise HTTPException(status_code=400, detail="Nem tamogatott fokusz tipus")

    start_date = _parse_iso_date(date_from) if date_from else _utc_now().date()
    end_date = _parse_iso_date(date_to) if date_to else start_date + timedelta(days=30)
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Ervenytelen datumtartomany")
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="A zaro datum nem lehet korabbi")

    exercises = [i for i in db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
                 if _date_overlap(i.start_date, i.end_date, start_date, end_date)]
    trainings = [i for i in db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
                 if _date_overlap(i.start_date, i.end_date, start_date, end_date)]
    events = [i for i in db.scalars(select(EventModel).order_by(EventModel.start_date)).all()
              if _date_overlap(i.start_date, i.end_date, start_date, end_date)]
    duties = [i for i in db.scalars(select(DutyModel).order_by(DutyModel.start_date)).all()
              if _date_overlap(i.start_date, i.end_date, start_date, end_date)]

    sections: list[dict] = []

    def add_section(key, title, items, itype, limit):
        visible = items[:limit]
        sections.append({
            "key": key, "title": title, "count": len(items),
            "truncated": len(items) > len(visible),
            "items": [_serialize_report_item(i, itype) for i in visible],
        })

    focus_payload = None
    if template == "focus":
        if not focus_type or not focus_id:
            raise HTTPException(status_code=400, detail="A fokusz riporthoz tipus es azonosito szukseges")
        model_map = {"exercise": ExerciseModel, "training": TrainingModel, "event": EventModel, "duty": DutyModel}
        item = db.scalar(select(model_map[focus_type]).where(model_map[focus_type].id == focus_id))
        if not item:
            raise HTTPException(status_code=404, detail="A kivalasztott rekord nem talalhato")
        focus_payload = _serialize_focus(item, focus_type, focus_id)
    else:
        if template in {"overview", "operations"}:
            add_section("exercises", "Gyakorlatok", exercises, "exercise", 300)
            add_section("trainings", "Kikepzesek", trainings, "training", 300)
        if template == "overview":
            add_section("events", "Esemenyek", events, "event", 300)
            add_section("duties", "Szolgalatok", duties, "duty", 400)
        elif template == "duties":
            add_section("duties", "Szolgalatok", duties, "duty", 400)
        elif template == "events":
            add_section("events", "Esemenyek", events, "event", 300)

    return {
        "template": template, "title": _report_title(template),
        "interval": {"dateFrom": start_date.isoformat(), "dateTo": end_date.isoformat()},
        "focusType": focus_type, "focusId": focus_id,
        "summary": {"exercises": len(exercises), "trainings": len(trainings), "events": len(events), "duties": len(duties)},
        "sections": sections, "focus": focus_payload,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/operations/preview")
def operations_report_preview(
    date_from: str | None = None, date_to: str | None = None, template: str = "overview",
    focus_type: str | None = None, focus_id: str | None = None,
    db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user),
):
    return _build_report_data(db, date_from, date_to, template, focus_type, focus_id)


@router.get("/operations.xlsx")
def operations_excel_report(
    date_from: str | None = None, date_to: str | None = None, template: str = "overview",
    focus_type: str | None = None, focus_id: str | None = None,
    db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user),
):
    try:
        from io import BytesIO
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Excel modul hiba: {exc}") from exc

    data = _build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Riport"
    dark = PatternFill(fill_type="solid", start_color="1E293B", end_color="1E293B")
    white_bold = Font(color="FFFFFF", bold=True)
    ws["A1"] = data["title"]; ws["A1"].font = Font(size=14, bold=True)
    ws["A2"] = f"Intervallum: {data['interval']['dateFrom']} - {data['interval']['dateTo']}"
    ws["A4"] = "Gyakorlatok"; ws["B4"] = data["summary"]["exercises"]
    ws["A5"] = "Kikepzesek"; ws["B5"] = data["summary"]["trainings"]
    ws["A6"] = "Esemenyek"; ws["B6"] = data["summary"]["events"]
    ws["A7"] = "Szolgalatok"; ws["B7"] = data["summary"]["duties"]
    row = 9
    if data["focus"]:
        focus = data["focus"]
        ws.cell(row=row, column=1, value="Fokusz riport").font = Font(bold=True); row += 1
        ws.cell(row=row, column=1, value=focus["headline"]); row += 2
        for col in (1, 2):
            ws.cell(row=row, column=col).fill = dark
            ws.cell(row=row, column=col).font = white_bold
        ws.cell(row=row, column=1, value="Reszlet"); ws.cell(row=row, column=2, value="Ertek"); row += 1
        for det in focus["details"]:
            ws.cell(row=row, column=1, value=det["label"])
            ws.cell(row=row, column=2, value=det["value"]); row += 1
        if focus["description"]:
            row += 1; ws.cell(row=row, column=1, value="Leiras").font = Font(bold=True); row += 1
            ws.cell(row=row, column=1, value=focus["description"]).alignment = Alignment(wrap_text=True); row += 2
        if focus["participants"]:
            ws.cell(row=row, column=1, value="Resztvevok").font = Font(bold=True); row += 1
            for col in (1, 2):
                ws.cell(row=row, column=col).fill = dark
                ws.cell(row=row, column=col).font = white_bold
            ws.cell(row=row, column=1, value="Nev"); ws.cell(row=row, column=2, value="Reszleg"); row += 1
            for part in focus["participants"]:
                ws.cell(row=row, column=1, value=part["personName"])
                ws.cell(row=row, column=2, value=part["detail"]); row += 1
    else:
        for section in data["sections"]:
            ws.cell(row=row, column=1, value=f"{section['title']} ({section['count']} db)").font = Font(bold=True); row += 1
            is_duty = section["key"] == "duties"
            headers = ["Kezdes", "Vege", "Tipus", "Szemely", "Helyszin", "Statusz"] if is_duty else ["Kezdes", "Vege", "Megnevezes", "Helyszin", "Statusz"]
            for col, h in enumerate(headers, 1):
                ws.cell(row=row, column=col, value=h).fill = dark
                ws.cell(row=row, column=col).font = white_bold
            row += 1
            for item in section["items"]:
                vals = [item.get("startDate",""), item.get("endDate",""), item.get("type",""), item.get("personName",""), item.get("location",""), item.get("status","")] if is_duty else [item.get("startDate",""), item.get("endDate",""), item.get("name",""), item.get("location",""), item.get("status","")]
                for col, v in enumerate(vals, 1):
                    ws.cell(row=row, column=col, value=v)
                row += 1
            if section.get("truncated"):
                ws.cell(row=row, column=1, value=f"Csak az elso {len(section['items'])} sor lathato"); row += 1
            row += 1
    for col, w in zip("ABCDEF", [18, 16, 34, 30, 24, 16]):
        ws.column_dimensions[col].width = w
    buf = BytesIO(); wb.save(buf); payload = buf.getvalue(); buf.close()
    filename = f"{_report_filename_base(template, focus_type)}.xlsx"
    return Response(content=payload, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/operations.docx")
def operations_word_report(
    date_from: str | None = None, date_to: str | None = None, template: str = "overview",
    focus_type: str | None = None, focus_id: str | None = None,
    db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user),
):
    try:
        from io import BytesIO
        from docx import Document
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Word modul hiba: {exc}") from exc

    data = _build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    doc = Document()
    doc.add_heading(data["title"], level=1)
    doc.add_paragraph(f"Intervallum: {data['interval']['dateFrom']} - {data['interval']['dateTo']}")
    s = data["summary"]
    doc.add_paragraph(f"Osszesites: Gyakorlatok {s['exercises']}, Kikepzesek {s['trainings']}, Esemenyek {s['events']}, Szolgalatok {s['duties']}")
    if data["focus"]:
        focus = data["focus"]
        doc.add_heading("Fokusz riport", level=2); doc.add_paragraph(focus["headline"])
        tbl = doc.add_table(rows=1, cols=2); tbl.style = "Table Grid"
        tbl.rows[0].cells[0].text = "Reszlet"; tbl.rows[0].cells[1].text = "Ertek"
        for det in focus["details"]:
            r = tbl.add_row().cells; r[0].text = str(det["label"]); r[1].text = str(det["value"])
        if focus["description"]:
            doc.add_heading("Leiras", level=3); doc.add_paragraph(focus["description"])
        if focus["participants"]:
            doc.add_heading("Resztvevok", level=3)
            pt = doc.add_table(rows=1, cols=2); pt.style = "Table Grid"
            pt.rows[0].cells[0].text = "Nev"; pt.rows[0].cells[1].text = "Reszleg"
            for part in focus["participants"]:
                r = pt.add_row().cells; r[0].text = str(part["personName"]); r[1].text = str(part["detail"])
    else:
        for section in data["sections"]:
            doc.add_heading(f"{section['title']} ({section['count']} db)", level=2)
            is_duty = section["key"] == "duties"
            cols = 6 if is_duty else 5
            tbl = doc.add_table(rows=1, cols=cols); tbl.style = "Table Grid"
            hdr = ["Kezdes", "Vege", "Tipus", "Szemely", "Helyszin", "Statusz"] if is_duty else ["Kezdes", "Vege", "Megnevezes", "Helyszin", "Statusz"]
            for idx, h in enumerate(hdr):
                tbl.rows[0].cells[idx].text = h
            for item in section["items"]:
                r = tbl.add_row().cells
                r[0].text = str(item.get("startDate","")); r[1].text = str(item.get("endDate",""))
                if is_duty:
                    r[2].text = str(item.get("type","")); r[3].text = str(item.get("personName",""))
                    r[4].text = str(item.get("location","")); r[5].text = str(item.get("status",""))
                else:
                    r[2].text = str(item.get("name","")); r[3].text = str(item.get("location",""))
                    r[4].text = str(item.get("status",""))
            if section.get("truncated"):
                doc.add_paragraph(f"Csak az elso {len(section['items'])} sor lathato")
    buf = BytesIO(); doc.save(buf); payload = buf.getvalue(); buf.close()
    filename = f"{_report_filename_base(template, focus_type)}.docx"
    return Response(content=payload, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/operations.pdf")
def operations_pdf_report(
    date_from: str | None = None, date_to: str | None = None, template: str = "overview",
    focus_type: str | None = None, focus_id: str | None = None,
    db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user),
):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether,
        )
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF modul hiba: {exc}") from exc

    try:
        pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/Arialbd.ttf"))
        pdfmetrics.registerFont(TTFont("Arial-Italic", "C:/Windows/Fonts/Ariali.ttf"))
        pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic")
        body_font = "Arial"; bold_font = "Arial-Bold"
    except Exception:
        body_font = "Helvetica"; bold_font = "Helvetica-Bold"

    C_DARK   = colors.HexColor("#1e293b")
    C_MED    = colors.HexColor("#334155")
    C_LIGHT  = colors.HexColor("#f1f5f9")
    C_ACCENT = colors.HexColor("#3b82f6")
    C_WHITE  = colors.white
    C_BORDER = colors.HexColor("#cbd5e1")

    def ps(name, font=body_font, size=9, leading=12, color=C_DARK, bold=False, **kw):
        return ParagraphStyle(name, fontName=bold_font if bold else font,
                              fontSize=size, leading=leading, textColor=color, **kw)

    sTitle   = ps("title",  size=18, leading=22, bold=True,  color=C_WHITE)
    sSub     = ps("sub",    size=10, leading=14, color=colors.HexColor("#94a3b8"))
    sSection = ps("sec",    size=11, leading=14, bold=True,  color=C_WHITE)
    sLabel   = ps("label",  size=8,  leading=11, bold=True,  color=C_MED)
    sValue   = ps("value",  size=9,  leading=12, color=C_DARK)
    sCell    = ps("cell",   size=8,  leading=11, color=C_DARK)
    sCellB   = ps("cellb",  size=8,  leading=11, bold=True,  color=C_DARK)
    sEmpty   = ps("empty",  size=8,  leading=11, color=colors.HexColor("#94a3b8"))
    sDesc    = ps("desc",   size=8,  leading=12, color=C_DARK)

    from io import BytesIO
    buffer = BytesIO()
    report_data = _build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    interval = report_data["interval"]
    summary = report_data["summary"]

    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=2*cm,
                            title="Guard Guard Duty - Riport")
    W_pt = A4[0] - 3*cm
    story = []

    subtitle = f"Intervallum: {interval['dateFrom']}  -  {interval['dateTo']}"
    if template == "focus":
        subtitle += f"   |   Fokusz: {focus_type or '-'}"
    hdr_tbl = Table([[Paragraph(report_data["title"], sTitle)], [Paragraph(subtitle, sSub)]], colWidths=[W_pt])
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_DARK),
        ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 14), ("RIGHTPADDING", (0,0), (-1,-1), 14),
    ]))
    story.append(hdr_tbl); story.append(Spacer(1, 0.4*cm))

    card_labels = [("Gyakorlatok", str(summary["exercises"])), ("Kikepzesek", str(summary["trainings"])),
                   ("Esemenyek", str(summary["events"])), ("Szolgalatok", str(summary["duties"]))]
    card_w = W_pt / 4 - 0.1*cm
    card_data = [[
        Table([[Paragraph(v, ps(f"cv{i}", size=20, leading=24, bold=True, color=C_ACCENT))],
               [Paragraph(l, ps(f"cl{i}", size=8, leading=10, color=colors.HexColor("#64748b")))]],
              colWidths=[card_w])
        for i, (l, v) in enumerate(card_labels)
    ]]
    card_styles = []
    for col in range(4):
        card_styles += [
            ("BACKGROUND", (col,0), (col,0), C_LIGHT), ("BOX", (col,0), (col,0), 0.5, C_BORDER),
            ("TOPPADDING", (col,0), (col,0), 8), ("BOTTOMPADDING", (col,0), (col,0), 8),
            ("LEFTPADDING", (col,0), (col,0), 10), ("RIGHTPADDING", (col,0), (col,0), 10),
        ]
    cards_tbl = Table(card_data, colWidths=[card_w + 0.1*cm]*4)
    cards_tbl.setStyle(TableStyle(card_styles))
    story.append(cards_tbl); story.append(Spacer(1, 0.5*cm))

    def sec_hdr(title, count=None):
        label = title if count is None else f"{title}  ({count} db)"
        t = Table([[Paragraph(label, sSection)]], colWidths=[W_pt])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), C_MED),
            ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ]))
        return t

    def data_tbl(headers, rows, widths):
        body = [[Paragraph(h, sCellB) for h in headers]] + [[Paragraph(str(c), sCell) for c in row] for row in rows]
        t = Table(body, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), C_DARK), ("TEXTCOLOR", (0,0), (-1,0), C_WHITE),
            ("FONTNAME", (0,0), (-1,0), bold_font), ("FONTSIZE", (0,0), (-1,0), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [C_WHITE, C_LIGHT]),
            ("GRID", (0,0), (-1,-1), 0.3, C_BORDER),
            ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ]))
        return t

    if template == "focus":
        focus = report_data["focus"]
        story.append(KeepTogether([sec_hdr(focus["headline"]), Spacer(1, 0.2*cm)]))
        for det in focus["details"]:
            story.append(Table([[Paragraph(det["label"], sLabel), Paragraph(det["value"], sValue)]], colWidths=[3.5*cm, W_pt-3.5*cm]))
            story.append(Spacer(1, 0.15*cm))
        if focus["description"]:
            story.append(Spacer(1, 0.3*cm)); story.append(sec_hdr("Leiras")); story.append(Spacer(1, 0.2*cm))
            for line in focus["description"].splitlines():
                story.append(Paragraph(line or " ", sDesc))
        if focus["participants"]:
            story.append(Spacer(1, 0.4*cm)); story.append(sec_hdr("Resztvevok", len(focus["participants"]))); story.append(Spacer(1, 0.2*cm))
            rows = [[e["personName"], e["detail"]] for e in focus["participants"]]
            story.append(data_tbl(["Nev", "Reszleg / szerep"], rows, [W_pt*0.55, W_pt*0.45]))
    else:
        col_cfg = {
            "duty":     (["Kezdes","Vege","Tipus","Szemely","Helyszin","Statusz"], [2.2*cm,2.2*cm,2.8*cm,4.5*cm,3.5*cm,2.5*cm]),
            "exercise": (["Kezdes","Vege","Megnevezes","Helyszin","Statusz"], [2.2*cm,2.2*cm,5.5*cm,4.0*cm,3.5*cm]),
            "training": (["Kezdes","Vege","Megnevezes","Helyszin","Statusz"], [2.2*cm,2.2*cm,5.5*cm,4.0*cm,3.5*cm]),
            "event":    (["Kezdes","Vege","Megnevezes","Helyszin","Statusz"], [2.2*cm,2.2*cm,5.5*cm,4.0*cm,3.5*cm]),
        }
        type_map = {"duties":"duty","exercises":"exercise","trainings":"training","events":"event"}
        for sec in report_data["sections"]:
            itype = type_map.get(sec["key"], "exercise")
            headers, widths = col_cfg.get(itype, col_cfg["exercise"])
            story.append(Spacer(1, 0.3*cm)); story.append(sec_hdr(sec["title"], sec["count"])); story.append(Spacer(1, 0.2*cm))
            if not sec["items"]:
                story.append(Paragraph("Nincs talalat a megadott feltetelekre.", sEmpty)); story.append(Spacer(1, 0.2*cm)); continue
            def _row(item, t):
                if t == "duty":
                    return [item.get("startDate",""), item.get("endDate",""), item.get("type",""), item.get("personName",""), item.get("location",""), item.get("status","")]
                return [item.get("startDate",""), item.get("endDate",""), item.get("name",""), item.get("location",""), item.get("status","")]
            story.append(data_tbl(headers, [_row(i, itype) for i in sec["items"]], widths))
            if sec.get("truncated"):
                story.append(Paragraph(f"(Csak az elso {len(sec['items'])} sor lathato)", sEmpty))
            story.append(Spacer(1, 0.1*cm))

    def add_page_number(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont(body_font, 7)
        canvas_obj.setFillColor(colors.HexColor("#94a3b8"))
        num = f"{canvas_obj.getPageNumber()}. oldal  |  Guard Guard Duty - {report_data['title']}"
        canvas_obj.drawRightString(A4[0] - 1.5*cm, 1.2*cm, num)
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    data = buffer.getvalue(); buffer.close()
    filename_map = {
        "overview": "osszesitett-muveleti-riport.pdf", "operations": "muveleti-naptar-riport.pdf",
        "duties": "szolgalati-kivonat.pdf", "events": "esemenynaptar-riport.pdf",
        "focus": f"fokusz-riport-{focus_type or 'elem'}.pdf",
    }
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename_map.get(template, 'riport.pdf')}"})
