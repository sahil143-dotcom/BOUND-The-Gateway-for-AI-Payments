"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMetrics } from "@/lib/api";
import { railStatus } from "@/lib/copy";

const NAV = [
  { href: "/", label: "COMMAND CENTER", icon: IconCommand },
  { href: "/transactions", label: "TRANSACTIONS", icon: IconTransactions },
  { href: "/audit", label: "AUDIT", icon: IconAudit },
];

export function AppShell({
  children,
  current,
  flush,
}: {
  children: React.ReactNode;
  current: string;
  flush?: boolean;
}) {
  const [rail, setRail] = useState("RAZORPAY / TEST");

  useEffect(() => {
    getMetrics()
      .then((m) => setRail(railStatus(m.rail_name)))
      .catch(() => undefined);
  }, []);

  const [left, right] = splitStatus(rail);

  return (
    <div className="flex min-h-screen min-w-[1100px] flex-col bg-cream text-ink">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[18%] min-w-[220px] max-w-[260px] shrink-0 flex-col border-r border-ink">
          <div className="border-b border-ink px-5 pb-5 pt-6">
            <Link href="/" className="display block text-[44px] text-ink">
              BOUND
            </Link>
            <p className="mt-2 font-sans text-[11px] uppercase tracking-[0.12em] text-mute">
              Auth Layer v1.0
            </p>
          </div>

          <nav className="flex flex-1 flex-col pt-2" aria-label="Primary">
            {NAV.map((item) => {
              const on = current === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex items-center gap-3 px-5 py-3.5 font-sans text-[11px] font-medium uppercase tracking-[0.14em] ${
                    on ? "bg-cream-wash text-ink" : "text-ink"
                  }`}
                >
                  {on ? (
                    <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-poster" aria-hidden />
                  ) : null}
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
            <span
              className="relative flex cursor-default items-center gap-3 px-5 py-3.5 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-ink"
              title="Policies are not available in this build"
            >
              <IconPolicies />
              POLICIES
            </span>
          </nav>

          <div className="flex items-center gap-3 border-t border-ink px-5 py-4">
            <span className="grid h-8 w-8 place-items-center border border-ink" aria-hidden>
              <IconUser />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">UCP / CONNECTED</span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[48px] shrink-0 items-center justify-end border-b border-ink px-8">
            <div className="flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.12em]">
              <StatusMark left="UCP" right="CONNECTED" />
              <span className="h-4 w-px bg-ink" aria-hidden />
              <StatusMark left={left} right={right} />
            </div>
          </header>

          <main className={flush ? "min-h-0 flex-1 overflow-hidden" : "flex-1 overflow-auto px-8 py-8"}>
            {children}
          </main>
        </div>
      </div>

      <footer className="grid h-10 shrink-0 grid-cols-3 items-center bg-ink px-6 font-mono text-[10px] uppercase tracking-[0.14em]">
        <p className="text-poster">BOUND</p>
        <p className="text-center text-white">BOUND © 2024 AUTHORIZATION LAYER</p>
        <div className="flex items-center justify-end gap-8 text-white">
          <span className="underline decoration-white underline-offset-4">Documentation</span>
          <span className="underline decoration-white underline-offset-4">Support</span>
          <span className="underline decoration-white underline-offset-4">API Status</span>
        </div>
      </footer>
    </div>
  );
}

function splitStatus(value: string): [string, string] {
  const parts = value.split(" / ");
  return [parts[0] || "RAZORPAY", parts[1] || "TEST"];
}

function StatusMark({ left, right }: { left: string; right: string }) {
  return (
    <p className="border-b border-ink pb-0.5">
      <span className="text-ink">{left}</span>
      <span className="text-mute"> / {right}</span>
    </p>
  );
}

function IconCommand() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IconTransactions() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="4" width="18" height="14" />
      <path d="M3 9h18" />
    </svg>
  );
}

function IconAudit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function IconPolicies() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
    </svg>
  );
}
