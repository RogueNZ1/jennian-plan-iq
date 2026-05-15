-- Public bucket for rendered plan page frames passed to the AI gateway
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-frames', 'plan-frames', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access (bucket is public; AI gateway fetches by URL)
CREATE POLICY "Plan frames are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'plan-frames');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload plan frames"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'plan-frames');

-- Authenticated users can update their uploads
CREATE POLICY "Authenticated users can update plan frames"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'plan-frames');

-- Authenticated users can delete plan frames (for cleanup)
CREATE POLICY "Authenticated users can delete plan frames"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'plan-frames');