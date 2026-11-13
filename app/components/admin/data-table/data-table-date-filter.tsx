"use client";

import { DateRangePicker } from "@/components/admin/date-range-picker";

export interface DateFilterControl {
  label: string;
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}

/**
 * Filtre de période (dates ISO) de la barre d'outils. Le calendrier garde sa sélection en interne : la clé de
 * remontage le remet à zéro quand la période change hors de lui (réinitialisation, retour arrière du navigateur).
 */
export function DataTableDateFilter({ filter }: { filter: DateFilterControl }) {
  return (
    <div className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {filter.label}
      <DateRangePicker
        key={`${filter.from ?? ""}~${filter.to ?? ""}`}
        from={filter.from}
        to={filter.to}
        onChange={(from, to) => filter.onChange(from || undefined, to || undefined)}
        className="h-10 justify-start px-2.5 font-normal"
      />
    </div>
  );
}
