---
title: The ri command
description: Every `ri` command and option, generated from the code.
---

The `ri` command runs and looks after Ri on a computer. Every command takes `--help`, which prints the same details as this page.

This page is generated from the code by `pnpm guide:reference`. Edit the code, not this page.

| Command | What it does |
| --- | --- |
| `ri start` | Start Ri, keep it running in the background, and open the app |
| `ri stop` | Stop Ri, and keep it stopped after restarts until `ri start` |
| `ri onboard` | Run first-run setup (or re-configure an existing install) |
| `ri pair` | Mint a new device key and print its pairing URL + QR |
| `ri doctor` | Run diagnostic checks |
| `ri restart` | Restart the Home at the next idle moment |
| `ri logs` | Show the Home's service log |
| `ri voice` | Manage speech recognition: optional packaged model or external Docker sidecar |
| `ri acp` | Connect a configured Ri agent to Buzz over ACP stdio |
| `ri snapshot` | Write a local, dated snapshot (DB + markdown) to `<app-root>/snapshots/` |
| `ri commit` | Flush the mirror and git-commit the brain dir (init git if needed) |
| `ri export` | Force a full sync of the live markdown mirror |
| `ri agent` | Agent orchestrator surface. Typed, auto-generated CLI twin of the orchestrator MCP. |
| `ri skills` | Install and manage the skills this app ships for agent sessions |
| `ri trigger` | Manage scheduled agent work (cron, interval, one-shot, webhook). |
| `ri runs` | List recent runs across all triggers + manual chats. |
| `ri run` | Operate on a single run. |
| `ri spend` | Spending rollups across runs (today / week / month). |
| `ri browser` | Control the agent browser |
| `ri tls` | Manage the local HTTPS certificate trust |
| `ri home` | This root's home identity |
| `ri status` | Show what this folder is and whether every Home on this computer is running |
| `ri setup` | Your agents' folders on this device, as your Ri records them |
| `ri connect` | Connect this device to your existing Ri, with a pairing link from its Devices settings |
| `ri disconnect` | Disconnect this device from your Ri. Your data stays there. |
| `ri mcp` | Connect agents on this computer (Claude Code, Codex, Cursor and more) to Ri’s MCP |
| `ri worker` | Run agents on this device for your Ri |
| `ri service` | Manage the local background backend shared by desktop and CLI |
| `ri perf` | Show what has been holding the server: stalls, slow queries and request rates |
| `ri update` | Update Ri on this computer, then switch every Home to the new version |
| `ri attachment` | Upload an existing file to Ri |
| `ri team` | Host a team space: shared tasks and notes, without AI |

## ri start

Start Ri, keep it running in the background, and open the app.

```sh
ri start [options]
```

| Option | What it does |
| --- | --- |
| `--root <dir>` | the Home's folder, when it isn't ~/ri |
| `--foreground` | run in this terminal instead of the background, for debugging |
| `-p, --port <number>` | port for a new Home (default: 4224, or 42241 with --dev) |
| `--no-open` | do not launch the browser |
| `--pair` | open the pairing URL even if already paired |
| `--dev` | run the server in dev mode (next dev) instead of production |
| `--voice` | start the voice sidecar (overrides saved preference) |
| `--no-voice` | skip the voice sidecar (overrides saved preference) |
| `--portless [name]` | front the dev server with portless.sh at `<name>.localhost` (default: ri) |
| `--http2` | front the app with the built-in HTTPS/HTTP2 gateway |
| `--no-http2` | use the direct HTTP startup path (overrides RI_HTTP2) |
| `--tls-cert <path>` | use an existing certificate instead of generating one (requires --tls-key) |
| `--tls-key <path>` | private key for --tls-cert |
| `--hot` | enable the client-side hot-path tracker (sets NEXT_PUBLIC_HOT=1) |

## ri stop

Stop Ri, and keep it stopped after restarts until `ri start`.

```sh
ri stop [options]
```

| Option | What it does |
| --- | --- |
| `--root <dir>` | the Home, when this computer runs several |
| `-p, --port <number>` | port of the instance to stop |
| `--dev` | target the dev instance (dev data root, default port 42241) |
| `-f, --force` | send SIGKILL immediately instead of SIGTERM |
| `-t, --timeout <ms>` | how long to wait for graceful shutdown (default: "5000") |

## ri onboard

Run first-run setup (or re-configure an existing install)

```sh
ri onboard [options]
```

