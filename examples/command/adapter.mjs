#!/usr/bin/env node

let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;

const request = JSON.parse(source);
const lastMessage = request.messages.at(-1)?.content ?? '';
const systemMessage = request.messages.find((message) => message.role === 'system')?.content ?? '';

const content =
  /codename/iu.test(lastMessage) && /ORBIT/u.test(systemMessage)
    ? 'ORBIT'
    : `Acknowledged: ${lastMessage}`;

process.stdout.write(`${JSON.stringify({ content })}\n`);
