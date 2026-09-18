import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

export function Select({ value, onValueChange, children }: { value?: string, onValueChange?: (value: string) => void, children: React.ReactNode }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      {children}
    </SelectPrimitive.Root>
  )
}

export function SelectTrigger({ children }: { children?: React.ReactNode }) {
  return (
    <SelectPrimitive.Trigger
      className="flex h-[44px] w-full items-center justify-between rounded-md border border-[var(--border)] bg-white/5 px-3.5 py-2 text-[0.95rem] text-[var(--text-primary)] shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <SelectPrimitive.Value placeholder={placeholder} />
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className="relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
        position="popper"
        sideOffset={4}
      >
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
          <ChevronUp className="h-4 w-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
          <ChevronDown className="h-4 w-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ value, children }: { value: string, children: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-[var(--bg-card-hover)] focus:text-[var(--text-primary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
