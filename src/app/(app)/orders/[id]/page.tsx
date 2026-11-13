import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getBusinessToday } from '@/lib/dates';
import { requireSession } from '@/server/auth/guards';
import { getPurchaseOrderDetail } from '@/server/orders/orders';
import { OrderDetailView } from '@/components/orders/order-detail-view';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const order = await getPurchaseOrderDetail(id);
  if (!order) {
    notFound();
  }

  const today = getBusinessToday();

  return (
    <OrderDetailView
      order={order}
      isAdmin={session.user.role === 'admin'}
      today={today}
    />
  );
}

