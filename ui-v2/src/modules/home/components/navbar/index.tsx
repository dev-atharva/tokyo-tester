"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

export const Navbar = ({ userName, userEmail, userRole }: NavbarProps) => {
  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2.5 text-sidebar-foreground">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
      </div>
      <div className="flex items-center gap-4">
        <UserMenu
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
        />
      </div>
    </nav>
  );
};
