/**
 * Közös naptár elrendezés: hetek, folytonos sávok, típus-színek.
 * Tiszta függvények — a naptár oldal csak rajzol.
 */

export type CalendarSource = "duty" | "exercise" | "event"; // duty = szolgálat-típusú művelet

export type CalendarItem = {
  id: string;
  source: CalendarSource;
  name: string;
  /** Melyik zászlóaljé; üres = ezredszintű. */
  unit: string;
  /** Szín-kulcs: a művelet/esemény típusa (Gyakorlat, Őrszolgálat, …). */
  kind: string;
  dutyType: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  peopleSummary: string;
  peopleCount: number;
};

/** Egy hét egy sávja: az elem a hét `startCol`. oszlopától `span` napon át tart. */
export type WeekBar = {
  item: CalendarItem;
  startCol: number;   // 0..6
  span: number;       // 1..7
  lane: number;       // sor a héten belül
  continuesLeft: boolean;
  continuesRight: boolean;
};

// A rendszer tónusához illő, tompított katonai színek (HSL, közepes telítettség,
// fehér felirattal olvasható). A típus (Gyakorlat, Őrszolgálat, Kiképzés, …)
// állandó színt kap, hogy ugyanaz a fajta mindig ugyanolyan legyen.
export const PALETTE = [
  "hsl(148 30% 34%)",   // olívazöld — a rendszer elsődleges színe
  "hsl(42 45% 40%)",    // sárgaréz
  "hsl(210 28% 42%)",   // acélkék
  "hsl(18 40% 42%)",    // terrakotta
  "hsl(268 22% 46%)",   // szürkés lila
  "hsl(178 30% 34%)",   // kékeszöld
  "hsl(0 38% 44%)",     // téglavörös
  "hsl(84 28% 36%)",    // moha
  "hsl(232 24% 48%)",   // indigószürke
  "hsl(330 24% 44%)",   // fakó bordó
  "hsl(28 30% 36%)",    // khaki barna
  "hsl(200 18% 40%)",   // palaszürke
];

function hashKey(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/** Típus → szín. A leggyakoribbak fix helyet kapnak, a többi hash alapján, ütközés nélkül ha lehet. */
export function buildColorMap(kinds: string[]): Map<string, string> {
  const fixed: Record<string, string> = { Gyakorlat: PALETTE[0], Őrszolgálat: PALETTE[1], Kiképzés: PALETTE[2], Esemény: PALETTE[4] };
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const kind of kinds) {
    if (fixed[kind]) { map.set(kind, fixed[kind]); used.add(fixed[kind]); }
  }
  for (const kind of kinds) {
    if (map.has(kind)) continue;
    let idx = hashKey(kind) % PALETTE.length;
    for (let tries = 0; tries < PALETTE.length && used.has(PALETTE[idx]); tries += 1) idx = (idx + 1) % PALETTE.length;
    map.set(kind, PALETTE[idx]);
    used.add(PALETTE[idx]);
  }
  return map;
}

export function isoDate(value: string) {
  return value.slice(0, 10);
}

export function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** A hónap 6 hete, hetenként 7 ISO-dátum (a szomszéd hónapok napjai is, hogy a sáv folytonos legyen). */
export function monthWeeks(year: number, monthIndex: number): string[][] {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(toIso(first), -offset);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** Egy hét sávjai: minden elem egy folytonos csík, a sorok (lane) kapzsi módon töltődnek. */
export function weekBars(week: string[], items: CalendarItem[]): WeekBar[] {
  const weekStart = week[0];
  const weekEnd = week[6];
  const bars: WeekBar[] = [];
  const laneEnds: number[] = []; // lane → utolsó foglalt oszlop
  const inWeek = items
    .filter((it) => isoDate(it.startDate) <= weekEnd && isoDate(it.endDate) >= weekStart)
    .sort((a, b) => isoDate(a.startDate).localeCompare(isoDate(b.startDate)) || isoDate(b.endDate).localeCompare(isoDate(a.endDate)) || a.name.localeCompare(b.name, "hu"));
  for (const item of inWeek) {
    const s = isoDate(item.startDate);
    const e = isoDate(item.endDate);
    const startCol = s < weekStart ? 0 : week.indexOf(s);
    const endCol = e > weekEnd ? 6 : week.indexOf(e);
    if (startCol < 0 || endCol < 0 || endCol < startCol) continue;
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(endCol); } else { laneEnds[lane] = endCol; }
    bars.push({ item, startCol, span: endCol - startCol + 1, lane, continuesLeft: s < weekStart, continuesRight: e > weekEnd });
  }
  return bars;
}
