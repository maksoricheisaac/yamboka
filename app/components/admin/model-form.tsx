"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminModelDetail, AdminModelParam } from "@yamboka/shared";
import { Pill } from "@/components/admin/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";

/**
 * Création et édition d'un modèle du catalogue, SANS toucher au code ni au seed.
 *
 * Un appel fournisseur, c'est toujours (slug, input). Ce formulaire décrit les deux : le slug exact du
 * modèle, et chaque clé de son `input` — son type, son rôle, qui en décide, les valeurs autorisées et sa
 * valeur par défaut. Le serveur reconstruit l'`input` à partir de ça et refuse tout ce qui n'y figure pas.
 *
 * Deux choses restent volontairement hors de ce formulaire :
 *   — les identifiants d'API, qui vivent dans les variables d'environnement du serveur ;
 *   — l'activation, qui se fait depuis la liste et reste refusée tant qu'un tarif manque.
 *
 * Les tarifs, eux, sont en AJOUT SEUL : enregistrer un prix ajoute une version datée, il n'écrase rien.
 */

type ParamType = AdminModelParam["type"];
type ParamRole = AdminModelParam["role"];
type ParamExposure = AdminModelParam["exposure"];

/** Un paramètre en cours d'édition : les valeurs complexes sont tenues en texte, converties à l'envoi. */
interface ParamDraft {
  key: string;
  label: string;
  type: ParamType;
  role: ParamRole;
  exposure: ParamExposure;
  affectsPrice: boolean;
  /** ENUM : valeurs séparées par des virgules. */
  enumValues: string;
  /** INTEGER : bornes. */
  min: string;
  max: string;
  /** STRING : longueur maximale. */
  maxLength: string;
  /** Valeur par défaut, en texte (convertie selon le type). */
  defaultValue: string;
}

const TYPES: { value: ParamType; label: string }[] = [
  { value: "STRING", label: "Texte" },
  { value: "INTEGER", label: "Nombre entier" },
  { value: "BOOLEAN", label: "Vrai / faux" },
  { value: "ENUM", label: "Liste de valeurs" },
];

const ROLES: { value: ParamRole; label: string; hint: string }[] = [
  { value: "PROMPT", label: "Description", hint: "le texte du client, complété par le gabarit du serveur" },
  { value: "DURATION", label: "Durée", hint: "en secondes ; c'est l'unité facturée" },
  { value: "RESOLUTION", label: "Qualité", hint: "chaque valeur peut avoir son propre tarif" },
  { value: "ASPECT_RATIO", label: "Format", hint: "9:16, 16:9…" },
  { value: "IMAGE_URL", label: "Photo d'entrée", hint: "déposée par le serveur ; jamais saisie par le client" },
  { value: "OPTION", label: "Option", hint: "tout le reste (son, débit, aperçu rapide…)" },
];

const EXPOSURES: { value: ParamExposure; label: string; hint: string }[] = [
  { value: "CLIENT", label: "Le client choisit", hint: "dans les valeurs autorisées" },
  { value: "FIXED", label: "Imposé", hint: "une valeur envoyée par le client est refusée" },
  { value: "HIDDEN_DEFAULT", label: "Caché", hint: "envoyé au fournisseur, jamais montré" },
];

/**
 * Paramètre dont aucun appel ne peut se passer : la description. Un modèle créé en part toujours, quitte
 * à ce que l'administrateur le retire ensuite.
 */
function promptParam(): ParamDraft {
  return {
    ...emptyParam(),
    key: "prompt",
    label: "Description",
    type: "STRING",
    role: "PROMPT",
    maxLength: "600",
  };
}

function emptyParam(): ParamDraft {
  return {
    key: "",
    label: "",
    type: "STRING",
    role: "OPTION",
    exposure: "CLIENT",
    affectsPrice: false,
    enumValues: "",
    min: "",
    max: "",
    maxLength: "",
    defaultValue: "",
  };
}

/** Paramètre existant → brouillon éditable. */
function toDraft(p: AdminModelParam): ParamDraft {
  const allowed = p.allowedValues;
  const bounds =
    allowed && typeof allowed === "object" && !Array.isArray(allowed)
      ? (allowed as { min?: number; max?: number; maxLength?: number })
      : {};
  return {
    key: p.key,
    label: p.label ?? "",
    type: p.type,
    role: p.role,
    exposure: p.exposure,
    affectsPrice: p.affectsPrice,
    enumValues: Array.isArray(allowed) ? allowed.map(String).join(", ") : "",
    min: bounds.min === undefined ? "" : String(bounds.min),
    max: bounds.max === undefined ? "" : String(bounds.max),
    maxLength: bounds.maxLength === undefined ? "" : String(bounds.maxLength),
    defaultValue:
      p.defaultValue === null || p.defaultValue === undefined
        ? ""
        : String(p.defaultValue),
  };
}

