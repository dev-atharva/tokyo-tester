"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { createProjectAdminAction } from "@/modules/admin/actions";
import {
  createProjectSchema,
  createZodResolver,
  type CreateProjectFormValues,
} from "@/modules/admin/forms";
import { INITIAL_ADMIN_ACTION_STATE } from "@/modules/admin/state";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function CreateProjectForm() {
  const [state, formAction] = useActionState(
    createProjectAdminAction,
    INITIAL_ADMIN_ACTION_STATE,
  );
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateProjectFormValues>({
    resolver: createZodResolver(createProjectSchema),
    defaultValues: {
      name: "",
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
                <FieldLabel htmlFor="admin-project-name">
                  Project name
                </FieldLabel>
                <Input
                  {...field}
                  id="admin-project-name"
                  placeholder="e.g. Payments staging"
                  aria-invalid={fieldState.invalid}
                  className="shadow-sm"
                />
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
          {isPending ? "Creating project..." : "Create project"}
        </Button>
      </form>
    </Form>
  );
}
