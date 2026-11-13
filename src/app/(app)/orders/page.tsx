import { getBusinessToday } from '@/lib/dates';
import { requireSession } from '@/server/auth/guards';
import { getPurchaseOrdersList } from '@/server/orders/orders';
import { OrdersListView } from '@/components/orders/orders-list-view';

export default async function OrdersPage() {
  await requireSession();
  const today = getBusinessToday();
  const orders = await getPurchaseOrdersList();

  return <OrdersListView orders={orders} today={today} />;
}

