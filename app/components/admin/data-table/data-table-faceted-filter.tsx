"use client";

/**
 * Filtre de colonne à valeur unique, intégré à la barre d'outils.
 *
 * Choix assumé : une liste déroulante native plutôt qu'un sélecteur multiple à cases. Chaque filtre du produit
 * correspond à UN paramètre de l'API (`status`, `provider`, `country`…), la liste native est accessible au clavier
 * et aux lecteurs d'écran sans code supplémentaire, et elle reste confortable sur mobile.
 */
export interface FilterControl {
  /** Paramètre d'adresse (liste serveur) ou identifiant de colonne (tableau client). */
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Libellé de l'option « tout » (par défaut « Tous »). */
  all?: string;
}

export function DataTableFacetedFilter({ filter }: { filter: FilterControl }) {
  return (
    <label className="flex min-w-32 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {filter.label}
      <select
        value={filter.value ?? ""}
        onChange={(e) => filter.onChange(e.target.value || undefined)}
        className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      >
        <option value="">{filter.all ?? "Tous"}</option>
        {filter.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
