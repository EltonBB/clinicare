export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell-bg relative min-h-screen overflow-hidden">
      <div className="absolute left-[-10%] top-[10%] size-80 rounded-full bg-[rgba(150,118,247,0.16)] blur-3xl" />
      <div className="absolute bottom-[8%] right-[-8%] size-80 rounded-full bg-[rgba(109,195,213,0.16)] blur-3xl" />
      <div className="absolute inset-x-0 top-[7%] mx-auto h-48 w-[72%] rounded-full bg-[radial-gradient(circle,rgba(150,118,247,0.1),rgba(109,195,213,0.08),transparent_72%)] blur-3xl" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-[460px] section-reveal">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-background/74" />
    </div>
  );
}
