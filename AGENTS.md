# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

---

# Mobile architecture rules

## Read vs write

| Operation | Where it runs |
|---|---|
| Reads | Direct Supabase query inside the hook (`useSchedules`, `useMessages`, etc.) |
| Writes | Direct Supabase INSERT/UPDATE/DELETE in `src/lib/api/*.ts` with audit log |

**Never call `https://switchday.app/api/*` from the mobile app.** The web API uses `@supabase/ssr` cookie-based auth. Mobile sends a Bearer token; the web server reads cookies only — every call returns 401.

## Audit logging for writes

Every write to a legally-sensitive table (`parenting_schedules`, `expenses`, `messages`, `custody_schedule`, etc.) must produce a signed `audit_log` entry. Use `expo-crypto` for the SHA-256 hash — Node's `crypto` module is not available in React Native.

See `src/lib/api/schedules.ts` for the canonical pattern.

```ts
import * as Crypto from 'expo-crypto'

const payload = { actor_id, action, resource_id, metadata }
const sha256_hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  JSON.stringify(payload),
)
// fire-and-forget
supabase.from('audit_log').insert({ actor_id, action, resource_type, resource_id, metadata, sha256_hash }).then(() => {})
```

## Known broken write operations — Session 107 priority

`src/lib/hooks/useExpenses.ts` — `approveExpense`, `declineExpense`, and `logExpense` still call the web API with Bearer auth and will fail with 401. These need the same direct-Supabase refactor that schedules received in Session 106.

## Database types

`src/lib/types/database.ts` is **hand-maintained** — do NOT run `supabase gen types` and overwrite it. The generated format differs from the simplified hand-maintained format used here.

**When any migration adds or changes a table:**
1. Add/update the `Row` / `Insert` / `Update` blocks manually in `database.ts`.
2. Also regenerate the web types (`src/lib/supabase/types.ts` in the `switchday` repo) using the `supabase_generate_typescript_types` tool.
3. Both repos must stay in sync — if you change one, change the other in the same session.

## Schedule write caveats

`createSchedule` inserts the `parenting_schedules` row directly without generating pending custody days. Custody day generation is complex server-side logic that currently only runs on the web when a schedule is accepted. For the mobile MVP, this is acceptable: the co-parent can accept via the web to trigger full day generation.

`scheduleAction('accept')` updates the status to `'accepted'` directly but also does not generate custody days. Until a mobile-compatible server endpoint exists, full custody day generation on mobile accept is deferred.