/** Valeurs autorisées d'un brouillon, au format que le catalogue attend. */
function allowedOf(d: ParamDraft): unknown {
  if (d.type === "ENUM") {
    const values = d.enumValues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return values.length > 0 ? values : null;
  }
  if (d.type === "INTEGER") {
    const o: { min?: number; max?: number } = {};
    if (d.min.trim()) o.min = Number(d.min);
    if (d.max.trim()) o.max = Number(d.max);
    return Object.keys(o).length > 0 ? o : null;
  }
  if (d.type === "STRING" && d.maxLength.trim()) {
    return { maxLength: Number(d.maxLength) };
  }
  return null;
}

/** Valeur par défaut d'un brouillon, convertie selon son type. */
function defaultOf(d: ParamDraft): unknown {
  const raw = d.defaultValue.trim();
  if (!raw) return undefined;
  if (d.type === "BOOLEAN") return raw === "true";
  if (d.type === "INTEGER") return Number(raw);
  return raw;
}

/** Valeurs proposées pour la valeur par défaut d'un paramètre de type liste. */
function enumOptions(d: ParamDraft): string[] {
  return d.enumValues
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function ModelFormDialog({
  slug,
  trigger,
}: {
  /** Slug du modèle à modifier, ou undefined pour en créer un. */
  slug?: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AdminModelDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Identité du modèle.
  const [slugValue, setSlugValue] = useState(slug ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"TEXT_TO_VIDEO" | "IMAGE_TO_VIDEO">("TEXT_TO_VIDEO");
  const [sortOrder, setSortOrder] = useState("0");
  const [isDefault, setIsDefault] = useState(false);
  // En création, le formulaire part de la description ; en édition, il attend le détail du modèle.
  const [params, setParams] = useState<ParamDraft[]>(() =>
    slug === undefined ? [promptParam()] : [],
  );

  // Tarif de base à ajouter.
  const [priceResolution, setPriceResolution] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [priceMultiplier, setPriceMultiplier] = useState("1");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  // Règle d'option à ajouter.
  const [ruleParam, setRuleParam] = useState("");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleKind, setRuleKind] = useState<"SURCHARGE" | "MULTIPLIER">("SURCHARGE");
  const [ruleAmount, setRuleAmount] = useState("");

  const editing = slug !== undefined;

  useEffect(() => {
    if (!open || slug === undefined) return;
    void (async () => {
      setBusy(true);
      setMsg(null);
      try {
        const d = await apiGet<AdminModelDetail>(
          `/admin/models/detail?slug=${encodeURIComponent(slug)}`,
        );
        setDetail(d);
        setSlugValue(d.slug);
        setName(d.name);
        setDescription(d.description ?? "");
        setMode(d.mode);
        setSortOrder(String(d.sortOrder));
        setIsDefault(d.isDefault);
        setParams(d.params.map(toDraft));
      } catch (err) {
        setMsg({
          ok: false,
          text: err instanceof ApiError ? err.message : "Lecture impossible.",
        });
      } finally {
        setBusy(false);
      }
    })();
    // Rechargé à chaque ouverture : le catalogue a pu changer depuis la dernière fois.
     
  }, [open, slug]);

  function patch(i: number, change: Partial<ParamDraft>) {
    setParams(params.map((p, j) => (j === i ? { ...p, ...change } : p)));
  }

  async function saveSchema() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/admin/models", {
        slug: slugValue.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        sortOrder: Number(sortOrder) || 0,
        isDefault,
        params: params.map((d) => ({
          key: d.key.trim(),
          label: d.label.trim() || undefined,
          type: d.type,
          role: d.role,
          exposure: d.exposure,
          allowedValues: allowedOf(d),
          defaultValue: defaultOf(d),
          affectsPrice: d.affectsPrice,
        })),
      });
      setMsg({
        ok: true,
        text: editing
          ? "Schéma enregistré. L’activation reste refusée tant qu’un tarif manque."
          : "Modèle créé, inactif. Ajoutez ses tarifs, puis activez-le depuis la liste.",
      });
      router.refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text:
          err instanceof ApiError
            ? (err.details[0]?.message ?? err.message)
            : "Enregistrement impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePrice() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(`/admin/models/prices?slug=${encodeURIComponent(slugValue.trim())}`, {
        resolution: priceResolution.trim() || null,
        usdPerUnit: priceUsd.trim(),
        billingUnit: "SECOND",
        billableMultiplier: Number(priceMultiplier) || 1,
        minSeconds: priceMin.trim() ? Number(priceMin) : null,
        maxSeconds: priceMax.trim() ? Number(priceMax) : null,
      });
      setMsg({ ok: true, text: "Tarif enregistré (nouvelle version, l’ancienne reste lisible)." });
      setPriceUsd("");
      router.refresh();
      if (editing) setOpen(false);
    } catch (err) {
      setMsg({
        ok: false,
        text:
          err instanceof ApiError
            ? (err.details[0]?.message ?? err.message)
            : "Tarif refusé.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    setBusy(true);
    setMsg(null);
    try {
      const param = params.find((p) => p.key === ruleParam);
      const value =
        param?.type === "BOOLEAN"
          ? ruleValue === "true"
          : param?.type === "INTEGER"
            ? Number(ruleValue)
            : ruleValue;
      await apiPost(
        `/admin/models/option-prices?slug=${encodeURIComponent(slugValue.trim())}`,
        {
          paramKey: ruleParam,
          triggerValue: value,
          kind: ruleKind,
          ...(ruleKind === "SURCHARGE"
            ? { usdPerUnit: ruleAmount.trim() }
            : { multiplier: ruleAmount.trim() }),
        },
      );
      setMsg({ ok: true, text: "Règle d’option enregistrée." });
      setRuleAmount("");
      router.refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text:
          err instanceof ApiError
            ? (err.details[0]?.message ?? err.message)
            : "Règle refusée.",
      });
    } finally {
      setBusy(false);
    }
  }

  const pricedParams = params.filter(
    (p) => p.affectsPrice && p.role !== "RESOLUTION" && p.type !== "INTEGER",
  );
  const schemaReady =
    slugValue.trim().length >= 3 &&
    name.trim().length >= 2 &&
    params.length > 0 &&
    params.every((p) => p.key.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-h-[92vh] max-w-[min(94vw,76rem)] overflow-y-auto">
        <div className="space-y-1.5">
          <DialogTitle>{editing ? `Modifier ${slug}` : "Ajouter un modèle"}</DialogTitle>
          <DialogDescription>
            Le slug et les paramètres décrivent l’appel fournisseur. Les identifiants d’API, eux, restent
            dans les variables d’environnement du serveur et ne se saisissent jamais ici.
          </DialogDescription>
        </div>

        {msg && (
          <Alert variant={msg.ok ? "default" : "destructive"}>
            <AlertDescription>{msg.text}</AlertDescription>
          </Alert>
        )}

        {/* ───────────── Identité ───────────── */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">Le modèle</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="m-slug">Slug chez le fournisseur</Label>
              <Input
                id="m-slug"
                value={slugValue}
                onChange={(e) => setSlugValue(e.target.value)}
                disabled={editing}
                placeholder="bytedance/seedance-2.5/text-to-video"
              />
              <p className="text-xs text-muted-foreground">
                Le chemin EXACT, tel que le fournisseur l’attend. Il ne se modifie pas après coup : un
                nouveau chemin, c’est un nouveau modèle.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Nom affiché</Label>
              <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-mode">Mode</Label>
              <select
                id="m-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="TEXT_TO_VIDEO">texte → vidéo</option>
                <option value="IMAGE_TO_VIDEO">photo → vidéo</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="m-desc">Description</Label>
              <Textarea
                id="m-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-order">Ordre d’affichage</Label>
              <Input
                id="m-order"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-24"
              />
            </div>
            <label className="flex items-start gap-3 self-end text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 size-5"
              />
              <span className="font-medium">
                Modèle par défaut
                <span className="block text-xs font-normal text-muted-foreground">
                  un seul à la fois ; celui que le client obtient sans choisir
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* ───────────── Paramètres ───────────── */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">Paramètres de l’appel</legend>
          <p className="text-sm text-muted-foreground">
            Une ligne par clé de l’<code>input</code>. Tout ce que le client envoie est validé contre ces
            lignes : une clé ou une valeur absente d’ici est refusée, même si le fournisseur l’accepterait.
          </p>
          <div className="space-y-4">
            {params.map((d, i) => (
              <div key={i} className="space-y-3 rounded-2xl border p-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-key-${i}`}>Clé exacte</Label>
                    <Input
                      id={`p-key-${i}`}
                      value={d.key}
                      onChange={(e) => patch(i, { key: e.target.value })}
                      placeholder="aspect_ratio"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-label-${i}`}>Libellé client</Label>
                    <Input
                      id={`p-label-${i}`}
                      value={d.label}
                      onChange={(e) => patch(i, { label: e.target.value })}
                      placeholder="Format"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-type-${i}`}>Type</Label>
                    <select
                      id={`p-type-${i}`}
                      value={d.type}
                      onChange={(e) => patch(i, { type: e.target.value as ParamType })}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-role-${i}`}>Rôle</Label>
                    <select
                      id={`p-role-${i}`}
                      value={d.role}
                      onChange={(e) => patch(i, { role: e.target.value as ParamRole })}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {ROLES.find((r) => r.value === d.role)?.hint}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-exp-${i}`}>Qui décide</Label>
                    <select
                      id={`p-exp-${i}`}
                      value={d.exposure}
                      onChange={(e) => patch(i, { exposure: e.target.value as ParamExposure })}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {EXPOSURES.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {EXPOSURES.find((x) => x.value === d.exposure)?.hint}
                    </p>
                  </div>

                  {/* Valeurs autorisées : la saisie dépend du type, pour n'avoir jamais à écrire du JSON. */}
                  {d.type === "ENUM" && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`p-enum-${i}`}>Valeurs autorisées</Label>
                      <Input
                        id={`p-enum-${i}`}
                        value={d.enumValues}
                        onChange={(e) => patch(i, { enumValues: e.target.value })}
                        placeholder="480p, 720p, 1080p"
                      />
                      <p className="text-xs text-muted-foreground">séparées par des virgules</p>
                    </div>
                  )}
                  {d.type === "INTEGER" && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor={`p-min-${i}`}>Minimum</Label>
                        <Input
                          id={`p-min-${i}`}
                          inputMode="numeric"
                          value={d.min}
                          onChange={(e) => patch(i, { min: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`p-max-${i}`}>Maximum</Label>
                        <Input
                          id={`p-max-${i}`}
                          inputMode="numeric"
                          value={d.max}
                          onChange={(e) => patch(i, { max: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {d.type === "STRING" && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`p-len-${i}`}>Longueur maximale</Label>
                      <Input
                        id={`p-len-${i}`}
                        inputMode="numeric"
                        value={d.maxLength}
                        onChange={(e) => patch(i, { maxLength: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor={`p-def-${i}`}>Valeur par défaut</Label>
                    {d.type === "BOOLEAN" ? (
                      <select
                        id={`p-def-${i}`}
                        value={d.defaultValue || "false"}
                        onChange={(e) => patch(i, { defaultValue: e.target.value })}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="true">vrai</option>
                        <option value="false">faux</option>
                      </select>
                    ) : d.type === "ENUM" ? (
                      <select
                        id={`p-def-${i}`}
                        value={d.defaultValue}
                        onChange={(e) => patch(i, { defaultValue: e.target.value })}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        {enumOptions(d).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`p-def-${i}`}
                        value={d.defaultValue}
                        onChange={(e) => patch(i, { defaultValue: e.target.value })}
                      />
                    )}
                    {d.exposure !== "CLIENT" && d.role !== "IMAGE_URL" && (
                      <p className="text-xs text-muted-foreground">
                        Obligatoire : ce paramètre est imposé par la configuration.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={d.affectsPrice}
                      onChange={(e) => patch(i, { affectsPrice: e.target.checked })}
                      className="size-5"
                    />
                    <span className="font-medium">Ce paramètre change le prix</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setParams(params.filter((_, j) => j !== i))}
                  >
                    Retirer ce paramètre
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setParams([...params, emptyParam()])}
          >
            Ajouter un paramètre
          </Button>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!schemaReady || busy} onClick={() => void saveSchema()}>
            {editing ? "Enregistrer le schéma" : "Créer le modèle"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </div>

        {/* ───────────── Tarifs ───────────── */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">Tarifs</legend>
          <p className="text-sm text-muted-foreground">
            Un tarif par qualité, en dollars par seconde facturée. Enregistrer AJOUTE une version datée :
            rien n’est écrasé, et les générations déjà faites gardent le tarif avec lequel elles ont été
            facturées. Le modèle ne peut s’activer que si toutes les combinaisons autorisées ont un tarif.
          </p>

          {detail && detail.prices.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Qualité</TableHead>
                    <TableHead>$ / unité</TableHead>
                    <TableHead>Multiplicateur</TableHead>
                    <TableHead>Durées</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Depuis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.prices.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.resolution ?? "toutes"}</TableCell>
                      <TableCell className="tabular-nums">{p.usdPerUnit}</TableCell>
                      <TableCell className="tabular-nums">×{p.billableMultiplier}</TableCell>
                      <TableCell className="tabular-nums">
                        {p.minSeconds ?? "—"} → {p.maxSeconds ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Pill tone={p.source === "MANUAL" ? "neutral" : "info"}>{p.source}</Pill>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(p.effectiveFrom).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {detail && detail.missingPrices.length > 0 && (
            <Alert>
              <AlertDescription>
                {detail.missingPrices.length} combinaison(s) encore sans tarif :{" "}
                {detail.missingPrices
                  .slice(0, 6)
                  .map((c) =>
                    Object.entries(c)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(" "),
                  )
                  .join(" · ")}
                {detail.missingPrices.length > 6 ? " …" : ""}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid items-end gap-3 sm:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="pr-res">Qualité</Label>
              <Input
                id="pr-res"
                value={priceResolution}
                onChange={(e) => setPriceResolution(e.target.value)}
                placeholder="720p"
              />
              <p className="text-xs text-muted-foreground">vide = tarif unique</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-usd">$ par seconde</Label>
              <Input
                id="pr-usd"
                inputMode="decimal"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                placeholder="0.10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-mult">Multiplicateur</Label>
              <Input
                id="pr-mult"
                inputMode="numeric"
                value={priceMultiplier}
                onChange={(e) => setPriceMultiplier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-min">Durée min.</Label>
              <Input
                id="pr-min"
                inputMode="numeric"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-max">Durée max.</Label>
              <Input
                id="pr-max"
                inputMode="numeric"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !priceUsd.trim() || slugValue.trim().length < 3}
              onClick={() => void savePrice()}
            >
              Enregistrer ce tarif
            </Button>
          </div>
        </fieldset>

        {/* ───────────── Règles d'option ───────────── */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">Règles de prix des options</legend>
          <p className="text-sm text-muted-foreground">
            Pour chaque option payante : un supplément en dollars par seconde, ou un multiplicateur du
            tarif (1,5 pour +50 %, 0,5 pour la moitié). La valeur par défaut d’un paramètre n’a pas besoin
            de règle : c’est elle que le tarif de base couvre.
          </p>

          {detail && detail.optionPrices.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paramètre</TableHead>
                    <TableHead>Valeur</TableHead>
                    <TableHead>Effet</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Depuis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.optionPrices.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.paramKey}</TableCell>
                      <TableCell>{String(o.triggerValue)}</TableCell>
                      <TableCell className="tabular-nums">
                        {o.kind === "SURCHARGE" ? `+${o.usdPerUnit} $/s` : `×${Number(o.multiplier)}`}
                      </TableCell>
                      <TableCell>
                        <Pill tone={o.source === "MANUAL" ? "neutral" : "info"}>{o.source}</Pill>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(o.effectiveFrom).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pricedParams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun paramètre marqué « change le prix » (hors qualité et durée) : il n’y a pas de règle
              d’option à définir.
            </p>
          ) : (
            <div className="grid items-end gap-3 sm:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="ru-param">Paramètre</Label>
                <select
                  id="ru-param"
                  value={ruleParam}
                  onChange={(e) => {
                    setRuleParam(e.target.value);
                    setRuleValue("");
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {pricedParams.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label || p.key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ru-value">Valeur déclenchante</Label>
                {(() => {
                  const p = params.find((x) => x.key === ruleParam);
                  if (p?.type === "BOOLEAN") {
                    return (
                      <select
                        id="ru-value"
                        value={ruleValue}
                        onChange={(e) => setRuleValue(e.target.value)}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        <option value="true">vrai</option>
                        <option value="false">faux</option>
                      </select>
                    );
                  }
                  if (p?.type === "ENUM") {
                    return (
                      <select
                        id="ru-value"
                        value={ruleValue}
                        onChange={(e) => setRuleValue(e.target.value)}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        {enumOptions(p).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <Input
                      id="ru-value"
                      value={ruleValue}
                      onChange={(e) => setRuleValue(e.target.value)}
                      disabled={!ruleParam}
                    />
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ru-kind">Effet</Label>
                <select
                  id="ru-kind"
                  value={ruleKind}
                  onChange={(e) => setRuleKind(e.target.value as typeof ruleKind)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="SURCHARGE">supplément ($/s)</option>
                  <option value="MULTIPLIER">multiplicateur</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ru-amount">
                  {ruleKind === "SURCHARGE" ? "Supplément $" : "Facteur"}
                </Label>
                <Input
                  id="ru-amount"
                  inputMode="decimal"
                  value={ruleAmount}
                  onChange={(e) => setRuleAmount(e.target.value)}
                  placeholder={ruleKind === "SURCHARGE" ? "0.01" : "1.5"}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !ruleParam || !ruleValue || !ruleAmount.trim()}
                onClick={() => void saveRule()}
              >
                Enregistrer la règle
              </Button>
            </div>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
