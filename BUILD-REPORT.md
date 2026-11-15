# BUILD REPORT — comexscope

Clean-room rebuild of `com.kyrodata/kyrodata` v1.0.17 (remote-only MCP
server at `https://mcp.kyrodata.com/mcp`), built 2026-10-28 as a
forwarding client. Package: `@reneturcios/comexscope` 0.1.0,
registry name `io.github.CloudCorpRecords/comexscope`.

## Surface built

Full surface built: **15/15 tools**, no omissions.

| Tool | Title (as served) | Required fields as served |
|------|-------------------|-----------------------------|
| `kyrodata_compare_trade` | Compare exports/imports between equal windows | `flow`, `mode` |
| `kyrodata_explain_pyramid_level` | Explain one level of the forecast pyramid | `hub`, `horizon` |
| `kyrodata_fetch` | Open one public trade document by id | `id` |
| `kyrodata_get_climate_reading` | Climate reading and physical crop loss | `hub` |
| `kyrodata_get_credit_balance` | Credit balance and limits for this key | *(no `required` key in schema)* |
| `kyrodata_get_data_coverage` | Data coverage and latest closed month | *(no `required` key in schema)* |
| `kyrodata_get_heading_overview` | Overview of an HS heading (SH4) | `sh4`, `flow` |
| `kyrodata_get_hub_summary` | Commodity hub summary and forecast verdict | `hub` |
| `kyrodata_get_supply_demand_balance` | Supply and demand balance sheet | `hub` |
| `kyrodata_list_trade_partners` | Top partner countries with growth | `flow` |
| `kyrodata_list_trade_series` | Raw monthly trade series as rows | `flow` |
| `kyrodata_resolve_comparison_window` | Build a like-for-like comparison window | `mode` |
| `kyrodata_resolve_entity` | Resolve country, HS code or commodity | `q` |
| `kyrodata_run_report` | Run one of the catalog reports | `reportId` |
| `kyrodata_search` | Search the public trade catalog | `query` |

Every tool's inputSchema carries the capture's `$schema` draft marker
(`https://json-schema.org/draft/2020-12/schema`), `type: "object"` and
`additionalProperties: false`; those are served verbatim. The upstream
`kyrodata_` name prefix is part of the captured tool names and is served
verbatim. Tool literals were generated programmatically from
`harness/fixtures/kyrodata-tools-original.json` by the script at
`/tmp/b41-comexscope-gen.py` (parse + re-serialise, spliced into
`src/forward.ts`) — never retyped — and a post-generation check (the
registration-integrity test suite, plus the parity harness) confirmed
the served literals deep-equal the fixture's 15 tool objects in order.
Tools are registered via the MCP SDK low-level Server API
(`ListToolsRequestSchema` / `CallToolRequestSchema` handlers), not
McpServer+zod, per the task instruction.

## Fixture conflicts

**None.** The spec and the fixture agree on tool names, order, titles,
required fields (present on exactly the thirteen tools listed above,
absent on `kyrodata_get_credit_balance` and
`kyrodata_get_data_coverage`), and descriptions.

## Labelled reconstructions (from the spec's Wire section)

- Upstream endpoint pinned: `https://mcp.kyrodata.com/mcp`.
- Env override `KYRODATA_MCP_URL` — labelled reconstruction.
- Env forwarding `KYRODATA_API_KEY` — labelled reconstruction (the
  registry record pins a secret `Authorization` header on its remote;
  the captures were taken keyless). When set, `Authorization: Bearer
  <value>` is sent on every upstream request. When unset, no key
  header is sent. Both branches are tested.
- Error rendering `comexscope error:` text for upstream failures —
  labelled reconstruction.
- Upstream results pass through verbatim, including `isError` and extra
  fields. tools/call is forwarded as streamable-HTTP JSON-RPC:
  initialize (protocolVersion `2025-03-26`) → notifications/initialized →
  tools/call, honouring `Mcp-Session-Id` when issued; plain-JSON and SSE
  replies are both parsed. The forwarding core takes an injectable fetch;
  tests stub the upstream — no live network calls in tests.

## Deviations

None.

## Lockfile

- Route: **Route 3** — generated clean from birth in the build dir with
  no `node_modules` and no pre-existing lockfile:
  `npm install --package-lock-only --ignore-scripts --offline`.
- Parses as JSON; `name` == `@reneturcios/comexscope`.
- Package entries: **128**.
- sha256: `6a34f542729334fa052274dc869b68459c57c723946bf236a6263ed59c3b6268`
  (re-verified unchanged after the subsequent offline `npm install`).

## server.json

- Description exactly: "Brazil foreign-trade data by HS code: exports,
  imports, partners, balances, climate, reports." — **93 characters**.
- npm package entry carries `"version": "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/comexscope:0.1.0`) carries **no** `version`
  field. Dockerfile (node:20-alpine, both stages) carries the label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/comexscope"`.
  Container workflow `IMAGE` is `ghcr.io/cloudcorprecords/comexscope` and
  its smoke test asserts the server name `comexscope`.

## Verification (all run 2026-10-28)

1. `npx tsc --noEmit` → exit 0.
2. `npm run build` → exit 0; real `dist/` produced (cli, forward, index,
   mcp, types — .js, .d.ts, .js.map each).
3. `node dist/cli.js --version` → `0.1.0`; unknown subcommand → Usage on
   stderr.
4. `npm test` → **63 tests, 63 pass, 0 fail** (registration-integrity
   suite deep-equals the served tools/list against the fixture's 15
   tools in order, plus session handling/reuse, env override, key-header
   present/absent/blank branches, verbatim argument forwarding and
   result pass-through including upstream isError, SSE parsing, error
   rendering, MCP-layer validation, and CLI behaviour).
5. Parity: `python3 harness/parity.py --original
   harness/fixtures/kyrodata-tools-original.json --rebuild
   "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/comexscope/dist/cli.js mcp"
   --out builds/comexscope/parity-out` → **verdict PASS, parity 100.0**
   (15/15 identical, 0 missing, 0 extra, no schema diffs). Output in
   `parity-out/`.
