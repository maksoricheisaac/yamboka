import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PaymentView } from "@yamboka/shared";
import { PaymentTracker } from "@/components/credits/payment-tracker";
import { requireUser } from "@/lib/auth";
import { serverGetOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paiement" };

export default async function PaymentPage({ params }: PageProps<"/app/credits/paiement/[id]">) {
  await requireUser();
  const { id } = await params;
  const res = await serverGetOrNull<{ payment: PaymentView }>(`/payments/${id}`);
  if (!res) notFound();
  return <PaymentTracker initial={res.payment} />;
}
