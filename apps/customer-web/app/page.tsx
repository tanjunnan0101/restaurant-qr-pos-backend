import { QrCode, Smartphone, UtensilsCrossed } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="entry-page">
      <section className="entry-card" aria-labelledby="entry-title">
        <div className="brand-mark" aria-hidden="true">
          <UtensilsCrossed size={26} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">Restaurant table ordering</p>
        <h1 id="entry-title">Scan the QR code at your table</h1>
        <p className="entry-copy">
          Your table QR opens the correct restaurant, menu, and order session.
          No download or account is required.
        </p>
        <div className="entry-steps">
          <span>
            <QrCode size={20} aria-hidden="true" />
            Scan your table QR
          </span>
          <span>
            <Smartphone size={20} aria-hidden="true" />
            Order and pay on your phone
          </span>
        </div>
      </section>
    </main>
  );
}
