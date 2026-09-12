import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import Modal from "@/components/Modal";
import { events, exercises, getErrorMessage } from "@/lib/store";
import { AvailabilityPanel } from "@/pages/Availability";
import { CalendarSearch } from "lucide-react";
import type { AppEvent, Exercise } from "@/lib/types";
import { isDutyType } from "@/lib/dutyTypes";
import { PALETTE, buildColorMap, isoDate, monthWeeks, toIso, weekBars, type CalendarItem } from "@/lib/calendarLayout";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const weekdayLabels = ["H", "K", "Sz", "Cs", "P", "Sz", "V"];

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("hu-HU");
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [exercisesData, setExercisesData] = useState<Exercise[]>([]);
  const [eventsData, setEventsData] = useState<AppEvent[]>([]);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const year = monthCursor.getFullYear();
  const monthIndex = monthCursor.getMonth();
  const todayIso = toIso(new Date());

  const refresh = useCallback(async () => {
    try {
      const [nextExercises, nextEvents] = await Promise.all([
        exercises.getAll(),
        events.getAll(),
      ]);
      setExercisesData(nextExercises);
      setEventsData(nextEvents);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  const allItems = useMemo<CalendarItem[]>(() => {
    // A szolgálat is művelet: a típusa mondja meg; a naptárban a típus adja a színt.
    const exerciseItems: CalendarItem[] = exercisesData
      .filter((item) => item.status !== "Lemondva")
      .map((item) => {
        const duty = isDutyType(item.type);
        const names = item.assigned.map((a) => a.personName).filter(Boolean);
        return {
          id: item.id,
          source: duty ? "duty" : "exercise",
          name: item.name,
          kind: item.type || "Gyakorlat",
          dutyType: duty ? item.type : "",
          startDate: item.startDate,
          endDate: item.endDate,
          location: item.location || "Nincs helyszín",
          status: item.status,
          peopleSummary: duty && names.length > 0 ? names.join(", ") : `${item.assigned.length}/${item.maxPersonnel} fő`,
          peopleCount: item.assigned.length,
        };
      });

    const eventItems: CalendarItem[] = eventsData
      .filter((item) => !["Lemondva", "Törölve"].includes(item.status as string))
      .map((item) => ({
        id: item.id,
        source: "event",
        name: item.name,
        kind: item.type || "Esemény",
        dutyType: "",
        startDate: item.startDate,
        endDate: item.endDate,
        location: item.location || "Nincs helyszín",
        status: item.status,
        peopleSummary: `${item.assigned.length}/${item.maxPersonnel} fő`,
        peopleCount: item.assigned.length,
      }));

    return [...exerciseItems, ...eventItems].sort((a, b) => {
      return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, "hu");
    });
  }, [eventsData, exercisesData]);

  const weeks = useMemo(() => monthWeeks(year, monthIndex), [monthIndex, year]);
  const monthStart = weeks[0][0];
  const monthEnd = weeks[5][6];

  const monthItems = useMemo(
    () => allItems.filter((it) => isoDate(it.startDate) <= monthEnd && isoDate(it.endDate) >= monthStart),
    [allItems, monthStart, monthEnd],
  );
  const colorOf = useMemo(() => buildColorMap([...new Set(monthItems.map((it) => it.kind))].sort((a, b) => a.localeCompare(b, "hu"))), [monthItems]);
  const legend = useMemo(() => [...colorOf.entries()], [colorOf]);
  const rows = useMemo(() => weeks.map((week) => ({ week, bars: weekBars(week, monthItems) })), [weeks, monthItems]);

  const openSelectedItem = useCallback(() => {
    if (!selectedItem) return;
    if (selectedItem.source === "event") {
      navigate("/events", { state: { openEventId: selectedItem.id } });
    } else {
      navigate("/operations?source=exercise", {
        state: { openOperationId: selectedItem.id, openOperationSource: "exercise" },
      });
    }
    setSelectedItem(null);
  }, [navigate, selectedItem]);

  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return (
    // A naptár a képernyőhöz igazodik: az oldal nem görget, a hetek belül görgetnek.
    <div className="flex flex-col h-[calc(100vh-6rem)] min-h-[520px]">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Közös naptár</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthCursor(new Date(year, monthIndex - 1, 1))} className="btn-mil-secondary text-xs">◀</button>
          <p className="font-rajdhani font-bold text-sm uppercase tracking-military min-w-[190px] text-center">
            {monthCursor.toLocaleDateString("hu-HU", { year: "numeric", month: "long" })}
          </p>
          <button onClick={() => setMonthCursor(new Date(year, monthIndex + 1, 1))} className="btn-mil-secondary text-xs">▶</button>
          <button onClick={() => setMonthCursor(new Date())} className="btn-mil-secondary text-xs">Ma</button>
        </div>
        {/* A foglaltság-kereső külön ablakban él: nem vonja el a figyelmet a naptártól. */}
        <button onClick={() => setAvailabilityOpen(true)} className="btn-mil-secondary text-xs flex items-center gap-2" title="Szabad-e a helyszín egy adott időszakban?">
          <CalendarSearch className="w-4 h-4" />
          Foglaltság-kereső
        </button>
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {legend.map(([kind, cls]) => (
            <span key={kind} className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-military font-mono text-white ${cls}`} style={{ borderRadius: "2px" }}>
              {kind}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 border border-border bg-border gap-px" style={{ borderRadius: "2px" }}>
        <div className="grid grid-cols-7 gap-px shrink-0">
          {weekdayLabels.map((label, i) => (
            <div key={`${label}-${i}`} className="bg-background px-2 py-1.5 text-center text-xs uppercase tracking-military text-muted-foreground">{label}</div>
          ))}
        </div>

        {rows.map(({ week, bars }) => (
          <div key={week[0]} className="relative flex-1 min-h-0 grid grid-cols-7 gap-px">
            {/* Napok háttere és számai */}
            {week.map((dateStr) => {
              const inMonth = dateStr.startsWith(monthPrefix);
              const isToday = dateStr === todayIso;
              return (
                <div key={dateStr} className={`bg-card p-1.5 min-h-0 ${inMonth ? "" : "opacity-40"} ${isToday ? "ring-2 ring-inset ring-primary/80 bg-primary/5" : ""}`}>
                  <p className={`text-xs font-mono ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{Number(dateStr.slice(8, 10))}</p>
                </div>
              );
            })}
            {/* Sávok: egy elem egy folytonos csík a hét oszlopain át */}
            <div className="absolute inset-x-0 top-6 bottom-0 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-7 gap-px auto-rows-[22px] gap-y-0.5">
                {bars.map((bar) => {
                  const it = bar.item;
                  const line = it.source === "duty" ? `${it.dutyType}: ${it.peopleSummary}` : it.name;
                  return (
                    <button
                      key={`${it.source}-${it.id}`}
                      onClick={() => setSelectedItem(it)}
                      className={`text-left text-[11px] px-1.5 leading-[22px] truncate text-white transition-all hover:brightness-110 ${colorOf.get(it.kind) ?? PALETTE[0]}`}
                      style={{
                        gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                        gridRow: bar.lane + 1,
                        marginLeft: bar.continuesLeft ? 0 : 4,
                        marginRight: bar.continuesRight ? 0 : 4,
                        borderTopLeftRadius: bar.continuesLeft ? 0 : 2,
                        borderBottomLeftRadius: bar.continuesLeft ? 0 : 2,
                        borderTopRightRadius: bar.continuesRight ? 0 : 2,
                        borderBottomRightRadius: bar.continuesRight ? 0 : 2,
                      }}
                      title={`${line} · ${formatDate(it.startDate)} → ${formatDate(it.endDate)}`}
                      aria-label={line}
                    >
                      {bar.continuesLeft && <span className="opacity-70 mr-1">…</span>}
                      {it.source === "duty" ? <><span className="font-semibold">{it.dutyType}</span> · {it.peopleSummary}</> : it.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} title="Foglaltság-kereső — szabad-e a helyszín?" wide>
        <AvailabilityPanel embedded />
      </Modal>

      <Modal open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem ? `${selectedItem.kind} részletei` : "Részletek"}>
        {selectedItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span>
                <p className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 text-white ${colorOf.get(selectedItem.kind) ?? PALETTE[0]}`} style={{ borderRadius: "2px" }}>
                  {selectedItem.kind}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Név</span>
                <p className="mt-1">{selectedItem.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Kezdet / Vég</span>
                <p className="font-mono text-primary text-sm mt-1">{formatDate(selectedItem.startDate)} → {formatDate(selectedItem.endDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span>
                <p className="mt-1">{selectedItem.location}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span>
                <p className="mt-1">{selectedItem.status}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Résztvevők</span>
                <p className="mt-1">{selectedItem.peopleSummary}{selectedItem.source === "duty" ? "" : ` (${selectedItem.peopleCount} fő)`}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={openSelectedItem} className="btn-mil-primary text-xs">Megtekint</button>
              <button onClick={() => setSelectedItem(null)} className="btn-mil-secondary text-xs">Bezárás</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
