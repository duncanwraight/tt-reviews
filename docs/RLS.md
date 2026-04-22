# Row Level Security (RLS) Policies

Patterns and pitfalls for Supabase RLS in this project. Referenced from `CLAUDE.md`.

## Critical rule: use JWT claims for role checks

**NEVER** query the `user_roles` table directly in an RLS policy. It has restricted access (only `supabase_auth_admin` can read it).

```sql
-- WRONG — "permission denied for table user_roles"
CREATE POLICY "admin_only" ON my_table
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- CORRECT — read from JWT
CREATE POLICY "admin_only" ON my_table
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');
```

## Policy patterns

| Access level       | USING clause                                                     |
| ------------------ | ---------------------------------------------------------------- |
| Public read        | `FOR SELECT USING (true)`                                        |
| Authenticated read | `FOR SELECT TO authenticated USING (true)`                       |
| Own records only   | `USING (auth.uid() = user_id)`                                   |
| Admin only         | `USING ((auth.jwt() ->> 'user_role') = 'admin')`                 |
| Admin or moderator | `USING ((auth.jwt() ->> 'user_role') IN ('admin', 'moderator'))` |

## Before writing a new RLS migration

1. Check existing patterns in `supabase/migrations/`, especially `20250612221534_implement_proper_rbac_with_auth_hooks.sql`.
2. Use `auth.jwt() ->> 'user_role'`, never query `user_roles`.
3. Remember SELECT vs UPDATE/DELETE are separate policies. If admins need to see inactive rows alongside the public's approved-only view, add a separate admin SELECT policy.
4. The pgTAP tests in `supabase/tests/rls.sql` cover one representative table (`player_equipment_setup_submissions`). If the new policy pattern is novel, mirror a test there.

## Common RLS issues

| Symptom                                  | Likely cause                                                |
| ---------------------------------------- | ----------------------------------------------------------- |
| "permission denied for table user_roles" | RLS policy queries `user_roles` instead of using JWT claims |
| Empty results for admin                  | Missing admin SELECT policy (only public SELECT exists)     |
| Update/delete fails silently             | USING clause doesn't match, or missing policy for operation |

## Testing RLS locally

pgTAP tests run via `supabase test db`. Simulate roles and JWT claims inside the test:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"<uuid>","role":"authenticated","user_role":"admin"}';
```

Wrap assertions in `BEGIN ... ROLLBACK` so seed data doesn't persist.
