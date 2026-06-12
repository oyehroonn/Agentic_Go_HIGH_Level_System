import { z } from "zod";
import { register } from "./registry.js";

/**
 * Conversation capabilities: reading is low-risk; SENDING is high-risk and
 * approval-gated because it reaches a real person. See §15.
 */

register({
  name: "get_conversations",
  description:
    "List recent conversations for the location, optionally filtered to a single contactId. Read-only.",
  risk: "low",
  inputSchema: z.object({
    contactId: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (input, ctx) => {
    const convos = await ctx.ghl.searchConversations(input);
    return {
      ok: true,
      summary: `Found ${convos.length} conversation(s).`,
      data: convos,
    };
  },
});

register({
  name: "get_messages",
  description: "Read the messages in a conversation by conversationId. Read-only.",
  risk: "low",
  inputSchema: z.object({ conversationId: z.string() }),
  handler: async (input, ctx) => {
    const messages = await ctx.ghl.getMessages(input.conversationId);
    return {
      ok: true,
      summary: `${messages.length} message(s) in conversation ${input.conversationId}.`,
      data: messages,
    };
  },
});

register({
  name: "send_message",
  description:
    "Send an SMS or Email to a contact. SENDS TO A REAL PERSON — high risk; the system will stage it for human approval rather than sending immediately. Draft the full message; do not claim it was sent.",
  risk: "high",
  inputSchema: z.object({
    contactId: z.string(),
    channel: z.enum(["SMS", "Email"]),
    body: z.string().min(1),
    subject: z.string().optional().describe("Required for Email; ignored for SMS."),
  }),
  handler: async (input, ctx) => {
    const res = await ctx.ghl.sendMessage(input);
    return {
      ok: true,
      summary: `Sent ${input.channel} to ${input.contactId}`,
      data: res,
    };
  },
});
