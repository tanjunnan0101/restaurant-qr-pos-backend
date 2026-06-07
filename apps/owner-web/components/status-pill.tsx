import type { StatusTone } from '@/lib/owner-demo';

const toneClassNames: Record<StatusTone, string> = {
  success: 'status-pill status-pill--success',
  attention: 'status-pill status-pill--attention',
  neutral: 'status-pill status-pill--neutral',
  danger: 'status-pill status-pill--danger',
};

export function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: StatusTone;
}) {
  return <span className={toneClassNames[tone]}>{children}</span>;
}
