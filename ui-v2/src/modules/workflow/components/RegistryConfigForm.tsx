"use client";

import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRegistrySecretStore } from "../stores/registry-secret-store";

interface Props {
  serviceId: string;
}

interface RegistryFormData {
  enabled: boolean;
  url?: string;
  auth_type: "basic" | "token";
  username?: string;
  password?: string;
  token?: string;
}

export const RegistryConfigForm: React.FC<Props> = ({ serviceId }) => {
  const { getSecret, setSecret, clearSecret } = useRegistrySecretStore();
  const [showCredential, setShowCredential] = useState(false);
  const existing = getSecret(serviceId);
  const form = useForm<RegistryFormData>({
    defaultValues: {
      enabled: Boolean(existing),
      auth_type: existing?.auth_type ?? "basic",
      ...existing,
    },
    mode: "onBlur",
  });

  const { watch, control, register } = form;
  const enabled = watch("enabled");
  const authType = watch("auth_type");
  const url = watch("url") ?? "";
  const username = watch("username") ?? "";
  const password = watch("password") ?? "";
  const token = watch("token") ?? "";

  useEffect(() => {
    const sub = watch((value) => {
      if (!value.enabled) {
        clearSecret(serviceId);
        return;
      }
      setSecret(serviceId, {
        url: value.url,
        auth_type: value.auth_type ?? "basic",
        username: value.username,
        password: value.password,
        token: value.token,
      });
    });
    return () => sub.unsubscribe();
  }, [watch, serviceId, setSecret, clearSecret]);

  return (
    <FieldGroup className="max-w-2xl py-4">
      <Field orientation="horizontal">
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Checkbox
              id="private-registry-enabled"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <FieldContent>
          <FieldTitle>Use a private container registry</FieldTitle>
          <FieldDescription>
            Leave this off for public images. Credentials stay in local secret
            storage and are not exported with the workflow.
          </FieldDescription>
        </FieldContent>
      </Field>

      {enabled ? (
        <>
          <Field data-invalid={!url.trim() || undefined}>
            <FieldLabel htmlFor="registry-url">Registry address</FieldLabel>
            <Input
              id="registry-url"
              {...register("url")}
              type="url"
              placeholder="https://ghcr.io"
              aria-invalid={!url.trim()}
            />
            <FieldDescription>
              Include the protocol when your registry requires it.
            </FieldDescription>
            {!url.trim() ? (
              <FieldError>
                Enter the registry address used by this image.
              </FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>Authentication method</FieldLabel>
            <Controller
              control={control}
              name="auth_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="basic">
                        Username and password
                      </SelectItem>
                      <SelectItem value="token">Access token</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {authType === "basic" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!username.trim() || undefined}>
                <FieldLabel htmlFor="registry-username">Username</FieldLabel>
                <Input
                  id="registry-username"
                  {...register("username")}
                  autoComplete="username"
                  aria-invalid={!username.trim()}
                />
                {!username.trim() ? (
                  <FieldError>Enter the registry username.</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={!password || undefined}>
                <FieldLabel htmlFor="registry-password">Password</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="registry-password"
                    type={showCredential ? "text" : "password"}
                    {...register("password")}
                    autoComplete="current-password"
                    aria-invalid={!password}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title={showCredential ? "Hide password" : "Show password"}
                    onClick={() => setShowCredential((current) => !current)}
                  >
                    {showCredential ? <IconEyeOff /> : <IconEye />}
                  </Button>
                </div>
                {!password ? (
                  <FieldError>Enter the registry password.</FieldError>
                ) : null}
              </Field>
            </div>
          ) : (
            <Field data-invalid={!token || undefined}>
              <FieldLabel htmlFor="registry-token">Access token</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="registry-token"
                  type={showCredential ? "text" : "password"}
                  {...register("token")}
                  autoComplete="off"
                  aria-invalid={!token}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  title={showCredential ? "Hide token" : "Show token"}
                  onClick={() => setShowCredential((current) => !current)}
                >
                  {showCredential ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
              {!token ? <FieldError>Enter an access token.</FieldError> : null}
            </Field>
          )}
        </>
      ) : null}
    </FieldGroup>
  );
};
