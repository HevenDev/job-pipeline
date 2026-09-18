import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronDown, Search, X } from "lucide-react"

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  variant?: "violet" | "emerald" // violet = roles, emerald = locations
  debounceMs?: number
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options…",
  variant = "violet",
  debounceMs = 350,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [localSelected, setLocalSelected] = React.useState<string[]>(selected)

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestLocalRef = React.useRef<string[]>(localSelected)
  latestLocalRef.current = localSelected

  // Synchronize local state when selected prop changes externally
  React.useEffect(() => {
    setLocalSelected(selected)
  }, [selected])

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const chipColors =
    variant === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-violet-500/40 bg-violet-500/15 text-violet-300"

  const triggerDebouncedChange = (next: string[]) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      onChange(next)
      timerRef.current = null
    }, debounceMs)
  }

  const toggleOption = (option: string) => {
    const next = localSelected.includes(option)
      ? localSelected.filter((item) => item !== option)
      : [...localSelected, option]

    setLocalSelected(next)
    triggerDebouncedChange(next)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // If closing, immediately flush any pending debounced change
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        onChange(latestLocalRef.current)
      }
      setSearchQuery("")
    }
  }

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.toLowerCase()
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, searchQuery])

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={[
            "flex min-h-[44px] w-full items-center justify-between gap-2",
            "rounded-xl border border-violet-500/20 bg-white/[0.04]",
            "px-3 py-2 text-sm text-slate-200",
            "transition-all duration-200",
            "hover:border-violet-500/40 hover:bg-white/[0.06]",
            open
              ? "border-violet-500/60 ring-2 ring-violet-500/20 shadow-[0_0_16px_rgba(124,58,237,0.15)]"
              : "",
            "focus:outline-none",
          ].join(" ")}
        >
          {/* Chips + placeholder */}
          <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
            {localSelected.length === 0 && (
              <span className="text-slate-500 text-[13px]">{placeholder}</span>
            )}
            {localSelected.map((item) => (
              <span
                key={item}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${chipColors}`}
              >
                {item}
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-0.5 rounded opacity-60 hover:opacity-100 transition-opacity cursor-pointer inline-flex items-center"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleOption(item)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      toggleOption(item)
                    }
                  }}
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </span>
            ))}
          </div>

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className={[
            "z-50 max-h-72 overflow-hidden flex flex-col",
            "rounded-xl border border-violet-500/20",
            "bg-[#111827]/95 backdrop-blur-xl",
            "p-1 shadow-2xl",
            "animate-fade-up",
          ].join(" ")}
        >
          {/* Search input if options list is substantial */}
          {options.length > 5 && (
            <div className="relative p-1 border-b border-violet-500/10 mb-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-8 pl-8 pr-3 text-xs bg-white/[0.04] text-slate-200 rounded-lg border border-violet-500/15 focus:outline-none focus:border-violet-500/40 placeholder:text-slate-500"
              />
            </div>
          )}

          <div className="overflow-y-auto max-h-56 p-0.5 space-y-0.5">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-slate-500">
                {searchQuery ? "No matching options" : "No options available."}
              </div>
            )}
            {filteredOptions.map((option) => {
              const isSelected = localSelected.includes(option)
              return (
                <div
                  key={option}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleOption(option)}
                  className={[
                    "relative flex cursor-pointer select-none items-center rounded-lg",
                    "py-2 pl-8 pr-3 text-[13px] text-slate-200",
                    "transition-colors duration-150",
                    isSelected
                      ? "bg-violet-500/15 text-violet-300 font-medium"
                      : "hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
                    {isSelected && <Check className="h-3.5 w-3.5 text-violet-400" />}
                  </span>
                  {option}
                </div>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
