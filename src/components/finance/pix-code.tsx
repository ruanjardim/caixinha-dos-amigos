"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** QR Code + "copia e cola" do Pix. Na simulação, o aviso fica evidente antes do código. */
export function PixCode({ copyPaste, qr, simulation }: { copyPaste: string; qr: string | null; simulation: boolean }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyPaste);
    } catch {
      textRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-3">
      {simulation && (
        <p className="bg-warning-bg text-warning rounded-lg px-3 py-2 text-xs font-semibold">
          SIMULAÇÃO — este código não tem valor real e nenhum banco aceita pagá-lo.
        </p>
      )}
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem gerada no servidor (data URL)
        <img
          src={qr}
          alt="QR Code do Pix"
          width={220}
          height={220}
          className={`border-line mx-auto rounded-xl border bg-white p-2 ${simulation ? "opacity-60" : ""}`}
        />
      )}
      <label className="block text-xs font-semibold" htmlFor="pix-copia-e-cola">
        Pix copia e cola
      </label>
      <textarea
        id="pix-copia-e-cola"
        ref={textRef}
        readOnly
        rows={3}
        value={copyPaste}
        className="border-line bg-canvas w-full resize-none rounded-lg border p-2 font-mono text-[0.7rem] break-all"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button type="button" variant="secondary" size="sm" onClick={copy} className="w-full">
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Código copiado" : "Copiar código"}
      </Button>
    </div>
  );
}
