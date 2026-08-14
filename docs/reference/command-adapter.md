# Command adapter protocol

The command adapter connects RuleDrift to any agent that can accept JSON on stdin and write JSON to stdout. It does not invoke a shell.

RuleDrift starts one process for each background turn and probe. Every request contains the complete conversation snapshot, so the adapter itself can stay stateless.

## Request

```json
{
  "protocolVersion": 1,
  "messages": [
    { "role": "system", "content": "...rendered rules..." },
    { "role": "user", "content": "What is the codename?" }
  ],
  "context": {
    "scenarioId": "growing-conversation",
    "kind": "probe",
    "itemId": "after-distraction",
    "afterTurn": 4
  }
}
```

`kind` is `turn` for background conversation or `probe` for an isolated rule check. Context metadata is for logging/routing and should not be inserted into the model prompt unless the adapter intentionally needs it.

## Response

Write one JSON object to stdout and exit with code `0`:

```json
{ "content": "ORBIT" }
```

Logs belong on stderr. A non-zero exit, malformed JSON, missing string `content`, timeout, or more than 1 MiB on either output stream becomes an adapter error.

## Minimal Node adapter

```js
let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;

const request = JSON.parse(source);
const content = await callMyAgent(request.messages);
process.stdout.write(JSON.stringify({ content }));
```

A runnable deterministic example is in [`examples/command`](../../examples/command/).

## Security

- `shell` is always disabled, so configured arguments are passed without shell expansion.
- The child inherits the caller's environment. Treat the adapter as trusted local code.
- RuleDrift redacts common credential patterns from surfaced stderr, but redaction is not a substitute for keeping secrets out of logs.
- Time and output limits bound a stuck or noisy process; they do not sandbox it.
- Never run an adapter from an untrusted repository without reviewing it first.
