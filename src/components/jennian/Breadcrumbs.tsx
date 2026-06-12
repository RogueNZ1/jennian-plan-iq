import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type Crumb = {
  label: string;
  to?: string;
  search?: Record<string, unknown>;
  params?: Record<string, string>;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex items-center gap-1.5 text-[12px] text-muted-foreground"
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        const node: ReactNode =
          c.to && !isLast ? (
            <Link
              to={c.to as never}
              search={c.search as never}
              params={c.params as never}
              className="hover:text-foreground transition-colors"
            >
              {c.label}
            </Link>
          ) : (
            <span className={isLast ? "text-foreground font-medium" : ""}>{c.label}</span>
          );
        return (
          <span key={i} className="flex items-center gap-1.5">
            {node}
            {!isLast && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
          </span>
        );
      })}
    </nav>
  );
}
