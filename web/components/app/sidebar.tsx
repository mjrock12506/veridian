"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LayoutDashboard, Zap, Workflow, Plug, MessagesSquare, SlidersHorizontal, Users, LineChart, Store, TrendingUp, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { UserMenu } from "@/components/auth/user-menu";
import { GuestBadge } from "@/components/auth/guest-badge";
import { cn } from "@/lib/utils";

export const NAV_ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Start here", href: "/start", icon: Compass },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI actions", href: "/actions", icon: Zap },
  { label: "Agentic workflow", href: "/agent", icon: Workflow },
  { label: "Integrations", href: "/connections", icon: Plug },
  { label: "Impact & ROI", href: "/roi", icon: TrendingUp },
  { label: "Customer segments", href: "/segments", icon: Users },
  { label: "Demand forecast", href: "/forecast", icon: LineChart },
  { label: "AI Copilot", href: "/copilot", icon: MessagesSquare },
  { label: "Score an order", href: "/score", icon: SlidersHorizontal },
  { label: "Connect store", href: "/connect", icon: Store },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <item.icon className={cn("size-[18px] transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card/30 px-4 py-6 lg:flex">
      <Link href="/" className="px-2">
        <Logo />
      </Link>
      <div className="mt-8 px-2">
        <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground/60">
          Workspace
        </p>
        <SidebarNav />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <GuestBadge />
        <UserMenu />
        <Link
          href="/"
          className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to site
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </aside>
  );
}
