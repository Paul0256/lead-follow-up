// Tests the workflow's Code nodes outside n8n: node tests/code-nodes.test.js workflow/lead-follow-up.json
const wf = require(require("path").resolve(process.argv[2] || "workflow/lead-follow-up.json"));
const code = n => wf.nodes.find(x => x.name === n).parameters.jsCode;
const run = (src, input, refs = {}) => new Function('$input', '$', src)(
  { first: () => ({ json: input }) }, n => ({ first: () => ({ json: refs[n] }) }));
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) };

const good = { body: { name: 'Jane Doe', email: 'Jane@Clinic.com', company: 'Smile Co', message: 'We need a chatbot for our clinic website.', website: '', 'cf-turnstile-response': 'tok' }, headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } };
let v = run(code('Validate'), good)[0].json;
ok(v.ok && v.email === 'jane@clinic.com' && v.ip === '1.2.3.4', 'valid form accepted, email lowercased, real ip');
ok(!run(code('Validate'), { body: { ...good.body, website: 'http://spam' } })[0].json.ok, 'honeypot rejected');
ok(run(code('Validate'), { body: { ...good.body, email: 'nope' } })[0].json.error.includes('email'), 'bad email rejected');
ok(run(code('Validate'), { body: { ...good.body, 'cf-turnstile-response': '' } })[0].json.error.includes('anti-spam'), 'missing token rejected');

const req = run(code('Build Claude request'), {}, { Validate: v })[0].json.body;
ok(req.model === 'claude-sonnet-5-5' && req.output_config.format.schema.required.length === 8, 'claude request shape');
ok(!('temperature' in req) && !('thinking' in req), 'no sampling or thinking params');

const reply = (o, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(o) }] });
const t = { category: 'chat_assistant', spam: false, serious: true, language: 'en', topic: 'An AI chatbot <script>alert(1)</script> see https://evil.com now!!', summary: 'Klinika nori boto.', questions: ['Which pages?'], draft_reply: 'Hi Jane' };
let p = run(code('Parse'), reply(t), { Validate: v })[0].json;
ok(p.confirm && !p.spam && p.Status === 'New' && p.Serious === 'yes', 'normal lead: confirm + owner');
ok(!/[<>:\/]/.test(p.topic) && !p.topic.includes('evil') && p.topic.split(' ').length <= 8, 'topic sanitized: ' + JSON.stringify(p.topic));
ok(p.firstName === 'Jane', 'first name');
p = run(code('Parse'), reply({ ...t, spam: true }), { Validate: v })[0].json;
ok(p.spam && !p.confirm && p.Status === 'Spam', 'spam: logged only');
p = run(code('Parse'), { stop_reason: 'refusal', content: [] }, { Validate: v })[0].json;
ok(!p.spam && !p.confirm && p.Summary.includes('negalėjo'), 'refusal: no confirmation, owner told');
p = run(code('Parse'), { type: 'error', error: { type: 'authentication_error' } }, { Validate: v })[0].json;
ok(!p.confirm && p.Summary.includes('authentication_error'), 'api error: owner told');
