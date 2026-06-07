import {
  ArrowRight,
  CreditCard,
  MenuSquare,
  Printer,
  QrCode,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { demoOutletId } from '@/lib/owner-demo';

const launchLinks = [
  {
    href: '/activate',
    label: 'Activate owner account',
    description: 'Accept the onboarding token and set the owner password.',
  },
  {
    href: '/login',
    label: 'Owner login',
    description:
      'Use company slug, email, and password for multi-client access.',
  },
  {
    href: '/dashboard',
    label: 'Setup dashboard',
    description: 'Track the first outlet readiness checklist.',
  },
];

const capabilityCards = [
  {
    icon: MenuSquare,
    title: 'Menu publishing',
    description:
      'Prepare categories, items, variants, sold-out state, and QR visibility.',
    href: `/outlets/${demoOutletId}/menu`,
  },
  {
    icon: QrCode,
    title: 'Tables and QR',
    description: 'Configure dining zones, table labels, and QR token rotation.',
    href: `/outlets/${demoOutletId}/tables`,
  },
  {
    icon: CreditCard,
    title: 'Payment switches',
    description:
      'Disable online checkout, HitPay card, or PayNow scopes during downtime.',
    href: `/outlets/${demoOutletId}/payment-settings`,
  },
  {
    icon: Printer,
    title: 'Wi-Fi printing',
    description:
      'View local printer agent status, routes, test jobs, and reprints.',
    href: `/outlets/${demoOutletId}/printing`,
  },
];

export default function OwnerLandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Owner web scaffold</p>
          <h1>One console for every restaurant owner you onboard.</h1>
          <p>
            This app is structured for roughly 10 clients on one owner-web
            domain. Restaurants sign in with a company slug, then manage their
            own outlet setup, menu, QR tables, payments, and printers.
          </p>
          <div className="button-row">
            <Link className="button" href="/dashboard">
              Open dashboard
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link className="button button--secondary" href="/login">
              Owner login
            </Link>
          </div>
        </div>

        <div className="landing-hero__panel" aria-label="Owner web summary">
          <div className="brand-orb">
            <Store aria-hidden="true" size={34} />
          </div>
          <p className="eyebrow">Backend alignment</p>
          <h2>Routes match existing admin APIs</h2>
          <p>
            The scaffold mirrors `/auth`, `/admin/outlets`, `/menus`, `/tables`,
            `/payment-settings`, and `/printing` so the next pass can wire real
            data without changing the navigation shape.
          </p>
        </div>
      </section>

      <section className="quick-link-grid" aria-label="Owner entry points">
        {launchLinks.map((link) => (
          <Link className="quick-link-card" href={link.href} key={link.href}>
            <span>{link.label}</span>
            <p>{link.description}</p>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </section>

      <section className="capability-grid" aria-label="Owner setup areas">
        {capabilityCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link className="capability-card" href={card.href} key={card.href}>
              <span className="capability-card__icon">
                <Icon aria-hidden="true" size={22} />
              </span>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
