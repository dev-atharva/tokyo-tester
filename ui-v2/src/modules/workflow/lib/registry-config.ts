export type RegistryAuthType = "none" | "basic" | "token";

export interface RegistryRuntimeConfig {
  url: string;
  auth_type: RegistryAuthType;
  username?: string;
  password?: string;
  token?: string;
}

export interface RegistryFormValue {
  enabled: boolean;
  url: string;
  auth_type: RegistryAuthType;
  username: string;
  password: string;
  token: string;
}

export const EMPTY_REGISTRY_FORM: RegistryFormValue = {
  enabled: false,
  url: "",
  auth_type: "basic",
  username: "",
  password: "",
  token: "",
};

export function registryFormFromConfig(
  config?: RegistryRuntimeConfig,
): RegistryFormValue {
  if (!config) return { ...EMPTY_REGISTRY_FORM };
  return {
    enabled: true,
    url: config.url,
    auth_type: config.auth_type,
    username: config.username ?? "",
    password: config.password ?? "",
    token: config.token ?? "",
  };
}

export function normalizeRegistryHost(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("Enter the registry host.");
  if (input.includes("://")) {
    throw new Error("Enter a host only, without http:// or https://.");
  }
  if (/[/?#@]/.test(input)) {
    throw new Error("The registry field cannot contain a path or credentials.");
  }

  const bracketed = input.match(/^(\[[0-9a-fA-F:]+\]):(\d+)$/);
  if (input.startsWith("[") && !bracketed) {
    throw new Error("Enter a valid bracketed IPv6 registry host.");
  }

  let host = bracketed?.[1] ?? input;
  let port = bracketed?.[2];
  if (!bracketed) {
    if ((input.match(/:/g) ?? []).length > 1) {
      throw new Error("Bracket IPv6 addresses before adding a port.");
    }
    const separator = input.lastIndexOf(":");
    if (separator >= 0) {
      host = input.slice(0, separator);
      port = input.slice(separator + 1);
    }
    const validHost =
      host === "localhost" ||
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(
        host,
      );
    if (!validHost) throw new Error("Enter a valid registry host.");
  }

  if (port !== undefined) {
    const number = Number(port);
    if (!/^\d+$/.test(port) || number < 1 || number > 65535) {
      throw new Error("Registry port must be between 1 and 65535.");
    }
  }
  return `${host.toLowerCase()}${port ? `:${port}` : ""}`;
}

function hasExplicitRegistry(image: string): boolean {
  const first = image.split("/", 1)[0] ?? "";
  return (
    first === "localhost" ||
    first.includes(".") ||
    first.includes(":") ||
    first.startsWith("[")
  );
}

export function resolveRegistryImage(registry: string, image: string): string {
  const host = normalizeRegistryHost(registry);
  const repository = image.trim().replace(/^\/+/, "");
  if (!repository) throw new Error("Enter a container image.");
  if (repository.includes("://")) {
    throw new Error("Container images cannot include a URL scheme.");
  }
  if (!hasExplicitRegistry(repository)) return `${host}/${repository}`;

  const imageHost = normalizeRegistryHost(repository.split("/", 1)[0] ?? "");
  if (imageHost !== host) {
    throw new Error(
      `The image uses ${imageHost}, but this service is configured for ${host}.`,
    );
  }
  return repository;
}

export function validateRegistryForm(
  value: RegistryFormValue,
): { field: string; message: string } | null {
  if (!value.enabled) return null;
  try {
    normalizeRegistryHost(value.url);
  } catch (error) {
    return {
      field: "registry-url",
      message:
        error instanceof Error ? error.message : "Invalid registry host.",
    };
  }
  if (value.auth_type === "basic" && !value.username.trim()) {
    return {
      field: "registry-username",
      message: "Enter the registry username.",
    };
  }
  if (value.auth_type === "basic" && !value.password) {
    return {
      field: "registry-password",
      message: "Enter a password or pull token.",
    };
  }
  if (value.auth_type === "token" && !value.token) {
    return {
      field: "registry-token",
      message: "Enter the Docker registry identity token.",
    };
  }
  return null;
}

export function registryConfigFromForm(
  value: RegistryFormValue,
): RegistryRuntimeConfig | undefined {
  if (!value.enabled) return undefined;
  const url = normalizeRegistryHost(value.url);
  if (value.auth_type === "none") return { url, auth_type: "none" };
  if (value.auth_type === "token") {
    return { url, auth_type: "token", token: value.token };
  }
  return {
    url,
    auth_type: "basic",
    username: value.username.trim(),
    password: value.password,
  };
}
