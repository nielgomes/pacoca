// src/inteligence/tools/wrapper.ts
// Wrapper para manter compatibilidade com generateResponse.ts existente

import { getOpenAITools } from "./index";
import { ChatCompletionTool } from "openai/resources";

/**
 * Retorna as tools no formato OpenAI para compatibilidade
 * Este arquivo serve como ponte entre o novo sistema e o código existente
 */
export function getTools(): ChatCompletionTool[] {
  return getOpenAITools();
}

/**
 * Exporta as tools diretamente para uso em generateResponse.ts
 */
export const tools: ChatCompletionTool[] = getOpenAITools();
