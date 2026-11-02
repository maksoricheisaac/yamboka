import type { Metadata } from "next";
import { MAX_PROMPT_LENGTH, type StyleView } from "@yamboka/shared";
import { Studio } from "@/components/creations/studio";
import { requireUser } from "@/lib/auth";
import { isKind } from "@/lib/creations";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Créer" };

export default async function CreatePage({ searchParams }: PageProps<"/app/creer">) {
  const user = await requireUser();
  const [{ styles }, sp] = await Promise.all([serverGet<{ styles: StyleView[] }>("/creations/styles"), searchParams]);

  const styleParam = typeof sp.style === "string" ? sp.style : null;
  const typeParam = typeof sp.type === "string" ? sp.type : null;
  // Un style demandé (depuis « Tendances ») fixe l'onglet ; sinon « type », sinon l'affiche.
  const fromStyle = styles.find((s) => s.id === styleParam);
  const kind = fromStyle?.kind ?? (isKind(typeParam) ? typeParam : "affiche");

  const prompt = typeof sp.prompt === "string" ? sp.prompt.slice(0, MAX_PROMPT_LENGTH) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Qu’allez-vous créer ?</h1>
        <p className="mt-1 text-muted-foreground">Une photo, quelques mots : Yamboka s’occupe du reste.</p>
      </div>
      <Studio
        styles={styles}
        balance={user.credits}
        emailVerified={user.emailVerified}
        initialKind={kind}
        initialStyleId={fromStyle?.id ?? null}
        initialPrompt={prompt}
      />
    </div>
  );
}
