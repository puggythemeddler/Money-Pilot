import { MoneyPilotLogo } from "@/components/Logo";


const features = [
  {
    title: "Expenses & income",
    description:
      "Record money in and money out in seconds, with categories, accounts and clear notes.",
  },
  {
    title: "Debt management",
    description:
      "Track loans, mobile-money credit and personal debts. See what you owe, when, and plan payoff.",
  },
  {
    title: "Rent & recurring bills",
    description: "Know every upcoming obligation — rent, electricity, water, school fees, subscriptions.",
  },
  {
    title: "Budgets you control",
    description: "Set monthly or custom budgets. See committed vs spent vs still available.",
  },
  {
    title: "A clear financial overview",
    description: "See account balances, monthly spending and outstanding debts from your actual records.",
  },
  {
    title: "A mobile-friendly web app",
    description: "Use MoneyPilot in your phone, tablet or desktop browser with one account.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <MoneyPilotLogo />
        <nav className="flex items-center gap-2" aria-label="Main">
          <a href="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold border border-line text-body hover:bg-surface-2">Log in</a>
          <a href="/register" className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold bg-primary-700 text-white hover:bg-primary-800">Get started</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm font-medium text-primary-800 dark:border-primary-900 dark:bg-primary-950/60 dark:text-primary-200">
            Built for Kenya · Kenyan Shillings first
          </p>
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-heading sm:text-5xl lg:text-6xl">
            Understand your money.
            <br />
            <span className="text-primary-600">Own your debt.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-body">
            MoneyPilot gives you one honest, calm picture of your finances — income, expenses, debts,
            bills and budgets — in your browser, on your phone or computer.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/register" className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold bg-primary-700 text-white hover:bg-primary-800">Create your account</a>
            <a href="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold border border-line text-body hover:bg-surface-2">Log in</a>
          </div>
          <p className="mt-6 text-sm text-muted">
            Free to start. No card required. Your data stays yours.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
              >
                <h2 className="text-base font-semibold text-heading">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-body">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-heading sm:text-3xl">
              A clear picture, even when it&apos;s uncomfortable
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-body">
              MoneyPilot was designed for people working through debt. No judgements, no hype — just
              accurate numbers, honest estimates, and tools to plan your way out.
            </p>
            <a href="/register" className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold bg-primary-700 text-white hover:bg-primary-800">Start with a free account</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-page">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <MoneyPilotLogo className="scale-95" />
          <p>MoneyPilot — built for Kenya, ready for the world.</p>
        </div>
      </footer>
    </div>
  );
}