| Option | What it does |
| --- | --- |
| `-p, --port <number>` | port to probe for an already-running instance (default: "4224") |
| `--force` | run the full wizard even if already onboarded |

## ri pair

Mint a new device key and print its pairing URL + QR.

```sh
ri pair [options]
```

| Option | What it does |
| --- | --- |
| `-n, --name <name>` | label for the new device (shown in web UI) |
| `-t, --type <type>` | device type: desktop \| laptop \| phone \| tablet \| cli \| other |
| `--lan` | use the LAN IP instead of the remote URL |
| `--local` | use localhost instead of the remote URL |
| `--set-url <url>` | save a public/tunnel base URL for off-network pairing |
| `--clear-url` | forget the saved public/tunnel base URL |

## ri doctor

Run diagnostic checks.

```sh
ri doctor [options]
```

| Option | What it does |
| --- | --- |
| `--fix` | make `ri` in a new terminal run Ri when it runs something else, such as Ruby's ri |

## ri restart

Restart the Home at the next idle moment.

```sh
ri restart [options]
```

| Option | What it does |
| --- | --- |
| `--now` | don't wait for running chats, which ends them |
| `--root <dir>` | the Home, when this computer runs several |

## ri logs

Show the Home's service log.

```sh
ri logs [options]
```

| Option | What it does |
| --- | --- |
| `-f, --follow` | keep printing new lines |
| `-n, --lines <count>` | how many lines to show (default: "200") |
| `--root <dir>` | the Home, when this computer runs several |

## ri voice

Manage speech recognition: optional packaged model or external Docker sidecar.

```sh
ri voice [options] [command]
```

### ri voice managed

Manage the optional packaged local speech model through the running Ri service.

```sh
ri voice managed [options] [command]
```

#### ri voice managed status

Show model installation and helper readiness.

```sh
ri voice managed status [options]
```

#### ri voice managed install

Download the pinned model or verify and repair its files.

```sh
ri voice managed install [options]
```

#### ri voice managed pause

Pause the download and retain partial files for resume.

```sh
ri voice managed pause [options]
```

#### ri voice managed remove

Remove the downloaded model and partial files.

```sh
ri voice managed remove [options]
```

#### ri voice managed enable

Use the installed managed Parakeet model.

```sh
ri voice managed enable [options]
```

#### ri voice managed disable

Use the configured external service instead.

```sh
ri voice managed disable [options]
```

#### ri voice managed allow-cloud

Allow automatic provider selection to send audio to Groq when local speech is unavailable.

```sh
ri voice managed allow-cloud [options]
```

#### ri voice managed local-only

Disable automatic cloud fallback.

```sh
ri voice managed local-only [options]
```

### ri voice status

Show voice service status.

```sh
ri voice status [options]
```

### ri voice start

Start the voice sidecar.

```sh
ri voice start [options]
```

### ri voice stop

Stop the voice sidecar (keeps model cache)

```sh
ri voice stop [options]
```

### ri voice restart

Restart the voice sidecar.

```sh
ri voice restart [options]
```

### ri voice enable

Remember to auto-start voice with the server.

```sh
ri voice enable [options]
```

### ri voice disable

Stop auto-starting voice with the server.

```sh
ri voice disable [options]
```

### ri voice logs

Tail voice sidecar logs (Ctrl-C to exit)

```sh
ri voice logs [options]
```

## ri acp

Connect a configured Ri agent to Buzz over ACP stdio.

```sh
ri acp [options]
```

| Option | What it does |
| --- | --- |
| `--url <url>` | Ri conversation bridge URL (or RI_CONVERSATION_URL) |

## ri snapshot

Write a local, dated snapshot (DB + markdown) to `<app-root>/snapshots/`.

```sh
ri snapshot [options]
```

| Option | What it does |
| --- | --- |
| `-o, --out <path>` | custom output directory (bypasses dated-folder convention) |

## ri commit

Flush the mirror and git-commit the brain dir (init git if needed)

```sh
ri commit [options]
```

## ri export

Force a full sync of the live markdown mirror.

```sh
ri export [options] [command]
```

### ri export path

Print the brain directory.

```sh
ri export path [options]
```

### ri export status

Show mirror file counts per type.

```sh
ri export status [options]
```

## ri agent

Agent orchestrator surface. Typed, auto-generated CLI twin of the orchestrator MCP.

```sh
ri agent [options] [command]
```

Every action is a subcommand: `ri agent <action>`, with each parameter as a `--flag` or the whole input as JSON with `--input`. The output is JSON. See the [actions reference](/docs/reference/actions) for every action and its parameters.

