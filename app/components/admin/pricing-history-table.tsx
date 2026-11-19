"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PricingSections } from "@yamboka/shared";
import { Pill } from "@/components/admin/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiPost } from "@/lib/api-client";

/**
 * Historique des versions de tarification. Revenir à une version n'efface rien : une nouvelle version recopie
 * l'ancienne, et chaque génération garde la version avec laquelle elle a été facturée.
 */
export function PricingHistoryTable({ sections }: { sections: PricingSections }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function rollback(versionId: string) {
    const reason = window.prompt("Motif du retour à cette version ?");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/admin/pricing/rollback", { versionId, note: reason.trim() });
      setMsg({ ok: true, text: "Retour effectué : une nouvelle version recopie l’ancienne, rien n’a été supprimé." });
      router.refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Retour impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>En vigueur depuis</TableHead>
              <TableHead>Réglages</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.history.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {new Date(v.effectiveFrom).toLocaleString("fr-FR")}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  marge {Number(v.marginPercent)} % · carte {Number(v.cardFcfaPerUsd)} F/$ · circuit{" "}
                  {Number(v.circuitLossPercent)} % · bonus {Number(v.bonusValuationPercent)} %
                </TableCell>
                <TableCell>
                  {v.id === sections.current.id ? (
                    <Pill tone="ok">En vigueur</Pill>
                  ) : v.provisional ? (
                    <Pill tone="warn">Provisoire</Pill>
                  ) : (
                    <Pill>Archivée</Pill>
                  )}
                </TableCell>
                <TableCell className="max-w-[20rem] truncate" title={v.note ?? ""}>
                  {v.note ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {v.id === sections.current.id ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void rollback(v.id)}>
                      Revenir
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
