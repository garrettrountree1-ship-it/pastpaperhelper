import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Date + 24-hour time picker. Value shape matches `<input type="datetime-local">`
 * ("YYYY-MM-DDTHH:MM") but the time is always shown on a 24-hour clock, so the
 * browser locale can never render AM/PM.
 */
export function DateTime24Input({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [datePart = "", timePart = ""] = value ? value.split("T") : ["", ""];
  const [hourPart = "", minutePart = ""] = timePart ? timePart.split(":") : ["", ""];

  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));

  const emit = (date: string, hour: string, minute: string) => {
    if (!date) {
      onChange("");
      return;
    }
    onChange(`${date}T${hour || "23"}:${minute || "59"}`);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        id={id}
        type="date"
        className="w-40"
        value={datePart}
        onChange={(event) => emit(event.target.value, hourPart, minutePart)}
      />
      <div className="flex items-center gap-1">
        <Select
          value={hourPart || undefined}
          onValueChange={(next) => emit(datePart, next, minutePart || "00")}
        >
          <SelectTrigger className="w-[72px]" aria-label="Hour (24h)">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {hours.map((hour) => (
              <SelectItem key={hour} value={hour}>
                {hour}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">:</span>
        <Select
          value={minutePart || undefined}
          onValueChange={(next) => emit(datePart, hourPart || "00", next)}
        >
          <SelectTrigger className="w-[72px]" aria-label="Minutes">
            <SelectValue placeholder="MM" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {minutes.map((minute) => (
              <SelectItem key={minute} value={minute}>
                {minute}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
