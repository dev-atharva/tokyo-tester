"use client";

import type React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Navbar } from "../components/navbar";
import { HomeSidebar } from "../components/sidebar";

interface HomeLayoutProps {
  children: React.ReactNode;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

export const HomeLayout = ({
  children,
  userName,
  userEmail,
  userRole,
}: HomeLayoutProps) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-screen overflow-hidden">
        <HomeSidebar />
        <main className="flex flex-col flex-1 overflow-hidden">
          <Navbar
            userName={userName}
            userEmail={userEmail}
            userRole={userRole}
          />
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
};
