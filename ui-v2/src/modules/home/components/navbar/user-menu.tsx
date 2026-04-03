"use client";

import { IconLogout2, IconMoon2, IconSun } from "@tabler/icons-react";
import Avatar from "boring-avatars";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearUserScopedClientState } from "@/modules/auth/client-state";

interface UserMenuProps {
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
}

export const UserMenu = ({ userName, userEmail, userRole }: UserMenuProps) => {
  const { setTheme } = useTheme();

  const handleLogout = async () => {
    await clearUserScopedClientState();
    await signOut({ redirectTo: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-85 hover:scale-105 transition-all duration-150">
        <Avatar
          size={32}
          variant="marble"
          name={userEmail || userName || "Tokyo Tester"}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-56 p-1.5 border border-amber-700/20 dark:border-amber-300/12 bg-amber-50/95 dark:bg-stone-950/95 backdrop-blur-md shadow-lg dark:shadow-black/30"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
            <span className="truncate text-sm font-semibold leading-tight text-foreground">
              {userName || userEmail || "Signed In"}
            </span>
            {userEmail && (
              <span className="truncate text-[10px] font-normal uppercase tracking-[0.22em] text-muted-foreground">
                {userEmail}
              </span>
            )}
            {userRole && (
              <span className="mt-1 self-start rounded-full border border-amber-600/25 bg-amber-500/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/7 dark:text-amber-300/80">
                {userRole}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="bg-amber-700/12 dark:bg-amber-300/10 my-1" />

        {/* Appearance */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-sm rounded-md hover:bg-amber-500/10 dark:hover:bg-amber-300/8 focus:bg-amber-500/10 dark:focus:bg-amber-300/8 transition-colors cursor-pointer">
              <IconSun className="mr-2 h-3.5 w-3.5 opacity-60" />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="p-1.5 border border-amber-700/20 dark:border-amber-300/12 bg-amber-50/95 dark:bg-stone-950/95 backdrop-blur-md shadow-lg dark:shadow-black/30">
                <DropdownMenuItem
                  className="text-sm rounded-md hover:bg-amber-500/10 dark:hover:bg-amber-300/8 focus:bg-amber-500/10 cursor-pointer transition-colors"
                  onClick={() => setTheme("light")}
                >
                  <IconSun className="mr-2 h-3.5 w-3.5 opacity-60" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-sm rounded-md hover:bg-amber-500/10 dark:hover:bg-amber-300/8 focus:bg-amber-500/10 cursor-pointer transition-colors"
                  onClick={() => setTheme("dark")}
                >
                  <IconMoon2 className="mr-2 h-3.5 w-3.5 opacity-60" />
                  Dark
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="bg-amber-700/12 dark:bg-amber-300/10 my-1" />

        {/* Sign out */}
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="text-sm rounded-md text-muted-foreground hover:bg-red-500/10 dark:hover:bg-red-400/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 cursor-pointer transition-colors"
            onClick={handleLogout}
          >
            <IconLogout2 className="mr-2 h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
