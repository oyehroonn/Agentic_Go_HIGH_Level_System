import { getConfig } from "../src/config/env.js";

/**
 * Step 0 (docs/BUILD_SPEC.md §6): ping one READ endpoint per capability and
 * print which succeed for this token/plan. Uses raw fetch so it verifies the
 * actual paths + headers, independent of src/ghl/client.ts. Run before trusting
 * any endpoint: `npm run check-ghl`.
 *
 * Record the results in README.md under "Verified GHL endpoints."
 */

interface Probe {
  capability: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  note?: string;
}

async function main(): Promise<void> {
  const cfg = getConfig();
  const base = cfg.GHL_BASE_URL.replace(/\/$/, "");
  const loc = cfg.GHL_LOCATION_ID;

  const probes: Probe[] = [
    { capability: "contacts", method: "GET", path: "/contacts/", query: { locationId: loc, limit: "1" } },
    { capability: "pipelines", method: "GET", path: "/opportunities/pipelines", query: { locationId: loc } },
    { capability: "opportunities", method: "GET", path: "/opportunities/search", query: { location_id: loc, limit: "1" } },
    { capability: "conversations", method: "GET", path: "/conversations/search", query: { locationId: loc, limit: "1" } },
    {
      capability: "calendars",
      method: "GET",
      path: "/calendars/",
      query: { locationId: loc },
      note: "free-slots needs a calendarId; this lists calendars to find one.",
    },
  ];

  console.log(`Probing GHL API at ${base} for location ${loc}\n`);

  const results: Array<{ capability: string; ok: boolean; status: number; detail: string }> = [];

  for (const p of probes) {
    const url = new URL(base + p.path);
    for (const [k, v] of Object.entries(p.query ?? {})) url.searchParams.set(k, v);

    let status = 0;
    let ok = false;
    let detail = "";
    try {
      const res = await fetch(url, {
        method: p.method,
        headers: {
          Authorization: `Bearer ${cfg.GHL_API_KEY}`,
          Version: cfg.GHL_API_VERSION,
          Accept: "application/json",
        },
      });
      status = res.status;
      ok = res.ok;
      const text = await res.text();
      detail = ok ? `${text.slice(0, 120)}…` : text.slice(0, 200);
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }

    results.push({ capability: p.capability, ok, status, detail });
    const icon = ok ? "✓" : "✗";
    console.log(`${icon} ${p.capability.padEnd(14)} ${p.method} ${p.path}  → ${status || "ERR"}`);
    if (p.note) console.log(`    note: ${p.note}`);
    if (!ok) console.log(`    body: ${detail}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} capabilities reachable.`);
  console.log("Update README.md → 'Verified GHL endpoints' with these results and any path corrections.");
  if (passed < results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("check-ghl-api failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
