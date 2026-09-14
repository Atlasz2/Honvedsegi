import type { OperationAttendanceEntry, OperationAttendanceStatus } from "@/lib/types";

type Props = {
  entries: OperationAttendanceEntry[];
  canEdit: boolean;
  saving: boolean;
  dirtyPersonIds: Set<string>;
  onChange: (personId: string, field: "status" | "note", value: string) => void;
  onSave: () => void;
};

const labels: Record<OperationAttendanceStatus, string> = {
  Present: "Megjelent",
  Excused: "Igazolt",
  Absent: "Hiányzott",
  Pending: "Függőben",
};

const badgeClass: Record<OperationAttendanceStatus, string> = {
  Present: "bg-green-500/15 text-green-300 border-green-500/30",
  Excused: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Absent: "bg-red-500/15 text-red-300 border-red-500/30",
  Pending: "bg-gray-500/15 text-gray-300 border-gray-500/30",
};

export default function AttendanceGrid({ entries, canEdit, saving, dirtyPersonIds, onChange, onSave }: Props) {
  const hasDirty = dirtyPersonIds.size > 0;

  return (
    <div className="space-y-3">
      {hasDirty && canEdit && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 text-xs font-mono" style={{ borderRadius: "2px" }}>
          <span className="text-primary">{dirtyPersonIds.size} sor módosítva</span>
          <span className="text-muted-foreground">— mentés szükséges</span>
        </div>
      )}
      <div className="overflow-auto border border-border" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead>
            <tr>
              <th>Név</th>
              <th>Státusz</th>
              <th>Megjegyzés</th>
              <th>Módosította</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground text-xs py-4">Nincs jelenléti adat.</td>
              </tr>
            )}
            {entries.map((row) => {
              const isDirty = dirtyPersonIds.has(row.personId);
              return (
                <tr key={row.personId} className={isDirty ? "bg-primary/5" : ""}>
                  <td>
                    <span className="flex items-center gap-1.5">
                      {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" title="Módosított" />}
                      {row.personName}
                    </span>
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={row.status}
                        onChange={(e) => onChange(row.personId, "status", e.target.value)}
                        className="bg-input border border-border px-2 py-1 text-xs"
                        style={{ borderRadius: "2px" }}
                      >
                        <option value="Present">Megjelent</option>
                        <option value="Excused">Igazolt</option>
                        <option value="Absent">Hiányzott</option>
                        <option value="Pending">Függőben</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 border text-xs font-mono ${badgeClass[row.status]}`} style={{ borderRadius: "2px" }}>
                        {labels[row.status]}
                      </span>
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        value={row.note}
                        onChange={(e) => onChange(row.personId, "note", e.target.value)}
                        className="w-full bg-input border border-border px-2 py-1 text-xs"
                        style={{ borderRadius: "2px" }}
                      />
                    ) : (
                      row.note || "-"
                    )}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {row.updatedBy || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            className="btn-mil-primary text-xs"
            onClick={onSave}
            disabled={saving || !hasDirty}
          >
            {saving ? "Mentés..." : `Jelenlét mentése${hasDirty ? ` (${dirtyPersonIds.size})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
