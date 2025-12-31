-- Fix categories RLS policies to use JWT claims instead of querying user_roles table
-- The user_roles table is restricted to supabase_auth_admin only, so authenticated users
-- cannot query it directly. Use auth.jwt() ->> 'user_role' instead.

-- Drop existing admin policies on categories
DROP POLICY IF EXISTS "categories_insert_admin" ON categories;
DROP POLICY IF EXISTS "categories_update_admin" ON categories;
DROP POLICY IF EXISTS "categories_delete_admin" ON categories;

-- Recreate policies using JWT claims
CREATE POLICY "categories_insert_admin" ON categories
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "categories_update_admin" ON categories
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "categories_delete_admin" ON categories
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- Also add a SELECT policy so admins can see all categories (including inactive)
CREATE POLICY "categories_select_all_admin" ON categories
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');
