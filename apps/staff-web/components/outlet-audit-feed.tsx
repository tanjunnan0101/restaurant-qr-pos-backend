'use client';

import type { OutletAuditLogEntry } from '@/lib/types';

export function OutletAuditFeed({
  title,
  subtitle,
  entries,
}: {
  title: string;
  subtitle: string;
  entries: OutletAuditLogEntry[];
}) {
  return (
    <section className="panel section-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Recent audit trail</p>
          <h2 className="section-title serif">{title}</h2>
          <p className="supporting-copy">{subtitle}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="supporting-copy">
          No recent audit entries matched this operational view.
        </p>
      ) : (
        <div className="stack-list">
          {entries.map((entry) => (
            <div className="stack-row" key={entry.id}>
              <div>
                <strong>{formatEnum(entry.actionType)}</strong>
                <p className="supporting-copy">
                  {entry.actor?.fullName ?? 'System'} •{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                {entry.reason ? (
                  <p className="supporting-copy">{entry.reason}</p>
                ) : null}
              </div>
              <span className="status-pill neutral">
                {formatEnum(entry.entityType)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
