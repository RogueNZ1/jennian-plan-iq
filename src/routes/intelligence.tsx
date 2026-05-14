import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/jennian/AppLayout";

export const Route = createFileRoute("/intelligence")({ component: IntelligencePage });

interface DailyBrief {
  id: string;
  brief_date: string;
  html_content: string;
  text_content: string;
  summary: string;
  alert_count: number;
  new_listing_count: number;
  price_change_count: number;
  generated_at: string;
}

function IntelligencePage() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase
      .from("daily_briefs")
      .select("*")
      .order("brief_date", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setBrief(data as DailyBrief);
        setLoading(false);
      });
  }, []);

  function handleEmailSend() {
    if (!brief) return;
    const subject = encodeURIComponent(`Jennian 007 Brief — ${brief.brief_date}`);
    const body = encodeURIComponent(brief.text_content);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  }

  function handleCopyBrief() {
    if (!brief) return;
    navigator.clipboard.writeText(brief.text_content);
  }

  return (
    <AppLayout>
      {/* Dark-theme full-bleed wrapper inside AppLayout's content area */}
      <div className="min-h-screen" style={{ background: "#0a0c0f" }}>
        {/* Sticky header */}
        <div
          style={{
            background: "#111419",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: "#185FA5",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.1,
                textAlign: "center",
              }}
            >
              J<br />007
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e8eaed" }}>
                Jennian 007 Intelligence
              </div>
              {brief ? (
                <div style={{ fontSize: 10, color: "#555b66", fontFamily: "monospace" }}>
                  {brief.brief_date} · {brief.alert_count} alerts · {brief.new_listing_count} new
                  listings · {brief.price_change_count} price changes
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#555b66", fontFamily: "monospace" }}>
                  Daily market intelligence · Palmerston North / Manawatū
                </div>
              )}
            </div>
          </div>

          {brief && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCopyBrief}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#8b909a",
                  borderRadius: 6,
                  padding: "7px 13px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Copy text
              </button>
              <button
                onClick={handleEmailSend}
                style={{
                  background: sent ? "#00875a" : "#185FA5",
                  border: "none",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "7px 15px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                {sent ? "✓ Email opened" : "📧 Email this brief"}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
          {loading && (
            <div style={{ color: "#00e5a0", fontFamily: "monospace", fontSize: 13 }}>
              Loading intelligence brief...
            </div>
          )}

          {!loading && !brief && (
            <div
              style={{
                color: "#ff4757",
                fontFamily: "monospace",
                fontSize: 13,
                padding: "24px",
                border: "1px solid rgba(255,71,87,0.3)",
                borderRadius: 8,
                background: "rgba(255,71,87,0.06)",
              }}
            >
              No brief available yet.
              <br />
              <span style={{ color: "#555b66", fontSize: 11, marginTop: 6, display: "block" }}>
                Run <code>python run_daily.py</code> in the jennian-007-scraper folder to generate the
                first brief.
              </span>
            </div>
          )}

          {brief && (
            // eslint-disable-next-line react/no-danger
            <div dangerouslySetInnerHTML={{ __html: brief.html_content }} />
          )}
        </div>

        {/* Footer */}
        {brief && (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 48px" }}>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingTop: 14,
                fontSize: 11,
                color: "#555b66",
                fontFamily: "monospace",
              }}
            >
              Generated{" "}
              {new Date(brief.generated_at).toLocaleString("en-NZ", {
                timeZone: "Pacific/Auckland",
              })}{" "}
              NZST · Sourced from realestate.co.nz · oneroof.co.nz · competitor websites · No
              fabricated data
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
