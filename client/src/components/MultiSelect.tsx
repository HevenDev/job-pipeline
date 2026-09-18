import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronDown } from "lucide-react"

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
}

export function MultiSelect({ options, selected, onChange, placeholder = "Select options..." }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-[var(--border)] bg-white/5 px-3.5 py-2 text-[0.95rem] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex flex-wrap gap-1.5 flex-1 items-center">
            {selected.length === 0 && <span className="text-muted-foreground opacity-70">{placeholder}</span>}
            {selected.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded bg-[var(--accent)]/20 border border-[var(--accent)]/40 px-2 py-0.5 text-[0.8rem] font-medium text-[var(--accent)]"
              >
                {item}
                <div
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-full opacity-70 hover:opacity-100 ml-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleOption(item)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") toggleOption(item)
                  }}
                >
                  &times;
                </div>
              </span>
            ))}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-64 min-w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-[var(--text-primary)] shadow-md"
        >
          {options.length === 0 && <div className="p-2 text-sm opacity-70">No options found.</div>}
          {options.map((option) => {
            const isSelected = selected.includes(option)
            return (
              <div
                key={option}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                onClick={() => toggleOption(option)}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {isSelected && <Check className="h-4 w-4" />}
                </span>
                {option}
              </div>
            )
          })}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
