-- Empties every app table in the throwaway e2e database before each run.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('TRUNCATE %I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
