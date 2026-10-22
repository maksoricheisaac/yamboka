import { redirect } from "next/navigation";

/** La racine de l'application privée mène à l'espace utilisateur (le contrôle d'accès s'y applique). */
export default function Home() {
  redirect("/app");
}
