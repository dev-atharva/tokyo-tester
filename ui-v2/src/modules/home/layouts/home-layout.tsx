"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import React from "react";
import { HomeSidebar } from "../components/sidebar";
import { Navbar } from "../components/navbar";

interface HomeLayoutProps {
  children: React.ReactNode;
}

export const HomeLayout = ({ children }: HomeLayoutProps) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-screen overflow-hidden">
        <HomeSidebar />
        <main className="flex flex-col flex-1 overflow-hidden">
          <Navbar />
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
};
