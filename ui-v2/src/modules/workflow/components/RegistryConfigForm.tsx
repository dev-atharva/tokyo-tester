"use client";

import { IconEye, IconEyeOff, IconShieldLock } from "@tabler/icons-react";
import { useMemo, useState } from "react";
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
import {
  type RegistryAuthType,
  type RegistryFormValue,
  resolveRegistryImage,
  validateRegistryForm,
} from "../lib/registry-config";

interface Props {
  serviceId: string;
  image?: string;
  value: RegistryFormValue;
  onChange: (value: RegistryFormValue) => void;
}

export const RegistryConfigForm: React.FC<Props> = ({
  serviceId,
  image,
  value,
  onChange,
}) => {
  const [showCredential, setShowCredential] = useState(false);
  const validation = validateRegistryForm(value);
  const resolvedImage = useMemo(() => {
    if (!value.enabled || !value.url.trim() || !image?.trim()) return null;
    try {
      return { value: resolveRegistryImage(value.url, image) };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to resolve image.",
      };
    }
  }, [image, value.enabled, value.url]);
  const fieldId = (name: string) => `${name}-${serviceId}`;
  const update = (change: Partial<RegistryFormValue>) =>
    onChange({ ...value, ...change });
  const changeAuthType = (authType: RegistryAuthType) =>
    update({
      auth_type: authType,
      username: authType === "basic" ? value.username : "",
      password: authType === "basic" ? value.password : "",
      token: authType === "token" ? value.token : "",
    });

  return (
    <FieldGroup className="max-w-2xl py-4">
      <Field orientation="horizontal">
        <Checkbox
          id={fieldId("private-registry-enabled")}
          checked={value.enabled}
          onCheckedChange={(checked) => update({ enabled: checked === true })}
        />
        <FieldContent>
          <FieldTitle>Use a custom container registry</FieldTitle>
          <FieldDescription>
            Enable this for private registries or public images hosted outside
            Docker Hub.
          </FieldDescription>
        </FieldContent>
      </Field>

      {value.enabled ? (
        <>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
            <div className="flex gap-3">
              <IconShieldLock className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="space-y-1">
                <p className="font-medium">Credentials are session-only</p>
                <p className="text-muted-foreground">
                  The registry host and method are saved, but passwords and
                  tokens stay only in browser memory and must be entered again
                  after a reload. Prefer a short-lived, pull-only token.
                </p>
              </div>
            </div>
          </div>

          <Field
            data-invalid={validation?.field === "registry-url" || undefined}
          >
            <FieldLabel htmlFor="registry-url">Registry host</FieldLabel>
            <Input
              id="registry-url"
              value={value.url}
              onChange={(event) => update({ url: event.target.value })}
              type="text"
              placeholder="registry.example.com:5000"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={validation?.field === "registry-url"}
            />
            <FieldDescription>
              Host and optional port only—do not include a protocol, repository
              path, or username.
            </FieldDescription>
            {validation?.field === "registry-url" ? (
              <FieldError>{validation.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>Authentication method</FieldLabel>
            <Select
              value={value.auth_type}
              onValueChange={(next) => changeAuthType(next as RegistryAuthType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">No credentials</SelectItem>
                  <SelectItem value="basic">
                    Username and password / pull token
                  </SelectItem>
                  <SelectItem value="token">
                    Docker identity token (advanced)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {value.auth_type === "basic" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                data-invalid={
                  validation?.field === "registry-username" || undefined
                }
              >
                <FieldLabel htmlFor="registry-username">Username</FieldLabel>
                <Input
                  id="registry-username"
                  value={value.username}
                  onChange={(event) => update({ username: event.target.value })}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={validation?.field === "registry-username"}
                />
                {validation?.field === "registry-username" ? (
                  <FieldError>{validation.message}</FieldError>
                ) : null}
              </Field>
              <Field
                data-invalid={
                  validation?.field === "registry-password" || undefined
                }
              >
                <FieldLabel htmlFor="registry-password">
                  Password or pull token
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="registry-password"
                    type={showCredential ? "text" : "password"}
                    value={value.password}
                    onChange={(event) =>
                      update({ password: event.target.value })
                    }
                    autoComplete="new-password"
                    aria-invalid={validation?.field === "registry-password"}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title={
                      showCredential ? "Hide credential" : "Show credential"
                    }
                    aria-label={
                      showCredential ? "Hide credential" : "Show credential"
                    }
                    onClick={() => setShowCredential((current) => !current)}
                  >
                    {showCredential ? <IconEyeOff /> : <IconEye />}
                  </Button>
                </div>
                {validation?.field === "registry-password" ? (
                  <FieldError>{validation.message}</FieldError>
                ) : null}
              </Field>
            </div>
          ) : null}

          {value.auth_type === "token" ? (
            <Field
              data-invalid={validation?.field === "registry-token" || undefined}
            >
              <FieldLabel htmlFor="registry-token">
                Docker identity token
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="registry-token"
                  type={showCredential ? "text" : "password"}
                  value={value.token}
                  onChange={(event) => update({ token: event.target.value })}
                  autoComplete="off"
                  aria-invalid={validation?.field === "registry-token"}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  title={showCredential ? "Hide token" : "Show token"}
                  aria-label={showCredential ? "Hide token" : "Show token"}
                  onClick={() => setShowCredential((current) => !current)}
                >
                  {showCredential ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
              <FieldDescription>
                This is the identity token returned by a Docker registry auth
                service. GitHub or GitLab personal access tokens normally belong
                in the password field above.
              </FieldDescription>
              {validation?.field === "registry-token" ? (
                <FieldError>{validation.message}</FieldError>
              ) : null}
            </Field>
          ) : null}

          {resolvedImage ? (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium">Resolved image</p>
              {resolvedImage.value ? (
                <code className="mt-1 block break-all text-xs text-muted-foreground">
                  {resolvedImage.value}
                </code>
              ) : (
                <p className="mt-1 text-destructive">{resolvedImage.error}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Repository subfolders are supported. For example,
                team/platform/api:v1 is appended to the registry host as-is.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </FieldGroup>
  );
};
