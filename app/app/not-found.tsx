import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-1 flex-col items-start justify-center gap-5 px-4 py-24">
      <p className="font-heading text-6xl font-bold text-primary">404</p>
      <h1 className="text-3xl font-bold">Page introuvable</h1>
      <p className="text-lg text-muted-foreground">
        Cette page n’existe pas, ou elle ne vous appartient pas.
      </p>
      <Button asChild size="lg">
        <Link href="/app">Retour à mon espace</Link>
      </Button>
    </main>
  );
}
