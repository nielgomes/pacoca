// src/inteligence/generateSearchResponse.ts

import OpenAI from "openai";
import config from '../../model.json';
import beautifulLogger from "../utils/beautifulLogger";

// Para uso com a API da Perplexity
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

// Cria um novo cliente de API, configurado especificamente para o Perplexity.
const perplexityClient = new OpenAI({
  baseURL: "https://api.perplexity.ai",
  apiKey: perplexityApiKey,
});

/**
 * Remove o bloco <think>...</think> da resposta do Perplexity.
 * @param rawContent A resposta bruta vinda da API.
 * @returns A resposta limpa, pronta para o usuário.
 */
function parsePerplexityResponse(rawContent: string): string {
  // Esta expressão regular encontra o bloco <think> e tudo que está dentro dele,
  // incluindo múltiplas linhas, e o substitui por uma string vazia.
  const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/, '');
  return cleanedContent.trim(); // .trim() remove espaços em branco extras no início ou fim
}

export default async function generateSearchResponse(query: string) {
  if (!perplexityApiKey) {
    throw new Error("A chave de API do Perplexity (PERPLEXITY_API_KEY) não foi configurada.");
  }

  const modelConfig = config.perplexity; // Pega a configuração do agente de pesquisa da API Perplexity
  beautifulLogger.info("AGENTE PESQUISADOR", `Usando o modelo: ${modelConfig.MODEL_NAME}`);

  const response = await perplexityClient.chat.completions.create({
    model: modelConfig.MODEL_NAME,
    messages: [
      { 
        role: "system", 
        content: "Você é um assistente de pesquisa on-line de última geração. \nResponda à pergunta do usuário de forma direta, clara e baseada nos seus resultados de busca em tempo real. \nResuma as informações obedecendo a cronologia do contexto da pergunta e da resposta de forma a facilitar entendimento do usuário. \nIMPORTANTE: \nSempre que possível, cite suas fontes com links e URLs. \nNÃO mostrar o seu pensamento <think> na resposta." 
      },
      { role: "user", content: query }
    ],
    max_tokens: 2500, // Podemos dar um pouco mais de espaço para respostas de pesquisa
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`O agente de pesquisa ${modelConfig.MODEL_NAME} não retornou uma resposta.`);
  }

  const cleanContent = parsePerplexityResponse(content);
  return cleanContent;
}