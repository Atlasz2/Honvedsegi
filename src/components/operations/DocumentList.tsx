import { useRef, useState } from "react";
import type { OperationDocument } from "@/lib/types";

type Props = {
  items: OperationDocument[];
  canEdit: boolean;
  busy: boolean;
  onUpload: (file: File, title: string) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
  onDownload: (docId: string, originalName: string) => Promise<void>;
  onView: (docId: string) => Promise<void>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentList({ items, canEdit, busy, onUpload, onDelete, onDownload, onView }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  const handleUpload = async () => {
    if (!selectedFile) return;
    await onUpload(selectedFile, title);
    setSelectedFile(null);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
          <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-2">Új dokumentum feltöltése</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Fájl</label>
              <input
                ref={inputRef}
                type="file"
                className="w-full text-xs bg-input border border-border px-2 py-1"
                style={{ borderRadius: "2px" }}
                accept=".pdf,.xlsx,.xls,.docx,.doc,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Cím (opcionális)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-input border border-border px-2 py-1 text-xs"
                style={{ borderRadius: "2px" }}
                placeholder="pl. Műveleti parancs"
              />
            </div>
            <div className="flex md:justify-end">
              <button className="btn-mil-primary text-xs" onClick={() => void handleUpload()} disabled={busy || !selectedFile}>
                Feltöltés
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono mt-2">Max 20MB, engedélyezett: pdf, xlsx, xls, docx, doc, txt</p>
        </div>
      )}

      <div className="overflow-auto border border-border" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead>
            <tr>
              <th>Cím</th>
              <th>Fájlnév</th>
              <th>Méret</th>
              <th>Feltöltő</th>
              <th>Dátum</th>
              <th>Művelet</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground text-xs py-4">Nincs feltöltött dokumentum.</td>
              </tr>
            )}
            {items.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.title || "-"}</td>
                <td>{doc.originalName}</td>
                <td className="font-mono text-xs">{formatBytes(doc.fileSize)}</td>
                <td>{doc.uploadedBy || "-"}</td>
                <td className="font-mono text-xs">{new Date(doc.uploadedAt).toLocaleString("hu-HU")}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <button className="btn-mil-secondary text-xs" onClick={() => void onView(doc.id)} disabled={busy}>Megtekint</button>
                    <button className="btn-mil-secondary text-xs" onClick={() => void onDownload(doc.id, doc.originalName)} disabled={busy}>Letöltés</button>
                    {canEdit && <button className="btn-mil-secondary text-xs" onClick={() => void onDelete(doc.id)} disabled={busy}>Törlés</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
