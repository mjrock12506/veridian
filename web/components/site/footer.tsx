import { Github } from "lucide-react";

import { Logo } from "@/components/site/logo";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Workspace",
    links: [
      { label: "Risk dashboard", href: "/dashboard" },
      { label: "AI action center", href: "/actions" },
      { label: "Integrations", href: "/connections" },
      { label: "Impact & ROI", href: "/roi" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "AI copilot", href: "/copilot" },
      { label: "Customer segments", href: "/segments" },
      { label: "Demand forecast", href: "/forecast" },
      { label: "Score / connect your data", href: "/connect" },
    ],
  },
];

const REPO_URL = "https://github.com/mjrock12506/veridian";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60">
      <div className="container py-16">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Order intelligence that predicts which orders will go wrong — and acts on them —
              before the cost is locked in. Calibrated risk models, an agentic action workflow,
              and an LLM copilot.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              <Github className="size-4" /> View the source
            </a>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-border/60 pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>Veridian — order intelligence platform.</p>
          <p>Built on the public Olist Brazilian e-commerce dataset (2016–2018).</p>
        </div>
      </div>
    </footer>
  );
}
