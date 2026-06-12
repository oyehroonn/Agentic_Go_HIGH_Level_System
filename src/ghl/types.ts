import { z } from "zod";

/**
 * GHL (LeadConnector) API v2 domain types.
 *
 * These mirror the documented v2 shapes. Response schemas are intentionally
 * LENIENT (.passthrough(), most fields optional) so that minor doc/runtime
 * drift does not crash the client — we validate the fields we actually use and
 * keep the rest. Tighten these after Step 0 (`npm run check-ghl`) confirms the
 * exact shapes for your token/plan. See docs/BUILD_SPEC.md §6.
 */

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const ContactSchema = z
  .object({
    id: z.string(),
    locationId: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    tags: z.array(z.string()).optional(),
    dateAdded: z.string().optional(),
    dateUpdated: z.string().optional(),
  })
  .passthrough();
export type Contact = z.infer<typeof ContactSchema>;

export const ContactWrapSchema = z.object({ contact: ContactSchema }).passthrough();
export const ContactSearchResponseSchema = z
  .object({
    contacts: z.array(ContactSchema).default([]),
    total: z.number().optional(),
  })
  .passthrough();
export type ContactSearchResponse = z.infer<typeof ContactSearchResponseSchema>;

export const TagsResponseSchema = z
  .object({ tags: z.array(z.string()).optional() })
  .passthrough();

// ---------------------------------------------------------------------------
// Pipelines & Opportunities
// ---------------------------------------------------------------------------

export const PipelineStageSchema = z
  .object({ id: z.string(), name: z.string().optional() })
  .passthrough();

export const PipelineSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    stages: z.array(PipelineStageSchema).default([]),
  })
  .passthrough();
export type Pipeline = z.infer<typeof PipelineSchema>;

export const PipelinesResponseSchema = z
  .object({ pipelines: z.array(PipelineSchema).default([]) })
  .passthrough();

export const OpportunitySchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    pipelineId: z.string().optional(),
    pipelineStageId: z.string().optional(),
    status: z.string().optional(),
    monetaryValue: z.number().optional(),
    contactId: z.string().optional(),
    locationId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    lastStatusChangeAt: z.string().optional(),
    lastStageChangeAt: z.string().optional(),
    contact: ContactSchema.partial().optional(),
  })
  .passthrough();
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const OpportunityWrapSchema = z
  .object({ opportunity: OpportunitySchema })
  .passthrough();
export const OpportunitySearchResponseSchema = z
  .object({
    opportunities: z.array(OpportunitySchema).default([]),
    meta: z.unknown().optional(),
    total: z.number().optional(),
  })
  .passthrough();
export type OpportunitySearchResponse = z.infer<typeof OpportunitySearchResponseSchema>;

// ---------------------------------------------------------------------------
// Conversations & Messages
// ---------------------------------------------------------------------------

export const ConversationSchema = z
  .object({
    id: z.string(),
    contactId: z.string().optional(),
    locationId: z.string().optional(),
    lastMessageDate: z.string().optional(),
    lastMessageBody: z.string().optional(),
    type: z.string().optional(),
    unreadCount: z.number().optional(),
  })
  .passthrough();
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationSearchResponseSchema = z
  .object({
    conversations: z.array(ConversationSchema).default([]),
    total: z.number().optional(),
  })
  .passthrough();

export const MessageSchema = z
  .object({
    id: z.string().optional(),
    type: z.union([z.string(), z.number()]).optional(),
    messageType: z.string().optional(),
    body: z.string().optional(),
    direction: z.string().optional(),
    dateAdded: z.string().optional(),
    contactId: z.string().optional(),
  })
  .passthrough();
export type Message = z.infer<typeof MessageSchema>;

// Messages can come back as { messages: { messages: [...] } } in v2.
export const MessagesResponseSchema = z
  .object({
    messages: z
      .union([
        z.array(MessageSchema),
        z.object({ messages: z.array(MessageSchema).default([]) }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();

export const SendMessageResponseSchema = z
  .object({
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    messageIds: z.array(z.string()).optional(),
  })
  .passthrough();
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

// Free-slots responses are date-keyed: { "2026-06-12": { slots: ["..."] }, traceId }
export const FreeSlotsResponseSchema = z.record(z.string(), z.unknown());
export type FreeSlotsResponse = z.infer<typeof FreeSlotsResponseSchema>;

export const AppointmentResponseSchema = z
  .object({
    id: z.string().optional(),
    appointmentId: z.string().optional(),
    calendarId: z.string().optional(),
    contactId: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();
export type AppointmentResponse = z.infer<typeof AppointmentResponseSchema>;

// ---------------------------------------------------------------------------
// Tasks & Notes
// ---------------------------------------------------------------------------

export const TaskSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    dueDate: z.string().optional(),
    completed: z.boolean().optional(),
    contactId: z.string().optional(),
  })
  .passthrough();
export const TaskWrapSchema = z.object({ task: TaskSchema }).passthrough();

export const NoteSchema = z
  .object({
    id: z.string().optional(),
    body: z.string().optional(),
    contactId: z.string().optional(),
    dateAdded: z.string().optional(),
  })
  .passthrough();
export const NoteWrapSchema = z.object({ note: NoteSchema }).passthrough();
