import { requireSession } from '@/server/auth/guards';
import { listCategories } from '@/server/catalogue/products';
import { getProductStockList } from '@/server/ledger/queries';
import { CatalogueView } from '@/components/catalogue/catalogue-view';

export default async function CataloguePage() {
  const session = await requireSession();
  const isAdmin = session.user.role === 'admin';

  const products = await getProductStockList();
  const categories = await listCategories();

  return (
    <CatalogueView
      products={products}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
      }))}
      isAdmin={isAdmin}
    />
  );
}