## ri skills

Install and manage the skills this app ships for agent sessions.

```sh
ri skills [options] [command]
```

### ri skills install

Symlink shipped skills into the app data dir (`<app-root>/.claude/skills` and `<app-root>/.agents/skills`). Pass --global to opt in to user-level ~/.claude/skills/ and ~/.agents/skills/.

```sh
ri skills install [options]
```

| Option | What it does |
| --- | --- |
| `--global` | Install into the user-level ~/.claude/skills and ~/.agents/skills instead of the app data dir |

### ri skills remove

Remove shipped-skill symlinks from the app data dir. Pass --global to target ~/.claude and ~/.agents.

```sh
ri skills remove [options]
```

| Option | What it does |
| --- | --- |
| `--global` | Remove from the user-level ~/.claude/skills and ~/.agents/skills |

### ri skills list

List skills installed in the two standard channels. Pass --global for ~/.claude and ~/.agents.

```sh
ri skills list [options]
```

| Option | What it does |
| --- | --- |
| `--global` | List from the user-level ~/.claude/skills and ~/.agents/skills |

## ri trigger

Manage scheduled agent work (cron, interval, one-shot, webhook).

```sh
ri trigger [options] [command]
```

### ri trigger create

Create a new trigger. Prefer the friendly cadence flags (--manual / --hourly / --daily-at / --weekly-on / --monthly-on / --webhook / --cron) over the low-level --cron/--every/--at trio.

```sh
ri trigger create [options]
```

| Option | What it does |
| --- | --- |
| `--name <name>` | Human-facing name. Unique within scope. |
| `--prompt <prompt>` | Prompt text. One of --prompt or --prompt-file is required. |
| `--prompt-file <path>` | Path to a file containing the prompt text. |
| `--description <text>` | Short description (shown alongside the name). |
| `--manual` | No automatic firing. Only fires via `ri trigger run`. |
| `--hourly` | Fire at the top of every hour. |
| `--daily-at <time>` | Fire daily at HH:MM (e.g. 09:00). |
| `--weekly-on <day>` | Weekday: monday\|tuesday\|... (use with --at). |
| `--monthly-on <day>` | Day of month 1-28 (use with --at). |
| `--at <time>` | HH:MM time, used with --weekly-on / --monthly-on. |
| `--cron <expr>` | 5-field cron expression (advanced). |
| `--every <seconds>` | Interval in seconds. |
| `--run-at <iso>` | Absolute ISO timestamp for a one-shot trigger. |
| `--webhook` | Webhook-triggered trigger. |
| `--timezone <tz>` | IANA timezone for cron interpretation. (default: "UTC") |
| `--target <kind>` | workspace (a fresh chat in that agent each fire) \| orchestrator (a fresh Ri chat each fire) \| session (one existing chat each fire) (default: "workspace") |
| `--workspace <id-or-slug>` | Target workspace (required when target=workspace). |
| `--session <chat-id>` | Chat each fire sends to (target=session). Run from inside a chat, omit it to target that chat. |
| `--provider <id>` | Who runs it: codex \| claude \| cursor \| opencode \| antigravity. Defaults to your default provider. |
| `--model <model>` | Per-run model override. Must belong to the provider. |
| `--effort <level>` | low \| medium \| high \| xhigh \| max \| ultra |
| `--timeout <seconds>` | Run timeout (seconds). |
| `--active-hours <start-end>` | Active-hours window, e.g. 09:00-17:00. Only fires inside the window. |
| `--concurrency <policy>` | skip_if_running \| coalesce_if_active \| allow_concurrent. Defaults to skip_if_running for target=session, coalesce_if_active otherwise. |

### ri trigger list

List triggers.

```sh
ri trigger list [options]
```

| Option | What it does |
| --- | --- |
| `--enabled` | Only enabled triggers. |
| `--workspace <id>` | Restrict to a workspace. |

### ri trigger show

Show a trigger in detail.

```sh
ri trigger show [options] <idOrName>
```

### ri trigger run

Fire a trigger immediately (records as a manual run).

```sh
ri trigger run [options] <idOrName>
```

| Option | What it does |
| --- | --- |
| `--wait` | Block until the run terminates. |

### ri trigger pause

Disable a trigger. Existing runs are unaffected.

```sh
ri trigger pause [options] <idOrName>
```

### ri trigger resume

Re-enable a previously paused trigger.

