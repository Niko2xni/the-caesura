import { requireSession } from '@/server/auth/guards';
import { listProducts } from '@/server/catalogue/products';
import { listSupplierItems, listSuppliers } from '@/server/catalogue/suppliers';
import { SuppliersView } from '@/components/catalogue/suppliers-view';

export default async function SuppliersPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === 'admin';

  const suppliers = await listSuppliers({ activeOnly: true });
  const supplierItems = await listSupplierItems();
  const products = await listProducts({ activeOnly: true });

  return (
    <SuppliersView
      suppliers={suppliers}
      supplierItems={supplierItems}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        baseUnit: p.baseUnit,
      }))}
      isAdmin={isAdmin}
    />
  );
}

