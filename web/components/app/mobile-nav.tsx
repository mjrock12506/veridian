"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { SidebarNav } from "@/components/app/sidebar";
import { UserMenu } from "@/components/auth/user-menu";
import { GuestBadge } from "@/components/auth/guest-badge";

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="lg:hidden">
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <Link href="/">
          <Logo />
        </Link>
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur-xl">
          <SidebarNav onNavigate={() => setOpen(false)} />
          <GuestBadge />
          <UserMenu />
        </div>
      )}
    </div>
  );
}
