import { CheckCircle2, Clock, FileEdit, PackageCheck, XCircle } from 'lucide-react';

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'partially_received'
  | 'completed'
  | 'cancelled';

const STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; badgeClass: string; icon: typeof Clock }
> = {
  draft: {
    label: 'Draft',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    icon: FileEdit,
  },
  submitted: {
    label: 'Submitted',
    badgeClass: 'bg-blue-50 text-blue-800 border border-blue-200',
    icon: Clock,
  },
  partially_received: {
    label: 'Partially Received',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-300',
    icon: PackageCheck,
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200',
    icon: XCircle,
  },
};

export function PoStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
    </span>
  );
}

