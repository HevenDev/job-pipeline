import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import 'react-day-picker/dist/style.css'

export function DatePicker({ date, setDate, placeholder = 'Pick a date' }: { date: Date | undefined, setDate: (d: Date | undefined) => void, placeholder?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={`flex items-center justify-between w-full h-[44px] px-3.5 bg-white/5 border border-[var(--border)] rounded-[var(--radius-sm)] text-[0.95rem] cursor-pointer text-left ${date ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'}`}
        >
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
          <CalendarIcon className="h-4 w-4 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-4 shadow-[var(--shadow-card)] text-[var(--text-primary)]"
        >
          <DayPicker
            mode="single"
            selected={date}
            onSelect={setDate}
            styles={{
              root: { color: 'var(--text-primary)', margin: 0 },
              day: { padding: '0.5rem', cursor: 'pointer', borderRadius: '4px' },
              selected: { background: 'var(--accent)', color: 'white' },
              today: { fontWeight: 'bold', color: 'var(--accent)' }
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
