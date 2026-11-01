import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreationsGallery } from "@/components/creations/creations-gallery";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Mes créations" };

export default function CreationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mes créations</h1>
          <p className="mt-1 text-muted-foreground">Retrouvez, partagez et téléchargez tout ce que vous avez créé.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/app/creer">
            <Sparkles aria-hidden /> Nouvelle création
          </Link>
        </Button>
      </div>
      <CreationsGallery />
    </div>
  );
}
