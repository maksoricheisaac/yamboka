import { Suspense } from "react";
import { ShellSkeleton, UserShell } from "@/components/shell/user-shell";

export default function UserLayout({ children }: LayoutProps<"/app">) {
  // La lecture de la session se fait dans la coque, derrière <Suspense> (exigence de Cache Components).
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <UserShell>{children}</UserShell>
    </Suspense>
  );
}
