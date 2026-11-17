"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CalibrationGrid, ModelTestResult, PricingSections } from "@yamboka/shared";
import { Pill } from "@/components/admin/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Section « Modèles » de la configuration des calculs.
 *
 * Trois gestes, dans cet ordre : tester le modèle (gratuit, vérifie le schéma et renvoie le prix réel),
 * calibrer ses tarifs par estimation, puis l'activer — l'activation étant refusée tant qu'une combinaison
 * autorisée n'a pas de tarif. Aucun essai réel payant n'est lancé depuis ici.
 */
export function ModelCatalogPanel({ sections }: { sections: PricingSections }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<ModelTestResult | null>(null);
  const [grid, setGrid] = useState<CalibrationGrid | null>(null);

  /** Appel d'une route d'administration du catalogue. Le slug contient des « / » : il passe en requête. */
  async function call<T>(path: string, slug: string, body: unknown): Promise<T> {
    const { apiPost } = await import("@/lib/api-client");
    return apiPost<T>(`${path}?slug=${encodeURIComponent(slug)}`, body);
  }

  async function act(slug: string, what: "test" | "calibrate" | "activate" | "disable" | "apply") {
    setBusy(`${slug}:${what}`);
    setMsg(null);
    try {
      if (what === "test") {
        const res = await call<ModelTestResult>("/admin/models/test", slug, {});
        setTest(res);
        setGrid(null);
      } else if (what === "calibrate") {
        const res = await call<CalibrationGrid>("/admin/models/calibrate", slug, {});
        setGrid(res);
        setTest(null);
      } else if (what === "apply") {
        if (!grid) return;
        // Une ligne par résolution : on retient le prix observé le plus élevé, jamais une moyenne.
        const byResolution = new Map<string | null, string>();
        for (const row of grid.rows) {
          if (row.observedUsdPerUnit === null) continue;
          const kept = byResolution.get(row.resolution);
          if (kept === undefined || Number(row.observedUsdPerUnit) > Number(kept)) {
            byResolution.set(row.resolution, row.observedUsdPerUnit);
          }
        }
        const rows = [...byResolution].map(([resolution, usdPerUnit]) => ({ resolution, usdPerUnit }));
        if (rows.length === 0) {
          setMsg({ ok: false, text: "Aucun prix lisible à appliquer." });
          return;
        }
        const res = await call<{ applied: number }>("/admin/models/calibrate/apply", slug, { rows });
        setMsg({ ok: true, text: `${res.applied} tarif(s) enregistré(s) en source ESTIMATE.` });
        setGrid(null);
        router.refresh();
      } else {
        await call("/admin/models/active", slug, { active: what === "activate" });
        setMsg({ ok: true, text: what === "activate" ? "Modèle activé." : "Modèle désactivé." });
        router.refresh();
      }
    } catch (err) {
      const { ApiError } = await import("@/lib/api-client");
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Opération impossible.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
      {!sections.estimateAvailable && (
        <p className="text-sm text-muted-foreground">
          Le fournisseur en service ne sait pas estimer un prix (fournisseur simulé) : le test vérifie le
          schéma du modèle, mais le calibrage n’est pas possible.
        </p>
      )}

      <div className="overflow-x-auto rounded-3xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modèle</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Qualités</TableHead>
              <TableHead>Paramètres</TableHead>
              <TableHead>Tarif</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.models.map((m) => (
              <TableRow key={m.slug}>
                <TableCell>
                  <span className="font-medium">{m.name}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">{m.slug}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {m.mode === "TEXT_TO_VIDEO" ? "texte → vidéo" : "photo → vidéo"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{m.resolutions.join(", ") || "—"}</TableCell>
                <TableCell className="tabular-nums">{m.paramCount}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {m.missingPrices === 0 ? (
                    <Pill tone="ok">{m.pricedCombinations} combinaison(s) tarifée(s)</Pill>
                  ) : (
                    <Pill tone="warn">{m.missingPrices} sans tarif</Pill>
                  )}
                </TableCell>
                <TableCell>
                  {m.active ? <Pill tone="ok">Actif</Pill> : <Pill>Inactif</Pill>}
                  {m.isDefault && <Pill tone="info">Par défaut</Pill>}
                </TableCell>
                <TableCell className="space-x-2 whitespace-nowrap text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void act(m.slug, "test")}
                  >
                    Tester
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || !sections.estimateAvailable}
                    onClick={() => void act(m.slug, "calibrate")}
                  >
                    Calibrer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={m.active ? "ghost" : "default"}
                    disabled={busy !== null || (!m.active && m.missingPrices > 0)}
                    onClick={() => void act(m.slug, m.active ? "disable" : "activate")}
                  >
                    {m.active ? "Désactiver" : "Activer"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {test && (
        <section aria-labelledby="test-result" className="space-y-2 rounded-3xl bg-card p-4 shadow-card">
          <h3 id="test-result" className="font-bold">
            Essai de {test.slug}
          </h3>
          <p className="text-sm text-muted-foreground">
            Schéma valide : l’<code>input</code> ci-dessous est exactement ce que le serveur enverrait.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(test.input, null, 2)}
          </pre>
          {test.error ? (
            <Alert variant="destructive">
              <AlertDescription>{test.error}</AlertDescription>
            </Alert>
          ) : test.observedUsd ? (
            <p className="text-sm">
              Prix annoncé : <strong>{test.observedUsd} $</strong> par unité
              {test.configuredUsd && ` · configuré : ${test.configuredUsd} $`}
              {test.deviationPercent !== null && ` · écart ${test.deviationPercent} %`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun prix demandé : le fournisseur en service ne sait pas estimer.
            </p>
          )}
        </section>
      )}

      {grid && (
        <section aria-labelledby="grid-result" className="space-y-3 rounded-3xl bg-card p-4 shadow-card">
          <h3 id="grid-result" className="font-bold">
            Calibrage de {grid.slug}
          </h3>
          <p className="text-sm text-muted-foreground">
            Écart maximal constaté : {grid.maxDeviationPercent} %. Appliquer enregistre une nouvelle version
            de tarif par qualité, en source ESTIMATE — le prix le plus élevé observé est retenu.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qualité</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Configuré</TableHead>
                  <TableHead>Observé</TableHead>
                  <TableHead>Écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grid.rows.map((r, i) => (
                  <TableRow key={`${r.resolution ?? "-"}-${r.durationSeconds}-${i}`}>
                    <TableCell>{r.resolution ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.durationSeconds} s</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Object.entries(r.options)
                        .map(([k, v]) => `${k} : ${String(v)}`)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.configuredUsdPerUnit} $</TableCell>
                    <TableCell className="tabular-nums">{r.observedUsdPerUnit ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : (
                        `${r.deviationPercent ?? 0} %`
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" disabled={busy !== null} onClick={() => void act(grid.slug, "apply")}>
            Appliquer ce tableau de prix
          </Button>
        </section>
      )}

      {sections.estimateAlerts.length > 0 && (
        <section aria-labelledby="alertes" className="space-y-2 rounded-3xl border border-warning/40 bg-warning/8 p-4">
          <h3 id="alertes" className="font-bold">
            Le fournisseur est plus cher que la configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Les nouveaux devis retiennent déjà le prix le plus élevé des deux. Lancez un calibrage pour
            enregistrer le tarif estimé — rien n’est appliqué automatiquement.
          </p>
          <ul className="space-y-1 text-sm">
            {sections.estimateAlerts.map((a, i) => (
              <li key={`${a.providerModel}-${a.resolution ?? "-"}-${i}`}>
                {a.providerModel} {a.resolution ?? ""} : configuré {a.configuredUsd} $, observé{" "}
                {a.observedUsd} $ (+{a.deviationPercent} %) le{" "}
                {new Date(a.checkedAt).toLocaleString("fr-FR")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
