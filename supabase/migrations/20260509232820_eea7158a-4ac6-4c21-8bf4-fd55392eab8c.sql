
-- Enums
CREATE TYPE public.job_status AS ENUM ('draft','uploaded','extracted','review_required','approved','exported');
CREATE TYPE public.confidence_level AS ENUM ('high','mid','low');
CREATE TYPE public.file_type AS ENUM ('plan','specification');
CREATE TYPE public.export_type AS ENUM ('csv','excel');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  template TEXT,
  status public.job_status NOT NULL DEFAULT 'draft',
  uploaded_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own jobs" ON public.jobs FOR ALL
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE INDEX idx_jobs_created_by ON public.jobs(created_by);

-- Uploaded files
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_type public.file_type NOT NULL,
  file_name TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own files" ON public.uploaded_files FOR ALL
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()));

-- Extracted quantities
CREATE TABLE public.extracted_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  quantity_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  extracted_value NUMERIC NOT NULL,
  approved_value NUMERIC,
  confidence public.confidence_level NOT NULL DEFAULT 'mid',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.extracted_quantities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own quantities" ON public.extracted_quantities FOR ALL
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()));
CREATE INDEX idx_quantities_job ON public.extracted_quantities(job_id);

-- Quantity overrides
CREATE TABLE public.quantity_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity_id UUID NOT NULL REFERENCES public.extracted_quantities(id) ON DELETE CASCADE,
  original_value NUMERIC NOT NULL,
  new_value NUMERIC NOT NULL,
  edited_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quantity_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own overrides" ON public.quantity_overrides FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.extracted_quantities q
    JOIN public.jobs j ON j.id = q.job_id
    WHERE q.id = quantity_id AND j.created_by = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.extracted_quantities q
    JOIN public.jobs j ON j.id = q.job_id
    WHERE q.id = quantity_id AND j.created_by = auth.uid()));

-- Export logs
CREATE TABLE public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  exported_by UUID NOT NULL REFERENCES auth.users(id),
  export_type public.export_type NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own export logs" ON public.export_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.created_by = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('job-files', 'job-files', false);

CREATE POLICY "Users read own job files" ON storage.objects FOR SELECT
  USING (bucket_id = 'job-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own job files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'job-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own job files" ON storage.objects FOR UPDATE
  USING (bucket_id = 'job-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own job files" ON storage.objects FOR DELETE
  USING (bucket_id = 'job-files' AND auth.uid()::text = (storage.foldername(name))[1]);
