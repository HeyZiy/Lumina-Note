# Cloud Sync (Dev) - Local Server

This doc describes how to run the local Lumina Sync Server and connect the desktop app via WebDAV.

## Run the server

From repo root:
```bash
cd server
export LUMINA_BIND=127.0.0.1:8787
export LUMINA_DB_URL=sqlite://data/lumina.db
export LUMINA_DATA_DIR=data
export LUMINA_JWT_SECRET=dev-secret-change-me
cargo run
```

Health check:
```bash
curl http://127.0.0.1:8787/health
```

## Register / login

Register:
```bash
curl -X POST http://127.0.0.1:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

Login:
```bash
curl -X POST http://127.0.0.1:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"change-me"}'
```

The response includes:
- `token`
- `user` (`id`, `email`)
- `user_id` (legacy compatibility)
- `workspaces` (pick `id`)

## Desktop cloud config

In **Settings → WebDAV Sync** fill in:
- `Cloud server`: `http://127.0.0.1:8787`
- `Email`: your email
- `Password`: your password

Then:
1. Click `Register` or `Login`
2. Pick a `Cloud workspace`
3. Confirm the derived WebDAV URL is `http://127.0.0.1:8787/dav`
4. Confirm the derived remote path is `/<workspace_id>`
5. Run `Test Connection`, `Preview Sync`, then `Sync Now`

## Cloud relay (dev)

Relay endpoint:
- `ws://127.0.0.1:8787/relay?client=desktop`
- `ws://127.0.0.1:8787/relay?client=mobile`

Pairing payload format (cloud):
```json
{
  "v": 1,
  "token": "<jwt>",
  "relay_url": "ws://127.0.0.1:8787/relay?client=mobile"
}
```

You can obtain the `token` from `/auth/login` response and paste this payload into the mobile app.

## Notes

- This is a dev-only local setup (HTTP). Production must use TLS.
- Data is stored under `server/data/` and is ignored by git.
