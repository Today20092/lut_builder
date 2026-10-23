import { Field, FieldTitle } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** Small, exclusive choices stay visible without opening a menu. */
export function ChoiceField<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return <Field>
    <FieldTitle>{label}</FieldTitle>
    <ToggleGroup className="workspace-choices" variant="outline" aria-label={label} value={[value]} disabled={disabled} onValueChange={values => {
      const option = options.find(option => option.value === values[0])
      if (option) onChange(option.value)
    }}>
      {options.map(option => <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>)}
    </ToggleGroup>
  </Field>
}
