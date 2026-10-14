"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Mesmo formato de `ActionState` (src/lib/errors.ts), repetido aqui por ser código de cliente. */
export type FormState = {
  ok?: boolean;
  error?: string;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<FormState>({});

export function useFormState() {
  return useContext(FormStateContext);
}

export function useFieldError(name: string | undefined): string | undefined {
  const state = useContext(FormStateContext);
  return name ? state.fieldErrors?.[name]?.[0] : undefined;
}

/**
 * Formulário ligado a uma Server Action.
 * - Mostra erros gerais e por campo; mantém o que foi digitado em caso de erro.
 * - `confirm`: pede confirmação antes de enviar (operações sensíveis).
 * - `resetOnSuccess`: limpa o formulário após sucesso.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = "primary",
  confirm,
  resetOnSuccess = false,
  className,
  fullWidthSubmit = false,
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel: string;
  submitVariant?: ButtonProps["variant"];
  confirm?: string;
  resetOnSuccess?: boolean;
  className?: string;
  fullWidthSubmit?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Campos visíveis no envio: erros de campos ocultos aparecem no alerta geral.
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const hiddenFieldErrors = Object.entries(state.fieldErrors ?? {})
    .filter(([name]) => !visibleFields.has(name))
    .map(([, messages]) => messages[0]);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext.Provider value={state}>
      <form
        ref={formRef}
        noValidate
        className={cn("space-y-4", className)}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          const form = event.currentTarget;
          setVisibleFields(
            new Set(
              Array.from(form.elements)
                .filter((el) => (el as HTMLInputElement).type !== "hidden")
                .map((el) => (el as HTMLInputElement).name)
                .filter(Boolean),
            ),
          );
          const formData = new FormData(form);
          startTransition(() => dispatch(formData));
        }}
      >
        {state.error && (
          <Alert tone={state.code === "DUPLICATE_SUSPECTED" ? "warning" : "error"}>
            {state.error}
            {hiddenFieldErrors.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {hiddenFieldErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
        {children}
        <Button type="submit" variant={submitVariant} loading={pending} className={cn(fullWidthSubmit && "w-full")}>
          {submitLabel}
        </Button>
      </form>
    </FormStateContext.Provider>
  );
}

/** Caixa de confirmação que só aparece quando o servidor suspeita de pagamento duplicado. */
export function DuplicateAck() {
  const state = useFormState();
  if (state.code !== "DUPLICATE_SUSPECTED") return null;
  return (
    <label className="bg-warning-bg text-warning flex items-start gap-2.5 rounded-xl border border-amber-200 p-3 text-sm">
      <input type="checkbox" name="acknowledgeDuplicate" className="accent-brand-600 mt-0.5 size-4" />
      <span>Conferi e confirmo que este NÃO é um pagamento duplicado.</span>
    </label>
  );
}
