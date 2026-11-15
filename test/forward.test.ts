import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  ComexscopeClient,
  callTool,
  createClient,
  DEFAULT_ENDPOINT_URL,
  isKnownTool,
  parseRpcBody,
  PROTOCOL_VERSION,
  TOOL_DEFS,
  TOOL_NAMES,
  VERSION,
} from "../src/forward.js";
import { handleCallTool } from "../src/mcp.js";
import type {
  FetchFn,
  FetchResponseLike,
  ToolDef,
  ToolResult,
} from "../src/types.js";

/**
 * Every test runs against a stubbed JSON-RPC upstream that
 * implements the streamable-HTTP session flow
 * (initialize -> notifications/initialized -> tools/call):
 * no live network, and the real Kyrodata endpoint is
 * never contacted.
 */

const FIXTURE_URL = new URL(
  "../../../harness/fixtures/kyrodata-tools-original.json",
  import.meta.url,
);
const FIXTURE_AVAILABLE = existsSync(FIXTURE_URL);
const fixture = (
  FIXTURE_AVAILABLE
    ? JSON.parse(readFileSync(FIXTURE_URL, "utf-8"))
    : { tools: [] }
) as {
  tools: ToolDef[];
};
/**
 * Publish-survival guard (Wave 25 preflight, proven Wave 24 pattern):
 * the parity fixture lives in the build harness, outside the published
 * repo tree, so fixture-dependent tests skip cleanly when it is absent;
 * with the fixture present they run in full, with no skips.
 */
function skipWithoutFixture(t: {
  skip: (message: string) => void;
}): boolean {
  if (FIXTURE_AVAILABLE) return false;
  t.skip("parity fixture lives in the build harness, not the repo tree");
  return true;
}


const COMPARE = "kyrodata_compare_trade";
const EXPLAIN = "kyrodata_explain_pyramid_level";
const FETCH_DOC = "kyrodata_fetch";
const CLIMATE = "kyrodata_get_climate_reading";
const CREDIT = "kyrodata_get_credit_balance";
const COVERAGE = "kyrodata_get_data_coverage";
const HEADING = "kyrodata_get_heading_overview";
const HUB = "kyrodata_get_hub_summary";
const BALANCE = "kyrodata_get_supply_demand_balance";
const PARTNERS = "kyrodata_list_trade_partners";
const SERIES = "kyrodata_list_trade_series";
const WINDOW = "kyrodata_resolve_comparison_window";
const ENTITY = "kyrodata_resolve_entity";
const REPORT = "kyrodata_run_report";
const SEARCH = "kyrodata_search";
const ALL_TOOLS = [
  COMPARE,
  EXPLAIN,
  FETCH_DOC,
  CLIMATE,
  CREDIT,
  COVERAGE,
  HEADING,
  HUB,
  BALANCE,
  PARTNERS,
  SERIES,
  WINDOW,
  ENTITY,
  REPORT,
  SEARCH,
];

const SAMPLE_RESULT = {
  content: [{ type: "text", text: "{\"hub\":\"soybean\",\"verdict\":\"up\"}" }],
  structuredContent: { hub: "soybean", verdict: "up" },
};

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface FakeOptions {
  callResult?: Record<string, unknown>;
  callBodyText?: string;
  callError?: Record<string, unknown>;
  callStatus?: number;
  initError?: Record<string, unknown>;
  throwOn?: "initialize" | "tools/call";
  sessionId?: string | null;
  hangOnCall?: boolean;
  sse?: boolean;
}

function makeResponse(
  status: number,
  bodyText: string,
  headers: Record<string, string> = {},
): FetchResponseLike {
  const lowered = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowered.get(name.toLowerCase()) ?? null },
    text: async () => bodyText,
  };
}

function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return makeResponse(status, JSON.stringify(payload), headers);
}

