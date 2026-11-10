import type { ComponentProps, ReactNode } from "react"
import { Radio, RadioGroup } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

/** Exclusive choices named by a child `<legend>`. */
export function RadioChoices<T extends string>({
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<typeof RadioGroup>, "value" | "onChange" | "onValueChange" | "render"> & {
  value: T
  onChange: (value: T) => void
}) {
  return (
    <RadioGroup
      render={<fieldset />}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={cn("min-w-0 gap-2", className)}
      {...props}
    />
  )
}

/** The whole label is the target, so a small radio still meets target-size guidance. */
export function RadioChoice({
  value,
  disabled,
  className,
  children,
}: {
  value: string
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring",
        className,
      )}
    >
      <Radio value={value} disabled={disabled} />
      {children}
    </label>
  )
}
