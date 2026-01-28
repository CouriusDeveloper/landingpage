-- Migration: Enable pg_net and create trigger for AI generation
-- This runs the AI worker in the background when project status changes to 'generating'

-- Enable pg_net extension (async HTTP from Postgres)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store config in database
INSERT INTO vault.secrets (name, secret) 
VALUES ('worker_secret', 'internal-worker-key-2026')
ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_ai_worker()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  supabase_url text;
  worker_secret text;
BEGIN
  -- Only trigger when status changes TO 'generating'
  IF NEW.status = 'generating' AND (OLD.status IS DISTINCT FROM 'generating') THEN
    
    -- Get config
    supabase_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1);
    worker_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'worker_secret' LIMIT 1);
    
    -- Fallback to env
    IF supabase_url IS NULL THEN
      supabase_url := 'https://pbzfiheutnyqkfmgjtee.supabase.co';
    END IF;
    IF worker_secret IS NULL THEN
      worker_secret := 'internal-worker-key-2026';
    END IF;

    -- Call the worker via pg_net (async HTTP)
    PERFORM extensions.http_post(
      url := supabase_url || '/functions/v1/ai-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', worker_secret
      ),
      body := jsonb_build_object('projectId', NEW.id)::text,
      timeout_milliseconds := 300000  -- 5 minutes
    );
    
    RAISE LOG 'AI Worker triggered for project %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_project_status_generating ON public.projects;

-- Create the trigger
CREATE TRIGGER on_project_status_generating
  AFTER UPDATE OF status ON public.projects
  FOR EACH ROW
  WHEN (NEW.status = 'generating')
  EXECUTE FUNCTION public.trigger_ai_worker();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
