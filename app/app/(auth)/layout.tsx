import { AuthAside } from "@/components/auth/auth-aside";

/**
 * Composition commune à toutes les pages d'authentification : le formulaire d'abord (colonne de gauche), un panneau
 * visuel à droite sur grand écran seulement. Sur téléphone : le formulaire, rien d'autre.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <main className="flex items-start justify-center bg-background px-4 py-6 sm:items-center sm:bg-secondary/40 sm:py-10 lg:bg-background">
        {children}
      </main>
      <AuthAside />
    </div>
  );
}
