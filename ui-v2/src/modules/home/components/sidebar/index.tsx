"use client";

import {
  IconChevronDown,
  IconFolders,
  IconTopologyRing2,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { TokyoTesterBrand } from "@/components/branding/tokyo-tester-brand";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  subItem?: MenuItem[];
}

interface MenuItemRenderProps {
  items: MenuItem[];
  isSubItem?: boolean;
}

const MenuItemRender = ({ items, isSubItem }: MenuItemRenderProps) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigation = (url: string) => {
    const queryParams = new URLSearchParams();
    const [pathOnly, existingQuery] = url.split("?");
    if (existingQuery) {
      const existingParams = new URLSearchParams(existingQuery);
      existingParams.forEach((value, key) => {
        queryParams.append(key, value);
      });
    }
    const finalUrlWithParams = `${pathOnly}?${queryParams.toString()}`;
    router.push(finalUrlWithParams);
  };

  return items.map((item) => {
    const isActive = pathname === item.url;
    const hasActiveChild = item.subItem?.some(
      (subitem) => pathname === subitem.url,
    );

    return (
      <SidebarMenu key={item.url}>
        <Collapsible className="group/collapsible" defaultOpen={hasActiveChild}>
          <SidebarMenuItem className="w-full">
            {item.subItem ? (
              <CollapsibleTrigger
                className="w-full"
                render={
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={cn(
                      "flex items-center justify-between w-full px-4 py-2 text-left cursor-pointer ",
                      isSubItem ? "text-xs" : "text-sm",
                      isActive
                        ? "font-semibold bg-primary dark:bg-secondary text-primary-foreground dark:text-secondary-foreground rounded"
                        : "hover:bg-muted hover:rounded",
                    )}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {item.icon && (
                        <item.icon
                          height={isSubItem ? 14 : 16}
                          width={isSubItem ? 14 : 16}
                          className="shrink-0"
                        />
                      )}
                      <span className="flex-1">{item.title}</span>
                      <IconChevronDown className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                    </div>
                  </SidebarMenuButton>
                }
              />
            ) : (
              <SidebarMenuButton
                tooltip={item.title}
                className={cn(
                  "flex items-center gap-2 w-full px-4 py-2 text-left no-underline cursor-pointer",
                  isSubItem ? "text-xs" : "text-sm",
                  isActive
                    ? "font-semibold bg-primary dark:bg-secondary text-primary-foreground dark:text-secondary-foreground rounded"
                    : "hover:bg-muted hover:rounded",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation(item.url);
                }}
              >
                {item.icon && (
                  <item.icon
                    height={isSubItem ? 14 : 16}
                    width={isSubItem ? 14 : 16}
                    className="shrink-0"
                  />
                )}
                <span className="flex-1">{item.title}</span>
              </SidebarMenuButton>
            )}

            {item.subItem && (
              <CollapsibleContent className="pl-6">
                <SidebarMenuSub>
                  <MenuItemRender items={item.subItem} isSubItem={true} />
                </SidebarMenuSub>
              </CollapsibleContent>
            )}
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    );
  });
};

export const HomeSidebar = ({ userRole }: { userRole: string | null }) => {
  const items: MenuItem[] = [
    {
      title: "Workflows",
      url: "/workflow",
      icon: IconTopologyRing2,
    },
  ];

  if (userRole === "admin") {
    items.push(
      {
        title: "Projects",
        url: "/admin/projects",
        icon: IconFolders,
      },
      {
        title: "Users",
        url: "/admin/users",
        icon: IconUsers,
      },
    );
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link className="flex items-center" href="/">
              <TokyoTesterBrand />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="p-2">
          <MenuItemRender items={items} />
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenuItem></SidebarMenuItem>
      </SidebarFooter>
    </Sidebar>
  );
};
