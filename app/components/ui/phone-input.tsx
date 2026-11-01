"use client";

import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from "libphonenumber-js/min";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { DEFAULT_PHONE_COUNTRY, normalizePhone, phoneCountry } from "@yamboka/shared";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";

/** Pays proposés en tête de liste : la clientèle actuelle et ses voisins. */
const FAVORITES: CountryCode[] = ["CG", "CD", "CM", "GA", "CI", "SN", "FR", "BE"];

const names = new Intl.DisplayNames(["fr"], { type: "region" });
/** Noms plus explicites que ceux de la norme CLDR (« Congo-Brazzaville », « Congo-Kinshasa ») pour la clientèle visée. */
const NAME_OVERRIDES: Partial<Record<CountryCode, string>> = { CG: "République du Congo", CD: "République démocratique du Congo" };
const nameOf = (c: CountryCode) => NAME_OVERRIDES[c] ?? names.of(c) ?? c;
const dialOf = (c: CountryCode) => `+${getCountryCallingCode(c)}`;
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const emoji = (c: string) => String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0)));

/**
 * Drapeaux en SVG, chargés à part (≈ 47 Ko compressés) après le premier affichage : le formulaire n'attend pas.
 * En attendant (et sur les systèmes sans drapeaux emoji), le nom et l'indicatif restent toujours affichés.
 */
let flagsPromise: Promise<Record<string, string>> | null = null;
function useFlags() {
  const [flags, setFlags] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    flagsPromise ??= import("country-flag-icons/string/3x2").then((m) => m as unknown as Record<string, string>);
    let live = true;
    void flagsPromise.then((f) => live && setFlags(f));
    return () => {
      live = false;
    };
  }, []);
  return flags;
}

function Flag({ country, flags }: { country: CountryCode; flags: Record<string, string> | null }) {
  const svg = flags?.[country];
  return svg ? (
    // eslint-disable-next-line @next/next/no-img-element -- petit SVG en data URI, aucune optimisation d'image à faire
    <img alt="" aria-hidden src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} className="h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]" />
  ) : (
    <span aria-hidden className="w-6 shrink-0 text-center text-base leading-none">
      {emoji(country)}
    </span>
  );
}

/** Numéro congolais : 06 606 31 33 (2-3-2-2). Les autres pays suivent leur plan de numérotation. */
function formatNational(digits: string, country: CountryCode): string {
  if (country === "CG") {
    // 2-3-2-2 pour les 9 premiers chiffres ; l'excédent reste visible (pour que l'erreur « numéro invalide » soit compréhensible).
    const head = (digits.slice(0, 9).match(/^(\d{0,2})(\d{0,3})(\d{0,2})(\d{0,2})/)?.slice(1) ?? []).filter(Boolean);
    return [...head, ...(digits.length > 9 ? [digits.slice(9)] : [])].join(" ");
  }
  return new AsYouType(country).input(digits);
}

/** Pays correspondant à un indicatif, s'il n'y en a qu'un. */
function soleCountryFor(callingCode: string): CountryCode | undefined {
  const all = getCountries().filter((c) => getCountryCallingCode(c) === callingCode);
  return all.length === 1 ? all[0] : undefined;
}

/** Présentation nationale d'un numéro analysé : « 06 606 31 33 » (Congo), « 06 12 34 56 78 » (France), etc. */
function nationalDisplay(parsed: PhoneNumber, country: CountryCode): string {
  return country === "CG" ? formatNational(parsed.nationalNumber, country) : parsed.formatNational();
}

function fromValue(value: string, fallback: CountryCode): { country: CountryCode; text: string } {
  if (!value) return { country: fallback, text: "" };
  const country = phoneCountry(value) ?? fallback;
  const parsed = parsePhoneNumberFromString(/^\d/.test(value) ? `+${value}` : value);
  if (!parsed) return { country, text: value };
  return { country, text: nationalDisplay(parsed, country) };
}

export interface PhoneInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> {
  /** Numéro au format E.164 (ou ancien format congolais), vide si non renseigné. */
  value: string;
  /** Reçoit le E.164 quand le numéro est valide ; sinon la saisie brute « +indicatif chiffres » (que le schéma refusera), ou « » si vide. */
  onChange: (value: string) => void;
  /** Pays proposés ; un seul pays verrouille le sélecteur (ex. paiement mobile money : Congo). */
  countries?: CountryCode[];
  defaultCountry?: CountryCode;
}

/**
 * Champ de téléphone international : sélecteur de pays (recherche par nom, indicatif ou code), indicatif visible,
 * saisie formatée sans déplacer le curseur, reconnaissance d'un numéro collé avec « + ». La valeur échangée est
 * toujours au format E.164 ; ce qui s'affiche n'est que de la présentation.
 */
