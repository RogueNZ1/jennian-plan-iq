import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ImageOff } from "lucide-react";

/**
 * Plan thumbnail.
 * - If `storagePath` is provided, resolves a private signed URL from the
 *   `job-files` bucket and renders the actual rendered PDF page image.
 * - Otherwise renders a clean "No preview available" placeholder.
 */
export function PlanThumbnail({
  storagePath,
  className,
  size = "sm",
  alt = "Plan preview",
}: {
  storagePath?: string | null;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  alt?: string;
}) {
  const dims = {
    xs: "w-12 h-9",
    sm: "w-16 h-12",
    md: "w-24 h-16",
    lg: "w-40 h-28",
  }[size];

  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    setErrored(false);
    setUrl(null);
    if (!storagePath) return;
    if (
      /^https?:\/\//i.test(storagePath) ||
      storagePath.startsWith("data:") ||
      storagePath.startsWith("blob:")
    ) {
      setUrl(storagePath);
      return;
    }
    supabase.storage
      .from("job-files")
      .createSignedUrl(storagePath, 60 * 30)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) setErrored(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [storagePath]);

  const hasImage = !!storagePath && !!url && !errored;

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-md border border-border bg-[oklch(0.985_0.003_260)] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        dims,
        className,
      )}
    >
      {hasImage ? (
        <img
          src={url!}
          alt={alt}
          loading="lazy"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/70 p-1 text-center">
          <ImageOff className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span className="text-[8.5px] uppercase tracking-[0.12em] leading-tight">
            No preview
          </span>
        </div>
      )}
    </div>
  );
}