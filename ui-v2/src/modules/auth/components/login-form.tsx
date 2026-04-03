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
import { loginAction } from "@/modules/auth/actions";
import type { AuthActionState } from "@/modules/auth/types";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: AuthActionState = { error: null, redirectTo: null };

export function LoginForm({
  redirectTo,
  initialEmail,
  setupMessage,
}: {
  redirectTo: string;
  initialEmail?: string;
  setupMessage?: string | null;
}) {
  const [state, formAction] = useActionState(loginAction, INITIAL_STATE);

  const form = useForm({
    defaultValues: {
      email: initialEmail || "",
      password: "",
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

        {setupMessage ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {setupMessage}
          </p>
        ) : null}

        {/* EMAIL */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Email
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

        {/* PASSWORD */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Password
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  className="shadow-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ERROR */}
        {state.error ? (
          <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive rounded-md">
            {state.error}
          </p>
        ) : null}

        <SubmitButton label="Sign In" pendingLabel="Signing In..." />
      </form>
    </Form>
  );
}