export function PhoneInput({ value, onChange, countries, defaultCountry = DEFAULT_PHONE_COUNTRY, disabled, className = "", ...rest }: PhoneInputProps) {
  const allowed = useMemo(() => countries ?? getCountries(), [countries]);
  const fallback = allowed.includes(defaultCountry) ? defaultCountry : allowed[0];
  const init = useMemo(() => fromValue(value, fallback), []); // eslint-disable-line react-hooks/exhaustive-deps -- état initial seulement
  const [country, setCountry] = useState<CountryCode>(init.country);
  const [text, setText] = useState(init.text);
  const emitted = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const flags = useFlags();
  const locked = allowed.length === 1;

  // Valeur modifiée de l'extérieur (réinitialisation du formulaire, données rechargées) : on réaffiche.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const next = fromValue(value, fallback);
    setCountry(next.country);
    setText(next.text);
  }, [value, fallback]);

  // Restitue le curseur après un reformatage (sinon il saute en fin de champ).
  useLayoutEffect(() => {
    if (caret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  function emit(nextCountry: CountryCode, digits: string) {
    const out = digits ? (normalizePhone(digits, nextCountry) ?? `+${getCountryCallingCode(nextCountry)}${digits}`) : "";
    emitted.current = out;
    onChange(out);
  }

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    const pos = e.target.selectionStart ?? raw.length;
    // Numéro collé avec son indicatif mais sans « + » (« 242061234567 ») : valide en international, pas en national.
    const bare = raw.replace(/\D/g, "");
    if (!/^[+0]/.test(raw.trimStart()) && bare.startsWith(getCountryCallingCode(country))) {
      const asNational = parsePhoneNumberFromString(bare, country);
      // La bibliothèque a retiré l'indicatif de lui-même : c'était un numéro complet, collé sans « + ».
      if (asNational?.isValid() && asNational.nationalNumber !== bare) raw = `+${bare}`;
    }
    const international = raw.trimStart().startsWith("+") || raw.trimStart().startsWith("00");

    if (international) {
      // Numéro collé ou saisi avec son indicatif : on reconnaît le pays et on retire l'indicatif du champ.
      const typed = new AsYouType();
      typed.input(raw.trimStart().replace(/^00/, "+"));
      const cc = typed.getCallingCode();
      const found = (typed.getCountry() as CountryCode | undefined) ?? (cc ? soleCountryFor(cc) : undefined);
      if (found && allowed.includes(found)) {
        const number = typed.getNumber();
        const national = number?.nationalNumber ?? "";
        setCountry(found);
        setText(number ? nationalDisplay(number, found) : formatNational(national, found));
        emit(found, national);
        return;
      }
      // Indicatif pas encore reconnu (ou pays non proposé) : on garde la saisie telle quelle, sans valider.
      setText(raw);
      emitted.current = raw;
      onChange(raw.replace(/[^\d+]/g, ""));
      return;
    }

    const digits = raw.replace(/\D/g, "");
    const formatted = formatNational(digits, country);
    // Nombre de chiffres avant le curseur → position équivalente dans le texte reformaté.
    const before = raw.slice(0, pos).replace(/\D/g, "").length;
    let seen = 0;
    let idx = 0;
    while (idx < formatted.length && seen < before) if (/\d/.test(formatted[idx++])) seen++;
    caret.current = idx;
    setText(formatted);
    emit(country, digits);
  }

  function pickCountry(c: CountryCode) {
    setCountry(c);
    const digits = text.replace(/\D/g, "");
    setText(formatNational(digits, c));
    emit(c, digits);
    inputRef.current?.focus();
  }

  return (
    <div
      className={`flex h-10 w-full items-stretch rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30 ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}
    >
      <CountryPicker country={country} onPick={pickCountry} countries={allowed} locked={locked} flags={flags} disabled={disabled} />
      <input
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={text}
        onChange={handleText}
        disabled={disabled}
        placeholder={country === "CG" ? "06 606 31 33" : undefined}
        className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
        {...rest}
      />
    </div>
  );
}

function CountryPicker({
  country,
  onPick,
  countries,
  locked,
  flags,
  disabled,
}: {
  country: CountryCode;
  onPick: (c: CountryCode) => void;
  countries: CountryCode[];
  locked: boolean;
  flags: Record<string, string> | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => {
    const q = fold(query.trim());
    const digits = q.replace(/\D/g, "");
    const sorted = [...countries].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fr"));
    const ordered = q ? sorted : [...FAVORITES.filter((c) => countries.includes(c)), ...sorted.filter((c) => !FAVORITES.includes(c))];
    return ordered.filter(
      (c) => !q || fold(nameOf(c)).includes(q) || c.toLowerCase() === q || (digits && getCountryCallingCode(c).startsWith(digits)),
    );
  }, [countries, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const label = `Pays : ${nameOf(country)}, indicatif ${dialOf(country)}`;
  const shown = (
    <>
      <Flag country={country} flags={flags} />
      <span className="font-medium tabular-nums">{dialOf(country)}</span>
    </>
  );
  if (locked)
    return (
      <span title={nameOf(country)} className="flex items-center gap-2 border-r px-3 text-sm">
        {shown}
        <span className="sr-only">{label}</span>
      </span>
    );

  function choose(c: CountryCode) {
    setOpen(false);
    onPick(c);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <Popover.Trigger
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        className="flex shrink-0 items-center gap-2 rounded-l-lg border-r px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted data-[state=open]:bg-muted"
      >
        {shown}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-[min(21rem,calc(100vw-1rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options[active] ? `${listId}-${options[active]}` : undefined}
              aria-label="Rechercher un pays ou un indicatif"
              placeholder="Pays ou indicatif (ex. France, 33)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && options[active]) {
                  e.preventDefault();
                  choose(options[active]);
                }
              }}
              className="h-10 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Pays" className="max-h-[min(18rem,50dvh)] overflow-y-auto overscroll-contain p-1">
            {options.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun pays trouvé.</li>}
            {options.map((c, i) => (
              <li
                key={c}
                id={`${listId}-${c}`}
                role="option"
                aria-selected={c === country}
                data-index={i}
                onClick={() => choose(c)}
                onMouseMove={() => active !== i && setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${i === active ? "bg-muted" : ""}`}
              >
                <Flag country={c} flags={flags} />
                <span className="min-w-0 flex-1 truncate">{nameOf(c)}</span>
                <span className="tabular-nums text-muted-foreground">{dialOf(c)}</span>
                {c === country && <Check className="size-4 text-primary" aria-hidden />}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
