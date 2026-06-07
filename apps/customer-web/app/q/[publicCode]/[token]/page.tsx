import { CustomerOrderApp } from '@/components/customer-order-app';

export default async function CustomerMenuPage({
  params,
}: {
  params: Promise<{ publicCode: string; token: string }>;
}) {
  const { publicCode, token } = await params;
  return <CustomerOrderApp publicCode={publicCode} token={token} />;
}
