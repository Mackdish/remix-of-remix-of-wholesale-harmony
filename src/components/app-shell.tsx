import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingCart, Package, Tags, Truck, Users, ClipboardList, ArrowLeftRight, Wallet, Receipt, BarChart3, Settings, LogOut, Store, ScrollText, Undo2, ClipboardCheck, FileClock, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { signOut } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InstallAppButton } from "@/components/install-app-button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS / New Sale", icon: ShoppingCart },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/purchases", label: "Purchases", icon: ClipboardList },
  { to: "/products", label: "Products", icon: Package },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/stock", label: "Stock", icon: ArrowLeftRight },
  { to: "/stock-take", label: "Stock Take", icon: ClipboardCheck },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/reports-history", label: "Report History", icon: FileClock },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavigationLinks({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
      {nav.map((n) => {
        const active = path === n.to || path.startsWith(n.to + "/");
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <n.icon className="h-4 w-4 shrink-0" />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ email }: { email?: string }) {
  return (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <InstallAppButton className="mb-2 w-full justify-start bg-transparent text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
      <div className="mb-2 px-2 text-xs text-sidebar-foreground/70 truncate">{email}</div>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-10 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={async () => {
          await signOut();
          window.location.href = "/auth";
        }}
      >
        <LogOut className="h-4 w-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Store className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold tracking-tight">Wholesale ERP</div>
        <div className="text-[11px] text-sidebar-foreground/70">Inventory &amp; Sales</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const state = useRouterState();
  const { user } = useSession();
  const path = state.location.pathname;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen min-w-0 bg-background md:flex">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Brand />
        <NavigationLinks path={path} />
        <SidebarFooter email={user?.email} />
      </aside>

      <div className="min-w-0 flex-1 md:pl-64">
        <header className="no-print sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Wholesale ERP</div>
              <div className="truncate text-xs text-muted-foreground">Inventory &amp; Sales</div>
            </div>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="no-print fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default bg-black/50"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] max-w-full flex-col bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="flex items-center justify-between border-b border-sidebar-border">
                <Brand />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mr-2 h-10 w-10 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <NavigationLinks path={path} onNavigate={() => setMobileNavOpen(false)} />
              <SidebarFooter email={user?.email} />
            </aside>
          </div>
        )}

        <main className="min-w-0">
          <div className="mx-auto w-full max-w-[1400px] min-w-0 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
