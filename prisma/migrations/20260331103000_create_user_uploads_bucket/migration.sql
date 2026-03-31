-- Prisma runs migrations against a temporary shadow database that does not include
-- Supabase's `storage` schema, so INSERTs into storage.buckets cannot live here.
--
-- Create the `user-uploads` bucket once per Supabase project (SQL Editor or Storage UI):
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('user-uploads', 'user-uploads', true)
--   ON CONFLICT DO NOTHING;

SELECT 1;
