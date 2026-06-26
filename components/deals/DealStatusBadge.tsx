import { cn } from '@/lib/utils/helpers';
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from '@/lib/types';
import type { DealStatus } from '@/lib/types';

export default function DealStatusBadge({ status }: { status: DealStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        DEAL_STATUS_COLORS[status]
      )}
    >
      {DEAL_STATUS_LABELS[status]}
    </span>
  );
}
