"""Import-próbaüzem („dry run") PDF: a KGIR-import elfogadása ELŐTT a teljes
változás-lista papíron — „12 új, 3 leszerelt, 5 alegység-váltás", soronként
mező szerint (régi → új). Az ügyintéző aláírja, mit engedett be; ez a nyoma
annak, hogy a nyilvántartás miért változott."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO

from .schemas import ImportPreviewResult

_FIELD_LABELS = {
    "name": "Név", "rank": "Rendfokozat", "unit": "Alegység", "beosztas": "Beosztás", "status": "Státusz",
    "serviceType": "Jogviszony", "email": "E-mail", "phone": "Telefon", "birthDate": "Születési dátum",
    "address": "Lakcím", "joinDate": "Jogviszony kezdete",
}
_ACTION_LABELS = {"create": "ÚJ", "update": "MÓDOSUL", "skip": "KIHAGYVA"}


def build_dry_run_pdf(preview: ImportPreviewResult, *, filename: str, user_name: str, scope_label: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    try:
        pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/Arialbd.ttf"))
        body_font, bold_font = "Arial", "Arial-Bold"
    except Exception:
        body_font, bold_font = "Helvetica", "Helvetica-Bold"

    C_DARK = colors.HexColor("#1e293b")
    C_WHITE = colors.white
    C_BORDER = colors.HexColor("#cbd5e1")
    C_LIGHT = colors.HexColor("#f1f5f9")
    C_MUTED = colors.HexColor("#94a3b8")
    C_NEW = colors.HexColor("#dcfce7")
    C_CHANGE = colors.HexColor("#fef3c7")
    C_DISCHARGE = colors.HexColor("#fee2e2")

    def ps(name: str, size: int = 8, leading: int = 10, color=C_DARK, bold: bool = False) -> ParagraphStyle:
        return ParagraphStyle(name, fontName=bold_font if bold else body_font, fontSize=size, leading=leading, textColor=color)

    page = landscape(A4)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=2 * cm,
                            title="Import-próbaüzem — változáslista")
    width = page[0] - 3 * cm
    story = []
    diff = preview.diff
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    header = Table(
        [[Paragraph("Import-próbaüzem — változáslista (elfogadás előtt)", ps("t", size=16, leading=20, color=C_WHITE, bold=True))],
         [Paragraph(f"Fájl: {filename}   ·   Készítette: {user_name}   ·   {stamp}   ·   Hatókör: {scope_label}", ps("s", size=9, leading=12, color=C_MUTED))],
         [Paragraph(f"Összes sor: {preview.totalRows}   ·   Új: {diff.new}   ·   Változik: {diff.changed}   ·   Leszerelt: {diff.discharged}   ·   "
                    f"Alegység-váltás: {diff.unitChanges}   ·   Változatlan: {diff.unchanged}   ·   Kihagyva/hibás: {preview.skipped}"
                    + (f"   ·   Nem az én hatóköröm: {diff.outOfScope}" if diff.outOfScope else ""), ps("c", size=9, leading=12, color=C_WHITE))]],
        colWidths=[width],
    )
    header.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C_DARK), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                                ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    story.append(header)
    story.append(Spacer(1, 10))

    rows = [[Paragraph(h, ps("th", color=C_WHITE, bold=True)) for h in ("Sor", "Művelet", "Név", "SZTSZ", "Alegység", "Változás (régi → új) / megjegyzés")]]
    tones: list[tuple[int, object]] = []
    for item in preview.items:
        if item.action == "update" and not item.changes and not item.issues:
            continue   # változatlan sor nem kerül a papírra
        changes = "; ".join(f"{_FIELD_LABELS.get(f, f)}: {old or '—'} → {new}" for f, (old, new) in item.changes.items())
        note = changes or ("; ".join(item.issues) if item.issues else ("új rekord" if item.action == "create" else ""))
        rows.append([Paragraph(str(item.line), ps("c")), Paragraph(_ACTION_LABELS.get(item.action, item.action), ps("c", bold=True)),
                     Paragraph(item.name or "—", ps("c")), Paragraph(item.key or "—", ps("c")),
                     Paragraph(str(item.data.get("unit") or "—"), ps("c")), Paragraph(note, ps("c"))])
        if item.action == "create":
            tones.append((len(rows) - 1, C_NEW))
        elif item.changes.get("status", ["", ""])[1] == "Leszerelt":
            tones.append((len(rows) - 1, C_DISCHARGE))
        elif item.changes:
            tones.append((len(rows) - 1, C_CHANGE))
    if len(rows) == 1:
        rows.append([Paragraph("Nincs változás — az import nem módosítana semmit.", ps("c"))] + [Paragraph("", ps("c"))] * 5)
    table = Table(rows, colWidths=[width * f for f in (0.05, 0.09, 0.18, 0.10, 0.10, 0.48)], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), C_DARK), ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_LIGHT]),
             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
             ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
    for idx, color in tones:
        style.append(("BACKGROUND", (0, idx), (-1, idx), color))
    table.setStyle(TableStyle(style))
    story.append(table)

    if preview.missingCount:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"A nyilvántartásban van, de a fájlban nincs: {preview.missingCount} fő — "
                               + ", ".join(f"{m.name} ({m.sztsz})" for m in preview.missing[:30]) + ("…" if preview.missingCount > len(preview.missing[:30]) else ""), ps("m", size=8, leading=10)))

    story.append(Spacer(1, 24))
    sign = Table([[Paragraph("Az importot a fenti tartalommal elfogadom.", ps("sg", size=9, leading=12)), Paragraph("", ps("sg")), Paragraph("", ps("sg"))],
                  [Paragraph("Dátum: ____________________", ps("sg", size=9, leading=12)), Paragraph("Ügyintéző: ____________________", ps("sg", size=9, leading=12)),
                   Paragraph("Ellenőrizte: ____________________", ps("sg", size=9, leading=12))]],
                 colWidths=[width / 3] * 3)
    story.append(sign)

    doc.build(story)
    data = buf.getvalue()
    buf.close()
    return data
