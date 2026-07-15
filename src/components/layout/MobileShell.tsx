export function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--canvas)] md:px-6 md:py-6">
      <section className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-clip bg-[var(--surface)] md:min-h-[850px] md:rounded-[32px] md:border md:border-[var(--border)] md:shadow-[0_24px_70px_rgba(25,24,21,0.08)]">
        {children}
      </section>
    </main>
  );
}
