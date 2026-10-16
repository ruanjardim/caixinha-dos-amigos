import { z } from "zod";
import { optionalText, requiredText } from "@/lib/validation";

export const caixinhaSchema = z.object({
  name: requiredText("o nome da caixinha", 80).pipe(z.string().min(3, "Use pelo menos 3 caracteres.")),
  description: optionalText(300),
});

export type CaixinhaInput = z.infer<typeof caixinhaSchema>;

