# ShareRing Me Module skill

An agent skill for building **ShareRing Me Modules**: web apps that run inside the
[ShareRing Me](https://sharering.network) app's WebView and use
[`@sharering/me-module-sdk`](https://www.npmjs.com/package/@sharering/me-module-sdk). Every ShareRing Me
user is an ID-verified human, so a module can offer bot-free votes, one-per-person claims, age gates
and proofs on ShareLedger.

The skill gives a coding agent (Claude Code, Codex and others that read `SKILL.md` skills):

- **A scaffolder** (`scripts/new-module.mjs`) and a React/Vite/TypeScript **template**: identity
  discovery, a dynamic manifest server, the ShareLedger write/read kit, ShareRing's "cinema" house
  style, a mock bridge for the browser and an on-phone log of every bridge call.
- **References** for the parts that only fail on a phone: bridge events and their real reply
  shapes, signing on ShareLedger, layouts for phones and foldables, hosting, testing as a custom
  dApp, and submitting to the developer portal.

## Install

Copy the `sharering-me-module` folder into your agent's skills directory, for example:

```bash
git clone https://github.com/ShareRing/me-module-skill.git
cp -r me-module-skill/sharering-me-module ~/.claude/skills/        # Claude Code
cp -r me-module-skill/sharering-me-module ~/.agents/skills/        # Codex and other agents
```

Then ask your agent to build a Me Module, for example *"Build a ShareRing Me Module for a café
loyalty card"*. The skill loads itself when you mention a Me Module, the SDK, a ShareRing custom
dApp or the developer portal.

## Requirements

- Node.js 23.6 or later (the template's server runs `.ts` directly).
- The ShareRing Me app on a phone to test as a custom dApp. In a desktop browser the module runs
  against a mock bridge.

## Status

Built and tested against `@sharering/me-module-sdk` 0.1.x and ShareRing Me v3 on Android
(October 2026). The bridge and manifest details reflect what the app does on a device, which is
sometimes not what the SDK's types say; the references point those cases out.

Issues and pull requests are welcome.

## Licence

[MIT](LICENSE)
