import { Copy, Check } from "@phosphor-icons/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div>
          <h1 className="display-title">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

interface FilterMenuOption<T extends string> {
  label: string;
  value: T;
}

export function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  widthClassName,
}: {
  label: string;
  value: T;
  options: Array<FilterMenuOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  widthClassName?: string;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn("min-w-[140px]", widthClassName, className)}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder={label}>
            {selected ? `${label} · ${selected.label}` : label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[180px]">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60">
      <div className="flex items-start justify-between gap-4 border-b border-border/40 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 p-3.5">
      <p className="meta-label">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} />}
    </Button>
  );
}

export function StatusBadge({
  label,
  variant,
  className,
}: {
  label: string;
  variant: "success" | "error" | "warning" | "secondary";
  className?: string;
}) {
  return (
    <Badge variant={variant} className={cn("gap-1.5 capitalize", className)}>
      {label}
    </Badge>
  );
}
