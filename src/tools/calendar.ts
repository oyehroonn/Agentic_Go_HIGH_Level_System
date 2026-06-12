import { z } from "zod";
import { register } from "./registry.js";

/**
 * Calendar capabilities: reading free slots is low-risk; booking an appointment
 * is high-risk and approval-gated (it commits time on a real calendar). See §15.
 */

register({
  name: "get_calendar_slots",
  description:
    "Get available free slots for a calendar within a date range. Provide a calendarId and an ISO date range; timezone is optional (defaults to the calendar's). Read-only.",
  risk: "low",
  inputSchema: z.object({
    calendarId: z.string(),
    startDate: z.string().describe("ISO date or datetime for the start of the window."),
    endDate: z.string().describe("ISO date or datetime for the end of the window."),
    timezone: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const start = Date.parse(input.startDate);
    const end = Date.parse(input.endDate);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return { ok: false, summary: "startDate/endDate must be parseable ISO dates." };
    }
    const slots = await ctx.ghl.getFreeSlots({
      calendarId: input.calendarId,
      startDate: start,
      endDate: end,
      timezone: input.timezone,
    });
    return { ok: true, summary: `Fetched free slots for calendar ${input.calendarId}.`, data: slots };
  },
});

register({
  name: "book_appointment",
  description:
    "Book an appointment for a contact on a calendar at a specific start time. HIGH RISK — commits time on a real calendar; the system will stage it for human approval. Pick a slot from get_calendar_slots.",
  risk: "high",
  inputSchema: z.object({
    calendarId: z.string(),
    contactId: z.string(),
    startTime: z.string().describe("ISO 8601 start time, e.g. 2026-06-15T15:00:00-05:00"),
    endTime: z.string().optional(),
    title: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const appt = await ctx.ghl.createAppointment(input);
    return {
      ok: true,
      summary: `Booked appointment for ${input.contactId} at ${input.startTime}`,
      data: appt,
    };
  },
});
