let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;

const request = JSON.parse(source);
const prompt = request.messages.at(-1)?.content ?? '';
process.stdout.write(JSON.stringify({ content: prompt.includes('codename') ? 'ORBIT' : 'OK' }));
