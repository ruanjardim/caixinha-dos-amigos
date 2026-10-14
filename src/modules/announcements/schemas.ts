import { z } from "zod";
import { checkboxField, idField, requiredText } from "@/lib/validation";

export const announcementSchema = z.object({
  title: requiredText("o título", 120).refine((v) => v.length >= 3, "Título muito curto."),
  body: requiredText("o texto do comunicado", 5000),
  cycleId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  publishNow: checkboxField,
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const announcementIdSchema = z.object({ id: idField });
