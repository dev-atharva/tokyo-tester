"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";

export const Navbar = () => {
  return (
    <nav className="p-2 flex items-center justify-between sticky z-10 border-b-2">
      <div className="flex flex-row gap-2 items-center">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-4">
        <UserMenu />
      </div>
    </nav>
  );
};
