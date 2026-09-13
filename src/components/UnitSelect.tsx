import { useAuth } from '@/lib/auth';
import { useReferenceData } from '@/lib/queries';
import { unitLabelOf } from '@/lib/units';

/**
 * „Melyik zászlóaljé?" — művelet, esemény, parancs, közlemény tulajdonosa.
 * A zászlóalj ügyintézője nem választhat: minden, amit létrehoz, az övé (a
 * szerver is ezt kényszeríti). Az ezredtörzs választ: ezredszintű (mindenki
 * látja) vagy egy zászlóalj.
 */
export default function UnitSelect({ value, onChange, disabled, label = 'Zászlóalj', className = '' }: {
  value: string; onChange: (unit: string) => void; disabled?: boolean; label?: string; className?: string;
}) {
  const { user } = useAuth();
  const { data: reference } = useReferenceData();
  const own = user?.unit ?? '';
  const units = Object.keys(reference.unitLabels ?? {}).filter((u) => u !== reference.regimentUnit);

  if (own) {
    return (
      <div className={className}>
        <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{label}</label>
        <p className="mono-chip mt-1" title="A saját zászlóaljadé — ezen nem tudsz változtatni">{unitLabelOf(own, reference.unitLabels)}</p>
      </div>
    );
  }
  return (
    <div className={className}>
      <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
        style={{ borderRadius: '2px' }}
      >
        <option value="">Ezredszintű — minden zászlóalj látja</option>
        {units.map((u) => <option key={u} value={u}>{unitLabelOf(u, reference.unitLabels)}</option>)}
      </select>
    </div>
  );
}

/** Kis chip a listákban: az ezredtörzs látja, melyik zászlóaljé. */
export function UnitChip({ unit }: { unit?: string }) {
  const { user } = useAuth();
  const { data: reference } = useReferenceData();
  if (user?.unit) return null;   // a zászlóalj ügyintézője úgyis csak a sajátját (+ ezredszintűt) látja
  return (
    <span className={`mono-chip text-[10px] ${unit ? '' : 'opacity-70'}`} title={unit ? 'Zászlóalj' : 'Ezredszintű'}>
      {unitLabelOf(unit ?? '', reference.unitLabels)}
    </span>
  );
}
