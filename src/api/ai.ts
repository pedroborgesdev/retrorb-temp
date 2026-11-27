import { aiDescriptionResponseSchema } from '../types/contracts';
import { postJson } from './client';

export const DEFAULT_HF_MODEL = 'openai/gpt-oss-120b';

export const HF_MODEL_PRESETS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/Llama-3.3-70B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
] as const;

export interface DescribeGameRequest {
  apiKey?: string;
  model?: string;
  title: string;
  console?: string | null;
  sourceDescription?: string | null;
}

export const aiApi = {
  describeGame(request: DescribeGameRequest, signal?: AbortSignal) {
    const trimmedKey = request.apiKey?.trim();
    const trimmedModel = request.model?.trim() || DEFAULT_HF_MODEL;
    return postJson(
      '/ai/describe',
      {
        model: trimmedModel,
        title: request.title,
        console: request.console ?? null,
        source_description: request.sourceDescription ?? null,
      },
      aiDescriptionResponseSchema,
      {
        signal,
        headers: trimmedKey ? { 'X-HF-Token': trimmedKey } : undefined,
      },
    );
  },
};
