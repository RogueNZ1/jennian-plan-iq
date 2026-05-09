import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/specifications")({ component: Page });

const sections = [
  { name: "Foundations", items: ["Concrete grade 25 MPa", "DPM under slab", "150mm hardfill"] },
  { name: "Framing",     items: ["H1.2 SG8 timber", "90x45 wall framing @ 600 cc", "Mid-floor I-joists"] },
  { name: "Cladding",    items: ["Linea weatherboard", "Brick veneer where shown", "Cavity batten 20mm"] },
  { name: "Roofing",     items: ["Coloursteel longrun", "Self-supporting underlay", "R3.6 ceiling insulation"] },
  { name: "Linings",     items: ["10mm GIB standard", "Aqualine to wet areas", "Square stop"] },
];

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <PageHeader title="Specifications" subtitle="Library of standard specifications used during extraction." />
        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((s) => (
            <div key={s.name} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="text-[15px] font-semibold tracking-tight">{s.name}</h3></div>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {s.items.map((i) => <li key={i} className="flex gap-2"><span className="text-primary">·</span>{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
