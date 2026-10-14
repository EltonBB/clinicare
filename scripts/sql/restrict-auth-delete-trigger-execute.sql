-- Run once in the Supabase SQL Editor for an existing installation. The
-- auth.users trigger executes as its owner; API roles do not need direct access.
-- The setup script includes this same file immediately after creating the
-- function, inside its transaction, so a repeat setup cannot restore access.
revoke execute on function public.handle_auth_user_deleted()
from public, anon, authenticated, service_role;
