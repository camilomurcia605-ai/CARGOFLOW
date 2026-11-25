import Link from "next/link";
import { STATUS_COLOR, STATUS_LABEL, type Status } from "@/lib/domain";

export function StatusBadge({ status, incident }: { status: string; incident?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[status as Status] ?? ""}`}>
        {STATUS_LABEL[status as Status] ?? status}
      </span>
      {incident && <span className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">Novedad</span>}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default", href }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warn" | "bad" | "good"; href?: string }) {
  const toneCls = { default: "text-slate-900", warn: "text-amber-600", bad: "text-rose-600", good: "text-emerald-600" }[tone];
  const body = (
    <div className="card h-full p-4 transition hover:border-brand-300">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Section({ title, children, actions, className = "" }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
