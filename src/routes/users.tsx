import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";

export const Route = createFileRoute("/users")({ component: Page });

const users = [
  { name: "Ryan Mitchell",  role: "Estimating Lead",   email: "ryan@jennianmw.co.nz",   last: "Today, 09:14" },
  { name: "Sophie Aldridge", role: "Senior Estimator", email: "sophie@jennianmw.co.nz", last: "Yesterday" },
  { name: "Tama Whareaitu",  role: "Estimator",        email: "tama@jennianmw.co.nz",   last: "2 days ago" },
  { name: "Greg Patel",      role: "Director",         email: "greg@jennianmw.co.nz",   last: "Last week" },
];

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <PageHeader title="Users" subtitle="Team members with access to Jennian IQ." />
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-t border-border">
                  <td className="px-6 py-4 font-medium flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-[11px] font-semibold">{u.name.split(" ").map(n=>n[0]).join("")}</div>
                    {u.name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{u.role}</td>
                  <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">{u.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
