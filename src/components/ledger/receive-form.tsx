'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { receiveDeliveryAction } from '@/app/actions/ledger';
import { resizeReceiptImage } from '@/lib/image-resize';
import { majorToCents } from '@/lib/money';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type { DocumentCheckFlag, LineCheckFlag } from '@/server/extraction/checks';
import type { MatchCandidate, MatchMethod } from '@/server/extraction/match';

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface LineItemState {
  id: string; // client temporary key
  productId: string;
  packCount: string;
  packQuantity: string;
  lineCostPesos: string;
  expiryDate: string;
  lotCode: string;
  // AI intake properties
  descriptionPrinted?: string | null;
  supplierSku?: string | null;
  packLabel?: string | null;
  supplierItemId?: string | null;
  matchMethod?: MatchMethod;
  candidates?: MatchCandidate[];
  flags?: LineCheckFlag[];
  saveSupplierAlias?: boolean;
}

interface ReceiveFormProps {
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultDate: string;
  initialSupplierId?: string;
  initialProductId?: string;
}

export function ReceiveForm({
  suppliers,
  products,
  defaultDate,
  initialSupplierId,
  initialProductId,
}: ReceiveFormProps) {
  const router = useRouter();

  const resolvedSupplierId =
    (initialSupplierId && suppliers.some((s) => s.id === initialSupplierId) ? initialSupplierId : null) ||
    suppliers[0]?.id ||
    '';
  const resolvedProductId =
    (initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : null) ||
    products[0]?.id ||
    '';
  const defaultProd = products.find((p) => p.id === resolvedProductId);

  // Method state: 'photo' (AI) vs 'manual'
  const [receiveMode, setReceiveMode] = useState<'photo' | 'manual'>('photo');

  // Document header state
  const [supplierId, setSupplierId] = useState(resolvedSupplierId);
  const [deliveryDate, setDeliveryDate] = useState(defaultDate);
  const [reference, setReference] = useState('');
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [documentFlags, setDocumentFlags] = useState<DocumentCheckFlag[]>([]);

  // Submission & message state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [aiNoticeMessage, setAiNoticeMessage] = useState<string | null>(null);

  // Photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Line items state
  const [lines, setLines] = useState<LineItemState[]>([
    {
      id: crypto.randomUUID(),
      productId: resolvedProductId,
      packCount: '1',
      packQuantity: defaultProd?.baseUnit === 'each' ? '1' : '1000',
      lineCostPesos: '',
      expiryDate: '',
      lotCode: '',
      saveSupplierAlias: false,
    },
  ]);

  // Handle Photo Upload & AI Extraction
  const handlePhotoSelected = async (file: File) => {
    setErrorMessage(null);
    setAiNoticeMessage(null);
    setIsExtracting(true);

    // Create object URL for client preview
    const previewUrl = URL.createObjectURL(file);
    setPhotoUrl(previewUrl);

    try {
      // 1. Client-side resize keeping under 4 MB
      const processedFile = await resizeReceiptImage(file);

      // 2. Transmit to POST /api/extractions
      const formData = new FormData();
      formData.append('file', processedFile);
      if (supplierId) {
        formData.append('supplierId', supplierId);
      }

      const res = await fetch('/api/extractions', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        // Fallback guard per docs/design.md § Receive from photo
        const fallbackMsg =
          json.code === 'ai_unavailable'
            ? 'Photo reading is unavailable right now. Enter the delivery by hand — your photo stays visible.'
            : json.error || "Couldn't read this photo. You can enter the delivery by hand — your photo stays visible.";

        setAiNoticeMessage(fallbackMsg);
        // Switch to manual form while keeping photo pinned
        setReceiveMode('manual');
        setIsExtracting(false);
        return;
      }

      // 3. AI Extraction Succeeded: populate draft
      const draft = json.data.draft;
      setExtractionId(json.data.extractionId);

      // Hydrate document headers if detected
      if (draft.document.deliveryDate) {
        setDeliveryDate(draft.document.deliveryDate);
      }
      if (draft.document.documentNumber) {
        setReference(draft.document.documentNumber);
      }

      // Fuzzy match supplier name if returned and not already chosen
      if (draft.document.supplierNameNormalized) {
        const found = suppliers.find((s) =>
          draft.document.supplierNameNormalized.includes(s.name.toLowerCase().trim()),
        );
        if (found) {
          setSupplierId(found.id);
        }
      }

      setDocumentFlags(draft.documentFlags || []);

      // Hydrate lines from draft
      if (draft.lines && draft.lines.length > 0) {
        interface DraftLineItem {
          selectedProductId?: string | null;
          packCount: string;
          packQuantity?: string | null;
          unitPriceCents?: number | null;
          lineTotalCents?: number | null;
          expiryDate?: string | null;
          lotCode?: string | null;
          description: string;
          supplierSku?: string | null;
          packLabel?: string | null;
          selectedSupplierItemId?: string | null;
          matchMethod?: MatchMethod;
          candidates?: MatchCandidate[];
          flags?: LineCheckFlag[];
        }

        const populatedLines: LineItemState[] = draft.lines.map((l: DraftLineItem) => {
          const matchedProd = l.selectedProductId ? products.find((p) => p.id === l.selectedProductId) : null;
          const defaultPackQty = matchedProd ? (matchedProd.baseUnit === 'each' ? '1' : '1000') : '';

          const rawPackCount = l.packCount ? Number(l.packCount) : 1;
          const formattedPackCount = Number.isFinite(rawPackCount)
            ? rawPackCount % 1 === 0
              ? rawPackCount.toString()
              : rawPackCount.toFixed(3)
            : '1';

          const lineCostPesos =
            l.lineTotalCents !== undefined && l.lineTotalCents !== null
              ? (l.lineTotalCents / 100).toFixed(2)
              : l.unitPriceCents !== undefined && l.unitPriceCents !== null
                ? ((l.unitPriceCents * Number(l.packCount)) / 100).toFixed(2)
                : '';

          return {
            id: crypto.randomUUID(),
            productId: l.selectedProductId || '',
            packCount: formattedPackCount,
            packQuantity: l.packQuantity || defaultPackQty,
            lineCostPesos,
            expiryDate: l.expiryDate || '',
            lotCode: l.lotCode || '',
            descriptionPrinted: l.description,
            supplierSku: l.supplierSku,
            packLabel: l.packLabel,
            supplierItemId: l.selectedSupplierItemId,
            matchMethod: l.matchMethod,
            candidates: l.candidates || [],
            flags: l.flags || [],
            saveSupplierAlias: l.matchMethod === 'new_item' || !l.selectedSupplierItemId,
          };
        });

        setLines(populatedLines);
      }
    } catch {
      setAiNoticeMessage('Photo reading is unavailable right now. Enter the delivery by hand — your photo stays visible.');
      setReceiveMode('manual');
    } finally {
      setIsExtracting(false);
    }
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: '',
        packCount: '1',
        packQuantity: '',
        lineCostPesos: '',
        expiryDate: '',
        lotCode: '',
        saveSupplierAlias: false,
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, updates: Partial<LineItemState>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...updates };

        // If product changed, update default pack quantity and clear unselected/weak flags
        if (updates.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          if (prod && !updated.packQuantity) {
            updated.packQuantity = prod.baseUnit === 'each' ? '1' : '1000';
          }
          if (updated.flags) {
            updated.flags = updated.flags.filter((f) => f !== 'unmatched' && f !== 'weak_match');
          }
        }
        return updated;
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supplierId) {
      setErrorMessage('Please select a supplier.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('At least one line item is required.');
      return;
    }

    for (const [idx, line] of lines.entries()) {
      if (!line.productId) {
        setErrorMessage(`Line ${idx + 1}: Please select a product.`);
        return;
      }
      if (!line.packCount || Number(line.packCount) <= 0) {
        setErrorMessage(`Line ${idx + 1}: Pack count must be greater than zero.`);
        return;
      }
      if (!line.packQuantity || Number(line.packQuantity) <= 0) {
        setErrorMessage(`Line ${idx + 1}: Pack quantity must be greater than zero.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        supplierId,
        deliveryDate,
        reference: reference.trim() || null,
        source: (photoUrl && extractionId ? 'ai_extraction' : 'manual') as 'ai_extraction' | 'manual',
        extractionId,
        idempotencyKey,
        lines: lines.map((l) => {
          let lineCostCents: number | null = null;
          if (l.lineCostPesos.trim()) {
            lineCostCents = majorToCents(l.lineCostPesos);
          }

          return {
            productId: l.productId,
            supplierItemId: l.supplierItemId || null,
            descriptionPrinted: l.descriptionPrinted || null,
            packCount: l.packCount,
            packQuantity: l.packQuantity,
            lineCostCents,
            expiryDate: l.expiryDate || null,
            expirySource: (l.expiryDate ? 'manual' : null) as 'manual' | null,
            lotCode: l.lotCode.trim() || null,
            matchMethod: (l.matchMethod || 'manual') as 'exact' | 'suggested' | 'manual' | 'new_item',
            saveSupplierAlias: Boolean(l.saveSupplierAlias),
            supplierSku: l.supplierSku || null,
            packLabel: l.packLabel || null,
          };
        }),
      };

      const result = await receiveDeliveryAction(payload);

      if (!result.ok) {
        setErrorMessage(result.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('Delivery receipt successfully recorded and stock movements logged.');
      setTimeout(() => {
        router.push('/today');
        router.refresh();
      }, 1200);
    } catch {
      setErrorMessage('An unexpected error occurred while saving the delivery.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Method Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
        <button
          type="button"
          onClick={() => setReceiveMode('photo')}
          className={`flex items-center gap-2 rounded-[var(--radius-field)] px-4 py-2 text-sm font-semibold transition-all ${
            receiveMode === 'photo'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Read from photo</span>
        </button>

        <button
          type="button"
          onClick={() => setReceiveMode('manual')}
          className={`flex items-center gap-2 rounded-[var(--radius-field)] px-4 py-2 text-sm font-semibold transition-all ${
            receiveMode === 'manual'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Enter by hand</span>
        </button>
      </div>

      {/* Fallback Notice Banner */}
      {aiNoticeMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Photo Reading Notice</p>
            <p className="text-amber-800 leading-relaxed">{aiNoticeMessage}</p>
          </div>
        </div>
      )}

      {/* Main Workspace Layout (Side-by-Side on Desktop when photo is available) */}
      <div className={`grid grid-cols-1 gap-6 ${photoUrl ? 'lg:grid-cols-12' : 'max-w-4xl'}`}>
        {/* Left Column: Pinned Receipt Photo Viewer */}
        {photoUrl && (
          <aside className="lg:col-span-5 space-y-3">
            <div className="sticky top-20 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2 mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)] uppercase tracking-wider">
                  <ImageIcon className="h-4 w-4 text-[var(--color-primary)]" />
                  <span>Delivery Photo</span>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Zoom in"
                    onClick={() => setPhotoZoom((z) => Math.min(2.5, z + 0.25))}
                    className="p-1 rounded hover:bg-[var(--color-paper)] text-[var(--color-ink)]"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Zoom out"
                    onClick={() => setPhotoZoom((z) => Math.max(1, z - 0.25))}
                    className="p-1 rounded hover:bg-[var(--color-paper)] text-[var(--color-ink)]"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Reset zoom"
                    onClick={() => setPhotoZoom(1)}
                    className="p-1 rounded hover:bg-[var(--color-paper)] text-[var(--color-ink)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Full screen"
                    onClick={() => setIsLightboxOpen(true)}
                    className="p-1 rounded hover:bg-[var(--color-paper)] text-[var(--color-primary)] font-bold"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Pinned Image Container */}
              <div className="relative overflow-auto max-h-[70vh] rounded border border-[var(--color-line)] bg-slate-900 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Scanned Delivery Receipt"
                  style={{ transform: `scale(${photoZoom})`, transformOrigin: 'top left' }}
                  className="transition-transform duration-150 cursor-pointer max-w-full h-auto object-contain"
                  onClick={() => setIsLightboxOpen(true)}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-ink-muted)]">
                <span>Click image to open full screen</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-semibold text-[var(--color-primary)] hover:underline"
                >
                  Replace photo
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Right Column: Review & Form Workspace */}
        <div className={photoUrl ? 'lg:col-span-7 space-y-6' : 'w-full space-y-6'}>
          {/* Photo Upload Dropzone (When in photo mode and no photo is processing) */}
          {receiveMode === 'photo' && !photoUrl && (
            <div className="rounded-lg border-2 border-dashed border-[var(--color-line)] bg-[var(--color-panel)] p-8 text-center shadow-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoSelected(file);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoSelected(file);
                }}
              />

              {isExtracting ? (
                <div className="space-y-4 py-8 flex flex-col items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)]" />
                  <div className="space-y-1">
                    <p className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                      Reading Delivery Receipt with Gemini Vision...
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)] max-w-sm">
                      Transcribing item descriptions, verifying arithmetic, and matching catalogue products.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-primary)]">
                    <UploadCloud className="h-7 w-7" />
                  </div>

                  <div className="space-y-1">
                    <p className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                      Snap or upload delivery note
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)] max-w-md mx-auto">
                      Photograph a Philippine Delivery Receipt (DR) or Sales Invoice (SI). Form fields, line totals, and
                      catalogue matches will be extracted automatically.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
                    >
                      <UploadCloud className="h-4 w-4" />
                      <span>Browse File</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-[var(--color-ink-muted)]">
                    Supports JPEG, PNG, or WebP up to 4 MB. Photos are compressed in-browser and never persisted.
                  </p>

                  <div className="mt-4 pt-4 border-t border-[var(--color-line)]">
                    <p className="text-xs font-semibold text-[var(--color-ink-muted)] mb-2">
                      Or try a sample Philippine delivery note (instant 1-click test):
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/samples/dr-clean-bukidnon-vat-inc.png');
                            const blob = await res.blob();
                            const file = new File([blob], 'bukidnon-delivery-receipt.png', { type: 'image/png' });
                            handlePhotoSelected(file);
                          } catch {
                            setErrorMessage('Failed to load sample image.');
                          }
                        }}
                        className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-primary)] transition-colors"
                      >
                        ☕ Bukidnon Coffee (VAT Inc)
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/samples/si-clean-northern-dairy-vat-ex.png');
                            const blob = await res.blob();
                            const file = new File([blob], 'northern-dairy-sales-invoice.png', { type: 'image/png' });
                            handlePhotoSelected(file);
                          } catch {
                            setErrorMessage('Failed to load sample image.');
                          }
                        }}
                        className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-primary)] transition-colors"
                      >
                        🥛 Northern Dairy (12% VAT)
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/samples/dr-clean-sweetcraft-syrups.png');
                            const blob = await res.blob();
                            const file = new File([blob], 'sweetcraft-syrups-note.png', { type: 'image/png' });
                            handlePhotoSelected(file);
                          } catch {
                            setErrorMessage('Failed to load sample image.');
                          }
                        }}
                        className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-primary)] transition-colors"
                      >
                        🍯 Sweet Craft Syrups
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Document Flags Banner */}
          {documentFlags.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs text-sm">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Document Verification Flags:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-800">
                {documentFlags.includes('total_mismatch') && (
                  <li>
                    <strong>Total Mismatch:</strong> Sum of line totals matches neither document subtotal nor grand
                    total.
                  </li>
                )}
                {documentFlags.includes('date_implausible') && (
                  <li>
                    <strong>Date Notice:</strong> Delivery date is in the future or older than 60 days.
                  </li>
                )}
                {documentFlags.includes('supplier_mismatch') && (
                  <li>
                    <strong>Supplier Mismatch:</strong> The name on the paper header differs from the chosen supplier.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Delivery Details Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
              <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                Delivery Details
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Supplier */}
                <div>
                  <label htmlFor="supplierId" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                    Supplier <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="supplierId"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                  >
                    <option value="" disabled>
                      Select a supplier...
                    </option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Delivery Date */}
                <div>
                  <label htmlFor="deliveryDate" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                    Delivery Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="deliveryDate"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                  />
                </div>

                {/* Reference */}
                <div>
                  <label htmlFor="reference" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                    Invoice / DR #
                  </label>
                  <input
                    id="reference"
                    type="text"
                    placeholder="e.g. DR-98124"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Section */}
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                    Items Received
                  </h2>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Review pack quantities, costs, and expiry dates before committing to the ledger.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Row</span>
                </button>
              </div>

              <div className="space-y-4">
                {lines.map((line, idx) => {
                  const prod = products.find((p) => p.id === line.productId);
                  const baseUnit = prod?.baseUnit || 'each';
                  const tracksExpiry = prod?.tracksExpiry ?? false;

                  const totalBaseQty = (Number(line.packCount || 0) * Number(line.packQuantity || 0)).toString();

                  return (
                    <div
                      key={line.id}
                      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-4 space-y-3 shadow-xs"
                    >
                      {/* Top Row: Title, Match Badge & Remove */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--color-ink)]">Item #{idx + 1}</span>

                          {line.matchMethod === 'exact' && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <Check className="h-3 w-3" /> Exact Match
                            </span>
                          )}
                          {line.matchMethod === 'suggested' && (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                              <Sparkles className="h-3 w-3" /> Suggested Match
                            </span>
                          )}
                          {line.flags?.includes('weak_match') && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="h-3 w-3" /> Weak Match — Please Review
                            </span>
                          )}
                          {line.flags?.includes('unmatched') && !line.productId && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                              <AlertCircle className="h-3 w-3" /> Unmatched — Select Product
                            </span>
                          )}
                          {!line.productId && !line.flags?.includes('unmatched') && !line.flags?.includes('weak_match') && (
                            <span className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                              Select Product
                            </span>
                          )}
                        </div>

                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="p-1 text-[var(--color-ink-muted)] hover:text-rose-600 rounded"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Extracted Description / Candidates (if present) */}
                      {line.descriptionPrinted && (
                        <div className="rounded bg-[var(--color-panel)] p-2.5 text-xs border border-[var(--color-line)] space-y-1.5">
                          <div className="text-[var(--color-ink-muted)]">
                            Printed on receipt:{' '}
                            <span className="font-semibold text-[var(--color-ink)]">
                              &ldquo;{line.descriptionPrinted}&rdquo;
                            </span>
                            {line.supplierSku && <span className="ml-2 font-mono">({line.supplierSku})</span>}
                          </div>

                          {/* Quick-Pick Candidate Pills */}
                          {line.candidates && line.candidates.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[11px] text-[var(--color-ink-muted)]">Candidates:</span>
                              {line.candidates.map((cand) => (
                                <button
                                  key={cand.productId}
                                  type="button"
                                  onClick={() => {
                                    const candProd = products.find((p) => p.id === cand.productId);
                                    updateLine(line.id, {
                                      productId: cand.productId,
                                      packQuantity: cand.packQuantity || (candProd?.baseUnit === 'each' ? '1' : '1000'),
                                      supplierItemId: cand.supplierItemId,
                                      matchMethod: 'manual',
                                    });
                                  }}
                                  className={`rounded px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                                    line.productId === cand.productId
                                      ? 'border-[var(--color-primary)] bg-emerald-50 text-[var(--color-primary)] font-bold'
                                      : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-[var(--color-panel)]'
                                  }`}
                                >
                                  {cand.productName} ({Math.round(cand.score * 100)}%)
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Input Fields Grid */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        {/* Product selection */}
                        <div className="sm:col-span-4">
                          <label className="flex flex-col justify-end h-8 pb-1 text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                            <span>
                              Product <span className="text-rose-500">*</span>
                            </span>
                          </label>
                          <select
                            value={line.productId}
                            onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                            required
                            className="block h-8 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                          >
                            <option value="" disabled>
                              — Select matching product —
                            </option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Packs */}
                        <div className="sm:col-span-2">
                          <label className="flex flex-col justify-end h-8 pb-1 text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                            <span>
                              Packs <span className="text-rose-500">*</span>
                            </span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={line.packCount}
                            onChange={(e) => updateLine(line.id, { packCount: e.target.value })}
                            required
                            className="block h-8 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                          />
                        </div>

                        {/* Qty per pack */}
                        <div className="sm:col-span-2">
                          <label className="flex flex-col justify-end h-8 pb-1 text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                            <span className="truncate">Qty / Pack</span>
                            <span className="text-[10px] normal-case text-[var(--color-ink-muted)] font-normal leading-none">
                              ({baseUnit})
                            </span>
                          </label>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.packQuantity}
                            onChange={(e) => updateLine(line.id, { packQuantity: e.target.value })}
                            required
                            className="block h-8 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                          />
                        </div>

                        {/* Line Cost (PHP) */}
                        <div className="sm:col-span-2">
                          <label className="flex flex-col justify-end h-8 pb-1 text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                            <span>Cost (PHP)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 570.00"
                            value={line.lineCostPesos}
                            onChange={(e) => updateLine(line.id, { lineCostPesos: e.target.value })}
                            className="block h-8 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:outline-hidden"
                          />
                        </div>

                        {/* Expiry Date */}
                        <div className="sm:col-span-2">
                          <label className="flex flex-col justify-end h-8 pb-1 text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                            <span>Expiry {tracksExpiry && <span className="text-rose-500">*</span>}</span>
                          </label>
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) => updateLine(line.id, { expiryDate: e.target.value })}
                            required={tracksExpiry && prod?.shelfLifeDays === null}
                            className="block h-8 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Warnings & Meta Info */}
                      <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-[var(--color-line)]">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[var(--color-ink-muted)]">
                            Total stock:{' '}
                            <strong className="text-[var(--color-ink)]">
                              {line.productId && Number(line.packQuantity || 0) > 0 ? formatQuantity(totalBaseQty, baseUnit) : '—'}
                            </strong>
                          </span>

                          {tracksExpiry && !line.expiryDate && prod?.shelfLifeDays && (
                            <span className="text-amber-700 font-medium">
                              Will estimate automatically (+{prod.shelfLifeDays} days)
                            </span>
                          )}

                          {line.flags?.includes('arithmetic_mismatch') && (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                              <AlertCircle className="h-3.5 w-3.5" /> Arithmetic mismatch on receipt
                            </span>
                          )}

                          {line.flags?.includes('missing_expiry') && (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                              <AlertCircle className="h-3.5 w-3.5" /> Expiry date required for this item
                            </span>
                          )}
                        </div>

                        {/* Learning Loop Toggle */}
                        {line.descriptionPrinted && (
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={line.saveSupplierAlias ?? false}
                              onChange={(e) => updateLine(line.id, { saveSupplierAlias: e.target.checked })}
                              className="rounded border-[var(--color-line)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                            />
                            <span>Remember supplier item alias</span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error & Success Alerts */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-800 shadow-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 shadow-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push('/today')}
                className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || lines.some((l) => !l.productId)}
                title={lines.some((l) => !l.productId) ? 'Select a product for every line before confirming' : undefined}
                className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-50 transition-opacity"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Confirming Receipt...</span>
                  </>
                ) : (
                  <span>Confirm Receipt</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Full-Screen Lightbox Modal for Photo Inspection */}
      {isLightboxOpen && photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-slate-900 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPhotoZoom((z) => Math.min(3, z + 0.5))}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPhotoZoom((z) => Math.max(1, z - 0.5))}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/90"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Scanned Delivery Receipt Full View"
              style={{ transform: `scale(${photoZoom})`, transformOrigin: 'top left' }}
              className="max-h-[85vh] max-w-full object-contain transition-transform"
            />
          </div>
        </div>
      )}
    </div>
  );
}

