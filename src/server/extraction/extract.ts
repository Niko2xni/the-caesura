import { createGateway, gateway, generateText, NoObjectGeneratedError, Output } from 'ai';
import { normaliseExtractedDocument, type NormalisedExtractedDocument } from './normalise';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_INSTRUCTION } from './prompt';
import { ExtractedDocumentSchema, type ExtractedDocument } from './schema';

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type ReasoningLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ExtractDocumentInput {
  imageBytes: Uint8Array;
  mimeType: SupportedImageMimeType;
  modelId?: string;
  reasoning?: ReasoningLevel;
}

export type ExtractDocumentResult =
  | {
      ok: true;
      data: {
        raw: ExtractedDocument;
        normalised: NormalisedExtractedDocument;
        modelId: string;
        inputTokens?: number;
        outputTokens?: number;
        latencyMs: number;
      };
    }
  | {
      ok: false;
      code: 'ai_unavailable' | 'validation_failed';
      error: string;
      rawOutput?: unknown;
      latencyMs: number;
    };

const DEFAULT_MODEL = 'alibaba/qwen3.8-omni-flash';
const DEFAULT_REASONING: ReasoningLevel = 'low';

function resolveGatewayModel(modelId: string) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (apiKey) {
    const customGateway = createGateway({ apiKey });
    return customGateway(modelId);
  }
  return gateway(modelId);
}

/**
 * Calls the multimodal model to transcribe a delivery receipt image.
 * Retries once on NoObjectGeneratedError. On API failure or rate limit,
 * safely falls back with code 'ai_unavailable' so the UI can proceed manually.
 */
export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  const startTime = Date.now();
  const modelId = input.modelId || process.env.EXTRACTION_MODEL || DEFAULT_MODEL;
  const reasoning = input.reasoning || (process.env.EXTRACTION_REASONING as ReasoningLevel) || DEFAULT_REASONING;

  // Verify that an API key is configured before attempting a live gateway call
  if (!process.env.AI_GATEWAY_API_KEY && process.env.NODE_ENV !== 'test') {
    return {
      ok: false,
      code: 'ai_unavailable',
      error: 'Photo reading is unavailable right now. Enter the delivery by hand — your photo stays visible.',
      latencyMs: Date.now() - startTime,
    };
  }

  const model = resolveGatewayModel(modelId);

  const callModel = async () => {
    return generateText({
      model,
      output: Output.object({ schema: ExtractedDocumentSchema }),
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: EXTRACTION_USER_INSTRUCTION,
            },
            {
              type: 'image',
              image: input.imageBytes,
              mediaType: input.mimeType,
            },
          ],
        },
      ],
      reasoning,
    });
  };

  try {
    let result;
    try {
      result = await callModel();
    } catch (firstError) {
      if (firstError instanceof NoObjectGeneratedError) {
        // Retry once on schema generation failure per docs/architecture.md
        result = await callModel();
      } else {
        throw firstError;
      }
    }

    const latencyMs = Date.now() - startTime;
    const raw = result.output;
    const normalised = normaliseExtractedDocument(raw);

    return {
      ok: true,
      data: {
        raw,
        normalised,
        modelId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof NoObjectGeneratedError) {
      return {
        ok: false,
        code: 'validation_failed',
        error: 'The document could not be structured into receipt lines. Please enter items manually.',
        rawOutput: error.text,
        latencyMs,
      };
    }

    // Graceful fallback for all gateway/network/auth/rate-limit errors
    const errorMessage =
      error instanceof Error && error.message ? error.message : 'Photo reading failed due to an upstream service error.';

    console.warn(`[Extraction Gateway Error] (${modelId}): ${errorMessage}`);

    return {
      ok: false,
      code: 'ai_unavailable',
      error: 'Photo reading is unavailable right now. Enter the delivery by hand — your photo stays visible.',
      latencyMs,
    };
  }
}


