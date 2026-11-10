'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Users } from 'lucide-react';
import { formatCents } from '@/lib/money';
import { formatQuantity } from '@/lib/units';
import type { SupplierItemWithDetails } from '@/server/catalogue/suppliers';
import { CreateSupplierItemModal } from './create-supplier-item-modal';
import { CreateSupplierModal } from './create-supplier-modal';

interface SupplierData {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  leadTimeDays: number;
  notes: string | null;
  isActive: boolean;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  baseUnit: 'each' | 'g' | 'ml';
}

interface SuppliersViewProps {
  suppliers: SupplierData[];
  supplierItems: SupplierItemWithDetails[];
  products: ProductOption[];
  isAdmin: boolean;
}

export function SuppliersView({
  suppliers,
  supplierItems,
  products,
  isAdmin,
}: SuppliersViewProps) {
  const router = useRouter();
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            <Users className="h-6 w-6 text-[var(--color-primary)]" />
            <span>Suppliers & Item Mappings</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Maintain your vendor directory, typical lead times, and product mapping catalogues.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsItemModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
            >
              <Link2 className="h-4 w-4" />
              <span>Map Supplier Item</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSupplierModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              <span>New Supplier</span>
            </button>
          </div>
        )}
      </div>

      {/* Suppliers Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)] border-b border-[var(--color-line)] pb-3">
          Active Suppliers ({suppliers.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Supplier Name</th>
                <th className="py-2.5 px-3">Contact</th>
                <th className="py-2.5 px-3">Email & Phone</th>
                <th className="py-2.5 px-3 text-center">Lead Time</th>
                <th className="py-2.5 px-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No suppliers added yet.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[var(--color-ink)]">
                      {s.name}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-[var(--color-ink-muted)]">
                      {s.contactName || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)]">
                      {s.email && <div className="text-[var(--color-ink)]">{s.email}</div>}
                      {s.phone && <div>{s.phone}</div>}
                      {!s.email && !s.phone && '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {s.leadTimeDays} {s.leadTimeDays === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)] max-w-xs truncate">
                      {s.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mapped Supplier Items Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)] border-b border-[var(--color-line)] pb-3">
          Mapped Supplier Items ({supplierItems.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Supplier</th>
                <th className="py-2.5 px-3">Invoice Description / SKU</th>
                <th className="py-2.5 px-3">Mapped Product</th>
                <th className="py-2.5 px-3">Pack Packaging</th>
                <th className="py-2.5 px-3 text-right">Pack Qty</th>
                <th className="py-2.5 px-3 text-right">Last Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {supplierItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No supplier items mapped yet. Mapping items helps the OCR and receipt engine automatically identify products from delivery notes.
                  </td>
                </tr>
              ) : (
                supplierItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                      {item.supplierName}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <div className="font-semibold text-[var(--color-ink)]">{item.description}</div>
                      {item.supplierSku && (
                        <div className="font-mono text-slate-500">SKU: {item.supplierSku}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <div className="font-medium text-[var(--color-ink)]">{item.productName}</div>
                      <div className="font-mono text-slate-500">{item.productSku}</div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)]">
                      {item.packLabel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-xs text-[var(--color-ink)]">
                      {formatQuantity(item.packQuantity, item.productBaseUnit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-[var(--color-ink-muted)]">
                      {item.lastPackCostCents !== null ? formatCents(item.lastPackCostCents) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateSupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        onSuccess={() => router.refresh()}
      />

      <CreateSupplierItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        products={products}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

