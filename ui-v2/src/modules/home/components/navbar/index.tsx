"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./project-switcher";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

export const Navbar = ({ userName, userEmail, userRole }: NavbarProps) => {
  return (
    <nav className="sticky top-0 z-10 flex h-11 items-center justify-between border-b border-border/60 bg-background/95 backdrop-blur-sm px-3 gap-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" />
        <ProjectSwitcher />
      </div>
      <UserMenu userName={userName} userEmail={userEmail} userRole={userRole} />
    </nav>
  );
};
