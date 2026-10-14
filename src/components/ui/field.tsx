"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFieldError } from "@/components/forms/action-form";
import { cn } from "@/lib/cn";

const controlClass = cn(
  "border-line text-ink placeholder:text-muted/70 w-full rounded-xl border bg-white px-3.5 text-[0.95rem]",
  "focus:border-brand-500 focus:ring-brand-100 focus:ring-4 focus:outline-none",
  "disabled:bg-canvas disabled:text-muted",
);
const errorClass = "border-danger focus:border-danger focus:ring-danger-bg";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-soft text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, id, name, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const serverError = useFieldError(name);
  const message = error ?? serverError;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={message}>
      <input
        ref={ref}
        id={inputId}
        name={name}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(inputId, message, hint)}
        className={cn(controlClass, "h-11", message && errorClass, className)}
        {...props}
      />
    </FieldShell>
  );
});

export type MoneyFieldProps = Omit<FieldProps, "type" | "inputMode">;

/** Campo de valor em reais (aceita "1.234,56"). */
export function MoneyField(props: MoneyFieldProps) {
  return <Field inputMode="decimal" placeholder="0,00" autoComplete="off" {...props} />;
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, hint, options, placeholder, className, id, name, ...props }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const message = useFieldError(name);
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={message}>
      <select
        id={selectId}
        name={name}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(selectId, message, hint)}
        className={cn(controlClass, "h-11 pr-8", message && errorClass, className)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode };

export function TextareaField({ label, hint, className, id, name, rows = 4, ...props }: TextareaFieldProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const message = useFieldError(name);
  return (
    <FieldShell id={areaId} label={label} hint={hint} error={message}>
      <textarea
        id={areaId}
        name={name}
        rows={rows}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(areaId, message, hint)}
        className={cn(controlClass, "py-2.5 leading-relaxed", message && errorClass, className)}
        {...props}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  name,
  defaultChecked,
}: {
  label: ReactNode;
  hint?: ReactNode;
  name: string;
  defaultChecked?: boolean;
}) {
  const id = useId();
  const message = useFieldError(name);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
        <input
          id={id}
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="accent-brand-600 mt-0.5 size-4 shrink-0"
        />
        <span>
          <span className="font-semibold">{label}</span>
          {hint && <span className="text-muted block">{hint}</span>}
        </span>
      </label>
      {message && <p className="text-danger text-sm">{message}</p>}
    </div>
  );
}

export function FileField({
  label,
  hint,
  name,
  accept,
}: {
  label: string;
  hint?: ReactNode;
  name: string;
  accept?: string;
}) {
  const id = useId();
  const message = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={message}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        className="text-ink-soft file:bg-brand-50 file:text-brand-800 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:font-semibold"
      />
    </FieldShell>
  );
}