```sh
ri trigger resume [options] <idOrName>
```

### ri trigger edit

Patch a trigger (prompt, cadence, provider, model, effort).

```sh
ri trigger edit [options] <idOrName>
```

| Option | What it does |
| --- | --- |
| `--prompt <text>` | New prompt text |
| `--cron <expr>` | New cron expression |
| `--every <seconds>` | New interval in seconds |
| `--timezone <tz>` | New timezone |
| `--enabled <bool>` | true \| false |
| `--provider <id>` | Switch who runs it. Resets model and effort to the provider defaults unless --model / --effort are also passed. |
| `--model <model>` | New model. Pass "default" to clear back to the provider default. |
| `--effort <level>` | low \| medium \| high \| xhigh \| max \| ultra, or "default" to clear. |

### ri trigger delete

Delete a trigger. Runs survive with trigger_id=NULL.

```sh
ri trigger delete [options] <idOrName>
```

| Option | What it does |
| --- | --- |
| `--force` | Skip the confirmation prompt. |

## ri runs

List recent runs across all triggers + manual chats.

```sh
ri runs [options]
```

| Option | What it does |
| --- | --- |
| `--unread` | Only runs whose chat is still unread. |
| `--status <s>` | Filter by status. |
| `--trigger <t>` | Filter by trigger. |
| `--trigger-id <id>` | Filter by trigger id. |
| `--limit <n>` | Max rows. |

## ri run

Operate on a single run.

```sh
ri run [options] [command]
```

### ri run show

Fetch a single run.

```sh
ri run show [options] <id>
```

### ri run cancel

Cancel an in-flight run (SIGTERM the executor).

```sh
ri run cancel [options] <id>
```

## ri spend

Spending rollups across runs (today / week / month).

```sh
ri spend [options]
```

| Option | What it does |
| --- | --- |
| `--by <group>` | Group by harness or trigger. |

## ri browser

Control the agent browser.

```sh
ri browser [options] [command]
```

### ri browser open

Open a headed window so you can sign into a site (persists to the profile)

```sh
ri browser open|login [options] [url]
```

| Option | What it does |
| --- | --- |
| `--profile <name>` | profile to open (default: the configured default) |

### ri browser profiles

List the profiles (logged-in identities) the agent can use.

```sh
ri browser profiles [options]
```

### ri browser import

macOS: import cookies for a site from your Chrome/Brave so the agent is signed in.

```sh
ri browser import [options] <domain>
```

| Option | What it does |
| --- | --- |
| `--source <source>` | source browser: chrome or brave (default: "chrome") |
| `--chrome-profile <name>` | source browser profile to read from (default: "Default") |
| `--profile <name>` | target agent profile to import into (default: the configured default) |

### ri browser status

Show whether the agent browser is running, the configured browser, profiles, and activity.

```sh
ri browser status [options]
```

| Option | What it does |
| --- | --- |
| `--profile <name>` | profile to check (default: the configured default) |

### ri browser doctor

Run agent browser readiness checks.

```sh
ri browser doctor [options]
```

### ri browser stop

Close the agent browser (the kill switch)

```sh
ri browser stop [options]
```

| Option | What it does |
| --- | --- |
| `--profile <name>` | profile to close (default: the configured default) |

## ri tls

Manage the local HTTPS certificate trust.

```sh
ri tls [options] [command]
```

### ri tls trust

Generate the local CA if needed and install browser/OS trust.

```sh
ri tls trust [options]
```

| Option | What it does |
| --- | --- |
| `--dev` | target the dev data root |

### ri tls untrust

Remove only this app's own trust entries (keeps supplied certs untouched)

```sh
ri tls untrust [options]
```

| Option | What it does |
| --- | --- |
| `--dev` | target the dev data root |

### ri tls status

Show which trust stores apply here and which are recorded.

```sh
ri tls status [options]
```

| Option | What it does |
| --- | --- |
| `--dev` | target the dev data root |

## ri home

This root's home identity.

```sh
ri home [options] [command]
```

### ri home show

Show the home in this root and the device it runs on.

```sh
ri home show [options]
```

### ri home claim

Make this device the home for the data in this root.

```sh
ri home claim [options]
```

| Option | What it does |
| --- | --- |
| `--as <device>` | which of the home's devices this is, by name or id, or `new` |

### ri home export

Export this stopped home, verified, to move it to another device.

```sh
ri home export [options] <dir>
```

### ri home import

Import an exported home into this folder, to become its home here once claimed.

```sh
ri home import [options] <dir>
```

