import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronDown, Search, X } from "lucide-react"
import type { FilterOption } from "../types"

interface MultiSelectProps {
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  variant?: "violet" | "emerald" | "amber"
  debounceMs?: number
  onSearch?: (q: string) => void
  searching?: boolean
  serverNotFound?: boolean
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options...",
  variant = "violet",
  debounceMs = 350,
  onSearch,
  searching = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [localSelected, setLocalSelected] = React.useState<string[]>(selected)

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestLocalRef = React.useRef<string[]>(localSelected)
  latestLocalRef.current = localSelected

  React.useEffect(() => { setLocalSelected(selected) }, [selected])
  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const variantChip =
    variant === "emerald" ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
    : variant === "amber" ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
    : "border-violet-500/50 bg-violet-500/20 text-violet-200"

  const variantCheck =
    variant === "emerald" ? "text-emerald-400"
    : variant === "amber" ? "text-amber-400"
    : "text-violet-400"

  const variantSelected =
    variant === "emerald" ? "bg-emerald-500/10 text-emerald-200"
    : variant === "amber" ? "bg-amber-500/10 text-amber-200"
    : "bg-violet-500/10 text-violet-200"

  const triggerDebouncedChange = (next: string[]) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { onChange(next); timerRef.current = null }, debounceMs)
  }

  const toggleOption = (value: string) => {
    const next = localSelected.includes(value)
      ? localSelected.filter(i => i !== value)
      : [...localSelected, value]
    setLocalSelected(next)
    triggerDebouncedChange(next)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; onChange(latestLocalRef.current) }
      setSearchQuery("")
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    onSearch?.(val)
  }

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, searchQuery])

  const showNotFound = filteredOptions.length === 0 && searchQuery.trim().length > 0 && !searching

  const optionMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const o of options) m[o.value] = o.label
    return m
  }, [options])

  // Select All logic
  const allFilteredValues = filteredOptions.map(o => o.value)
  const allFilteredSelected = allFilteredValues.length > 0 && allFilteredValues.every(v => localSelected.includes(v))
  const someFilteredSelected = allFilteredValues.some(v => localSelected.includes(v)) && !allFilteredSelected

  const toggleSelectAll = () => {
    let next: string[]
    if (allFilteredSelected) {
      next = localSelected.filter(v => !allFilteredValues.includes(v))
    } else {
      next = Array.from(new Set([...localSelected, ...allFilteredValues]))
    }
    setLocalSelected(next)
    triggerDebouncedChange(next)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={[
            "flex min-h-[44px] w-full items-center justify-between gap-2",
            "rounded-xl border border-white/15 bg-white/[0.06]",
            "px-3 py-2 text-sm",
            "transition-all duration-200",
            "hover:border-white/25 hover:bg-white/[0.09]",
            open ? "border-violet-400/50 ring-2 ring-violet-500/20 shadow-[0_0_16px_rgba(124,58,237,0.2)]" : "",
            "focus:outline-none",
          ].join(" ")}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
            {localSelected.length === 0 && (
              <span className="text-slate-400 text-[13px]">{placeholder}</span>
            )}
            {localSelected.map(value => (
              <span key={value} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${variantChip}`}>
                {optionMap[value] ?? value}
                <span
                  role="button" tabIndex={0}
                  className="ml-0.5 rounded opacity-70 hover:opacity-100 transition-opacity cursor-pointer inline-flex items-center"
                  onClick={e => { e.stopPropagation(); toggleOption(value) }}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleOption(value) } }}
                  aria-label={`Remove ${optionMap[value] ?? value}`}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {localSelected.length > 0 && (
              <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                {localSelected.length}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </div>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className={[
            "z-50 max-h-72 overflow-hidden flex flex-col",
            "rounded-xl border border-white/12",
            "bg-[#0d1221]/98 backdrop-blur-2xl",
            "shadow-[0_8px_40px_rgba(0,0,0,0.5)]",
            "animate-fade-up",
          ].join(" ")}
        >
          {/* Search input */}
          <div className="relative p-2 border-b border-white/8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-white/[0.05] text-slate-200 rounded-lg border border-white/10 focus:outline-none focus:border-violet-500/50 placeholder:text-slate-500"
            />
            {searching && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
            )}
          </div>

          {/* Select All row */}
          {filteredOptions.length > 0 && (
            <div
              onClick={toggleSelectAll}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-white/8 hover:bg-white/[0.04] transition-colors"
            >
              <div className={[
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                allFilteredSelected
                  ? "border-violet-500 bg-violet-500"
                  : someFilteredSelected
                    ? "border-violet-500/60 bg-violet-500/20"
                    : "border-white/20 bg-transparent",
              ].join(" ")}>
                {allFilteredSelected && <Check className="h-3 w-3 text-white" />}
                {someFilteredSelected && <span className="h-0.5 w-2 bg-violet-400 rounded-full" />}
              </div>
              <span className="text-[12px] font-medium text-slate-300">Select All</span>
              <span className="ml-auto text-[10px] text-slate-600">{filteredOptions.length}</span>
            </div>
          )}

          <div className="overflow-y-auto max-h-52 p-1">
            {showNotFound ? (
              <div className="px-3 py-4 text-center text-[13px] text-slate-500">Not found</div>
            ) : searching && filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-[13px] text-slate-500">Searching...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-[13px] text-slate-500">No options available</div>
            ) : null}

            {filteredOptions.map(option => {
              const isSelected = localSelected.includes(option.value)
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleOption(option.value)}
                  className={[
                    "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg",
                    "py-2 px-3 text-[13px]",
                    "transition-colors duration-100",
                    isSelected ? `${variantSelected} font-medium` : "text-slate-300 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <div className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all",
                    isSelected ? "border-violet-500 bg-violet-500" : "border-white/20 bg-transparent",
                  ].join(" ")}>
                    {isSelected && <Check className={`h-3 w-3 ${variantCheck}`} />}
                  </div>
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.count > 0 && (
                    <span className="text-[10px] text-slate-600 tabular-nums shrink-0">{option.count}</span>
                  )}
                </div>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}