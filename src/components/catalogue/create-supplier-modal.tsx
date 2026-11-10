'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { createSupplierAction } from '@/app/actions/catalogue';

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateSupplierModal({ isOpen, onClose, onSuccess }: CreateSupplierModalProps) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('2');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Supplier name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createSupplierAction({
        name: name.trim(),
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        leadTimeDays: Number(leadTimeDays) || 2,
        notes: notes.trim() || null,
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setLeadTimeDays('2');
      setNotes('');
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create supplier');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink)]">
            New Supplier
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Supplier / Company Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Pacific Beverage Supply Co."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Contact Person
              </label>
              <input
                type="text"
                placeholder="e.g. Jane Santos"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Typical Lead Time (Days)
              </label>
              <input
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="orders@pacificbev.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Phone
              </label>
              <input
                type="tel"
                placeholder="0917 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Delivers Tuesdays & Thursdays; cutoff 2pm previous day"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Create Supplier</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