### ri home retire

Set this folder's stopped home aside for good, after its work moved into another home.

```sh
ri home retire [options]
```

| Option | What it does |
| --- | --- |
| `--to <where>` | where its work lives now, to say so here: a name or an address |
| `--undo` | bring back the home retired last in this folder |
| `-y, --yes` | retire without asking |

## ri status

Show what this folder is and whether every Home on this computer is running.

```sh
ri status [options]
```

| Option | What it does |
| --- | --- |
| `--root <dir>` | only this Home |

## ri setup

Your agents' folders on this device, as your Ri records them.

```sh
ri setup [options] [command]
```

### ri setup attach

Record the folder an agent is in on this device (default: the current folder)

```sh
ri setup attach [options] <agent> [folder]
```

| Option | What it does |
| --- | --- |
| `--link <alias=folder>` | where a linked folder is here, or alias=omit to go without it |

### ri setup link

Where one of an agent's linked folders is on this device, or omit to go without it.

```sh
ri setup link [options] <agent> <alias> <folder>
```

### ri setup ref

Same as link.

```sh
ri setup ref [options] <agent> <alias> <folder>
```

### ri setup relink

Record an agent's folder's new place on this device, after a rename or move.

```sh
ri setup relink [options] <agent> <folder>
```

### ri setup detach

Take an agent off this device. Its folder itself is untouched.

```sh
ri setup detach [options] <agent>
```

## ri connect

Connect this device to your existing Ri, with a pairing link from its Devices settings.

```sh
ri connect [options] [link]
```

| Option | What it does |
| --- | --- |
| `--insecure-http` | allow a plain http:// address on a home network you trust |
| `--no-open` | don't open your Ri in the browser |
| `-y, --yes` | set aside an unused new Ri in this folder without asking |
| `--address <url>` | your Ri answers at a new address: follow it, keeping this device as it is |

## ri disconnect

Disconnect this device from your Ri. Your data stays there.

```sh
ri disconnect [options]
```

## ri mcp

Connect agents on this computer (Claude Code, Codex, Cursor and more) to Ri’s MCP.

```sh
ri mcp [options] [command]
```

### ri mcp connect

Connect an agent to Ri's MCP in one step: its own key, Ri in its user-level configuration and Ri's skill. Agents: claude-code, codex, cursor, vscode, claude-desktop, gemini-cli, opencode, antigravity, kiro.

```sh
ri mcp connect [options] <agent>
```

| Option | What it does |
| --- | --- |
| `--json` | Print the result as JSON |

### ri mcp disconnect

Remove Ri from an agent’s configuration and revoke its key.

```sh
ri mcp disconnect [options] <agent>
```

| Option | What it does |
| --- | --- |
| `--json` | Print the result as JSON |

### ri mcp list

Show which agents on this computer are connected to Ri.

```sh
ri mcp list [options]
```

| Option | What it does |
| --- | --- |
| `--json` | Print the result as JSON |

## ri worker

Run agents on this device for your Ri.

```sh
ri worker [options] [command]
```

### ri worker enroll

Let your Ri run agents on this device.

```sh
ri worker enroll [options]
```

| Option | What it does |
| --- | --- |
| `--code <code>` | an enrollment code made on the computer that hosts your Ri |
| `-y, --yes` | enroll without asking |

### ri worker run

Connect to your Ri and stay connected.

```sh
ri worker run [options]
```

### ri worker status

This device's enrollment.

```sh
ri worker status [options]
```

### ri worker open

Open your Ri in this device's browser, as This Mac.

```sh
ri worker open [options]
```

### ri worker disable

Stop running agents on this device.

```sh
ri worker disable [options]
```

### ri worker grant

On the computer that hosts your Ri: make a code another device enrolls with.

```sh
ri worker grant [options]
```

| Option | What it does |
| --- | --- |
| `--device <name>` | an existing device, by name or id |
| `--name <name>` | a name for a new device |

## ri service

Manage the local background backend shared by desktop and CLI.

```sh
ri service [options] [command]
```

| Option | What it does |
| --- | --- |
| `--root <directory>` | explicit data root |

### ri service start

Start or attach without keeping this terminal open.

```sh
ri service start [options]
```

| Option | What it does |
| --- | --- |
| `--dev` | use the development server |
| `--home` | make this new installation your Ri before starting |

### ri service worker

Stop or resume local execution without stopping your Ri or viewer.

```sh
ri service worker [options] <action>
```

### ri service status

