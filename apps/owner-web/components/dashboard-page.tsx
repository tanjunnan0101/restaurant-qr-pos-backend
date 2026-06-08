'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getCurrentCompany,
  getMenus,
  getOrders,
  getOutlets,
  getPaymentSettings,
  getPrinting,
  getTables,
} from '@/lib/api';
import type { CompanyProfile, OutletDashboardData } from '@/lib/types';
import { OwnerPageFrame } from './owner-page-frame';
import { useOwnerSession } from './owner-session-guard';

export function DashboardPage() {
  const { session, loading } = useOwnerSession();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [outlets, setOutlets] = useState<OutletDashboardData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    const authToken = session.accessToken;

    let cancelled = false;

    async function load() {
      setBusy(true);
      setError(null);
      try {
        const [companyData, outletList] = await Promise.all([
          getCurrentCompany(authToken),
          getOutlets(authToken),
        ]);

        const summaries = await Promise.all(
          outletList.map(async (outlet) => {
            const [menus, tables, paymentSettings, printing, orders] =
              await Promise.all([
                getMenus(authToken, outlet.id),
                getTables(authToken, outlet.id),
                getPaymentSettings(authToken, outlet.id),
                getPrinting(authToken, outlet.id),
                getOrders(authToken, outlet.id),
              ]);

            const latestPublishedVersion =
              menus
                .flatMap((menu) => menu.versions)
                .find((version) => version.status === 'PUBLISHED')
                ?.versionNumber ?? null;
            const tableCount = tables.reduce(
              (total, zone) => total + zone.tables.length,
              0,
            );
            const qrCount = tables.reduce(
              (total, zone) =>
                total +
                zone.tables.reduce(
                  (zoneTotal, table) => zoneTotal + table.qrCodes.length,
                  0,
                ),
              0,
            );
            const totalOrders = orders.length;
            const liveOrders = orders.filter((order) =>
              ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED'].includes(
                order.status,
              ),
            ).length;
            const paidOrders = orders.filter(
              (order) => order.paymentStatus === 'PAID',
            ).length;
            const grossSalesCents = orders
              .filter((order) => order.paymentStatus === 'PAID')
              .reduce((sum, order) => sum + order.grandTotalCents, 0);

            return {
              outlet,
              menuCount: menus.length,
              latestMenuVersion:
                latestPublishedVersion === null
                  ? null
                  : `v${latestPublishedVersion}`,
              totalOrders,
              liveOrders,
              paidOrders,
              grossSalesCents,
              zoneCount: tables.length,
              tableCount,
              qrCount,
              onlineEnabled: paymentSettings.online.configuredEnabled,
              onlineCardEnabled:
                paymentSettings.methods.find(
                  (method) => method.method === 'ONLINE_CARD',
                )?.effectiveEnabled ?? false,
              printerCount: printing.printers.length,
              agentCount: printing.agents.length,
              failedPrintJobs: printing.failedJobs.length,
            } satisfies OutletDashboardData;
          }),
        );

        if (!cancelled) {
          setCompany(companyData);
          setOutlets(summaries);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Dashboard failed to load.',
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <OwnerPageFrame
      title="Dashboard"
      subtitle="Read-only owner overview powered by the current backend APIs."
    >
      {loading || busy ? (
        <section className="section-panel">
          <p className="eyebrow">Hydrating</p>
          <h2 className="serif">Loading company and outlet data...</h2>
          <p>
            This first cut pulls company, menu, table, payment, and printing
            data directly from the existing API.
          </p>
        </section>
      ) : error ? (
        <section className="section-panel">
          <div className="alert error">{error}</div>
        </section>
      ) : (
        <>
          {company && (
            <section className="section-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Company profile</p>
                  <h2 className="serif">{company.name}</h2>
                  <p>
                    {company.slug} • {company.defaultCurrency} •{' '}
                    {company.defaultTimezone}
                  </p>
                </div>
                <div className="badge-row">
                  <span className="badge">{company.status}</span>
                  {company.legalName && (
                    <span className="tag">{company.legalName}</span>
                  )}
                </div>
              </div>

              <div className="dashboard-stats">
                <article className="dashboard-card">
                  <span className="metric-label">Outlets</span>
                  <span className="metric-value">{outlets.length}</span>
                </article>
                <article className="dashboard-card">
                  <span className="metric-label">Menus</span>
                  <span className="metric-value">
                    {outlets.reduce((sum, outlet) => sum + outlet.menuCount, 0)}
                  </span>
                </article>
                <article className="dashboard-card">
                  <span className="metric-label">Orders</span>
                  <span className="metric-value">
                    {outlets.reduce(
                      (sum, outlet) => sum + outlet.totalOrders,
                      0,
                    )}
                  </span>
                </article>
                <article className="dashboard-card">
                  <span className="metric-label">Paid sales</span>
                  <span className="metric-value">
                    {formatCurrency(
                      company.defaultCurrency,
                      outlets.reduce(
                        (sum, outlet) => sum + outlet.grossSalesCents,
                        0,
                      ),
                    )}
                  </span>
                </article>
              </div>
            </section>
          )}

          <section className="section-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Outlet overview</p>
                <h2 className="serif">Configured outlets</h2>
                <p>
                  Each card is hydrated from existing list endpoints so the
                  owner can see menu, table, payment, and printing readiness at
                  a glance.
                </p>
              </div>
            </div>

            <div className="outlet-grid">
              {outlets.map((entry) => (
                <article className="list-item" key={entry.outlet.id}>
                  <div className="section-header">
                    <div>
                      <h3>{entry.outlet.name}</h3>
                      <p>
                        {entry.outlet.slug} • {entry.outlet.currency} •{' '}
                        {entry.outlet.timezone}
                      </p>
                    </div>
                    <div className="badge-row">
                      <span
                        className={
                          entry.onlineCardEnabled
                            ? 'badge success'
                            : 'badge danger'
                        }
                      >
                        {entry.onlineCardEnabled
                          ? 'Checkout live'
                          : 'Checkout off'}
                      </span>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="info-card">
                      <span className="metric-label">Orders</span>
                      <span className="metric-value">{entry.totalOrders}</span>
                      <p className="metric-note">
                        {entry.liveOrders} live now • {entry.paidOrders} paid
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Sales</span>
                      <span className="metric-value">
                        {formatCurrency(
                          entry.outlet.currency,
                          entry.grossSalesCents,
                        )}
                      </span>
                      <p className="metric-note">
                        Gross value from paid orders
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Menus</span>
                      <span className="metric-value">{entry.menuCount}</span>
                      <p className="metric-note">
                        Latest published {entry.latestMenuVersion ?? 'none'}
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Tables</span>
                      <span className="metric-value">{entry.tableCount}</span>
                      <p className="metric-note">
                        {entry.zoneCount} zones • {entry.qrCount} active QR
                        codes
                      </p>
                    </article>
                    <article className="info-card">
                      <span className="metric-label">Printing</span>
                      <span className="metric-value">{entry.printerCount}</span>
                      <p className="metric-note">
                        {entry.agentCount} agents • {entry.failedPrintJobs}{' '}
                        failed jobs
                      </p>
                    </article>
                  </div>

                  <div className="inline-actions">
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/menu`}
                    >
                      Menu
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/tables`}
                    >
                      Tables
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/payment-settings`}
                    >
                      Payment settings
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/outlets/${entry.outlet.id}/printing`}
                    >
                      Printing
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </OwnerPageFrame>
  );
}

function formatCurrency(currency: string, cents: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
