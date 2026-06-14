"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/server/actions/auth";
import type { Session } from "next-auth";

export function UserMenu({
  user,
  collapsed = false,
}: {
  user: Session["user"];
  collapsed?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const role = (user as { role?: string })?.role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          collapsed
            ? "size-10 rounded-md hover:bg-accent transition-colors grid place-items-center mx-auto"
            : "w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent transition-colors text-left"
        }
        title={collapsed ? user?.name || user?.email || undefined : undefined}
      >
        <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <div className="flex-1 overflow-hidden">
            <div className="text-sm truncate">{user?.name || user?.email}</div>
            <div className="text-xs text-muted-foreground">
              {role === "ADMIN" ? "Administrator" : "Pracownik"}
            </div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm truncate">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOut className="mr-2 size-4" />
          Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
