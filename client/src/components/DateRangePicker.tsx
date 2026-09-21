import * as React from 'react'
import { format } from 'date-fns'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { DayPicker, type DateRange } from 'react-day-picker'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import 'react-day-picker/dist/style.css'

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  numberOfMonths?: number
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className = '',
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const hasValue = Boolean(value?.from)

  const displayText = React.useMemo(() => {
    if (!value?.from) return placeholder
    if (value.to) {
      return `${format(value.from, 'dd MMM yyyy')} – ${format(value.to, 'dd MMM yyyy')}`
    }
    return format(value.from, 'dd MMM yyyy')
  }, [value, placeholder])

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(undefined)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
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
            open ? "border-violet-500/60 ring-2 ring-violet-500/20 shadow-[0_0_16px_rgba(124,58,237,0.15)]" : "",
            "focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20",
            hasValue ? "text-slate-100" : "text-slate-500",
            className,
          ].join(" ")}
        >
          <span className="flex-1 truncate">
            {displayText}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {hasValue && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleClear(e as unknown as React.MouseEvent)
                  }
                }}
                className="rounded p-0.5 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer inline-flex items-center"
                aria-label="Clear date range"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <CalendarIcon className="h-4 w-4 text-slate-500" />
          </div>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={[
            "z-50 rounded-xl",
            "border border-violet-500/20",
            "bg-[#111827]/95 backdrop-blur-xl",
            "p-3 shadow-2xl",
            "animate-fade-up",
          ].join(" ")}
        >
          <DayPicker
            mode="range"
            defaultMonth={value?.from || new Date()}
            selected={value}
            onSelect={onChange}
            numberOfMonths={numberOfMonths}
            showOutsideDays
            style={{
              ["--rdp-accent-color" as string]: "#7c3aed",
              ["--rdp-accent-background-color" as string]: "rgba(124,58,237,0.18)",
              ["--rdp-range_middle-background-color" as string]: "rgba(124,58,237,0.22)",
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