Show the verified service identity and state.

```sh
ri service status [options]
```

### ri service stop

Stop the local backend, disconnecting its clients.

```sh
ri service stop [options]
```

### ri service awake

Keep this device awake on external power: on, off, or status.

```sh
ri service awake [options] [mode]
```

### ri service configure

Inspect or save private service settings. Changes apply on restart.

```sh
ri service configure [options]
```

| Option | What it does |
| --- | --- |
| `--file <json>` | JSON file containing the settings to merge |

### ri service logs

Show the latest local service log.

```sh
ri service logs [options]
```

### ri service stage

Verify and stage a bundled server/Node runtime outside the application.

```sh
ri service stage [options] <resources>
```

### ri service verify

Check every runtime file against its manifest.

```sh
ri service verify [options] <resources>
```

### ri service install

Install the staged runtime as a login service.

```sh
ri service install [options]
```

| Option | What it does |
| --- | --- |
| `--dry-run` | show the service definition without installing it |

### ri service uninstall

Remove login supervision and retain all data and installed runtimes.

```sh
ri service uninstall [options]
```

## ri perf

Show what has been holding the server: stalls, slow queries and request rates.

```sh
ri perf [options]
```

| Option | What it does |
| --- | --- |
| `--since <duration>` | how far back to read, like 30m, 24h or 7d (default: "24h") |
| `--top <n>` | rows in each section (default: "15") |
| `--dev` | read the dev home |
| `--json` | print the summary as JSON |

## ri update

Update Ri on this computer, then switch every Home to the new version.

```sh
ri update [options] [command]
```

| Option | What it does |
| --- | --- |
| `--now` | switch without waiting for running chats, which ends them |
| `--rollback` | go back one release on a Home, after showing what that would lose |
| `--yes` | roll back without asking |
| `--root <dir>` | the Home to roll back, when this computer runs several |
| `--from <folder>` | build releases from this checkout of Ri, or "published" to go back to published releases |
| `--channel <channel>` | which published releases to get (choices: "stable", "latest") |
| `--auto <mode>` | automatic updates for published releases (choices: "on", "off") |

### ri update recover

Retry the recorded recovery after correcting its reported problem. Then start the service again.

```sh
ri update recover [options]
```

### ri update status

```sh
ri update status [options]
```

### ri update preferences

Show or change automatic download preferences without changing the publisher.

```sh
ri update preferences [options]
```

| Option | What it does |
| --- | --- |
| `--automatic-download <mode>` | download verified updates after periodic checks (choices: "on", "off") |
| `--metered <mode>` | pause automatic downloads while enabled (choices: "on", "off") |

### ri update check

Check the configured publisher feed.

```sh
ri update check [options]
```

### ri update download

Download and verify the available runtime.

```sh
ri update download [options]
```

### ri update apply

Approve activation at the next safe point.

```sh
ri update apply [options]
```

### ri update when-idle

Remember approval and wait for work to finish.

```sh
ri update when-idle [options]
```

| Option | What it does |
| --- | --- |
| `--hour <hour>` | maintenance window start, 0-23 |
| `--hours <hours>` | window duration, 1-12 (default: "2") |
| `--timezone <name>` | IANA timezone (default: this computer's time zone) |

### ri update later

Cancel pending activation and keep the download.

```sh
ri update later [options]
```

## ri attachment

Upload an existing file to Ri.

```sh
ri attachment [options] [command]
```

### ri attachment upload

Upload a selected local file and return its durable attachment record.

```sh
ri attachment upload [options] <path>
```

## ri team

Host a team space: shared tasks and notes, without AI.

```sh
ri team [options] [command]
```

### ri team create

Create a team, start it in the background and open setup.

```sh
ri team create [options]
```

| Option | What it does |
| --- | --- |
| `--root <dir>` | the folder for the team (default: this root) |
| `--no-start` | only prepare the team folder, without starting its service |
| `--no-open` | print the setup link without opening a browser or changing certificate trust |
| `--trust-local` | allow installation of this team’s local HTTPS certificate trust |

### ri team setup-link

A single-use link that names this team and makes whoever opens it its owner.

```sh
ri team setup-link [options]
```

### ri team owner-sign-in

Recover access to an existing owner from the computer hosting this team.

```sh
ri team owner-sign-in [options]
```

| Option | What it does |
| --- | --- |
| `--member <id>` | the owner to recover, required when there is more than one |

### ri team status

This team: its name, owner and address.

```sh
ri team status [options]
```
