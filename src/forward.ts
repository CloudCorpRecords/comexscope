/**
 * comexscope core: a forwarding client for the hosted
 * Kyrodata MCP server.
 *
 * No trade data lives on this machine. tools/list is
 * answered from the literal definitions below, which
 * reproduce a live capture of the upstream server word
 * for word (name, title, description and inputSchema
 * exactly as captured, including each schema's
 * `$schema` draft marker, `additionalProperties: false`,
 * and the fact that `kyrodata_get_credit_balance` and
 * `kyrodata_get_data_coverage` declare no `required`
 * field). A tools/call travels upstream over a
 * streamable-HTTP JSON-RPC session: an initialize POST,
 * a notifications/initialized POST, then the tools/call
 * POST, carrying the Mcp-Session-Id response header on
 * later requests when the upstream issues one. The
 * session opens lazily on the first forwarded call and
 * is reused for the client's lifetime.
 *
 * The endpoint is pinned to
 * https://mcp.kyrodata.com/mcp and may be replaced
 * with the KYRODATA_MCP_URL environment variable (that
 * override is a labelled reconstruction). The upstream
 * registry record pins a secret `Authorization` header;
 * the captures were taken keyless. When KYRODATA_API_KEY
 * is set, every upstream request carries an
 * `Authorization: Bearer <key>` header (that env
 * forwarding is a labelled reconstruction). When it is
 * unset, no key header goes out.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures \u2014 an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch
 * that throws or times out \u2014 become an isError result
 * whose text begins with `comexscope error:` (that
 * rendering is a labelled reconstruction). Replies may
 * be plain JSON or SSE (`data:` lines); the JSON-RPC
 * message whose id matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://mcp.kyrodata.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/kyrodata-tools-original.json;           */
