// src/inteligence/generateConversationStarter.ts
import { openai } from "../services/openai";
import config from '../../model.json';
import PERSONALITY_PROMPT from "../constants/PERSONALITY_PROMPT";

/**
 * Gera uma mensagem criativa para iniciar uma conversa com base em um contexto.
 * @param context O tópico sobre o qual a conversa deve começar.
 */
export default async function generateConversationStarter(context: string): Promise<string> {
  const systemPrompt = `
    ${PERSONALITY_PROMPT}

    ---
    Sua tarefa específica AGORA é iniciar uma conversa com alguém sobre o seguinte tópico: "${context}".
    Crie uma única mensagem de abertura que seja curta, casual, dentro da sua personalidade e que termine com uma pergunta para incentivar uma resposta.
    Não atue como um assistente, seja você mesmo (Paçoca) puxando assunto com um amigo, caso vc reconheça o número do whatsapp como sendo de alguem que vc já conheça (parente ou amigo proximo) use um tom de maior intimidade.

    IMPORTANTE: Para esta tarefa, sua resposta deve ser APENAS o texto da mensagem. NÃO a formate como um objeto JSON 'actions'.
  `;
  
  const response = await openai.chat.completions.create({
    model: config.default.MODEL_NAME, // Usamos o modelo padrão para criatividade
    messages: [
      { 
        role: "system", 
        content: systemPrompt
      },
    ],
    max_tokens: 200,
    temperature: 0.9, // Aumentamos a criatividade para a mensagem de abertura
  });

  // Retorna a mensagem gerada ou uma mensagem padrão em caso de falha.
  return response.choices[0]?.message?.content || "Opa, tudo certo por aí?";
}