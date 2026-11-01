import type { Metadata } from "next";
import { ProfileForms } from "@/components/profile/profile-forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Mon profil" };

export default async function AdminProfilePage() {
  const user = await requireUser({ role: "ADMIN" });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="mt-1 text-muted-foreground">Compte administrateur : vos informations et votre mot de passe.</p>
      </div>
      <ProfileForms user={user} />
    </div>
  );
}
