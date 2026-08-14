# MCP setup

RuleDrift includes a local stdio MCP server. It gives compatible AI clients two explicit tools:

- `validate_suite` checks a configuration without calling an agent or model.
- `run_suite` runs the configured tests and returns a response-redacted report.

The server does not inspect every LLM request and does not run unless the client calls one of these tools.

## Client configuration

Use this server entry in a client that supports local stdio MCP servers:

```json
{
  "mcpServers": {
    "rule-drift": {
      "command": "npx",
      "args": ["-y", "rule-drift", "mcp", "--root", "/absolute/path/to/project"]
    }
  }
}
```

Put `rule-drift.config.json` inside that project. The tools use it by default, or may select another configuration inside the same root.

For a version-pinned setup, replace `rule-drift` with `rule-drift@0.1.0`.

## Cost and privacy

The MCP server and RuleDrift are free and open source. A default Ollama suite runs a local model and has no API charge. If the configuration points its command adapter at a paid or remote service, that adapter's own terms still apply.

The server:

- communicates with the client through local stdin/stdout;
- prevents configuration paths from escaping `--root`, including through symlinks;
- permits one running suite per MCP connection;
- omits model response bodies from returned reports;
- never adds telemetry.

`run_suite` can execute the command adapter named in a configuration. Only run suites from a workspace you trust.
