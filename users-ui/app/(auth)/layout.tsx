export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span>SyncSchedule</div>
      {children}
    </main>
  );
}
