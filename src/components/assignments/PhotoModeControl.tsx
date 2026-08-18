import { Button } from "@/components/ui/button";
import { PHOTO_MODES, type PhotoMode } from "@/lib/photo-mode";

/**
 * Segmented teacher control for photo answers. `allowInherit` adds a "Follow
 * assignment" option, used for per-student and per-question overrides.
 */
export function PhotoModeControl({
  value,
  onChange,
  disabled,
  allowInherit,
  inheritLabel = "Follow assignment",
}: {
  value: PhotoMode | null;
  onChange: (next: PhotoMode | null) => void;
  disabled?: boolean;
  allowInherit?: boolean;
  inheritLabel?: string;
}) {
  const options: Array<{ value: PhotoMode | null; label: string; hint: string }> = [
    ...(allowInherit
      ? [{ value: null, label: inheritLabel, hint: "Use the setting above" }]
      : []),
    ...PHOTO_MODES,
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.label}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          disabled={disabled}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
