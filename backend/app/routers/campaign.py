"""Kampányterv: gyakorlatra jelentkezők → jogosultság → behívandók listája.

A mai folyamat (1. betekintés): a jelentkezők Messengeren gyűlnek, az ügyintéző
kikeresi az SZTSZ-üket a KGIR-exportból, külön Excelekből ellenőrzi az
előfeltételeket, majd kampánytervet készít. Itt:

1. a beillesztett névsort (SZTSZ vagy név soronként) a rendszer feloldja a
   nyilvántartásból és „Jelentkezett" résztvevőként rögzíti;
2. a terv minden résztvevőhöz megmondja, jogosult-e (H1 követelmények) és mi
   hiányzik;
3. a terv Excel/PDF-ként exportálható — ez megy tovább behívóparancs-alapnak.
"""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from ..campaign_export import build_pdf, build_xlsx
from ..core.dependencies import DB, Editor, Reader
from ..models import ExerciseModel, ParticipantModel, PersonModel, TrainingModel, new_id
from ..participants import get_participants
from ..schemas import (
    ApplicantAmbiguous,
    ApplicantMatch,
    ApplicantPasteRequest,
    ApplicantPasteResult,
    CampaignPlan,
    CampaignRow,
)
from ..shortrank import short_rank
from .prerequisites import RequirementCheck

router = APIRouter(prefix="/api/campaign", tags=["campaign"])

_APPLICANT_STATUS = "Jelentkezett"
_DISCHARGED_STATUS = "Leszerelt"
_EVENT_MODELS = {"exercise": ExerciseModel, "training": TrainingModel}
_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_SZTSZ_PATTERN = re.compile(r"\b(\d{8}|[A-Za-z]{2}\d{6})\b")


def _load_event(db, event_type: str, event_id: str):
    model = _EVENT_MODELS.get(event_type)
    if model is None:
        raise HTTPException(status_code=400, detail="Kampányterv csak gyakorlathoz vagy kiképzéshez készíthető")
    item = db.get(model, event_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Az esemény nem található")
    return item


def _fold(value: str) -> str:
    """Ékezet- és kisbetű-érzéketlen kulcs a névösszevetéshez."""
    stripped = "".join(ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", stripped).strip().lower()


def _match(person: PersonModel, line: str) -> ApplicantMatch:
    return ApplicantMatch(line=line, personnelId=person.id, name=person.name, sztsz=person.sztsz)


def _resolve_line(line: str, by_sztsz: dict[str, PersonModel], by_name: dict[str, list[PersonModel]]) -> list[PersonModel]:
    """Egy beillesztett sor → jelöltek. SZTSZ-találat egyértelmű; név lehet többes."""
    found = _SZTSZ_PATTERN.search(line)
    if found:
        person = by_sztsz.get(found.group(1).upper())
        return [person] if person else []
    for part in re.split(r"[;,\t]", line):
        candidates = by_name.get(_fold(part))
        if candidates:
            return candidates
    return []


@router.post("/{event_type}/{event_id}/applicants", response_model=ApplicantPasteResult)
def paste_applicants(event_type: str, event_id: str, payload: ApplicantPasteRequest, db: DB, _: Editor):
    """Beillesztett jelentkező-lista rögzítése „Jelentkezett" résztvevőként.
    Soronként egy személy; az SZTSZ az elsődleges kulcs, a név a tartalék."""
    _load_event(db, event_type, event_id)
    lines = [ln.strip() for ln in payload.text.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Üres lista")

    persons = db.scalars(select(PersonModel).where(PersonModel.status != _DISCHARGED_STATUS)).all()
    by_sztsz = {p.sztsz.upper(): p for p in persons}
    by_name: dict[str, list[PersonModel]] = {}
    for p in persons:
        by_name.setdefault(_fold(p.name), []).append(p)
    present = {p.personnel_id for p in get_participants(db, event_type, event_id)}

    result = ApplicantPasteResult()
    for line in lines:
        candidates = _resolve_line(line, by_sztsz, by_name)
        if not candidates:
            result.unmatched.append(line)
            continue
        if len(candidates) > 1:
            result.ambiguous.append(ApplicantAmbiguous(line=line, candidates=[_match(c, line) for c in candidates]))
            continue
        person = candidates[0]
        if person.id in present:
            result.alreadyPresent.append(_match(person, line))
            continue
        db.add(ParticipantModel(
            id=new_id(), event_type=event_type, event_id=event_id,
            personnel_id=person.id, person_name=person.name,
            rank=person.rank, rank_short=short_rank(person.rank), sztsz=person.sztsz,
            role="résztvevő", status=_APPLICANT_STATUS,
        ))
        present.add(person.id)
        result.added.append(_match(person, line))
    db.commit()
    return result


def _build_plan(db, event_type: str, event_id: str) -> CampaignPlan:
    event = _load_event(db, event_type, event_id)
    check = RequirementCheck(db, event_type, event_id)
    participants = get_participants(db, event_type, event_id)
    persons = {
        p.id: p for p in db.scalars(
            select(PersonModel).where(PersonModel.id.in_([x.personnel_id for x in participants]))
        ).all()
    } if participants else {}

    rows = []
    for part in participants:
        person = persons.get(part.personnel_id)
        missing = check.missing(part.personnel_id)
        rows.append(CampaignRow(
            participantId=part.id, personnelId=part.personnel_id,
            name=part.person_name, rank=part.rank,
            unit=person.unit if person else "", sztsz=part.sztsz or (person.sztsz if person else ""),
            personStatus=person.status if person else "", status=part.status, role=part.role,
            eligible=not missing, missing=missing,
        ))
    # Jogosultak elöl, azon belül név szerint — a behívandók így egy blokkban vannak.
    rows.sort(key=lambda r: (not r.eligible, r.name.lower()))
    return CampaignPlan(
        eventType=event_type, eventId=event_id, eventName=event.name,
        startDate=event.start_date, endDate=event.end_date, location=event.location or "",
        requirements=check.requirement_names, rows=rows,
    )


@router.get("/{event_type}/{event_id}/plan", response_model=CampaignPlan)
def campaign_plan(event_type: str, event_id: str, db: DB, _: Reader):
    return _build_plan(db, event_type, event_id)


@router.get("/{event_type}/{event_id}/plan/export.xlsx")
def export_plan_xlsx(event_type: str, event_id: str, db: DB, _: Reader):
    plan = _build_plan(db, event_type, event_id)
    return Response(
        content=build_xlsx(plan), media_type=_XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename=kampanyterv-{plan.startDate}.xlsx"},
    )


@router.get("/{event_type}/{event_id}/plan/export.pdf")
def export_plan_pdf(event_type: str, event_id: str, db: DB, _: Reader):
    plan = _build_plan(db, event_type, event_id)
    return Response(
        content=build_pdf(plan), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=kampanyterv-{plan.startDate}.pdf"},
    )
