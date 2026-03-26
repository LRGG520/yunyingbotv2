# Twitter Browser Login Capture

This repository's browser-based Twitter collector is designed to reuse a persistent login state.

## Goal

Capture a durable browser storage state once, then let the Twitter browser collector reuse it for:

- tweet page access
- richer visible content
- stronger interaction extraction
- fewer login-wall captures

## Local workflow

1. Ensure the machine running the worker has a supported browser installed.
2. Run:

```bash
pnpm twitter:login
```

3. A headed browser window will open on the Twitter/X login flow.
4. Complete login manually.
5. Return to the terminal and press Enter.
6. The storage state will be saved to:

```text
data/local/twitter-storage-state.json
```

The login browser will also use a persistent Chrome profile directory:

```text
data/local/twitter-chrome-profile
```

You can override that path with:

```text
TWITTER_STORAGE_STATE_PATH=...
```

You can also override the profile directory with:

```text
TWITTER_BROWSER_USER_DATA_DIR=...
```

## Runtime expectation

The same machine or container that runs the Twitter browser collector must have:

- access to a supported browser executable
- access to the saved storage state file

If the worker later runs inside a container, mount the storage-state file into that container and point `TWITTER_STORAGE_STATE_PATH` to the mounted path.
