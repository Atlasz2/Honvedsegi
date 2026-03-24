import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function parseDateOnly(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '00:00' };
  const [date, timeRaw] = value.split('T');
  const time = (timeRaw || '00:00').slice(0, 5);
  return { date, time };
}

type DateTimePickerInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  className?: string;
};

export default function DateTimePickerInput({ value, onChange, placeholder = 'Dátum/idő kiválasztása', className = '' }: DateTimePickerInputProps) {
  const current = splitDateTime(value);
  const selected = parseDateOnly(current.date);

  const setDate = (nextDate: string) => {
    const nextTime = current.time || '00:00';
    onChange(`${nextDate}T${nextTime}`);
  };

  const setTime = (nextTime: string) => {
    const nextDate = current.date || formatDateOnly(new Date());
    onChange(`${nextDate}T${nextTime}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full bg-input border border-border px-3 py-2 text-sm text-left text-foreground focus:outline-none focus:border-primary flex items-center justify-between ${className}`}
          style={{ borderRadius: '2px' }}
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value || placeholder}</span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) setDate(formatDateOnly(date));
            }}
            initialFocus
          />
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Időpont</label>
            <input
              type="time"
              value={current.time}
              onChange={e => setTime(e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
              style={{ borderRadius: '2px' }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
