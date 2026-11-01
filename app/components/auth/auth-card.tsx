import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { SITE_URL } from "@/lib/site";

/** Cadre commun des pages d'authentification : logo, titre, phrase courte, contenu, puis lien alternatif et mentions légales. */
export function AuthCard({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <Logo href={SITE_URL} />
        <a href={SITE_URL} className="rounded-md text-sm text-muted-foreground underline-offset-4 hover:underline">
          Retour au site
        </a>
      </div>
      <div className="space-y-6 sm:rounded-3xl sm:border sm:bg-card sm:p-8 sm:shadow-soft lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          {lead && <p className="text-muted-foreground">{lead}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      <p className="text-center text-xs text-muted-foreground">
        <a href={`${SITE_URL}/conditions-utilisation`} className="underline-offset-4 hover:underline">Conditions</a>
        {" · "}
        <a href={`${SITE_URL}/confidentialite`} className="underline-offset-4 hover:underline">Confidentialité</a>
      </p>
    </div>
  );
}
