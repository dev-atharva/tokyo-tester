"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { createUserAdminAction } from "@/modules/admin/actions";
import {
  createUserSchema,
  createZodResolver,
  type CreateUserFormValues,
} from "@/modules/admin/forms";
import { INITIAL_ADMIN_ACTION_STATE } from "@/modules/admin/state";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateUserForm() {
  const [state, formAction] = useActionState(
    createUserAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateUserFormValues>({
    resolver: createZodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "normal",
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (state.success) {
      form.reset();
    }
  }, [form, state.success]);

  const onSubmit = form.handleSubmit((values) => {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("role", values.role);

    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="admin-user-name">Display name</FieldLabel>
                <Input
                  {...field}
                  id="admin-user-name"
                  placeholder="Display name"
                  aria-invalid={fieldState.invalid}
                  className="shadow-sm"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="admin-user-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="admin-user-email"
                  type="email"
                  placeholder="name@example.com"
                  aria-invalid={fieldState.invalid}
                  className="shadow-sm"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="admin-user-password">
                  Initial password
                </FieldLabel>
                <Input
                  {...field}
                  id="admin-user-password"
                  type="password"
                  placeholder="At least 8 characters"
                  aria-invalid={fieldState.invalid}
                  className="shadow-sm"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="admin-user-role">Role</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="admin-user-role"
                    aria-invalid={fieldState.invalid}
                    className="shadow-sm w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>

        {state.error ? (
          <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md border border-emerald-600/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            {state.success}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {isPending ? "Adding user..." : "Add user"}
        </Button>
      </form>
    </Form>
  );
}
