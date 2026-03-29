"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useRegistrySecretStore } from "../stores/registry-secret-store";

interface Props {
  serviceId: string;
}

interface RegistryFormData {
  enabled: boolean;
  url?: string;
  auth_type?: "basic" | "token";
  username?: string;
  password?: string;
  token?: string;
}

export const RegistryConfigForm: React.FC<Props> = ({ serviceId }) => {
  const { getSecret, setSecret, clearSecret } = useRegistrySecretStore();

  const existing = getSecret(serviceId);

  const form = useForm<RegistryFormData>({
    defaultValues: {
      enabled: !!existing,
      ...existing,
    },
  });

  const { watch, control, register } = form;
  const enabled = watch("enabled");
  const authType = watch("auth_type");

  useEffect(() => {
    const sub = watch((value) => {
      if (!value.enabled) {
        clearSecret(serviceId);
        return;
      }

      setSecret(serviceId, {
        url: value.url,
        auth_type: value.auth_type,
        username: value.username,
        password: value.password,
        token: value.token,
      });
    });

    return () => sub.unsubscribe();
  }, [watch, serviceId, setSecret, clearSecret]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label>Use Private Registry</Label>
      </div>

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          Enable this to configure private registry access.
        </p>
      )}

      {enabled && (
        <>
          <Separator />

          <div className="space-y-3">
            <div>
              <Label>Registry URL</Label>
              <Input
                {...register("url")}
                placeholder="ghcr.io / private.registry.com"
              />
            </div>

            <div>
              <Label>Auth Type</Label>
              <Controller
                control={control}
                name="auth_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">
                        Basic (Username/Password)
                      </SelectItem>
                      <SelectItem value="token">Token</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {authType === "basic" && (
              <>
                <Input {...register("username")} placeholder="Username" />
                <Input
                  type="password"
                  {...register("password")}
                  placeholder="Password"
                />
              </>
            )}

            {authType === "token" && (
              <Input
                type="password"
                {...register("token")}
                placeholder="Access Token"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
