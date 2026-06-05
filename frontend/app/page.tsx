import Link from "next/link";

const MODULES: { n: number; name: string; status: "planned" | "scaffolded" }[] = [
  { n: 1, name: "Authentication & Roles", status: "scaffolded" },
  { n: 2, name: "Dashboard", status: "scaffolded" },
  { n: 3, name: "Project Management", status: "scaffolded" },
  { n: 4, name: "Goal Tracking", status: "scaffolded" },
  { n: 5, name: "Guest Post Tracker", status: "scaffolded" },
  { n: 6, name: "Website Database", status: "scaffolded" },
  { n: 7, name: "Payment Management", status: "planned" },
  { n: 8, name: "Task Management", status: "planned" },
  { n: 9, name: "Notifications", status: "planned" },
  { n: 10, name: "Reports & Exports", status: "planned" },
  { n: 11, name: "Activity Logs", status: "scaffolded" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Digital Leap
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Guest Post Operations Management System
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A professional platform to plan, track, and report on guest-posting
          operations — replacing spreadsheets and manual tracking. This is the
          project scaffold; modules are built one step at a time.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
          <a
            href="http://localhost:8000/docs"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            API docs
          </a>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Modules</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m.n}
              className="rounded-lg border border-border bg-card p-4 text-card-foreground"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Module {m.n}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                  {m.status}
                </span>
              </div>
              <p className="mt-2 font-medium">{m.name}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
