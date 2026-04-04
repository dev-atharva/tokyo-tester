import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import { z } from "zod";

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(100, "Display name must be 100 characters or less."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be 128 characters or less."),
  role: z.enum(["normal", "admin"], {
    message: "Select a valid role.",
  }),
});

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(120, "Project name must be 120 characters or less."),
});

export const addProjectMembersSchema = z.object({
  projectId: z.string().min(1, "Project is required."),
  userIds: z.array(z.string().min(1)).min(1, "Select at least one user."),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type CreateProjectFormValues = z.infer<typeof createProjectSchema>;
export type AddProjectMembersFormValues = z.infer<
  typeof addProjectMembersSchema
>;

export function createZodResolver<TFieldValues extends FieldValues>(
  schema: z.ZodType<TFieldValues>,
): Resolver<TFieldValues> {
  return async (values) => {
    const parsed = schema.safeParse(values);

    if (parsed.success) {
      return {
        values: parsed.data,
        errors: {},
      };
    }

    const errors = parsed.error.issues.reduce<Record<string, string>>(
      (accumulator, issue) => {
      const key = issue.path[0];

      if (typeof key !== "string" || accumulator[key]) {
        return accumulator;
      }

      accumulator[key] = issue.message;

      return accumulator;
    },
      {},
    );

    const fieldErrors = Object.entries(errors).reduce<FieldErrors<TFieldValues>>(
      (accumulator, [key, message]) => {
        accumulator[key as keyof TFieldValues] = {
          type: "zod",
          message,
        } as FieldErrors<TFieldValues>[keyof TFieldValues];

        return accumulator;
      },
      {},
    );

    return {
      values: {} as never,
      errors: fieldErrors,
    };
  };
}
