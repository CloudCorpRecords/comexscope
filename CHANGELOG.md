# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted Kyrodata MCP server. The fifteen captured tools are answered locally for tools/list, and every tools/call is forwarded upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when the upstream issues one).
- Tools: `kyrodata_compare_trade`, `kyrodata_explain_pyramid_level`, `kyrodata_fetch`, `kyrodata_get_climate_reading`, `kyrodata_get_credit_balance`, `kyrodata_get_data_coverage`, `kyrodata_get_heading_overview`, `kyrodata_get_hub_summary`, `kyrodata_get_supply_demand_balance`, `kyrodata_list_trade_partners`, `kyrodata_list_trade_series`, `kyrodata_resolve_comparison_window`, `kyrodata_resolve_entity`, `kyrodata_run_report` and `kyrodata_search`. The surface reads published Brazil foreign-trade data and the vendor's derived readings; `kyrodata_get_credit_balance` reads the caller's own key balance. No tool writes, buys, subscribes, checks out or mints a key.
- Upstream results pass through verbatim, including the isError flag; upstream failures surface as `comexscope error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). The upstream endpoint can be overridden via `KYRODATA_MCP_URL`; when `KYRODATA_API_KEY` is set it is sent as an `Authorization: Bearer` header on every upstream request.
