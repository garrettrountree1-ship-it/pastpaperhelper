import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRICULUM_OPTIONS } from "@/lib/curricula";

/**
 * Curriculum picker with the common courses plus a free-typing "Other" box.
 */
export function CurriculumSelect({
  value,
  onChange,
  id,
  className = "w-40",
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
}) {
  const listed = (CURRICULUM_OPTIONS as readonly string[]).includes(value.trim());
  const [other, setOther] = useState(!listed && value.trim().length > 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={other || !listed ? "__other" : value.trim()}
        onValueChange={(next) => {
          if (next === "__other") {
            setOther(true);
            onChange("");
            return;
          }
          setOther(false);
          onChange(next);
        }}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {CURRICULUM_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          <SelectItem value="__other">Other…</SelectItem>
        </SelectContent>
      </Select>
      {other || (!listed && value.trim().length > 0) ? (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type the course"
          className="w-40"
        />
      ) : null}
    </div>
  );
}
