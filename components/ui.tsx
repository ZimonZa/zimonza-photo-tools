"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------- Button ------------------------------- */

type ButtonVariant = "primary" | "outline" | "ghost";

export function Button({
  children,
  onClick,
  variant = "outline",
  type = "button",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-r from-accent to-accent2 text-accent-foreground shadow-glow hover:shadow-glow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none",
    outline:
      "glass hover:border-border-strong hover:bg-muted/60 active:scale-[0.98] disabled:opacity-50",
    ghost: "hover:bg-muted disabled:opacity-50",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------- Segmented control ------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex w-full rounded-xl border border-border bg-muted/60 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-all duration-200",
            value === opt.value
              ? "bg-card text-foreground shadow-card ring-1 ring-border-strong"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Number field --------------------------- */

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  min = 1,
}: {
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  suffix?: string;
  min?: number;
}) {
  return (
    <label className="block w-full">
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <span className="flex items-center rounded-xl border border-border bg-card/60 transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-glow">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Math.max(min, Number(e.target.value)))
          }
          className="w-full bg-transparent px-3 py-2 text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="px-3 text-xs font-medium text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  );
}

/* -------------------------------- Slider ------------------------------- */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-accent">
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{
          background: `linear-gradient(to right, hsl(var(--accent)) 0%, hsl(var(--accent-2)) ${pct}%, hsl(var(--muted)) ${pct}%, hsl(var(--muted)) 100%)`,
        }}
      />
    </div>
  );
}

/* -------------------------------- Toggle ------------------------------- */

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-all duration-300",
          checked
            ? "bg-gradient-to-r from-accent to-accent2 shadow-glow"
            : "bg-muted ring-1 ring-inset ring-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}

/* -------------------------------- Select ------------------------------- */

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-accent/60 focus:shadow-glow"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ----------------------------- Section label --------------------------- */

export function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="h-px w-3 bg-gradient-to-r from-accent to-accent2" />
        {title}
      </p>
      {children}
    </div>
  );
}
