'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderPlus, Layers, Plus, Search } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatQuantity } from '@/lib/units';
import type { ProductStockSummary } from '@/server/ledger/queries';
import { CreateCategoryModal } from './create-category-modal';
import { CreateProductModal } from './create-product-modal';

interface CategoryItem {
  id: string;
  name: string;
  sortOrder: number;
}

interface CatalogueViewProps {
  products: ProductStockSummary[];
  categories: CategoryItem[];
  isAdmin: boolean;
}

export function CatalogueView({ products, categories, isAdmin }: CatalogueViewProps) {
  const router = useRouter();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategoryId) {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        if (p.categoryName !== cat?.name) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }

      return true;
    });
  }, [products, categories, selectedCategoryId, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            <Layers className="h-6 w-6 text-[var(--color-primary)]" />
            <span>Catalogue</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Manage your café’s products, categories, base units, and reorder points.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
            >
              <FolderPlus className="h-4 w-4" />
              <span>New Category</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProductModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              <span>New Product</span>
            </button>
          </div>
        )}
      </div>

      {/* Search and Category Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-ink-muted)]" />
          <input
            type="text"
            placeholder="Search products by name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] pl-9 pr-4 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategoryId(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              selectedCategoryId === null
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)]'
            }`}
          >
            All Products ({products.length})
          </button>
          {categories.map((c) => {
            const count = products.filter((p) => p.categoryName === c.name).length;
            const isSelected = selectedCategoryId === c.id;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(isSelected ? null : c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)]'
                }`}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-3 px-4">Product / SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Unit</th>
                <th className="py-3 px-4 text-right">Usable Stock</th>
                <th className="py-3 px-4 text-right">Expired Stock</th>
                <th className="py-3 px-4 text-right">Reorder Point</th>
                <th className="py-3 px-4 text-center">Expiry Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const usable = new Decimal(p.usableQuantity);
                  const expired = new Decimal(p.expiredQuantity);
                  const reorder = new Decimal(p.reorderPoint);

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[var(--color-paper)]/60 cursor-pointer transition-colors"
                      onClick={() => router.push(`/products/${p.id}`)}
                    >
                      <td className="py-3 px-4 font-medium text-[var(--color-ink)]">
                        <Link
                          href={`/products/${p.id}`}
                          className="hover:text-[var(--color-primary)] hover:underline block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        <span className="text-xs font-mono text-[var(--color-ink-muted)]">{p.sku}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--color-ink-muted)]">
                        {p.categoryName || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">
                          {p.baseUnit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[var(--color-ink)]">
                        {formatQuantity(p.usableQuantity, p.baseUnit)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm">
                        {expired.gt(0) ? (
                          <span className="font-semibold text-rose-600">
                            {formatQuantity(p.expiredQuantity, p.baseUnit)}
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[var(--color-ink-muted)]">
                        {reorder.gt(0) ? formatQuantity(p.reorderPoint, p.baseUnit) : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.tracksExpiry ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                            FEFO {p.shelfLifeDays ? `(${p.shelfLifeDays}d)` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-ink-muted)]">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        categories={categories}
        onSuccess={() => router.refresh()}
      />

      <CreateCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
