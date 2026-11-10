import { notFound } from 'next/navigation';
import { requireSession } from '@/server/auth/guards';
import { getProductDetail } from '@/server/ledger/queries';
import { ProductDetailView } from '@/components/ledger/product-detail-view';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const session = await requireSession();
  const isAdmin = session.user.role === 'admin';

  const { id } = await params;
  const detail = await getProductDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <ProductDetailView
      product={{
        id: detail.product.id,
        sku: detail.product.sku,
        name: detail.product.name,
        categoryName: detail.product.categoryName,
        baseUnit: detail.product.baseUnit,
        tracksExpiry: detail.product.tracksExpiry,
        shelfLifeDays: detail.product.shelfLifeDays,
        reorderPoint: detail.product.reorderPoint,
      }}
      usableQuantity={detail.usableQuantity}
      expiredQuantity={detail.expiredQuantity}
      batches={detail.batches}
      movements={detail.movements}
      isAdmin={isAdmin}
    />
  );
}
