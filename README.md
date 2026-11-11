# Lead follow-up: contact form → Claude → email + Google Sheets

An [n8n](https://n8n.io) workflow that answers every website enquiry within a
minute and hands the owner a ready-to-edit reply.

1. A visitor sends the contact form on the website.
2. Spam is filtered out twice: a hidden honeypot field and Cloudflare Turnstile.
3. Claude reads the message and returns a fixed JSON shape: category, spam or
   not, how serious it looks, a short topic, a summary for the owner, up to three
   clarifying questions and a reply draft in the visitor's language.
4. The visitor gets an immediate personal confirmation by email
   ("Thanks for getting in touch about an AI chat assistant for a dental clinic…").
5. The owner gets an email with the summary, the questions and the draft, and
   every enquiry is logged to Google Sheets.

It runs live on the contact form of [pulauskas.dev](https://pulauskas.dev).

## Safety by design

- **No promises in automatic emails.** The confirmation is a fixed template;
  Claude only supplies a short topic, which is stripped of links and symbols
  before it goes into an email to an address anyone could type. The full reply
  is a draft for a person to check.
- **The message is untrusted.** The prompt tells Claude to describe the message,
  never to follow instructions in it, and the output is constrained to a JSON
  schema.
- **Failures are loud, not silent.** If Claude refuses, times out or returns
  something unexpected, no confirmation is sent and the owner still gets the
  enquiry with a note to read it personally.
- **Privacy.** Execution data is kept 14 days, request logs are discarded,
  credentials are stored encrypted by n8n, never in files.

## Files

```
workflow/lead-follow-up.json   the workflow: import it in n8n
deploy/docker-compose.yml      n8n in Docker, behind an existing Caddy
deploy/automation.caddy        Caddy site block (automatic HTTPS)
.env.example                   n8n settings (no API keys here)
tests/code-nodes.test.js       tests of the Code nodes: node tests/code-nodes.test.js
```

## Setup

1. **DNS:** an `A` record for the n8n host (e.g. `automation.example.com`) →
   the server, *DNS only* so Caddy can get the certificate.
2. **Start n8n:**

   ```bash
   git clone https://github.com/Paul0256/lead-follow-up.git /opt/lead-follow-up
   cd /opt/lead-follow-up
   cp .env.example .env && nano .env      # host, encryption key, PROXY_NETWORK
   chmod 600 .env
   docker compose --env-file .env -f deploy/docker-compose.yml up -d
   cp deploy/automation.caddy /opt/caddy-sites/   # then reload Caddy
   ```

3. **In n8n** (create the owner account on first visit): *Workflows → Import
   from file* → `workflow/lead-follow-up.json`, then add the credentials:

   | Node | Credential type | Value |
   |---|---|---|
   | Check Turnstile | Custom Auth | `{"body": {"secret": "<Turnstile secret key>"}}` |
   | Ask Claude | Header Auth | name `x-api-key`, value: Anthropic API key |
   | Log to Google Sheets | Google Service Account | service account email + private key |
   | Both email nodes | SMTP | the sending provider (e.g. Resend: `smtp.resend.com`, port 587 with SSL/TLS off (STARTTLS), user `resend`, password: API key). Many hosts (Hetzner among them) block outgoing port 465. |

   **Check after adding the credentials:** in n8n 2.47 connecting a credential
   in **Ask Claude** can drop the node's body and its `anthropic-version`
   header. Open the node and confirm *Send Headers* has
   `anthropic-version: 2023-06-01` and *Send Body* is on (JSON, expression
   `{{ JSON.stringify($json.body) }}`). Without them Claude answers
   "request body is not valid JSON".
4. Edit `CONFIG` at the top of the **Validate** node (owner email, sender,
   sheet link) and the sheet ID in **Log to Google Sheets**. The sheet's first
   row: `Received, Name, Email, Company, Message, Category, Serious, Summary,
   Draft reply, Status`. Share the sheet with the service account (Editor).
5. **Activate** the workflow. The form posts JSON to
   `https://<n8n host>/webhook/contact` with `name`, `email`, `company`,
   `message`, the hidden `website` field and `cf-turnstile-response`.

## Cost

One Claude call per real enquiry (Claude Sonnet 5.5 at low effort, a fraction of
a cent). Spam that fails the honeypot or Turnstile never reaches Claude.

## License

MIT
