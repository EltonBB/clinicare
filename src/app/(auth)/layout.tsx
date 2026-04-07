export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute left-[-8%] top-[12%] size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[10%] right-[-6%] size-72 rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute inset-x-0 top-[8%] mx-auto h-48 w-[72%] rounded-full bg-[radial-gradient(circle,rgba(92,143,212,0.12),transparent_72%)] blur-3xl" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-[460px] section-reveal">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-background/70" />
    </div>
  );
}
