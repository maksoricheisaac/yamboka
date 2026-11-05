import type { Metadata } from "next";
import type { StyleView } from "@yamboka/shared";
import { TrendsBrowser } from "@/components/creations/trends-browser";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Idées" };

export default async function TrendsPage() {
  await requireUser();
  const { styles } = await serverGet<{ styles: StyleView[] }>("/creations/styles");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Idées</h1>
        <p className="mt-1 text-muted-foreground">Choisissez une idée, ajoutez votre photo, adaptez le texte à votre goût.</p>
      </div>
      <TrendsBrowser styles={styles} />
    </div>
  );
}
