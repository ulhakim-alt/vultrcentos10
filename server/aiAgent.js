// AI Agent — turns a sales rep's plain-language prompt into structured quotation
// data (customer, dates, pax, itinerary days). Calls the Anthropic API directly
// over fetch (Node 18+ has fetch built in — no SDK dependency needed).
//
// SECURITY: ANTHROPIC_API_KEY lives only here, server-side, read from an
// environment variable. It must NEVER be sent to or embedded in the frontend —
// the browser only ever talks to our own /api/ai-prompt route, which then
// makes the actual Anthropic call from the server.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const locationsData = JSON.parse(readFileSync(join(__dirname, "_locationsSummary.json"), "utf-8"));

function buildSystemPrompt() {
  const locList = locationsData.locations
    .map((l) => `- ${l.id} | ${l.name} (${l.group}) — ${l.detail}`)
    .join("\n");
  const arrivalList = locationsData.arrivalFlights.map((f) => `- ${f}`).join("\n");
  const departureList = locationsData.departureFlights.map((f) => `- ${f}`).join("\n");

  return `You are a quotation assistant for MKJ Travel, a Japan tour agency. A sales staff member will describe a customer's trip request in plain language (English or Bahasa Malaysia). Your job is to convert that into structured data for the quotation tool by calling the build_quotation tool.

AVAILABLE DESTINATIONS (use the exact "id" value from this list — never invent an id):
${locList}

AVAILABLE ARRIVAL FLIGHTS (use the exact text if one matches; otherwise leave arrivalFlight blank):
${arrivalList}

AVAILABLE DEPARTURE FLIGHTS (use the exact text if one matches; otherwise leave departureFlight blank):
${departureList}

GUIDELINES:
- dayLocationIds should be an ordered array of location ids, one per day of the trip, matching the requested trip length. If the rep doesn't specify a full itinerary, use reasonable defaults: Day 1 = an arrival preset matching the arrival city/flight, last day = a departure preset matching the departure city/flight, middle days = well-known destinations appropriate to the region (Tokyo: Mt Fuji, Tokyo Mix, Kamakura, Yokohama; Kansai: Kyoto, USJ, Nara, Osaka). If arrival and departure cities differ, include a Bullet Train transfer day (bullet_tokyo or bullet_osaka) at the appropriate point.
- If arrival/departure flights aren't mentioned, leave those fields blank rather than guessing a specific flight number.
- If pax counts aren't specified, default to 1 adult, 0 children, 0 infants, but note this assumption in the "notes" field.
- If dates aren't specified, leave dateStart/dateEnd blank rather than guessing.
- Always fill in "notes" with anything the sales rep should double-check — assumptions you made, ambiguous requests, or anything you weren't confident about. This is shown directly to the sales rep, so be specific and useful, not generic.`;
}

export async function interpretPrompt(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to the server's environment variables.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          name: "build_quotation",
          description: "Fill in the quotation form fields based on the sales rep's request.",
          input_schema: {
            type: "object",
            properties: {
              customer: { type: "string", description: "Customer's name" },
              customerPhone: { type: "string", description: "Customer's phone number, if mentioned" },
              adults: { type: "number" },
              children: { type: "number" },
              infants: { type: "number" },
              dateStart: { type: "string", description: "YYYY-MM-DD, or empty string if not specified" },
              dateEnd: { type: "string", description: "YYYY-MM-DD, or empty string if not specified" },
              arrivalFlight: { type: "string", description: "Exact text from the available arrival flights list, or empty string" },
              departureFlight: { type: "string", description: "Exact text from the available departure flights list, or empty string" },
              dayLocationIds: {
                type: "array",
                items: { type: "string" },
                description: "Ordered location ids, one per day, using only ids from the provided list",
              },
              notes: { type: "string", description: "Assumptions made or things the sales rep should double-check" },
            },
            required: ["customer", "adults", "children", "infants", "dayLocationIds", "notes"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "build_quotation" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API returned ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const toolUse = data.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("AI did not return structured data — try rephrasing the request.");
  }

  // Validate location ids against the real list — strip any the AI might have hallucinated
  // rather than trusting them blindly, since these ids get used to index into pricing data.
  const validIds = new Set(locationsData.locations.map((l) => l.id));
  const result = toolUse.input;
  const originalCount = (result.dayLocationIds || []).length;
  result.dayLocationIds = (result.dayLocationIds || []).filter((id) => validIds.has(id));
  if (result.dayLocationIds.length < originalCount) {
    result.notes = (result.notes || "") + " (Note: some destinations in the AI's response weren't recognized and were dropped — please review the itinerary.)";
  }

  return result;
}
