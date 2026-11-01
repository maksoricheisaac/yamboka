import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CreationView } from "@yamboka/shared";
import { CreationDetail } from "@/components/creations/creation-detail";
import { requireUser } from "@/lib/auth";
import { serverGetOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Création" };

export default async function CreationPage({ params }: PageProps<"/app/creations/[id]">) {
  await requireUser();
  const { id } = await params;
  const res = await serverGetOrNull<{ creation: CreationView }>(`/creations/${id}`);
  if (!res) notFound();
  return <CreationDetail initial={res.creation} />;
}
