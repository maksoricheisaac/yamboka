"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ISO = "yyyy-MM-dd";

/** "2026-10-31" -> date locale (évite le décalage UTC de new Date("2026-10-31")). */
export function parseIso(value?: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

interface Props {
  /** Dates ISO (AAAA-MM-JJ) initiales. */
  from?: string;
  to?: string;
  /** Plus grande date sélectionnable (ISO), par ex. aujourd'hui. */
  max?: string;
  /** Si fourni, les champs cachés `from`/`to` sont émis pour un formulaire GET. */
  name?: { from: string; to: string };
  /** Appelé à chaque sélection (dates ISO, vides si effacé). */
  onChange?: (from: string, to: string) => void;
  className?: string;
}

/** Sélecteur de période (calendrier à deux mois). Utilisable seul (onChange) ou dans un formulaire (name). */
export function DateRangePicker({ from, to, max, name, onChange, className }: Props) {
  const [range, setRange] = useState<DateRange | undefined>({ from: parseIso(from), to: parseIso(to) });
  const maxDate = parseIso(max);
  const fmt = (d?: Date) => (d ? format(d, ISO) : "");

  const select = (next: DateRange | undefined) => {
    setRange(next);
    onChange?.(fmt(next?.from), fmt(next?.to ?? next?.from));
  };

  const label = range?.from
    ? range.to
      ? `${format(range.from, "dd LLL y", { locale: fr })} – ${format(range.to, "dd LLL y", { locale: fr })}`
      : format(range.from, "dd LLL y", { locale: fr })
    : "Choisir une période";

  return (
    <>
      {name && <input type="hidden" name={name.from} value={fmt(range?.from)} />}
      {name && <input type="hidden" name={name.to} value={fmt(range?.to ?? range?.from)} />}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={className ?? "justify-start px-2.5 font-normal"}>
            <CalendarIcon aria-hidden /> {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            locale={fr}
            defaultMonth={range?.from}
            selected={range}
            onSelect={select}
            disabled={maxDate ? { after: maxDate } : undefined}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
