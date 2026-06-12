import type { AppConfig } from "../config/env.js";
import { log } from "../audit/logger.js";
import {
  AppointmentResponseSchema,
  ContactSchema,
  ContactSearchResponseSchema,
  ContactWrapSchema,
  ConversationSearchResponseSchema,
  FreeSlotsResponseSchema,
  MessagesResponseSchema,
  NoteWrapSchema,
  OpportunitySearchResponseSchema,
  OpportunityWrapSchema,
  PipelinesResponseSchema,
  SendMessageResponseSchema,
  TagsResponseSchema,
  TaskWrapSchema,
  type AppointmentResponse,
  type Contact,
  type ContactSearchResponse,
  type Conversation,
  type FreeSlotsResponse,
  type Message,
  type Opportunity,
  type OpportunitySearchResponse,
  type Pipeline,
  type SendMessageResponse,
} from "./types.js";

/** Typed error for any non-2xx GHL response. Carries enough to debug + audit. */
export class GhlApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly responseBody: unknown,
  ) {
    super(`GHL ${method} ${path} -> ${status}: ${JSON.stringify(responseBody)}`);
    this.name = "GhlApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

const MAX_ATTEMPTS = 3;
const RETRYABLE = (status: number) => status === 429 || status >= 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Thin, typed HTTP client over the GHL (LeadConnector) v2 API.
 *
 * Responsibilities: auth headers, query building, JSON encode/decode, typed
 * errors, and retry-with-backoff on 429/5xx. It contains NO risk logic — the
 * router owns that (docs/BUILD_SPEC.md §7).
 */
export class GhlClient {
  private readonly baseUrl: string;
  private readonly locationId: string;

  constructor(private readonly cfg: AppConfig) {
    this.baseUrl = cfg.GHL_BASE_URL.replace(/\/$/, "");
    this.locationId = cfg.GHL_LOCATION_ID;
  }

  // -- core request ---------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.GHL_API_KEY}`,
      Version: this.cfg.GHL_API_VERSION,
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        // Network-level failure — retry with backoff.
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(2 ** attempt * 250);
          continue;
        }
        throw err;
      }

      const text = await res.text();
      const parsed = text ? safeJson(text) : undefined;

      if (res.ok) return parsed as T;

      if (RETRYABLE(res.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500;
        log.warn("ghl.retry", { method, path, status: res.status, attempt, waitMs });
        await sleep(waitMs);
        lastErr = new GhlApiError(res.status, method, path, parsed);
        continue;
      }

      throw new GhlApiError(res.status, method, path, parsed);
    }

    // Exhausted retries on a retryable error.
    throw lastErr ?? new Error(`GHL ${method} ${path} failed after ${MAX_ATTEMPTS} attempts`);
  }

  // -- contacts -------------------------------------------------------------

  async searchContacts(input: { query?: string; limit?: number }): Promise<ContactSearchResponse> {
    // GET /contacts/ supports locationId + query filtering in v2.
    const raw = await this.request("GET", "/contacts/", {
      query: {
        locationId: this.locationId,
        query: input.query,
        limit: input.limit ?? 20,
      },
    });
    return ContactSearchResponseSchema.parse(raw);
  }

  async getContact(contactId: string): Promise<Contact> {
    const raw = await this.request("GET", `/contacts/${contactId}`);
    return ContactWrapSchema.parse(raw).contact;
  }

  async createContact(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    tags?: string[];
    locationId: string;
  }): Promise<Contact> {
    const raw = await this.request("POST", "/contacts/", { body: input });
    return ContactWrapSchema.parse(raw).contact;
  }

  async updateContact(
    contactId: string,
    fields: Partial<{ firstName: string; lastName: string; email: string; phone: string }>,
  ): Promise<Contact> {
    const raw = await this.request("PUT", `/contacts/${contactId}`, { body: fields });
    return ContactWrapSchema.parse(raw).contact;
  }

  async addTags(contactId: string, tags: string[]): Promise<string[]> {
    const raw = await this.request("POST", `/contacts/${contactId}/tags`, { body: { tags } });
    return TagsResponseSchema.parse(raw).tags ?? tags;
  }

  // -- pipelines & opportunities -------------------------------------------

  async getPipelines(): Promise<Pipeline[]> {
    const raw = await this.request("GET", "/opportunities/pipelines", {
      query: { locationId: this.locationId },
    });
    return PipelinesResponseSchema.parse(raw).pipelines;
  }

  async searchOpportunities(input: {
    pipelineId?: string;
    pipelineStageId?: string;
    query?: string;
    status?: string;
    limit?: number;
  }): Promise<OpportunitySearchResponse> {
    const raw = await this.request("GET", "/opportunities/search", {
      query: {
        location_id: this.locationId,
        pipeline_id: input.pipelineId,
        pipeline_stage_id: input.pipelineStageId,
        q: input.query,
        status: input.status,
        limit: input.limit ?? 100,
      },
    });
    return OpportunitySearchResponseSchema.parse(raw);
  }

  async createOpportunity(input: {
    pipelineId: string;
    pipelineStageId?: string;
    name: string;
    status?: string;
    monetaryValue?: number;
    contactId?: string;
  }): Promise<Opportunity> {
    const raw = await this.request("POST", "/opportunities/", {
      body: {
        locationId: this.locationId,
        pipelineId: input.pipelineId,
        pipelineStageId: input.pipelineStageId,
        name: input.name,
        status: input.status ?? "open",
        monetaryValue: input.monetaryValue,
        contactId: input.contactId,
      },
    });
    return OpportunityWrapSchema.parse(raw).opportunity;
  }

  async updateOpportunity(
    opportunityId: string,
    fields: Partial<{ pipelineStageId: string; status: string; name: string; monetaryValue: number }>,
  ): Promise<Opportunity> {
    const raw = await this.request("PUT", `/opportunities/${opportunityId}`, { body: fields });
    return OpportunityWrapSchema.parse(raw).opportunity;
  }

  // -- conversations & messages --------------------------------------------

  async searchConversations(input: { contactId?: string; limit?: number }): Promise<Conversation[]> {
    const raw = await this.request("GET", "/conversations/search", {
      query: {
        locationId: this.locationId,
        contactId: input.contactId,
        limit: input.limit ?? 20,
      },
    });
    return ConversationSearchResponseSchema.parse(raw).conversations;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const raw = await this.request("GET", `/conversations/${conversationId}/messages`);
    const parsed = MessagesResponseSchema.parse(raw);
    const m = parsed.messages;
    if (!m) return [];
    return Array.isArray(m) ? m : m.messages;
  }

  async sendMessage(input: {
    contactId: string;
    channel: "SMS" | "Email";
    body: string;
    subject?: string;
  }): Promise<SendMessageResponse> {
    const body: Record<string, unknown> = {
      type: input.channel,
      contactId: input.contactId,
      message: input.body,
    };
    if (input.channel === "Email") {
      body["html"] = input.body;
      if (input.subject) body["subject"] = input.subject;
    }
    const raw = await this.request("POST", "/conversations/messages", { body });
    return SendMessageResponseSchema.parse(raw);
  }

  // -- calendar -------------------------------------------------------------

  async getFreeSlots(input: {
    calendarId: string;
    startDate: number; // epoch ms
    endDate: number; // epoch ms
    timezone?: string;
  }): Promise<FreeSlotsResponse> {
    const raw = await this.request("GET", `/calendars/${input.calendarId}/free-slots`, {
      query: {
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: input.timezone,
      },
    });
    return FreeSlotsResponseSchema.parse(raw);
  }

  async createAppointment(input: {
    calendarId: string;
    contactId: string;
    startTime: string; // ISO 8601
    endTime?: string;
    title?: string;
  }): Promise<AppointmentResponse> {
    const raw = await this.request("POST", "/calendars/events/appointments", {
      body: {
        calendarId: input.calendarId,
        locationId: this.locationId,
        contactId: input.contactId,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
      },
    });
    return AppointmentResponseSchema.parse(raw);
  }

  // -- tasks & notes --------------------------------------------------------

  async createTask(input: {
    contactId: string;
    title: string;
    body?: string;
    dueDate?: string; // ISO 8601
  }): Promise<ReturnType<typeof TaskWrapSchema.parse>["task"]> {
    const raw = await this.request("POST", `/contacts/${input.contactId}/tasks`, {
      body: { title: input.title, body: input.body, dueDate: input.dueDate },
    });
    return TaskWrapSchema.parse(raw).task;
  }

  async createNote(input: {
    contactId: string;
    body: string;
  }): Promise<ReturnType<typeof NoteWrapSchema.parse>["note"]> {
    const raw = await this.request("POST", `/contacts/${input.contactId}/notes`, {
      body: { body: input.body },
    });
    return NoteWrapSchema.parse(raw).note;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
