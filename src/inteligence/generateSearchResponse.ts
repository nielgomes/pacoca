// src/inteligence/generateSearchResponse.ts

import { openai } from "../services/openai";
import config from '../../model.json';
import beautifulLogger from "../utils/beautifulLogger";

export default async function generateSearchResponse(query: string) {
  const modelConfig = config.search; // Pega a configuração do agente de pesquisa
  beautifulLogger.info("AGENTE PESQUISADOR", `Usando o modelo: ${modelConfig.MODEL_NAME}`);

  const response = await openai.chat.completions.create({
    model: modelConfig.MODEL_NAME,
    messages: [
      { 
        role: "system", 
        content: "Você é um assistente de pesquisa. Responda à pergunta do usuário de forma direta, clara e baseada nos seus resultados de busca em tempo real. Sempre que possível, cite suas fontes." 
      },
      { role: "user", content: query }
    ],
    max_tokens: 1000, // Podemos dar um pouco mais de espaço para respostas de pesquisa
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("O agente de pesquisa não retornou uma resposta.");
  }

  return content;
}