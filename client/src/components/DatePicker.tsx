import { format } from 'date-fns'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import 'react-day-picker/dist/style.css'

interface DatePickerProps {
  date: Date | undefined
  setDate: (d: Date | undefined) => void
  placeholder?: string
}

export function DatePicker({ date, setDate, placeholder = 'Pick a date' }: DatePickerProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={[
            "flex w-full h-[44px] items-center justify-between gap-2",
            "rounded-xl border border-violet-500/20",
            "bg-white/[0.04] px-3.5",
            "text-[13px] text-left",
            "transition-all duration-200",
            "hover:border-violet-500/40 hover:bg-white/[0.06]",
            "focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20",
            date ? "text-slate-100" : "text-slate-500",
          ].join(" ")}
        >
          <span className="flex-1 truncate">
            {date ? format(date, 'dd MMM yyyy') : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {date && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDate(undefined) }}
                className="rounded p-0.5 text-slate-500 hover:text-slate-200 transition-colors"
                aria-label="Clear date"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <CalendarIcon className="h-4 w-4 text-slate-500" />
          </div>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={[
            "z-50 rounded-xl",
            "border border-violet-500/20",
            "bg-[#111827]/95 backdrop-blur-xl",
            "p-4 shadow-2xl",
            "animate-fade-up",
          ].join(" ")}
        >
          <DayPicker
            mode="single"
            selected={date}
            onSelect={setDate}
            showOutsideDays
            style={{
              ["--rdp-accent-color" as string]: "#7c3aed",
              ["--rdp-accent-background-color" as string]: "rgba(124,58,237,0.15)",
              ["--rdp-day-height" as string]: "36px",
              ["--rdp-day-width" as string]: "36px",
              color: "#f1f5f9",
            }}
            classNames={{
              root: "rdp-themed",
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