function makeUpstream(options: FakeOptions = {}): {
  fetchFn: FetchFn;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    calls.push({ url, headers: init?.headers ?? {}, body });
    const method = body.method as string;
    if (options.throwOn === method) throw new Error("socket hang up");
    if (method === "initialize") {
      if (options.initError !== undefined) {
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          error: options.initError,
        });
      }
      const headers: Record<string, string> = {};
      const sessionId =
        options.sessionId === undefined ? "sess-xyz" : options.sessionId;
      if (sessionId !== null) headers["mcp-session-id"] = sessionId;
      return jsonResponse(
        200,
        {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: { name: "kyrodata", version: "1.0.17" },
          },
        },
        headers,
      );
    }
    if (method === "notifications/initialized") {
      return makeResponse(202, "");
    }
    if (method === "tools/call") {
      if (options.hangOnCall) {
        return new Promise<FetchResponseLike>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new Error("aborted"));
              return;
            }
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }
        });
      }
      if (options.callBodyText !== undefined) {
        return makeResponse(options.callStatus ?? 200, options.callBodyText);
      }
      if (options.callError !== undefined) {
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          error: options.callError,
        });
      }
      const result = options.callResult ?? SAMPLE_RESULT;
      const payload = { jsonrpc: "2.0", id: body.id, result };
      if (options.sse) {
        return makeResponse(
          200,
          `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
        );
      }
      return jsonResponse(options.callStatus ?? 200, payload);
    }
    return jsonResponse(200, {});
  };
  return { fetchFn, calls };
}

function stubClient(options: FakeOptions = {}, extra: Record<string, unknown> = {}) {
  const upstream = makeUpstream(options);
  const c = new ComexscopeClient({
    fetchFn: upstream.fetchFn,
    env: {},
    ...extra,
  });
  return { client: c, calls: upstream.calls };
}

function textOf(result: ToolResult): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

function methods(calls: Captured[]): string[] {
  return calls.map((c) => c.body.method as string);
}

function schemaOf(tool: ToolDef): Record<string, any> {
  return tool.inputSchema as Record<string, any>;
}

/* ------------------------------------------------------------------ */

describe("registration integrity (captured surface)", () => {
  it("serves exactly the fixture's 15 tools, deep-equal, in order", (t) => {
    if (skipWithoutFixture(t)) return;
    assert.equal(fixture.tools.length, 15);
    assert.deepEqual(TOOL_DEFS, fixture.tools);
  });

  it("serves the 15 tool names in fixture order", () => {
    assert.deepEqual(TOOL_NAMES, ALL_TOOLS);
  });

  it("carries exactly the fixture's keys on each tool", () => {
    for (const tool of TOOL_DEFS) {
      assert.deepEqual(Object.keys(tool).sort(), [
        "description",
        "inputSchema",
        "name",
        "title",
      ]);
    }
  });

  it("carries the fixture's tool titles verbatim", () => {
    assert.deepEqual(
      TOOL_DEFS.map((t) => t.title),
      [
        "Compare exports/imports between equal windows",
        "Explain one level of the forecast pyramid",
        "Open one public trade document by id",
        "Climate reading and physical crop loss",
        "Credit balance and limits for this key",
        "Data coverage and latest closed month",
        "Overview of an HS heading (SH4)",
        "Commodity hub summary and forecast verdict",
        "Supply and demand balance sheet",
        "Top partner countries with growth",
        "Raw monthly trade series as rows",
        "Build a like-for-like comparison window",
        "Resolve country, HS code or commodity",
        "Run one of the catalog reports",
        "Search the public trade catalog",
      ],
    );
  });

  it("carries no required key on kyrodata_get_credit_balance or kyrodata_get_data_coverage", () => {
    for (const idx of [4, 5]) {
      assert.equal("required" in schemaOf(TOOL_DEFS[idx]), false);
      assert.equal(schemaOf(TOOL_DEFS[idx]).required, undefined);
    }
  });

  it("requires exactly the fixture's fields on the other thirteen tools", () => {
    assert.deepEqual(schemaOf(TOOL_DEFS[0]).required, ["flow", "mode"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[1]).required, ["hub", "horizon"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[2]).required, ["id"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[3]).required, ["hub"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[6]).required, ["sh4", "flow"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[7]).required, ["hub"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[8]).required, ["hub"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[9]).required, ["flow"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[10]).required, ["flow"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[11]).required, ["mode"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[12]).required, ["q"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[13]).required, ["reportId"]);
    assert.deepEqual(schemaOf(TOOL_DEFS[14]).required, ["query"]);
  });

  it("carries the draft 2020-12 $schema marker, object type and additionalProperties false on every inputSchema", () => {
    for (const tool of TOOL_DEFS) {
      assert.equal(
        schemaOf(tool).$schema,
        "https://json-schema.org/draft/2020-12/schema",
      );
      assert.equal(schemaOf(tool).type, "object");
      assert.equal(schemaOf(tool).additionalProperties, false);
    }
  });

  it("carries every fixture property, in order, for all fifteen tools", (t) => {
    if (skipWithoutFixture(t)) return;
    for (let i = 0; i < 15; i += 1) {
      const served = Object.keys(schemaOf(TOOL_DEFS[i]).properties);
      const expected = Object.keys(schemaOf(fixture.tools[i]).properties);
      assert.deepEqual(served, expected);
    }
    assert.deepEqual(Object.keys(schemaOf(TOOL_DEFS[0]).properties), [
      "flow",
      "codes",
      "countryIds",
      "mode",
      "response_format",
    ]);
    assert.deepEqual(Object.keys(schemaOf(TOOL_DEFS[6]).properties), [
      "sh4",
      "flow",
      "year",
      "months",
      "response_format",
    ]);
    assert.deepEqual(Object.keys(schemaOf(TOOL_DEFS[9]).properties), [
      "flow",
      "codes",
      "from",
      "to",
      "limit",
      "withGrowth",
      "response_format",
    ]);
    assert.deepEqual(Object.keys(schemaOf(TOOL_DEFS[13]).properties), [
      "reportId",
      "params",
      "columnIds",
      "limit",
      "response_format",
    ]);
    assert.deepEqual(Object.keys(schemaOf(TOOL_DEFS[4]).properties), [
      "response_format",
    ]);
  });

  it("carries kyrodata_compare_trade's enums and filters verbatim", () => {
    const props = schemaOf(TOOL_DEFS[0]).properties;
    assert.deepEqual(props.flow.enum, ["export", "import"]);
    assert.deepEqual(props.mode.enum, [
      "monthly",
      "quarterly",
      "semestral",
      "semestral_sequential",
      "annual",
      "ytd",
      "rolling_3m",
      "rolling_6m",
      "rolling_12m",
    ]);
    assert.equal(props.codes.maxItems, 10);
    assert.equal(props.codes.items.pattern, "^\\d{4}(\\d{2}|\\d{4})?$");
    assert.equal(props.countryIds.maxItems, 5);
    assert.equal(props.countryIds.items.pattern, "^[A-Za-z0-9]{1,6}$");
  });

  it("carries kyrodata_explain_pyramid_level's hub, horizon and level enums verbatim", () => {
    const props = schemaOf(TOOL_DEFS[1]).properties;
    assert.equal(props.hub.enum.length, 22);
    assert.equal(props.hub.enum[0], "sugar");
    assert.equal(props.hub.enum[21], "rice");
    assert.deepEqual(props.horizon.enum, ["m1", "m3", "m6", "m12"]);
    assert.deepEqual(props.levelKey.enum, [
      "climate",
      "costs",
      "production",
      "logistics",
      "trade",
      "macro",
      "supply_demand",
    ]);
  });

  it("carries kyrodata_fetch's id bounds and kyrodata_search's query bounds verbatim", () => {
    const id = schemaOf(TOOL_DEFS[2]).properties.id;
    assert.equal(id.minLength, 3);
    assert.equal(id.maxLength, 64);
    const query = schemaOf(TOOL_DEFS[14]).properties.query;
    assert.equal(query.minLength, 2);
    assert.equal(query.maxLength, 120);
  });

  it("carries kyrodata_get_climate_reading's hub enum and scope pattern verbatim", () => {
    const props = schemaOf(TOOL_DEFS[3]).properties;
    assert.deepEqual(props.hub.enum, [
      "sugar",
      "beef",
      "ethanol",
      "chicken",
      "pork",
      "cocoa",
      "orange-juice",
      "wheat",
      "rice",
    ]);
    assert.equal(
      props.scope.pattern,
      "^(br|region:(N|NE|CW|SE|S)|uf:[A-Z]{2})$",
    );
  });

  it("carries kyrodata_get_heading_overview's sh4 pattern and year/month bounds verbatim", () => {
    const props = schemaOf(TOOL_DEFS[6]).properties;
    assert.equal(props.sh4.pattern, "^\\d{4}$");
    assert.equal(props.year.minimum, 2000);
    assert.equal(props.year.maximum, 2099);
    assert.equal(props.months.minimum, 3);
    assert.equal(props.months.maximum, 60);
  });

  it("carries the supply-demand hub enum and partners window bounds verbatim", () => {
    const hub = schemaOf(TOOL_DEFS[8]).properties.hub;
    assert.deepEqual(hub.enum, [
      "soybean",
      "corn",
      "wheat",
      "rice",
      "cotton",
      "beef",
      "chicken",
      "pork",
      "coffee",
      "sugar",
    ]);
    const props = schemaOf(TOOL_DEFS[9]).properties;
    assert.equal(props.from.minimum, 200001);
    assert.equal(props.from.maximum, 209912);
    assert.equal(props.limit.minimum, 1);
    assert.equal(props.limit.maximum, 300);
  });

  it("carries kyrodata_resolve_entity's q bounds and kinds enum verbatim", () => {
    const props = schemaOf(TOOL_DEFS[12]).properties;
    assert.equal(props.q.minLength, 2);
    assert.equal(props.q.maxLength, 64);
    assert.deepEqual(props.kinds.items.enum, [
      "country",
      "heading",
      "ncm",
      "hub",
    ]);
  });

  it("carries kyrodata_run_report's catalogue enum and row limits verbatim", () => {
    const props = schemaOf(TOOL_DEFS[13]).properties;
    assert.equal(props.reportId.enum.length, 16);
    assert.equal(props.reportId.enum[0], "comex.exports.1");
    assert.equal(props.reportId.enum[15], "climate.history.1");
    assert.equal(props.columnIds.minItems, 1);
    assert.equal(props.columnIds.maxItems, 20);
    assert.equal(props.limit.minimum, 1);
    assert.equal(props.limit.maximum, 50);
  });

  it("isKnownTool recognises the 15 built tools and rejects others", () => {
    for (const name of ALL_TOOLS) assert.equal(isKnownTool(name), true);
    assert.equal(isKnownTool("compare_trade"), false);
    assert.equal(isKnownTool("kyrodata_search_catalog"), false);
    assert.equal(isKnownTool(""), false);
  });
});

/* ------------------------------------------------------------------ */

describe("session establishment and reuse", () => {
  it("runs initialize, notifications/initialized, then tools/call in order", async () => {
    const { client: c, calls } = stubClient();
    const out = await c.callTool(COMPARE, { flow: "export", mode: "ytd" });
    assert.equal(out.isError, undefined);
    assert.deepEqual(methods(calls), [
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    assert.ok(calls.every((call) => call.url === DEFAULT_ENDPOINT_URL));
    assert.equal(DEFAULT_ENDPOINT_URL, "https://mcp.kyrodata.com/mcp");
    for (const call of calls) {
      assert.equal(call.headers["Content-Type"], "application/json");
      assert.equal(call.headers["Accept"], "application/json, text/event-stream");
    }
    assert.equal(calls[0].headers["Mcp-Session-Id"], undefined);
    assert.equal(calls[1].headers["Mcp-Session-Id"], "sess-xyz");
    assert.equal(calls[2].headers["Mcp-Session-Id"], "sess-xyz");
  });

  it("sends clientInfo name comexscope and the pinned protocol version on initialize", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool(COVERAGE, {});
    const initParams = calls[0].body.params as Record<string, unknown>;
    assert.equal(initParams.protocolVersion, PROTOCOL_VERSION);
    assert.equal(PROTOCOL_VERSION, "2025-03-26");
    assert.deepEqual(initParams.capabilities, {});
    assert.deepEqual(initParams.clientInfo, { name: "comexscope", version: VERSION });
  });

  it("establishes the session lazily once and reuses it on later calls", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool(CREDIT, {});
    await c.callTool(HEADING, { sh4: "1201", flow: "export" });
    assert.deepEqual(methods(calls), [
      "initialize",
      "notifications/initialized",
      "tools/call",
      "tools/call",
    ]);
    assert.equal(calls[3].headers["Mcp-Session-Id"], "sess-xyz");
    assert.notEqual(calls[2].body.id, calls[3].body.id);
  });

  it("sends no session header when the upstream issues none", async () => {
    const { client: c, calls } = stubClient({ sessionId: null });
    const out = await c.callTool(COVERAGE, {});
    assert.equal(out.isError, undefined);
    assert.ok(calls.every((call) => call.headers["Mcp-Session-Id"] === undefined));
  });

  it("honours the KYRODATA_MCP_URL env override", async () => {
    const upstream = makeUpstream();
    const c = new ComexscopeClient({
      fetchFn: upstream.fetchFn,
      env: { KYRODATA_MCP_URL: "https://staging.example.com/mcp" },
    });
    await c.callTool(SEARCH, { query: "soja" });
    assert.ok(
      upstream.calls.every((call) => call.url === "https://staging.example.com/mcp"),
    );
  });

  it("honours an explicit url override over the default endpoint", async () => {
    const upstream = makeUpstream();
    const c = createClient({
      fetchFn: upstream.fetchFn,
      env: {},
      url: "https://alt.example.com/mcp",
    });
    await c.callTool(HUB, { hub: "soybean" });
    assert.ok(upstream.calls.every((call) => call.url === "https://alt.example.com/mcp"));
  });

  it("prefers an explicit url override over the env override", async () => {
    const upstream = makeUpstream();
    const c = createClient({
      fetchFn: upstream.fetchFn,
      env: { KYRODATA_MCP_URL: "https://env.example.com/mcp" },
      url: "https://explicit.example.com/mcp",
    });
    await c.callTool(CREDIT, {});
    assert.ok(
      upstream.calls.every((call) => call.url === "https://explicit.example.com/mcp"),
    );
  });

  it("falls back to the pinned endpoint when the env override is blank", async () => {
    const upstream = makeUpstream();
    const c = new ComexscopeClient({
      fetchFn: upstream.fetchFn,
      env: { KYRODATA_MCP_URL: "   " },
    });
    await c.callTool(COVERAGE, {});
    assert.ok(upstream.calls.every((call) => call.url === DEFAULT_ENDPOINT_URL));
  });
});

/* ------------------------------------------------------------------ */

describe("upstream key header", () => {
  it("sends Authorization: Bearer on every request when KYRODATA_API_KEY is set", async () => {
    const upstream = makeUpstream();
    const c = new ComexscopeClient({
      fetchFn: upstream.fetchFn,
      env: { KYRODATA_API_KEY: "kyr-key-42" },
    });
    await c.callTool(SEARCH, { query: "soja" });
    assert.equal(upstream.calls.length, 3);
    assert.ok(
      upstream.calls.every(
        (call) => call.headers["Authorization"] === "Bearer kyr-key-42",
      ),
    );
  });

  it("sends no Authorization header when KYRODATA_API_KEY is unset", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool(SEARCH, { query: "soja" });
    assert.ok(calls.every((call) => call.headers["Authorization"] === undefined));
  });

  it("sends no Authorization header when KYRODATA_API_KEY is blank", async () => {
    const upstream = makeUpstream();
    const c = new ComexscopeClient({
      fetchFn: upstream.fetchFn,
      env: { KYRODATA_API_KEY: "   " },
    });
    await c.callTool(COVERAGE, {});
    assert.ok(
      upstream.calls.every((call) => call.headers["Authorization"] === undefined),
    );
  });

  it("never sends an X-API-Key header, with or without a key", async () => {
    const withKey = makeUpstream();
    const c1 = new ComexscopeClient({
      fetchFn: withKey.fetchFn,
      env: { KYRODATA_API_KEY: "kyr-key-42" },
    });
    await c1.callTool(CREDIT, {});
    assert.ok(withKey.calls.every((call) => call.headers["X-API-Key"] === undefined));
    const { client: c2, calls } = stubClient();
    await c2.callTool(CREDIT, {});
    assert.ok(calls.every((call) => call.headers["X-API-Key"] === undefined));
  });
});

/* ------------------------------------------------------------------ */

describe("tools/call forwarding", () => {
  it("forwards a kyrodata_compare_trade call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = { flow: "export", mode: "ytd", codes: ["1201"], countryIds: ["160"] };
    await c.callTool(COMPARE, args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, COMPARE);
    assert.deepEqual(params.arguments, args);
  });

  it("forwards a kyrodata_get_heading_overview call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = { sh4: "1201", flow: "export", year: 2025, months: 12 };
    await c.callTool(HEADING, args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, HEADING);
    assert.deepEqual(params.arguments, args);
  });

  it("forwards a kyrodata_run_report call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = { reportId: "comex.exports.1", params: { flow: "export" }, limit: 10 };
    await c.callTool(REPORT, args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, REPORT);
    assert.deepEqual(params.arguments, args);
  });

  it("forwards a kyrodata_search call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = { query: "soja" };
    await c.callTool(SEARCH, args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, SEARCH);
    assert.deepEqual(params.arguments, args);
  });

  it("forwards fetch and resolve_entity calls verbatim", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool(FETCH_DOC, { id: "heading:1201" });
    await c.callTool(ENTITY, { q: "China", kinds: ["country"] });
    const first = calls[2].body.params as Record<string, unknown>;
    const second = calls[3].body.params as Record<string, unknown>;
    assert.equal(first.name, FETCH_DOC);
    assert.deepEqual(first.arguments, { id: "heading:1201" });
    assert.equal(second.name, ENTITY);
    assert.deepEqual(second.arguments, { q: "China", kinds: ["country"] });
  });

  it("passes the upstream result through verbatim, including extra fields", async () => {
    const { client: c } = stubClient();
    const out = await c.callTool(HUB, { hub: "soybean" });
    assert.deepEqual(out, SAMPLE_RESULT);
  });

  it("passes an upstream isError result through untouched", async () => {
    const upstreamResult = {
      content: [{ type: "text", text: "no such heading" }],
      isError: true,
    };
    const { client: c } = stubClient({ callResult: upstreamResult });
    const out = await c.callTool(HEADING, { sh4: "9999", flow: "export" });
    assert.deepEqual(out, upstreamResult);
  });

  it("reads an SSE-framed tools/call response", async () => {
    const { client: c } = stubClient({ sse: true });
    const out = await c.callTool(CREDIT, {});
    assert.equal(out.isError, undefined);
    assert.deepEqual(out, SAMPLE_RESULT);
  });

  it("the one-shot callTool helper forwards under the right tool name", async () => {
    const upstream = makeUpstream();
    const out = await callTool(
      CLIMATE,
      { hub: "sugar" },
      { fetchFn: upstream.fetchFn, env: {} },
    );
    assert.equal(out.isError, undefined);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, CLIMATE);
    assert.deepEqual(params.arguments, { hub: "sugar" });
  });
});

/* ------------------------------------------------------------------ */

describe("upstream failures surface as comexscope error text", () => {
  it("maps a JSON-RPC error to `comexscope error: <message>`", async () => {
    const { client: c } = stubClient({
      callError: { code: -32000, message: "lookup failed upstream" },
    });
    const out = await c.callTool(HEADING, { sh4: "1201", flow: "export" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: lookup failed upstream");
  });

  it("maps an initialize JSON-RPC error to comexscope error text", async () => {
    const { client: c } = stubClient({
      initError: { code: -32600, message: "bad initialize" },
    });
    const out = await c.callTool(COVERAGE, {});
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: bad initialize");
  });

  it("maps an unparseable upstream response to a malformed-response error", async () => {
    const { client: c } = stubClient({ callBodyText: "<html>oops</html>" });
    const out = await c.callTool(CREDIT, {});
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: malformed response");
  });

  it("maps a response with no result object to a malformed-response error", async () => {
    const { client: c } = stubClient({
      callBodyText: '{"jsonrpc":"2.0","id":3,"result":null}',
    });
    const out = await c.callTool(CREDIT, {});
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: malformed response");
  });

  it("maps a non-2xx upstream status to comexscope error text", async () => {
    const { client: c } = stubClient({ callBodyText: "internal error", callStatus: 500 });
    const out = await c.callTool(COVERAGE, {});
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: HTTP 500");
  });

  it("maps a throwing fetch to comexscope error text", async () => {
    const { client: c } = stubClient({ throwOn: "tools/call" });
    const out = await c.callTool(SEARCH, { query: "soja" });
    assert.equal(out.isError, true);
    assert.match(textOf(out), /^comexscope error: /);
  });

  it("maps a throwing initialize fetch to comexscope error text", async () => {
    const { client: c } = stubClient({ throwOn: "initialize" });
    const out = await c.callTool(SEARCH, { query: "soja" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "comexscope error: socket hang up");
  });

  it("maps a timed-out call to comexscope error text", async () => {
    const { client: c } = stubClient({ hangOnCall: true }, { timeoutMs: 20 });
    const out = await c.callTool(HEADING, { sh4: "1201", flow: "export" });
    assert.equal(out.isError, true);
    assert.match(textOf(out), /^comexscope error: /);
  });
});

/* ------------------------------------------------------------------ */

describe("parseRpcBody", () => {
  it("parses plain JSON and picks the message with the matching id", () => {
    const body = '{"jsonrpc":"2.0","id":7,"result":{"ok":true}}';
    assert.deepEqual(parseRpcBody(body, 7), {
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true },
    });
  });

  it("parses SSE data lines", () => {
    const body =
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n';
    assert.deepEqual(parseRpcBody(body, 2), {
      jsonrpc: "2.0",
      id: 2,
      result: { ok: true },
    });
  });

  it("picks the matching id among several SSE messages", () => {
    const body =
      'data: {"jsonrpc":"2.0","id":1,"result":{"n":1}}\n\n' +
      'data: {"jsonrpc":"2.0","id":2,"result":{"n":2}}\n\n';
    assert.deepEqual(parseRpcBody(body, 2), {
      jsonrpc: "2.0",
      id: 2,
      result: { n: 2 },
    });
  });

  it("ignores the SSE [DONE] sentinel", () => {
    const body =
      'data: {"jsonrpc":"2.0","id":4,"result":{"ok":true}}\ndata: [DONE]\n';
    assert.deepEqual(parseRpcBody(body, 4), {
      jsonrpc: "2.0",
      id: 4,
      result: { ok: true },
    });
  });

  it("returns null for empty and unparseable bodies", () => {
    assert.equal(parseRpcBody(""), null);
    assert.equal(parseRpcBody("not json at all"), null);
    assert.equal(parseRpcBody("[1,2,3]"), null);
  });
});

/* ------------------------------------------------------------------ */

describe("MCP layer validation", () => {
  it("rejects an unknown tool with MethodNotFound before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, "not_a_tool", {}),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.MethodNotFound,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("rejects array arguments with InvalidParams before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, COMPARE, ["nope"]),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.InvalidParams,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("rejects string arguments with InvalidParams before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, HEADING, "sh4=1201"),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.InvalidParams,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("forwards a valid kyrodata_compare_trade call through the MCP layer unchanged", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, COMPARE, { flow: "export", mode: "ytd" });
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.deepEqual(params.arguments, { flow: "export", mode: "ytd" });
  });

  it("forwards a valid kyrodata_list_trade_partners call through the MCP layer unchanged", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, PARTNERS, { flow: "import" });
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, PARTNERS);
  });

  it("treats omitted arguments as an empty object", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, COVERAGE, undefined);
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.deepEqual(params.arguments, {});
  });
});

/* ------------------------------------------------------------------ */

describe("CLI", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

  function runCli(args: string[]) {
    return spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
  }

  it("--version prints 0.1.0 and exits 0", () => {
    const res = runCli(["--version"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
    assert.equal(res.stdout.trim(), VERSION);
  });

  it("-v prints 0.1.0 and exits 0", () => {
    const res = runCli(["-v"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("an unknown command prints usage on stderr and exits 2", () => {
    const res = runCli(["not-a-tool"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Usage:/);
  });

  it("a non-JSON argument exits 2", () => {
    const res = runCli([COMPARE, "not json"]);
    assert.equal(res.status, 2);
  });

  it("a JSON array argument exits 2", () => {
    const res = runCli([COMPARE, "[]"]);
    assert.equal(res.status, 2);
  });

  it("extra arguments after mcp exit 2", () => {
    const res = runCli(["mcp", "extra"]);
    assert.equal(res.status, 2);
  });
});
