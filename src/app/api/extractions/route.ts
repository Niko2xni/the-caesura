import { NextResponse } from 'next/server';
import { db } from '@/db';
import { documentExtractions } from '@/db/schema';
import { getSession } from '@/server/auth/guards';
import { runDocumentChecks } from '@/server/extraction/checks';
import { getExtractionCatalogueContext } from '@/server/extraction/context';
import { extractDocument } from '@/server/extraction/extract';
import { validateImageFile } from '@/server/extraction/file-validation';
import { matchExtractedLines } from '@/server/extraction/match';
import { checkExtractionRateLimits, hashClientIp } from '@/server/extraction/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Extracts line items, supplier information, dates, and prices from a photographed delivery receipt.
 * Flow (docs/architecture.md §5):
 * 1. Authentication & Role Guard (staff or admin)
 * 2. Rate limit preflight (user, IP, global caps)
 * 3. In-memory magic byte validation (JPEG, PNG, WebP <= 4 MB)
 * 4. Call AI SDK model (AI Gateway)
 * 5. Deterministic matching and checks
 * 6. Audit log to document_extractions
 * 7. Return editable draft (zero stock mutation)
 */
export async function POST(req: Request) {
  const startTime = Date.now();

  // 1. Session and Role Authorization
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, code: 'unauthenticated', error: 'You must be signed in to scan delivery receipts.' },
      { status: 401 },
    );
  }

  const role = session.user.role ?? 'staff';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json(
      { ok: false, code: 'forbidden', error: 'Only staff and administrators may scan delivery receipts.' },
      { status: 403 },
    );
  }

  // 2. Resolve Client IP & Check Rate Limits
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : realIp || '127.0.0.1';
  const ipHash = hashClientIp(clientIp);

  const rateLimitCheck = await checkExtractionRateLimits(session.user.id, clientIp);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { ok: false, code: 'rate_limit_exceeded', error: rateLimitCheck.reason },
      { status: 429 },
    );
  }

  // 3. Parse Multipart Form Data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_form_data', error: 'Failed to read multipart upload payload.' },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  const supplierId = formData.get('supplierId')?.toString() || null;

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, code: 'missing_file', error: 'Please select or capture a photo of the delivery receipt.' },
      { status: 400 },
    );
  }

  // 4. Validate Magic Bytes and Size in Memory
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const fileVal = validateImageFile(buffer);
  if (!fileVal.valid || !fileVal.mimeType) {
    return NextResponse.json(
      { ok: false, code: 'invalid_file', error: fileVal.error },
      { status: 400 },
    );
  }

  // 5. Multimodal Extraction Call
  const modelId = process.env.EXTRACTION_MODEL || 'alibaba/qwen3.8-omni-flash';
  const extractResult = await extractDocument({
    imageBytes: buffer,
    mimeType: fileVal.mimeType,
  });

  // Handle Model/Upstream Failure
  if (!extractResult.ok) {
    const errorStatus = extractResult.code === 'validation_failed' ? 422 : 503;

    await db.insert(documentExtractions).values({
      createdBy: session.user.id,
      modelId,
      status: extractResult.code === 'validation_failed' ? 'failed_validation' : 'failed_model',
      errorMessage: extractResult.error,
      clientIpHash: ipHash,
      latencyMs: extractResult.latencyMs,
      rawOutput: extractResult.rawOutput as Record<string, unknown> | null,
    });

    return NextResponse.json(
      { ok: false, code: extractResult.code, error: extractResult.error },
      { status: errorStatus },
    );
  }

  // 6. Matching & Deterministic Verification Checks
  const context = await getExtractionCatalogueContext(supplierId);
  const rawDocument = extractResult.data.normalised;

  const lineMatches = matchExtractedLines(rawDocument.lines, context.supplierItems, context.products);
  const checks = runDocumentChecks({
    document: rawDocument,
    lineMatches,
    products: context.products,
    chosenSupplierName: context.chosenSupplierName,
  });

  const draft = {
    document: rawDocument,
    documentFlags: checks.documentFlags,
    lines: rawDocument.lines.map((line, idx) => ({
      ...line,
      matchMethod: lineMatches[idx].matchMethod,
      selectedProductId: lineMatches[idx].selectedProductId,
      selectedSupplierItemId: lineMatches[idx].selectedSupplierItemId,
      packQuantity: lineMatches[idx].packQuantity,
      packLabel: lineMatches[idx].packLabel,
      candidates: lineMatches[idx].candidates,
      flags: checks.lineChecks[idx]?.flags ?? [],
    })),
  };

  // 7. Audit Logging in document_extractions
  const [logged] = await db
    .insert(documentExtractions)
    .values({
      createdBy: session.user.id,
      modelId: extractResult.data.modelId,
      status: 'succeeded',
      rawOutput: extractResult.data.raw,
      parsedOutput: draft,
      clientIpHash: ipHash,
      inputTokens: extractResult.data.inputTokens ?? null,
      outputTokens: extractResult.data.outputTokens ?? null,
      latencyMs: Date.now() - startTime,
    })
    .returning({ id: documentExtractions.id });

  return NextResponse.json({
    ok: true,
    data: {
      draft,
      extractionId: logged.id,
    },
  });
}


