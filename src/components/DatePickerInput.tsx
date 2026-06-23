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

type DatePickerInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  className?: string;
};

export default function DatePickerInput({ value, onChange, placeholder = 'Dátum kiválasztása', className = '' }: DatePickerInputProps) {
  const selected = parseDateOnly(value);

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
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) onChange(formatDateOnly(date));
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
