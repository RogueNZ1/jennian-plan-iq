import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ImageOff } from "lucide-react";

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
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let active = true;
    if (!storagePath) {
      setStatus("idle");
      setUrl(null);
      return;
    }

    setStatus("loading");

    if (
      /^https?:\/\//i.test(storagePath) ||
      storagePath.startsWith("data:") ||
      storagePath.startsWith("blob:")
    ) {
      setUrl(storagePath);
      setStatus("ready");
      return;
    }

    supabase.storage
      .from("job-files")
      .createSignedUrl(storagePath, 60 * 30)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setStatus("error");
        } else {
          setUrl(data.signedUrl);
          setStatus("ready");
        }
      });

    return () => {
      active = false;
    };
  }, [storagePath]);

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-md border border-border bg-[oklch(0.985_0.003_260)] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        dims,
        className,
      )}
    >
      {status === "loading" && <div className="absolute inset-0 bg-muted/60 animate-pulse" />}
      {status === "ready" && url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setStatus("error")}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {(status === "idle" || status === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/70 p-1 text-center">
          <ImageOff className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span className="text-[8.5px] uppercase tracking-[0.12em] leading-tight">No preview</span>
        </div>
      )}
    </div>
  );
}
