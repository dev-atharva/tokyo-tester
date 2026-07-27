"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { friendlyName } from "../lib/architecture-view";

interface ServiceSelectorProps {
  id?: string;
  value?: string;
  services: string[];
  placeholder?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

export function ServiceSelector({
  id,
  value,
  services,
  placeholder = "Choose a service",
  onValueChange,
  disabled,
  invalid,
}: ServiceSelectorProps) {
  const items = services.map((service) => ({
    value: service,
    label: friendlyName(service),
  }));

  return (
    <Combobox
      items={items}
      value={items.find((item) => item.value === value) ?? null}
      onValueChange={(item) => {
        if (item && typeof item === "object" && "value" in item) {
          onValueChange(String(item.value));
        }
      }}
      itemToStringValue={(item) => item.label}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="w-full"
        showClear={false}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matching services.</ComboboxEmpty>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item}>
              <span>{item.label}</span>
              <span className="text-muted-foreground">{item.value}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
