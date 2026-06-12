import { z } from "zod";
import { register } from "./registry.js";

/** Task + note capabilities. Both low-risk (internal records). See §15. */

register({
  name: "create_task",
  description:
    "Create a task on a contact (e.g. an onboarding checklist item or a follow-up reminder). Optionally set an ISO due date. Internal — runs immediately.",
  risk: "low",
  inputSchema: z.object({
    contactId: z.string(),
    title: z.string().min(1),
    body: z.string().optional(),
    dueDate: z.string().optional().describe("ISO 8601 due date/time."),
  }),
  handler: async (input, ctx) => {
    const task = await ctx.ghl.createTask(input);
    return { ok: true, summary: `Created task "${input.title}" on ${input.contactId}`, data: task };
  },
});

register({
  name: "create_note",
  description:
    "Add a note to a contact to capture context (e.g. why they were onboarded, a call summary). Internal — runs immediately.",
  risk: "low",
  inputSchema: z.object({
    contactId: z.string(),
    body: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    const note = await ctx.ghl.createNote(input);
    return { ok: true, summary: `Added note to ${input.contactId}`, data: note };
  },
});
