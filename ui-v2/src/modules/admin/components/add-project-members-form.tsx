"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { addProjectMembersAction } from "@/modules/admin/actions";
import {
  addProjectMembersSchema,
  createZodResolver,
  type AddProjectMembersFormValues,
} from "@/modules/admin/forms";
import { INITIAL_ADMIN_ACTION_STATE } from "@/modules/admin/state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Form, FormField } from "@/components/ui/form";
import type { ProjectMemberUser } from "@/modules/projects/types";

export function AddProjectMembersForm({
  projectId,
  availableUsers,
}: {
  projectId: string;
  availableUsers: ProjectMemberUser[];
}) {
  const [state, formAction] = useActionState(
    addProjectMembersAction,
    INITIAL_ADMIN_ACTION_STATE,
  );
  const [isPending, startTransition] = useTransition();
  const form = useForm<AddProjectMembersFormValues>({
    resolver: createZodResolver(addProjectMembersSchema),
    defaultValues: {
      projectId,
      userIds: [],
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (state.success) {
      form.reset({
        projectId,
        userIds: [],
      });
    }
  }, [form, projectId, state.success]);

  useEffect(() => {
    form.setValue("projectId", projectId, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [form, projectId]);

  const onSubmit = form.handleSubmit((values) => {
    const formData = new FormData();
    formData.set("projectId", values.projectId);

    values.userIds.forEach((userId) => {
      formData.append("userIds", userId);
    });

    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-dashed border-amber-700/20 bg-amber-500/4 p-4 space-y-4 dark:border-amber-300/12 dark:bg-amber-300/4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-700/80 dark:text-amber-300/60">
          Add members
        </p>

        <FormField
          control={form.control}
          name="userIds"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend variant="label">Select users</FieldLegend>
              <FieldDescription>
                Choose one or more platform users to add to this project.
              </FieldDescription>
              <FieldGroup className="grid gap-2 sm:grid-cols-2">
                {availableUsers.map((user) => {
                  const checked = field.value.includes(user.id);

                  return (
                    <Field
                      key={user.id}
                      orientation="horizontal"
                      data-invalid={fieldState.invalid || undefined}
                      className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 transition-colors hover:border-amber-600/30 hover:bg-amber-500/6"
                    >
                      <Checkbox
                        checked={checked}
                        aria-invalid={fieldState.invalid}
                        onCheckedChange={(nextChecked) => {
                          if (nextChecked) {
                            field.onChange([...field.value, user.id]);
                            return;
                          }

                          field.onChange(
                            field.value.filter(
                              (selectedId) => selectedId !== user.id,
                            ),
                          );
                        }}
                      />
                      <FieldLabel className="min-w-0 font-normal">
                        <span className="block truncate text-sm">
                          {user.name || user.email}
                        </span>
                        {user.name ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        ) : null}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

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
          variant="secondary"
          size="sm"
          disabled={isPending}
          className="text-xs font-semibold"
        >
          {isPending ? "Adding members..." : "Add selected members"}
        </Button>
      </form>
    </Form>
  );
}
