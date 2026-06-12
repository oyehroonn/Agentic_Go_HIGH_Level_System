import { z } from "zod";
import { register } from "./registry.js";

/** Pipeline / opportunity capabilities. All low-risk. See §15. */

register({
  name: "get_pipelines",
  description:
    "List the location's opportunity pipelines and their stages (with ids). Call this to discover the correct pipelineId / pipelineStageId before creating or moving an opportunity.",
  risk: "low",
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const pipelines = await ctx.ghl.getPipelines();
    const summary = pipelines
      .map((p) => `${p.name ?? p.id} [${(p.stages ?? []).map((s) => s.name ?? s.id).join(" → ")}]`)
      .join("; ");
    return {
      ok: true,
      summary: `${pipelines.length} pipeline(s): ${summary}`,
      data: pipelines,
    };
  },
});

register({
  name: "search_opportunities",
  description:
    "Search opportunities in the location, optionally filtered by pipeline, stage, status, or a text query. Returns opportunities with their value, stage, status, and timestamps (createdAt/updatedAt/lastStatusChangeAt) so you can spot stale deals.",
  risk: "low",
  inputSchema: z.object({
    pipelineId: z.string().optional(),
    pipelineStageId: z.string().optional(),
    status: z.enum(["open", "won", "lost", "abandoned", "all"]).optional(),
    query: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
  handler: async (input, ctx) => {
    const res = await ctx.ghl.searchOpportunities(input);
    return {
      ok: true,
      summary: `Found ${res.opportunities.length} opportunit(ies).`,
      data: res.opportunities,
    };
  },
});

register({
  name: "create_opportunity",
  description:
    "Create an opportunity in a pipeline. Provide a valid pipelineId (and ideally pipelineStageId) from get_pipelines. Optionally link a contactId.",
  risk: "low",
  inputSchema: z.object({
    name: z.string(),
    pipelineId: z.string(),
    pipelineStageId: z.string().optional(),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
    monetaryValue: z.number().nonnegative().optional(),
    contactId: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const opp = await ctx.ghl.createOpportunity(input);
    return { ok: true, summary: `Created opportunity "${input.name}" (${opp.id})`, data: opp };
  },
});

register({
  name: "move_opportunity_stage",
  description:
    "Move an opportunity to a different pipeline stage (and optionally change its status). Use a pipelineStageId from get_pipelines.",
  risk: "low",
  inputSchema: z.object({
    opportunityId: z.string(),
    pipelineStageId: z.string(),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
  }),
  handler: async (input, ctx) => {
    const { opportunityId, ...fields } = input;
    const opp = await ctx.ghl.updateOpportunity(opportunityId, fields);
    return { ok: true, summary: `Moved opportunity ${opportunityId} to stage ${input.pipelineStageId}`, data: opp };
  },
});
