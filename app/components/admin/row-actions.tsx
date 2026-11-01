"use client";

import { Check, Eye, EyeOff, MoreVertical, Pencil, Power, PowerOff, ShieldOff, Star, StarOff, Tag, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { ActionDialog, type ActionDialogProps } from "@/components/admin/action-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Icônes nommées par une chaîne : les props restent sérialisables depuis un composant serveur. */
const ICONS = { edit: Pencil, price: Tag, on: Power, off: PowerOff, publish: Eye, unpublish: EyeOff, star: Star, unstar: StarOff, handle: Check, demote: ShieldOff } satisfies Record<string, LucideIcon>;
export type RowActionIcon = keyof typeof ICONS;

export interface RowAction {
  key: string;
  label: string;
  icon?: RowActionIcon;
  /** Action sensible ou destructrice : rangée à part, en bas du menu, et en rouge. */
  destructive?: boolean;
  /** Dialogue de confirmation / de saisie ouvert par l'action (sans bouton propre : c'est le menu qui l'ouvre). */
  dialog: Omit<ActionDialogProps, "trigger" | "open" | "onOpenChange">;
}

/**
 * Menu d'actions d'une ligne de tableau (⋮). Les actions ordinaires viennent d'abord, les destructrices sont séparées
 * en bas. Chaque action ouvre le dialogue habituel (motif, validation, retour d'erreur) : le serveur revérifie tout.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (actions.length === 0) return null;
  const regular = actions.filter((a) => !a.destructive);
  const risky = actions.filter((a) => a.destructive);
  const current = actions.find((a) => a.key === openKey);

  const item = (a: RowAction) => {
    const Icon = a.icon ? ICONS[a.icon] : null;
    return (
      <DropdownMenuItem key={a.key} variant={a.destructive ? "destructive" : "default"} onSelect={() => setOpenKey(a.key)}>
        {Icon && <Icon aria-hidden />}
        {a.label}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} type="button" variant="ghost" size="icon" className="size-10 sm:size-9" aria-label={label}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={8} className="min-w-52">
          {regular.map(item)}
          {regular.length > 0 && risky.length > 0 && <DropdownMenuSeparator />}
          {risky.map(item)}
        </DropdownMenuContent>
      </DropdownMenu>
      {current && <ActionDialog key={current.key} {...current.dialog} open onOpenChange={(v) => {
        if (v) return;
        setOpenKey(null);
        // Le dialogue n'a pas de bouton d'ouverture propre : le focus revient explicitement sur le bouton du menu.
        requestAnimationFrame(() => triggerRef.current?.focus());
      }} />}
    </>
  );
}
