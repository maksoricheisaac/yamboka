"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-5 px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-bold">Un problème est survenu</h1>
      <p className="text-lg text-muted-foreground">
        La page n’a pas pu s’afficher. Vérifiez votre connexion puis réessayez.
      </p>
      <Button size="lg" onClick={reset}>
        Réessayer
      </Button>
    </main>
  );
}
