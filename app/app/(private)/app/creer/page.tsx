import type { Metadata } from "next";
import { MAX_PROMPT_LENGTH, type CreationConfig, type StyleView } from "@yamboka/shared";
import { Studio } from "@/components/creations/studio";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Créer" };

export default async function CreatePage({ searchParams }: PageProps<"/app/creer">) {
  const user = await requireUser();
  const [{ styles }, config, sp] = await Promise.all([
    serverGet<{ styles: StyleView[] }>("/creations/styles"),
    serverGet<CreationConfig>("/creations/config"),
    searchParams,
  ]);

  const styleParam = typeof sp.style === "string" ? sp.style : null;
  // Une idée demandée (depuis « Idées » ou « Refaire ») préremplit le texte et les réglages.
  const fromStyle = styles.find((s) => s.id === styleParam);

  const prompt = typeof sp.prompt === "string" ? sp.prompt.slice(0, MAX_PROMPT_LENGTH) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Qu’allez-vous créer ?</h1>
        <p className="mt-1 text-muted-foreground">Une photo, quelques mots : Yamboka en fait une vidéo.</p>
      </div>
      <Studio
        styles={styles}
        config={config}
        balance={user.credits}
        emailVerified={user.emailVerified}
        initialStyleId={fromStyle?.id ?? null}
        initialPrompt={prompt}
      />
    </div>
  );
}
