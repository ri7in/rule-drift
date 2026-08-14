import { setTimeout as sleep } from 'node:timers/promises';

let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;

const request = JSON.parse(source);
const prompt = request.messages.at(-1)?.content ?? '';
const delay = Number.parseInt(process.env.RULE_DRIFT_TEST_DELAY_MS ?? '0', 10);
if (delay > 0) await sleep(delay);
process.stdout.write(JSON.stringify({ content: prompt.includes('codename') ? 'ORBIT' : 'OK' }));
