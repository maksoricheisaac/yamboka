"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { parseIso } from "@/components/admin/date-range-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIOD_LABELS, brazzavilleDay, detectPreset, presetRange, type PeriodKey } from "@/lib/period";

const ISO = "yyyy-MM-dd";
const short = (d: Date) => format(d, "d MMM yyyy", { locale: fr });

/**
 * Sélecteur de période du tableau de bord : un seul bouton qui affiche la période active ; son menu propose les
 * raccourcis puis un calendrier pour une période personnalisée. La période vit dans l'URL (?from=&to=) : le serveur
 * recalcule les indicateurs, le lien est partageable et le bouton Précédent fonctionne.
 */
export function PeriodPicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from: parseIso(from), to: parseIso(to) });
  const active: PeriodKey = detectPreset(from, to);
  const today = brazzavilleDay();
  const maxDate = parseIso(today);

  const go = (nextFrom: string, nextTo: string) => {
    setOpen(false);
    startTransition(() => router.push(`${pathname}?from=${nextFrom}&to=${nextTo}`));
  };

  const complete = !!range?.from && !!range?.to;
  const dates = `${short(parseIso(from)!)} – ${short(parseIso(to)!)}`;
  const title = active === "custom" ? "Période personnalisée" : PERIOD_LABELS[active];

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setRange({ from: parseIso(from), to: parseIso(to) });
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-10 max-w-full justify-start gap-2 px-3 font-normal" disabled={pending}>
            <CalendarIcon aria-hidden className="text-muted-foreground" />
            <span className="font-medium">{title}</span>
            <span className="hidden text-muted-foreground sm:inline">· {dates}</span>
            <ChevronDown aria-hidden className="ml-auto size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0 sm:w-auto" collisionPadding={8}>
          <div className="flex flex-col sm:flex-row">
            <ul aria-label="Périodes prédéfinies" className="grid grid-cols-2 gap-1 border-b p-2 sm:flex sm:w-48 sm:flex-col sm:border-b-0 sm:border-r">
              {(Object.keys(PERIOD_LABELS) as Exclude<PeriodKey, "custom">[]).map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    aria-current={active === key ? "true" : undefined}
                    className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-primary/10 aria-[current=true]:font-semibold aria-[current=true]:text-primary"
                    onClick={() => {
                      const r = presetRange(key);
                      go(r.from, r.to);
                    }}
                  >
                    {PERIOD_LABELS[key]}
                    {active === key && <Check aria-hidden className="size-4" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col">
              <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Période personnalisée</p>
              <Calendar
                mode="range"
                locale={fr}
                defaultMonth={range?.from}
                selected={range}
                onSelect={setRange}
                disabled={maxDate ? { after: maxDate } : undefined}
                numberOfMonths={1}
              />
              <div className="flex items-center justify-between gap-2 border-t p-2">
                <p className="text-xs text-muted-foreground" role="status">
                  {complete ? `${short(range.from!)} – ${short(range.to!)}` : "Choisissez un début et une fin."}
                </p>
                <Button type="button" size="default" className="h-9" disabled={!complete} onClick={() => go(format(range!.from!, ISO), format(range!.to!, ISO))}>
                  Appliquer
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {pending && <span className="text-xs text-muted-foreground" role="status">Actualisation…</span>}
    </div>
  );
}
