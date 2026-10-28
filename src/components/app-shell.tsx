import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingCart, Package, Tags, Truck, Users, ClipboardList, ArrowLeftRight, Wallet, Receipt, BarChart3, Sparkles, Settings, LogOut, Store, ScrollText, Undo2, ClipboardCheck, FileClock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { signOut } from "@/lib/format";
import { Button } from "@/components/ui/button";

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

export function AppShell({ children }: { children: ReactNode }) {
  const state = useRouterState();
  const { user } = useSession();
  const path = state.location.pathname;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground no-print">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Wholesale ERP</div>
            <div className="text-[11px] text-sidebar-foreground/70">Inventory & Sales</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map((n) => {
            const active = path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2 text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={async () => {
              await signOut();
              window.location.href = "/auth";
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 pl-64 print:pl-0">
        <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