/* generated programmatically by parsing and re-serialising the        */
/* fixture JSON, never retyped)                                        */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "kyrodata_compare_trade",
    "title": "Compare exports/imports between equal windows",
    "description": "Compares Brazil's exports or imports between two equal-length windows (like-for-like), in value (USD FOB) and in volume (kg). `mode` changes the reading: quarterly, semestral, annual, ytd and rolling_3m/6m/12m look a year back and hold the season constant, while monthly and semestral_sequential compare against the period immediately before and cross one. `codes` and `countryIds` filter both windows alike and combine: together they isolate one product to one partner (1201 soybean to 160 China); omitted, every product and partner counts. The result carries both windows, the % change of each metric, the window label, whether it crosses a season, and the monthly series spanning both, capped at 24 months. This returns the FIGURES of a comparison — kyrodata_resolve_comparison_window only names the window, and kyrodata_list_trade_series hands over raw monthly points without comparing them. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "flow": {
          "type": "string",
          "enum": [
            "export",
            "import"
          ],
          "description": "Direction of the trade flow, from Brazil’s side: `export` leaves the country, `import` enters it."
        },
        "codes": {
          "description": "Products to filter by, as HS codes — 4 digits (heading), 6 (subheading) or 8 (Brazilian NCM), up to 10. Omit for every product. kyrodata_resolve_entity turns a product name into its code.",
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}(\\d{2}|\\d{4})?$"
          }
        },
        "countryIds": {
          "description": "Partner countries to filter by, as ids from kyrodata_resolve_entity. Omit for every partner.",
          "maxItems": 5,
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[A-Za-z0-9]{1,6}$"
          }
        },
        "mode": {
          "type": "string",
          "enum": [
            "monthly",
            "quarterly",
            "semestral",
            "semestral_sequential",
            "annual",
            "ytd",
            "rolling_3m",
            "rolling_6m",
            "rolling_12m"
          ],
          "description": "Which pair of equal-length windows to compare. Against the same period a year earlier: `quarterly`, `semestral`, `annual`, `ytd` (January to the last published month) and `rolling_3m`/`6m`/`12m`. Against the period immediately before, which crosses a season: `monthly` and `semestral_sequential`. Use `ytd` when the question names no period."
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "flow",
        "mode"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_explain_pyramid_level",
    "title": "Explain one level of the forecast pyramid",
    "description": "Explains the pyramid's arithmetic for one commodity and horizon: the seven levels side by side (label, push %, weight share, confidence, contribution %) and, for the levels that did not enter, the reason with its ruler (hit rate vs base rate, number of origins). `horizon` fixes the month and shows the seven levels; `levelKey` flips the cut, following one level across all four horizons instead. This is the drill-down of kyrodata_get_hub_summary — the 'por quê?' behind a verdict that tool already gave. A question about the physical harvest rather than the arithmetic belongs to kyrodata_get_climate_reading. Credit class: level (any level tool in a 60-second session = 2 credits; a session is capped at 3).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "hub": {
          "type": "string",
          "enum": [
            "sugar",
            "beef",
            "coffee",
            "ethanol",
            "chicken",
            "corn",
            "soybean",
            "pork",
            "crude-oil",
            "natural-gas",
            "iron-ore",
            "aluminum",
            "copper",
            "gold",
            "urea",
            "potash",
            "phosphate",
            "cotton",
            "cocoa",
            "orange-juice",
            "wheat",
            "rice"
          ],
          "description": "Which commodity hub to read."
        },
        "horizon": {
          "type": "string",
          "enum": [
            "m1",
            "m3",
            "m6",
            "m12"
          ],
          "description": "How far ahead the forecast looks: 1, 3, 6 or 12 months from the last published month."
        },
        "levelKey": {
          "description": "One level of the pyramid. Given, the answer follows that level across all four horizons instead of showing the seven side by side.",
          "type": "string",
          "enum": [
            "climate",
            "costs",
            "production",
            "logistics",
            "trade",
            "macro",
            "supply_demand"
          ]
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "hub",
        "horizon"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_fetch",
    "title": "Open one public trade document by id",
    "description": "Opens ONE public foreign-trade document by id and returns it as prose to quote: title, body text and a public URL for citation. `id` is not free text — it is an id kyrodata_search returned, shaped `heading:1201` (an HS heading) or `country:160` (a partner country); anything else is refused rather than guessed. The body carries the measured figures of the latest published year, Brazilian exports and imports in USD FOB and kg, plus the window, the source and its caveats. Public government trade data only. The output here is a citable DOCUMENT with a URL, and this is the only tool that returns one. A heading as structured figures and a monthly series to reason over is kyrodata_get_heading_overview; free text to find an id in the first place is kyrodata_search. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "id": {
          "type": "string",
          "minLength": 3,
          "maxLength": 64,
          "description": "Identifier of a document returned by kyrodata_search. Not a free-text query."
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_climate_reading",
    "title": "Climate reading and physical crop loss",
    "description": "Current climate reading for a commodity: risk level, the measured production shock in % of the harvest, and the projected physical loss in tonnes per horizon (1, 3, 6 and 12 months) with its range. `scope` sets the geographic cut — 'br' (the default) reads the country, 'region:SE' a macro-region (N, NE, CW, SE, S), 'uf:MG' a single state — and moves only the risk level and the shock: the loss in tonnes stays national at any scope. A commodity without a validated model returns a descriptive reading with no verdict, and a season not yet measurable returns the previous one, each flagged in the caveats. Climate here predicts PRODUCTION. The price question for the same hub is kyrodata_get_hub_summary, and the published season-by-season balance sheet is kyrodata_get_supply_demand_balance. Credit class: level (any level tool in a 60-second session = 2 credits; a session is capped at 3).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "hub": {
          "type": "string",
          "enum": [
            "sugar",
            "beef",
            "ethanol",
            "chicken",
            "pork",
            "cocoa",
            "orange-juice",
            "wheat",
            "rice"
          ],
          "description": "Which commodity hub to read. Climate forecasts PRODUCTION, never price."
        },
        "scope": {
          "description": "Geographic cut: `br` for the whole country, `region:<N|NE|CW|SE|S>` for a macro-region, or `uf:<XX>` for a state. Defaults to the country.",
          "type": "string",
          "pattern": "^(br|region:(N|NE|CW|SE|S)|uf:[A-Z]{2})$"
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "hub"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_credit_balance",
    "title": "Credit balance and limits for this key",
    "description": "Reports the credit balance and the limits of the API key making the request: credits left in the current cycle and when it resets, the daily credit and daily call ceilings of the key, and which tools the key reaches. `response_format` is the only input and it changes verbosity, not scope — there is no argument that selects another key, since the answer describes whichever key authenticated this call. It reads no market data, so it answers a question about the ACCOUNT, never about trade, climate or a commodity. A question about how far the data itself goes is kyrodata_get_data_coverage. Credit class: free (0 credits).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_data_coverage",
    "title": "Data coverage and latest closed month",
    "description": "Returns the calendar of the trade data: first and last published month (YYYYMM), whether the current year is partial, the last fully closed month, and when the aggregates were last refreshed. `response_format` is the only input; the answer covers the whole dataset, so there is no window or product to narrow it with. This answers 'até quando tem dado?' and 'qual o último mês?' — the CALENDAR, never figures. Turning that calendar into a like-for-like window is kyrodata_resolve_comparison_window; reading the figures inside it is kyrodata_get_heading_overview. Credit class: free (0 credits).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_heading_overview",
    "title": "Overview of an HS heading (SH4)",
    "description": "Structured read of ONE HS heading (SH4, 4 digits) for exports or imports: totals of the published year (USD FOB, kg), the last closed month against the previous one (average price per kg and volume), and a monthly price-by-volume series. `year` centres the overview and defaults to the most recent published year, with coverage starting in 2000; `months` sets only how far the series reaches back from the last published month, and leaves the totals untouched. A caveat states that US$/kg is an average unit value, not a quoted price. Public data. The output here is FIGURES and a series to reason over. The same heading as a citable document with a URL is kyrodata_fetch, and a comparison between two windows is kyrodata_compare_trade. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "sh4": {
          "type": "string",
          "pattern": "^\\d{4}$",
          "description": "The 4-digit HS heading to describe."
        },
        "flow": {
          "type": "string",
          "enum": [
            "export",
            "import"
          ],
          "description": "Direction of the trade flow, from Brazil’s side: `export` leaves the country, `import` enters it."
        },
        "year": {
          "description": "Calendar year of the TOTALS (USD FOB, kg). Omit for the most recent published year; coverage starts in 2000. The month-over-month figures and the price-by-volume series always describe the latest published months, whatever `year` says.",
          "type": "integer",
          "minimum": 2000,
          "maximum": 2099
        },
        "months": {
          "description": "Length of the monthly series returned, counting back from the last published month.",
          "type": "integer",
          "minimum": 3,
          "maximum": 60
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "sh4",
        "flow"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_hub_summary",
    "title": "Commodity hub summary and forecast verdict",
    "description": "Reads the Kyrodata pyramid verdict for a commodity hub: direction of the leading horizon, expected move in % per horizon (1, 3, 6 and 12 months), the 80% band as a half-width in percentage points, which levels drive the verdict and the measured accuracy. A horizon without an arrow names the reason, and an empty one means no level passed the confidence gate: no signal, not a stable price. `horizon` re-centres the verdict on the month given; omitted, it centres on the horizon the model leads with, and all four come back either way. It also carries the month-over-month and year-over-year % change of the reference price and its kind (doméstico, mundial or paridade de exportação), never the price level. This is the tool for where a hub's price is heading. The arithmetic behind the verdict is kyrodata_explain_pyramid_level, and the physical harvest of the same hub is kyrodata_get_climate_reading. Credit class: level (any level tool in a 60-second session = 2 credits; a session is capped at 3).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "hub": {
          "type": "string",
          "enum": [
            "sugar",
            "beef",
            "coffee",
            "ethanol",
            "chicken",
            "corn",
            "soybean",
            "pork",
            "crude-oil",
            "natural-gas",
            "iron-ore",
            "aluminum",
            "copper",
            "gold",
            "urea",
            "potash",
            "phosphate",
            "cotton",
            "cocoa",
            "orange-juice",
            "wheat",
            "rice"
          ],
          "description": "Which commodity hub to read."
        },
        "horizon": {
          "description": "How far ahead the forecast looks: 1, 3, 6 or 12 months from the last published month. Omitted, the verdict centres on the horizon the model leads with; given, it re-centres on that one — either way all four horizons come back.",
          "type": "string",
          "enum": [
            "m1",
            "m3",
            "m6",
            "m12"
          ]
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "hub"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_get_supply_demand_balance",
    "title": "Supply and demand balance sheet",
    "description": "Published supply and demand balance (physical, in tonnes) for one agricultural hub, season by season: production, imports, exports, consumption, initial and final stock, whether the season is still an estimate, and how many months a partial season measures. `hub` accepts only the hubs that have a published balance sheet, which is fewer than the hubs the forecast tools cover; `closedOnly` drops the current season, which is a projection and still moves. The source is a Brazilian government body and is named in the result. This is the physical BALANCE of a season. The price verdict for the same hub is kyrodata_get_hub_summary, and the weather risk behind production is kyrodata_get_climate_reading. Credit class: level (any level tool in a 60-second session = 2 credits; a session is capped at 3).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "hub": {
          "type": "string",
          "enum": [
            "soybean",
            "corn",
            "wheat",
            "rice",
            "cotton",
            "beef",
            "chicken",
            "pork",
            "coffee",
            "sugar"
          ],
          "description": "Which commodity hub to read. Only hubs with a published balance sheet appear here."
        },
        "closedOnly": {
          "description": "Restrict to seasons already closed. The current season is a projection and still moves.",
          "type": "boolean"
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "hub"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_list_trade_partners",
    "title": "Top partner countries with growth",
    "description": "Ranks Brazil's partner countries for exports or imports, one row per country with value (USD FOB), volume (kg), price per kg and share of the window. `from`/`to` are YYYYMM and default to the last 12 published months; `codes` narrows to HS codes (4, 6 or 8 digits) so the ranking answers 'who buys THIS product'; `withGrowth` adds the last 12 months against the previous 12, which is the only way growth enters the answer. The country is the OUTPUT of this tool, so it takes no country filter — a question about one known country is a filter on kyrodata_compare_trade or kyrodata_list_trade_series instead. This ranks partners inside one window; comparing two windows is kyrodata_compare_trade. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "flow": {
          "type": "string",
          "enum": [
            "export",
            "import"
          ],
          "description": "Direction of the trade flow, from Brazil’s side: `export` leaves the country, `import` enters it."
        },
        "codes": {
          "description": "Products to filter by, as HS codes — 4 digits (heading), 6 (subheading) or 8 (Brazilian NCM), up to 10. Omit for every product. kyrodata_resolve_entity turns a product name into its code.",
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}(\\d{2}|\\d{4})?$"
          }
        },
        "from": {
          "description": "First month of the window, as YYYYMM (200403 = March 2004). Omit for the last twelve published months.",
          "type": "integer",
          "minimum": 200001,
          "maximum": 209912
        },
        "to": {
          "description": "Last month of the window, as YYYYMM. Omit for the last published month.",
          "type": "integer",
          "minimum": 200001,
          "maximum": 209912
        },
        "limit": {
          "description": "How many partner countries to return, largest first by value.",
          "type": "integer",
          "minimum": 1,
          "maximum": 300
        },
        "withGrowth": {
          "description": "Also return each partner’s growth: the twelve months ending at `to` against the twelve before them. It does NOT follow `from` — with a window of any other length, the ranking and the growth describe different periods.",
          "type": "boolean"
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "flow"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_list_trade_series",
    "title": "Raw monthly trade series as rows",
    "description": "Returns Brazil's monthly export or import series as rows — one row per month, with value (USD FOB), volume (kg) and the implied price per kg. `from`/`to` are YYYYMM and default to the last 24 published months; the span is capped at 200 months and a wider one is refused rather than silently truncated. A month with nothing published is ABSENT from the series rather than present as zero, so gaps stay visible instead of reading as collapse. `codes` and `countryIds` narrow the same series and can combine, which is how a single product-and-partner line is drawn. This hands over the POINTS. A question about them — two equal windows compared — is kyrodata_compare_trade, and a ranking of partners inside one window is kyrodata_list_trade_partners. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "flow": {
          "type": "string",
          "enum": [
            "export",
            "import"
          ],
          "description": "Direction of the trade flow, from Brazil’s side: `export` leaves the country, `import` enters it."
        },
        "codes": {
          "description": "Products to filter by, as HS codes — 4 digits (heading), 6 (subheading) or 8 (Brazilian NCM), up to 10. Omit for every product. kyrodata_resolve_entity turns a product name into its code.",
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}(\\d{2}|\\d{4})?$"
          }
        },
        "countryIds": {
          "description": "Partner countries to filter by, as ids from kyrodata_resolve_entity. Omit for every partner.",
          "maxItems": 5,
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[A-Za-z0-9]{1,6}$"
          }
        },
        "from": {
          "description": "First month of the window, as YYYYMM (200403 = March 2004). Omit for the last twenty-four published months.",
          "type": "integer",
          "minimum": 200001,
          "maximum": 209912
        },
        "to": {
          "description": "Last month of the window, as YYYYMM. Omit for the last published month.",
          "type": "integer",
          "minimum": 200001,
          "maximum": 209912
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "flow"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_resolve_comparison_window",
    "title": "Build a like-for-like comparison window",
    "description": "Resolves an equal-length comparison window (like-for-like) for the trade data, anchored on the last fully published month, and returns ONLY the window metadata — from, to, label, months and whether it crosses a season. No figures. `mode` splits into two families, and the split is what matters: quarterly, semestral, annual, ytd and rolling_3m/6m/12m compare against the same period a year earlier and hold the season constant, while monthly and semestral_sequential compare against the period immediately before and therefore cross one. `ytd` runs January to the last published month, in both years. This exists to NAME a window in prose before it is described. The same window resolved internally and answered with value and volume in one call is kyrodata_compare_trade. Credit class: free (0 credits).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "monthly",
            "quarterly",
            "semestral",
            "semestral_sequential",
            "annual",
            "ytd",
            "rolling_3m",
            "rolling_6m",
            "rolling_12m"
          ],
          "description": "Which pair of equal-length windows to compare. Against the same period a year earlier: `quarterly`, `semestral`, `annual`, `ytd` (January to the last published month) and `rolling_3m`/`6m`/`12m`. Against the period immediately before, which crosses a season: `monthly` and `semestral_sequential`. Use `ytd` when the question names no period."
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "mode"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_resolve_entity",
    "title": "Resolve country, HS code or commodity",
    "description": "Resolves a free-text name into platform identifiers for FILTERING other tools: commodity hubs (slug plus anchor SH4), HS headings (SH4), NCM codes (8 digits) and partner countries (country id). 'soja' resolves to the soybean hub and SH4 1201; 'China' to country id 160. `query` takes a name already known rather than a topic to explore, and up to 10 matches per kind come back — an ambiguous term returns the candidates instead of one guess, so the caller picks. The output is an ID to pass to another tool, and it carries no document and no URL. Finding what exists in the public catalog, and getting a citable document back, is kyrodata_search. Credit class: free (0 credits).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "q": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64,
          "description": "What to look up, in plain words: a country, a product, or a code. Portuguese and English both work."
        },
        "kinds": {
          "description": "Narrow the search to these kinds of entity. Omit to search all of them.",
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "country",
              "heading",
              "ncm",
              "hub"
            ]
          }
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "q"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_run_report",
    "title": "Run one of the catalog reports",
    "description": "Runs one of the product's pre-built catalogue reports by id and returns its rows, up to 50. `reportId` is an enum of the catalogue's ids, so the whole catalogue travels in this schema and no lookup call is needed; `params` carries the values the chosen report declares, and `columnIds` narrows the projection — omitted, the report's default columns come back, and the columns that identify each row are included either way. Columns locked behind a paid plan are declared, with a header stating what an upgrade unlocks, while their values stay out. Rows count against the account's export quota. This serves a report that already exists as a product. An ad-hoc question about trade is kyrodata_compare_trade or kyrodata_list_trade_series, and a citable public document is kyrodata_fetch. Credit class: comex (up to 2 comex tools per 60-second session = 1 credit).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "reportId": {
          "type": "string",
          "enum": [
            "comex.exports.1",
            "comex.imports.1",
            "comex.partners.1",
            "comex.opportunities.1",
            "comex.series.1",
            "comex.elasticities.1",
            "comex.heading.partners.1",
            "comex.country.basket.1",
            "hub.trade.flow.1",
            "hub.trade.flow.2",
            "hub.production.regions.1",
            "hub.production.regions.2",
            "hub.balance.sheet.1",
            "hub.climate.regions.1",
            "costs.survey.1",
            "climate.history.1"
          ],
          "description": "Which catalogue report to run, by id. Each report declares its own parameters, which go in `params`."
        },
        "params": {
          "description": "Values for the parameters the chosen report declares.",
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "number"
              },
              {
                "type": "boolean"
              }
            ]
          }
        },
        "columnIds": {
          "description": "Only these columns, by id. Omit for the report’s default set; the columns that identify a row are always returned.",
          "minItems": 1,
          "maxItems": 20,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "limit": {
          "description": "Maximum rows to return.",
          "type": "integer",
          "minimum": 1,
          "maximum": 50
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "reportId"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "kyrodata_search",
    "title": "Search the public trade catalog",
    "description": "Searches the public Brazilian foreign-trade catalogue and returns document ids for kyrodata_fetch — HS headings (SH4, 4 digits) and partner countries — each with a public URL. `query` is free text in Portuguese or a code, and both reach the same place: 'soja' and '1201' land on the soybean heading, 'China' on the partner country. This is DISCOVERY: it finds what exists when the caller has words rather than an id. Turning a name already known into an id for filtering another tool is kyrodata_resolve_entity, which returns no document and no URL. Credit class: free (0 credits).",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 2,
          "maxLength": 120,
          "description": "What to look for, in plain words. Returns document ids to pass to kyrodata_fetch."
        },
        "response_format": {
          "description": "How much of the answer to return. `concise` (the default) carries the headline figures; `detailed` adds the row-level series behind them and counts against the export quota.",
          "type": "string",
          "enum": [
            "concise",
            "detailed"
          ]
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `comexscope error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding a single upstream session,
 * opened lazily on first use and reused from then on
 * (for the process lifetime in the MCP server, or for a
 * single invocation in the CLI).
 */
export class ComexscopeClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).KYRODATA_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).KYRODATA_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["Authorization"] = `Bearer ${key}`;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "comexscope", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): ComexscopeClient {
  return new ComexscopeClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new ComexscopeClient(deps).callTool(name, args);
}
