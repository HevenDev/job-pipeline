import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns"
import { CalendarDays, ChevronDown, X } from "lucide-react"
import { DateRangePicker } from "./DateRangePicker"
import type { DateRange } from "react-day-picker"

export type DatePreset = "this_week" | "last_week" | "this_month" | "last_month" | "custom" | null

interface PresetOption {
  id: DatePreset
  label: string
  description: string
}

const PRESETS: PresetOption[] = [
  { id: "this_week",   label: "This Week",   description: "Mon - today" },
  { id: "last_week",   label: "Last Week",   description: "Previous Mon - Sun" },
  { id: "this_month",  label: "This Month",  description: format(new Date(), "MMMM yyyy") },
  { id: "last_month",  label: "Last Month",  description: format(subMonths(new Date(), 1), "MMMM yyyy") },
  { id: "custom",      label: "Custom Range", description: "Pick any range" },
]

function presetToRange(preset: DatePreset): DateRange | undefined {
  const today = new Date()
  if (preset === "this_week")  return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today }
  if (preset === "last_week") {
    const lw = subWeeks(today, 1)
    return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }
  }
  if (preset === "this_month") return { from: startOfMonth(today), to: today }
  if (preset === "last_month") {
    const lm = subMonths(today, 1)
    return { from: startOfMonth(lm), to: endOfMonth(lm) }
  }
  return undefined
}

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return ""
  const from = format(range.from, "d MMM")
  const to = range.to ? format(range.to, "d MMM yy") : ""
  return to ? `${from} - ${to}` : from
}

interface SortDialogProps {
  label: string
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  icon?: React.ReactNode
}

export function SortDialog({ label, value, onChange, icon }: SortDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [activePreset, setActivePreset] = React.useState<DatePreset>(null)
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(undefined)

  // Derive display label
  const hasValue = Boolean(value?.from)
  const displayLabel = hasValue ? formatRangeLabel(value) : label

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset)
    if (preset === "custom") {
      // show custom picker, don't close
      return
    }
    const range = presetToRange(preset)
    onChange(range)
    setOpen(false)
  }

  const applyCustom = () => {
    if (customRange?.from) {
      onChange(customRange)
      setOpen(false)
    }
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActivePreset(null)
    setCustomRange(undefined)
    onChange(undefined)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={[
            "inline-flex items-center gap-2 rounded-xl border px-3 h-[44px] text-sm font-medium",
            "transition-all duration-200 focus:outline-none w-full justify-between",
            hasValue
              ? "border-violet-400/40 bg-violet-500/10 text-violet-200 hover:border-violet-400/60"
              : "border-white/15 bg-white/[0.06] text-slate-400 hover:border-white/25 hover:text-slate-200",
            open ? "border-violet-400/50 ring-2 ring-violet-500/20" : "",
          ].join(" ")}
        >
          <span className="flex items-center gap-2 flex-1 min-w-0">
            {icon ?? <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            <span className={`truncate text-[13px] ${hasValue ? "text-violet-200" : ""}`}>{displayLabel}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {hasValue && (
              <span
                role="button"
                tabIndex={0}
                onClick={clear}
                className="rounded p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={[
            "z-50 w-72 rounded-2xl border border-white/12",
            "bg-[#0d1221]/98 backdrop-blur-2xl",
            "shadow-[0_12px_48px_rgba(0,0,0,0.6)]",
            "p-3 space-y-1",
            "animate-fade-up",
          ].join(" ")}
        >
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Sort by Date</p>
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={[
                "w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm",
                "transition-all duration-150",
                activePreset === p.id
                  ? "bg-violet-500/20 border border-violet-500/30 text-violet-200"
                  : "bg-white/[0.04] border border-transparent text-slate-300 hover:bg-white/[0.07] hover:text-slate-100",
              ].join(" ")}
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-[11px] text-slate-500">{p.description}</span>
            </button>
          ))}

          {activePreset === "custom" && (
            <div className="pt-2 border-t border-white/8">
              <DateRangePicker
                value={customRange}
                onChange={setCustomRange}
                placeholder="Pick custom range..."
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customRange?.from}
                className="mt-2 w-full rounded-xl bg-violet-600/80 hover:bg-violet-600 py-2 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply Range
              </button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}