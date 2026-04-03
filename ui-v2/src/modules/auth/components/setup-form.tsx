"use client";

import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { setupAction } from "@/modules/auth/actions";
import type { AuthActionState } from "@/modules/auth/types";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: AuthActionState = { error: null, redirectTo: null };

export function SetupForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(setupAction, INITIAL_STATE);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.redirectTo]);

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-6 py-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        {/* DISPLAY NAME */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Display Name
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id="name"
                  name="name"
                  placeholder="Admin User"
                  className="shadow-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ADMIN EMAIL */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Admin Email
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  className="shadow-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* PASSWORD + CONFIRM */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Initial Password
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="password"
                    name="password"
                    type="password"
                    placeholder="At least 8 characters"
                    className="shadow-sm"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Confirm Password
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Repeat password"
                    className="shadow-sm"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ERROR */}
        {state.error ? (
          <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive rounded-md">
            {state.error}
          </p>
        ) : null}

        <SubmitButton
          label="Create Admin Account"
          pendingLabel="Creating Account..."
        />
      </form>
    </Form>
  );
}
