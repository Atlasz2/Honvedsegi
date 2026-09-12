import React, { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { events, exercises, getErrorMessage, trainings } from "@/lib/store";
import type { AppEvent, Exercise, Training } from "@/lib/types";
import { isDutyType } from "@/lib/dutyTypes";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type CalendarSource = "duty" | "exercise" | "training" | "event"; // duty = szolgálat-típusú gyakorlat
type SegmentPosition = "single" | "start" | "middle" | "end";

type CalendarItem = {
  id: string;
  source: CalendarSource;
  name: string;
  dutyType: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  peopleSummary: string;
  peopleCount: number;
};

type DayEntry = {
  item: CalendarItem;
  segment: SegmentPosition;
};

const weekdayLabels = ["H", "K", "Sz", "Cs", "P", "Sz", "V"];

const sourceClass: Record<CalendarSource, string> = {
  duty: "badge-reserve",
  exercise: "badge-planned",
  training: "badge-ongoing",
  event: "badge-cancelled",
};

const sourceLabel: Record<CalendarSource, string> = {
  duty: "Szolgálat",
  exercise: "Gyakorlat",
  training: "Kiképzés",
  event: "Esemény",
};

function isoDate(value: string) {
  return value.slice(0, 10);
}

function monthGrid(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  return Array.from({ length: 42 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
}

function segmentForDate(dateStr: string, startDate: string, endDate: string): SegmentPosition {
  const start = isoDate(startDate);
  const end = isoDate(endDate);
  if (start === end) return "single";
  if (dateStr === start) return "start";
  if (dateStr === end) return "end";
  return "middle";
}

function segmentStyle(segment: SegmentPosition): React.CSSProperties {
  const overlap = -4;
  if (segment === "single") return { borderRadius: "2px" };
  if (segment === "start") {
    return {
      borderTopLeftRadius: "2px",
      borderBottomLeftRadius: "2px",
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      marginRight: overlap,
    };
  }
  if (segment === "end") {
    return {
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderTopRightRadius: "2px",
      borderBottomRightRadius: "2px",
      marginLeft: overlap,
    };
  }
  return {
    borderRadius: 0,
    marginLeft: overlap,
    marginRight: overlap,
  };
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("hu-HU");
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [exercisesData, setExercisesData] = useState<Exercise[]>([]);
  const [trainingsData, setTrainingsData] = useState<Training[]>([]);
  const [eventsData, setEventsData] = useState<AppEvent[]>([]);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  const year = monthCursor.getFullYear();
  const monthIndex = monthCursor.getMonth();
  const todayIso = new Date().toISOString().slice(0, 10);

  const refresh = useCallback(async () => {
    try {
      const [nextExercises, nextTrainings, nextEvents] = await Promise.all([
        exercises.getAll(),
        trainings.getAll(),
        events.getAll(),
      ]);
      setExercisesData(nextExercises);
      setTrainingsData(nextTrainings);
      setEventsData(nextEvents);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      setTick((v) => v + 1);
      void refresh();
    }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const allItems = useMemo<CalendarItem[]>(() => {
    // A szolgálat is gyakorlat: a típusa mondja meg, a naptárban külön színt kap.
    const exerciseItems: CalendarItem[] = exercisesData.map((item) => {
      const duty = isDutyType(item.type);
      const names = item.assigned.map((a) => a.personName).filter(Boolean);
      return {
        id: item.id,
        source: duty ? "duty" : "exercise",
        name: item.name,
        dutyType: duty ? item.type : "",
        startDate: item.startDate,
        endDate: item.endDate,
        location: item.location || "Nincs helyszín",
        status: item.status,
        peopleSummary: duty && names.length > 0 ? names.join(", ") : `${item.assigned.length}/${item.maxPersonnel} fő`,
        peopleCount: item.assigned.length,
      };
    });

    const trainingItems: CalendarItem[] = trainingsData.map((item) => ({
      id: item.id,
      source: "training",
      name: item.name,
      dutyType: "",
      startDate: item.startDate,
      endDate: item.endDate,
      location: item.location || "Nincs helyszín",
      status: item.status,
      peopleSummary: `${item.assigned.length}/${item.maxPersonnel} fő`,
      peopleCount: item.assigned.length,
    }));

    const eventItems: CalendarItem[] = eventsData.map((item) => ({
      id: item.id,
      source: "event",
      name: item.name,
      dutyType: "",
      startDate: item.startDate,
      endDate: item.endDate,
      location: item.location || "Nincs helyszín",
      status: item.status,
      peopleSummary: `${item.assigned.length}/${item.maxPersonnel} fő`,
      peopleCount: item.assigned.length,
    }));

    return [...exerciseItems, ...trainingItems, ...eventItems].sort((a, b) => {
      return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, "hu");
    });
  }, [eventsData, exercisesData, trainingsData]);

  const days = useMemo(() => monthGrid(year, monthIndex), [monthIndex, year]);

  const dayEntries = useMemo(() => {
    const map = new Map<number, DayEntry[]>();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const entries = allItems
        .filter((item) => isoDate(item.startDate) <= dateStr && isoDate(item.endDate) >= dateStr)
        .map((item) => ({ item, segment: segmentForDate(dateStr, item.startDate, item.endDate) }))
        .sort((a, b) => a.item.source.localeCompare(b.item.source) || a.item.name.localeCompare(b.item.name, "hu"));

      map.set(day, entries);
    }

    return map;
  }, [allItems, monthIndex, year]);

  const openSelectedItem = useCallback(() => {
    if (!selectedItem) return;

    if (selectedItem.source === "duty" || selectedItem.source === "exercise") {
      navigate("/operations?source=exercise", {
        state: { openOperationId: selectedItem.id, openOperationSource: "exercise" },
      });
    } else if (selectedItem.source === "training") {
      navigate("/operations?source=training", {
        state: { openOperationId: selectedItem.id, openOperationSource: "training" },
      });
    } else {
      navigate("/events", { state: { openEventId: selectedItem.id } });
    }

    setSelectedItem(null);
  }, [navigate, selectedItem]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Közös naptár</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthCursor(new Date(year, monthIndex - 1, 1))} className="btn-mil-secondary text-xs">◀</button>
          <p className="font-rajdhani font-bold text-sm uppercase tracking-military min-w-[190px] text-center">
            {monthCursor.toLocaleDateString("hu-HU", { year: "numeric", month: "long" })}
          </p>
          <button onClick={() => setMonthCursor(new Date(year, monthIndex + 1, 1))} className="btn-mil-secondary text-xs">▶</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["duty", "exercise", "training", "event"] as CalendarSource[]).map((source) => (
          <span
            key={source}
            className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-military font-mono ${sourceClass[source]}`}
            style={{ borderRadius: "2px" }}
          >
            {sourceLabel[source]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border">
        {weekdayLabels.map((label) => (
          <div key={label} className="bg-background px-2 py-2 text-center text-xs uppercase tracking-military text-muted-foreground">{label}</div>
        ))}

        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="bg-card min-h-[132px] opacity-30" />;
          }

          const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayIso;

          return (
            <div
              key={`${index}-${day}`}
              className={`bg-card min-h-[132px] p-1.5 ${isToday ? "ring-2 ring-primary/80 bg-primary/5" : ""}`}
            >
              <p className={`text-xs font-mono mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{day}</p>
              <div className="space-y-1 max-h-[104px] overflow-y-auto pr-0.5">
                {(dayEntries.get(day) || []).map(({ item, segment }) => {
                  const line = item.source === "duty" ? item.peopleSummary : item.name;
                  return (
                    <button
                      key={`${item.source}-${item.id}-${day}`}
                      onClick={() => setSelectedItem(item)}
                      className={`w-full text-left text-[10px] px-1.5 py-1 transition-all hover:brightness-110 ${sourceClass[item.source]}`}
                      style={segmentStyle(segment)}
                      title={line}
                      aria-label={line}
                    >
                      {item.source === "duty" ? (
                        <>
                          <span className="block truncate font-semibold leading-tight">{item.dutyType}</span>
                          <span className="block truncate opacity-90 leading-tight">{item.peopleSummary}</span>
                        </>
                      ) : (
                        <span className="block truncate">{item.name}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString("hu-HU")} ({tick})</p>

      <Modal open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem ? `${sourceLabel[selectedItem.source]} részletei` : "Részletek"}>
        {selectedItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Forrás</span>
                <p className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${sourceClass[selectedItem.source]}`} style={{ borderRadius: "2px" }}>
                  {sourceLabel[selectedItem.source]}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Név / Típus</span>
                <p className="mt-1">{selectedItem.source === "duty" ? `${selectedItem.dutyType} - ${selectedItem.name}` : selectedItem.name}</p>
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
                <span className="text-muted-foreground text-xs uppercase tracking-military">Személy összegzés</span>
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
