import type { Metadata } from "next";
import type { StyleView } from "@yamboka/shared";
import { TrendsBrowser } from "@/components/creations/trends-browser";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Tendances" };

export default async function TrendsPage() {
  await requireUser();
  const { styles } = await serverGet<{ styles: StyleView[] }>("/creations/styles");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tendances</h1>
        <p className="mt-1 text-muted-foreground">Choisissez un visuel, ajoutez votre photo, décrivez ce que vous voulez.</p>
      </div>
      <TrendsBrowser styles={styles} />
    </div>
  );
}
