# comexscope

Brazil's foreign-trade data — Comex Stat figures and the vendor's derived readings on top of them — sits behind the hosted Kyrodata MCP service. comexscope is a small local bridge to that service: you can compare exports or imports between like-for-like windows, read a heading's totals and monthly series, rank partner countries, pull a commodity hub's forecast verdict or climate reading, check a supply and demand balance sheet, search the public catalogue, and run the product's pre-built reports.

Nothing is stored or computed on your own machine. This package answers `tools/list` locally from the captured tool definitions and forwards every `tools/call` to the hosted service over a streamable-HTTP JSON-RPC session, returning whatever the service sends back unchanged.

## The tools

Every tool in this surface reads published Brazil foreign-trade data (Comex Stat) and the vendor's derived readings. `kyrodata_get_credit_balance` reports the balance and limits of the caller's own API key; no tool writes anything, buys anything, starts a subscription, checks out, or creates an API key.

- **`kyrodata_compare_trade`** — Compares exports or imports between two equal-length windows, in value (USD FOB) and volume (kg), with the % change of each metric and the monthly series spanning both windows. `codes` and `countryIds` filter both windows alike.
- **`kyrodata_explain_pyramid_level`** — Explains the forecast pyramid's arithmetic for one commodity and horizon: the seven levels side by side, or one level followed across all four horizons via `levelKey`.
- **`kyrodata_fetch`** — Opens one public trade document by an id from `kyrodata_search` (`heading:1201`, `country:160`) and returns it as citable prose with a public URL.
- **`kyrodata_get_climate_reading`** — Current climate reading for a commodity: risk level, measured production shock, and projected physical loss in tonnes per horizon, at country, region or state scope.
- **`kyrodata_get_credit_balance`** — The credit balance and limits of the API key making the request: credits left, reset timing, daily ceilings, and which tools the key reaches.
- **`kyrodata_get_data_coverage`** — The calendar of the trade data: first and last published month, whether the current year is partial, the last fully closed month, and the last refresh.
- **`kyrodata_get_heading_overview`** — Structured read of one HS heading (SH4): published-year totals, last closed month against the previous one, and a monthly price-by-volume series.
- **`kyrodata_get_hub_summary`** — The pyramid verdict for a commodity hub: direction, expected move per horizon, the 80% band, which levels drive the verdict, and measured accuracy.
- **`kyrodata_get_supply_demand_balance`** — Published supply and demand balance (in tonnes) for one agricultural hub, season by season, optionally closed seasons only.
- **`kyrodata_list_trade_partners`** — Ranks Brazil's partner countries for exports or imports in a window, with value, volume, price per kg, share, and optional growth.
- **`kyrodata_list_trade_series`** — Brazil's monthly export or import series as rows, narrowed by HS codes and partner countries; gaps stay absent rather than reading as zero.
- **`kyrodata_resolve_comparison_window`** — Resolves an equal-length comparison window and returns only its metadata: from, to, label, months, and whether it crosses a season.
- **`kyrodata_resolve_entity`** — Resolves a free-text name into platform identifiers for filtering other tools: commodity hubs, HS headings, NCM codes and partner countries.
- **`kyrodata_run_report`** — Runs one of the product's pre-built catalogue reports by id and returns its rows, with the report's own parameters and an optional column projection.
- **`kyrodata_search`** — Searches the public Brazilian foreign-trade catalogue and returns document ids for `kyrodata_fetch` — HS headings and partner countries, each with a public URL.

## Install and run

As an MCP server via npm:

```bash
npx -y @reneturcios/comexscope mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "comexscope": {
      "command": "npx",
      "args": ["-y", "@reneturcios/comexscope", "mcp"]
    }
  }
}
```

As a container:

```bash
docker run -i ghcr.io/cloudcorprecords/comexscope
docker run --rm ghcr.io/cloudcorprecords/comexscope kyrodata_search '{"query":"soja"}'
```

## CLI

One binary serves both the command line and the MCP server. Each tool is a subcommand taking a single JSON string with that tool's arguments:

```bash
comexscope kyrodata_compare_trade '{"flow":"export","mode":"ytd"}'
comexscope kyrodata_get_heading_overview '{"sh4":"1201","flow":"export"}'
comexscope kyrodata_resolve_entity '{"q":"China"}'
comexscope kyrodata_search '{"query":"soja"}'
comexscope kyrodata_get_data_coverage '{}'
comexscope --version
```

Exit codes: `0` when the forwarded call succeeds, `1` when the upstream result is an error, and `2` for usage problems such as an unknown subcommand or a malformed JSON argument.

## Configuration

- `KYRODATA_MCP_URL` — Overrides the upstream endpoint. The default is the pinned hosted endpoint, `https://mcp.kyrodata.com/mcp`. (The override variable is a reconstruction added by this rebuild.)
- `KYRODATA_API_KEY` — When set, its value is sent to the upstream on every request as an `Authorization: Bearer <value>` header; the upstream's registry record pins a secret `Authorization` header on its remote. When it is not set, no key header is sent at all, matching the keyless behaviour the tool surface was captured with. (The env forwarding is a reconstruction added by this rebuild; the captures were keyless.)

Upstream failures — a JSON-RPC error from the service, a non-2xx response, an unreadable body, or a request that fails outright — are reported to the caller as an error result whose text starts with `comexscope error:`.

## How forwarding works

The first forwarded call opens a session: an `initialize` request (protocol version `2025-03-26`), followed by a `notifications/initialized` notification, then the `tools/call` itself. If the service answers the initialize request with an `Mcp-Session-Id` header, that value is carried on every later request, and the open session is reused for the rest of the process. Replies are accepted either as plain JSON or as server-sent events. Successful results pass through verbatim, including any `isError` flag and any extra fields the service includes.

## Development

```bash
npm install
npm run build   # tsc -> dist/ (dist/cli.js is the bin)
npm test        # tsx --test test/*.test.ts — stubbed upstream, no network
npm run dev     # run the CLI from source
```

The test suite checks the served tool list against the captured surface tool by tool, exercises the session handshake and its reuse, covers both key-header branches, and verifies that arguments go upstream untouched and results come back untouched.

## License

MIT — see `LICENSE`. Copyright (c) 2026 Rene Turcios.
