export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-secondary/40 px-4 py-10">
      {children}
    </main>
  );
}
