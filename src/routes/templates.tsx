import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { templates } from "@/lib/mock-data";
import { LayoutTemplate, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/templates")({ component: Page });

type TemplateDetail = {
  modules: string[];
  specRules: string[];
  description: string;
};

const TEMPLATE_DETAILS: Record<string, TemplateDetail> = {
  "t1": {
    description: "Standard single-storey home with brick and weatherboard combination cladding. Most common build type in the Manawatū region.",
    modules: ["IQ Core", "IQ Framing", "IQ Cladding", "IQ Roofing", "IQ Linings", "IQ Plumbing", "IQ Electrical"],
    specRules: [
      "Exterior wall framing: 90×45 H1.2 SG8 @ 600 ctrs",
      "Brick: Midland Tuscany or equivalent — 1.0 brick/ft² base rate",
      "Weatherboard: 150mm Linea or Harditex — price per m²",
      "Roof: Coloursteel Endura corrugate or similar",
      "Linings: 10mm Gib Standard walls, 13mm Gib Ceiling Plus",
      "Wet areas: 10mm Gib Aqualine to 1200mm + tiles",
    ],
  },
  "t2": {
    description: "Single-storey home with full Linea cladding profile. Clean contemporary aesthetic suited to architectural designs.",
    modules: ["IQ Core", "IQ Framing", "IQ Cladding", "IQ Roofing", "IQ Linings", "IQ Plumbing", "IQ Electrical"],
    specRules: [
      "Exterior wall framing: 90×45 H1.2 SG8 @ 600 ctrs",
      "Cladding: James Hardie 150mm Linea throughout",
      "Windows: Aluminium joinery — double glazed low-E",
      "Roof: Coloursteel long-run or concrete tile",
      "Linings: 10mm Gib Standard, 13mm Ceiling Plus",
      "Paint: Resene 2-coat system exterior, 2-coat interior",
    ],
  },
  "t3": {
    description: "Two-storey configuration with brick lower level and Linea upper level. Requires additional framing and structural calculations.",
    modules: ["IQ Core", "IQ Framing", "IQ Cladding", "IQ Roofing", "IQ Linings", "IQ Plumbing", "IQ Electrical", "IQ Margin", "IQ Procurement"],
    specRules: [
      "Ground floor: 90×45 H1.2 @ 600 ctrs — brick tie framing",
      "Upper floor: LVL bearer/joist system per engineer spec",
      "Staircase: Straight or quarter-turn — price by configuration",
      "Brick: Lower level only — standard Midland rate",
      "Upper cladding: 150mm Linea on cavity",
      "Structural: Engineer's PS1 and PS3 required",
      "Margin: +8% project risk allowance applied",
    ],
  },
  "t4": {
    description: "Show home specification for the Manawatū display village. Includes premium fitout, upgraded fixtures, and procurement package.",
    modules: ["IQ Core", "IQ Framing", "IQ Cladding", "IQ Roofing", "IQ Linings", "IQ Plumbing", "IQ Electrical", "IQ Margin", "IQ Procurement"],
    specRules: [
      "Premium kitchen: Integrated appliances, stone benchtops",
      "Bathrooms: Floor-to-ceiling tile, rainfall shower",
      "Joinery: Aluminium thermally broken — triple-glazed option",
      "Flooring: Engineered timber to living, carpet to bedrooms",
      "Heat pump: Multi-head split system — all rooms",
      "Procurement: Full Carters RFQ package — all trades",
      "Margin: Show home display rate — 0% markup applied",
    ],
  },
};

function Page() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <PageHeader title="Templates" subtitle="Standard templates mapped to Jennian's pricing workbook." />
        <div className="grid md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const detail = TEMPLATE_DETAILS[t.id];
            const isOpen = expanded === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "rounded-lg border bg-card transition-shadow",
                  isOpen ? "border-primary/40 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)]" : "border-border hover:shadow-sm",
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="w-full text-left p-5"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center">
                      <LayoutTemplate className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">{t.code}</span>
                      {isOpen
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{t.name}</h3>
                  {detail && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{detail.description}</p>
                  )}
                </button>

                {isOpen && detail && (
                  <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                    <div>
                      <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
                        Modules included ({detail.modules.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.modules.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                            <CheckCircle2 className="h-3 w-3" /> {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
                        Specification rules ({detail.specRules.length})
                      </div>
                      <ul className="space-y-1.5">
                        {detail.specRules.map((rule) => (
                          <li key={rule} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                            {rule}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
