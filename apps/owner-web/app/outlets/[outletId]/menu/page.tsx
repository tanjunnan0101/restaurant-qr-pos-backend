import { Plus, Upload } from 'lucide-react';
import { OwnerShell } from '@/components/owner-shell';
import { PageSection } from '@/components/page-section';
import { StatusPill } from '@/components/status-pill';
import { menuPreview } from '@/lib/owner-demo';

export const metadata = {
  title: 'Menu Management',
};

export default async function MenuPage({
  params,
}: {
  params: Promise<{ outletId: string }>;
}) {
  const { outletId } = await params;

  return (
    <OwnerShell
      actions={
        <>
          <button className="button button--secondary" type="button">
            <Upload aria-hidden="true" size={18} />
            Import menu
          </button>
          <button className="button" type="button">
            <Plus aria-hidden="true" size={18} />
            Add item
          </button>
        </>
      }
      aside={
        <div className="insight-card">
          <p className="eyebrow">API target</p>
          <h2>Admin menu routes</h2>
          <p>
            Wire this page to `GET /admin/outlets/{outletId}/menus`, `POST
            /setup`, draft replacement, publish, and item sold-out toggles.
          </p>
        </div>
      }
      description={`Prepare the first QR menu for outlet ${outletId}, then publish once prices and availability are checked.`}
      eyebrow="Menu setup"
      title="Menu management"
    >
      <PageSection
        description="The scaffold keeps draft, published, and sold-out actions visible without requiring the final editor yet."
        title="Menu categories"
      >
        <div
          className="data-table"
          role="table"
          aria-label="Menu category preview"
        >
          <div className="data-table__row data-table__row--head" role="row">
            <span role="columnheader">Category</span>
            <span role="columnheader">Items</span>
            <span role="columnheader">State</span>
            <span role="columnheader">Next action</span>
          </div>
          {menuPreview.map((category) => (
            <div className="data-table__row" role="row" key={category.category}>
              <strong role="cell">{category.category}</strong>
              <span role="cell">{category.items}</span>
              <span role="cell">
                <StatusPill
                  tone={category.state === 'Published' ? 'success' : 'neutral'}
                >
                  {category.state}
                </StatusPill>
              </span>
              <span role="cell">{category.next}</span>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Editor placeholders">
        <div className="split-card-grid">
          <article className="setup-card">
            <h3>Bulk onboarding import</h3>
            <p>
              Add CSV or spreadsheet import later so a new client can hand over
              a menu and be ready without manual item-by-item entry.
            </p>
          </article>
          <article className="setup-card">
            <h3>Sold-out controls</h3>
            <p>
              Match the backend item sold-out route so owners can remove items
              from QR ordering during service.
            </p>
          </article>
        </div>
      </PageSection>
    </OwnerShell>
  );
}
