// src/inteligence/generateSearchResponse.ts

import { openai } from "../services/openai";
import models from '../../model.json';
import beautifulLogger from "../utils/beautifulLogger";

/**
 * Remove o bloco  da resposta.
 * @param rawContent A resposta bruta vinda da API.
 * @returns A resposta limpa, pronta para o usuário.
 */
function parseSearchResponse(rawContent: string): string {
  const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/, '');
  return cleanedContent.trim();
}

export default async function generateSearchResponse(query: string, modelKey: string = 'sonar_openrouter') {
  const modelsData = models as Record<string, { MODEL_NAME: string }>;
  const modelConfig = modelsData[modelKey];
  
  if (!modelConfig) {
    throw new Error(`Modelo '${modelKey}' não encontrado em model.json`);
  }
  
  const MODEL_NAME = modelConfig.MODEL_NAME;
  beautifulLogger.info("AGENTE PESQUISADOR", `Usando o modelo: ${MODEL_NAME}`);

  // Configurar busca em tempo real
  const isPro = modelKey.includes('pro');
  const webSearchOptions = {
    search_type: isPro ? "auto" : "fast",
    search_context_size: 4000, // Limita contexto para respostas mais rápidas
  };

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      { 
        role: "system", 
        content: "Você é um assistente de pesquisa on-line de última geração. \nResponda à pergunta do usuário de forma direta, clara e baseada nos seus resultados de busca em tempo real. \nResuma as informações obedecendo a cronologia do contexto da pergunta e da resposta de forma a facilitar entendimento do usuário. \nIMPORTANTE: \nSempre que possível, cite suas fontes com links e URLs. \nNÃO mostrar o seu pensamento <think> na resposta." 
      },
      { role: "user", content: query }
    ],
    // @ts-ignore - web_search_options é específico do OpenRouter/Perplexity
    web_search_options: webSearchOptions,
    temperature: 0.3, // Menos criatividade para respostas mais precisas
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`O agente de pesquisa ${MODEL_NAME} não retornou uma resposta.`);
  }

  const cleanContent = parseSearchResponse(content);
  return cleanContent;
}
