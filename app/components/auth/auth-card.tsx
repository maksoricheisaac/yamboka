import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { SITE_URL } from "@/lib/site";

export function AuthCard({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="flex items-center justify-between">
        <Logo href={SITE_URL} />
        <a href={SITE_URL} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Retour au site
        </a>
      </div>
      <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {lead && <p className="text-muted-foreground">{lead}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
