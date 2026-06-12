import { z } from "zod";
import { register } from "./registry.js";
import type { Contact } from "../ghl/types.js";

/** Contact capabilities. All low-risk (internal/reversible). See §15. */

function displayName(c: Contact): string {
  return c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id;
}

register({
  name: "search_contacts",
  description:
    "Search the location's contacts by a free-text query (name, email, or phone). Returns matching contacts with their ids. Use this to find a contact before acting on it.",
  risk: "low",
  inputSchema: z.object({
    query: z.string().describe("Name, email, or phone fragment to search for."),
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (input, ctx) => {
    const res = await ctx.ghl.searchContacts(input);
    const lines = res.contacts.map((c) => `${displayName(c)} <${c.email ?? "no-email"}> (${c.id})`);
    return {
      ok: true,
      summary: `Found ${res.contacts.length} contact(s)${lines.length ? `: ${lines.join("; ")}` : ""}`,
      data: res.contacts,
    };
  },
});

register({
  name: "get_contact",
  description: "Fetch a single contact by id, including its fields and tags.",
  risk: "low",
  inputSchema: z.object({ contactId: z.string() }),
  handler: async (input, ctx) => {
    const c = await ctx.ghl.getContact(input.contactId);
    return { ok: true, summary: `Contact ${displayName(c)} (${c.id})`, data: c };
  },
});

register({
  name: "create_contact",
  description:
    "Create a new contact in GHL. Reversible/internal — runs immediately. Use for onboarding a new client or lead.",
  risk: "low",
  inputSchema: z.object({
    firstName: z.string(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  handler: async (input, ctx) => {
    const contact = await ctx.ghl.createContact({ ...input, locationId: ctx.locationId });
    return { ok: true, summary: `Created contact ${input.firstName} (${contact.id})`, data: contact };
  },
});

register({
  name: "update_contact",
  description: "Update fields (name/email/phone) on an existing contact by id.",
  risk: "low",
  inputSchema: z.object({
    contactId: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const { contactId, ...fields } = input;
    const contact = await ctx.ghl.updateContact(contactId, fields);
    return { ok: true, summary: `Updated contact ${displayName(contact)} (${contact.id})`, data: contact };
  },
});

register({
  name: "add_tags",
  description: "Add one or more tags to a contact. Useful for segmentation (e.g. new-client, coaching).",
  risk: "low",
  inputSchema: z.object({
    contactId: z.string(),
    tags: z.array(z.string()).min(1),
  }),
  handler: async (input, ctx) => {
    const tags = await ctx.ghl.addTags(input.contactId, input.tags);
    return {
      ok: true,
      summary: `Added tags [${input.tags.join(", ")}] to ${input.contactId}`,
      data: tags,
    };
  },
});
