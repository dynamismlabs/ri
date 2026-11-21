# agentex OpenCode control channel

`@agentex__agent@0.0.53.patch` changes the shared integration's shipped source and JavaScript. It avoids requiring an unpublished library release or modifying the linked agentex checkout.

OpenCode can interpret port 0 as a fixed default. Two ordinary Home processes using the same folder could attach to, or stop, each other's native server. This patch allocates an explicit free loopback port for each new server. A race for that port fails startup rather than attaching to an unrelated server. Native control authentication keeps the SDK's generated random password.

`src/lib/harness/opencode-home-processes.test.ts` starts two actual SDK server pools against a synthetic native process, refuses port 0, and checks separate authenticated ports and contexts. It is a process/protocol fixture, not live-account qualification.

The archived controller-specific password override was removed. Frozen pnpm installs apply the remaining port fix automatically. Remove the patch after upgrading to an agentex release with this fix and repeating the regression.

# macOS signing traversal

`@electron__osx-sign@1.3.3.patch` applies existing signing ignore rules before
walking a directory. Upstream applies them after discovering every binary,
which walks Ri's excluded Node dependency graph and exhausts file descriptors
on the hosted Mac runner. The ignored runtime files are still sealed into the
app signature and checked against Ri's runtime manifest.

`desktop/signing-walk.test.ts` verifies that ignored trees are never inspected
and that ordinary native files are still discovered. Remove this patch after
an upstream release supports pruning ignored directories during traversal.

# Windows harness launching and skills

The same `@agentex__agent@0.0.53.patch` also carries the Windows fixes from
[agentex branch `ri/windows-first-version`](https://github.com/dynamismlabs/agentex/tree/ri/windows-first-version).
It resolves npm `.cmd` shims, including paths with spaces and native Claude
executables, and uses directory junctions for skill links without elevation.
Source and shipped JavaScript are patched together. The OpenCode port fix above
is retained. `desktop/windows-platform.test.ts` exercises the actual patched
resolver and skill links, including native Windows sign-in. No agentex version
was published for this integration. Remove these hunks after taking up an
agentex release that includes them and repeating Windows lifecycle qualification.

# tar long symlink targets

`tar@7.5.22.patch` makes a GNU long-link (`K`) record or a PAX `linkpath` win over the header's own linkname field, as tar already does for `path`. tar 7.5.22 (and 7.5.23) applies the pending extended header and then overwrites `linkpath` with the header block's field. `sqfs2tar` writes a symlink target of 100 characters or more as a `K` record followed by a header with an empty linkname, so the strict parser in `desktop/release-artifacts.mjs` rejected the Linux AppImage's long `.next-desktop/node_modules` links with "linkpath required", and the v0.1.0 release build stopped. A PAX archive kept only the first 100 characters of a long target.

The patch changes the four files the package can load: the minified `dist/esm/index.min.js` and `dist/commonjs/index.min.js` that its exports point at, and the matching `header.js` sources. `desktop/tar-long-links.test.ts` builds archives the way `sqfs2tar` and PAX writers do and checks the full target comes through. Remove the patch once tar ships the fix and those tests pass without it.
