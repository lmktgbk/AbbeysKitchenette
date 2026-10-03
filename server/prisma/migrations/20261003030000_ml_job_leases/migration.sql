BEGIN;
ALTER TABLE public.forecast_jobs
  ADD COLUMN lease_owner UUID,
  ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.mba_jobs
  ADD COLUMN lease_owner UUID,
  ADD COLUMN lease_expires_at TIMESTAMPTZ;

-- Legacy unowned rows can be recovered on startup without altering them in a migration.
CREATE UNIQUE INDEX forecast_jobs_one_owned_running ON public.forecast_jobs(status)
  WHERE status = 'running' AND lease_owner IS NOT NULL;
CREATE UNIQUE INDEX mba_jobs_one_owned_running ON public.mba_jobs(status)
  WHERE status = 'running' AND lease_owner IS NOT NULL;
ALTER TABLE public.forecast_jobs ADD CONSTRAINT forecast_jobs_lease_pair
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL));
ALTER TABLE public.mba_jobs ADD CONSTRAINT mba_jobs_lease_pair
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL));
COMMIT;
