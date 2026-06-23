import { useMemo, useState } from "react";
import type { MaterialRequirement, RequirementStatus } from "@/lib/types";

type Props = {
  items: MaterialRequirement[];
  canEdit: boolean;
  busy: boolean;
  onCreate: (payload: Omit<MaterialRequirement, "id" | "operationId">) => Promise<void>;
  onUpdate: (id: string, payload: Partial<Omit<MaterialRequirement, "id" | "operationId">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const statusLabel: Record<RequirementStatus, string> = {
  Requested: "Igényelt",
  Approved: "Jóváhagyott",
  Fulfilled: "Teljesített",
};

export default function RequirementsList({ items, canEdit, busy, onCreate, onUpdate, onDelete }: Props) {
  const [newItem, setNewItem] = useState({ itemName: "", quantity: 1, unit: "db", note: "", status: "Requested" as RequirementStatus });

  const sorted = useMemo(() => [...items].sort((a, b) => a.itemName.localeCompare(b.itemName, "hu")), [items]);

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-secondary/30 border border-border" style={{ borderRadius: "2px" }}>
          <input value={newItem.itemName} onChange={(e) => setNewItem({ ...newItem, itemName: e.target.value })} placeholder="Anyag neve" className="md:col-span-2 bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: "2px" }} />
          <input type="number" min={0} value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) || 0 })} className="bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: "2px" }} />
          <input value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} placeholder="Mértékegység" className="bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: "2px" }} />
          <select value={newItem.status} onChange={(e) => setNewItem({ ...newItem, status: e.target.value as RequirementStatus })} className="bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: "2px" }}>
            <option value="Requested">Igényelt</option>
            <option value="Approved">Jóváhagyott</option>
            <option value="Fulfilled">Teljesített</option>
          </select>
          <button
            className="btn-mil-primary text-xs"
            onClick={() => {
              if (!newItem.itemName.trim()) return;
              void onCreate({ ...newItem, itemName: newItem.itemName.trim(), unit: newItem.unit.trim(), note: newItem.note.trim() });
              setNewItem({ itemName: "", quantity: 1, unit: "db", note: "", status: "Requested" });
            }}
            disabled={busy}
          >
            Hozzáadás
          </button>
          <input value={newItem.note} onChange={(e) => setNewItem({ ...newItem, note: e.target.value })} placeholder="Megjegyzés" className="md:col-span-6 bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: "2px" }} />
        </div>
      )}

      <div className="overflow-auto border border-border" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead>
            <tr>
              <th>Anyag</th>
              <th>Mennyiség</th>
              <th>Állapot</th>
              <th>Megjegyzés</th>
              {canEdit && <th>Művelet</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="text-muted-foreground text-xs py-4">Nincs anyagigény.</td>
              </tr>
            )}
            {sorted.map((item) => (
              <tr key={item.id}>
                <td>{item.itemName}</td>
                <td className="font-mono text-xs">{item.quantity} {item.unit}</td>
                <td>{statusLabel[item.status]}</td>
                <td>{item.note || "-"}</td>
                {canEdit && (
                  <td>
                    <div className="flex items-center gap-2">
                      <select
                        value={item.status}
                        onChange={(e) => void onUpdate(item.id, { status: e.target.value as RequirementStatus })}
                        className="bg-input border border-border px-2 py-1 text-xs"
                        style={{ borderRadius: "2px" }}
                        disabled={busy}
                      >
                        <option value="Requested">Igényelt</option>
                        <option value="Approved">Jóváhagyott</option>
                        <option value="Fulfilled">Teljesített</option>
                      </select>
                      <button className="btn-mil-secondary text-xs" onClick={() => void onDelete(item.id)} disabled={busy}>Törlés</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
