export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell-bg relative min-h-screen overflow-hidden">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-[460px] section-reveal">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-background/74" />
    </div>
  );
}
