import POSSIBLE_RESPONSE_PROMPT from "../constants/POSSIBLE_RESPONSE_PROMPT";
import { openai } from "../services/openai";
import { SummaryData } from "../utils/database";
import { Message } from "./types";
import config from '../../model.json';
import { withRetry } from "../utils/retry";

function tryParsePossibleResponse(content: string): { possible: boolean; reason: string } {
  const normalize = (text: string) =>
    text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

  const extractFirstJsonObject = (text: string): string | null => {
    const start = text.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  };

  const tryCandidates: string[] = [];
  const cleaned = normalize(content);
  tryCandidates.push(cleaned);

  const extracted = extractFirstJsonObject(cleaned);
  if (extracted && extracted !== cleaned) {
    tryCandidates.push(extracted);
  }

  // Reparo avançado para JSON parcial/truncado
  const startAt = cleaned.indexOf("{");
  if (startAt !== -1) {
    const partial = cleaned.slice(startAt);
    
    // Tenta extrair apenas o objeto JSON principal
    const braceDepth = (str: string): number => {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (const ch of str) {
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      return depth;
    };
    
    const opens = (partial.match(/\{/g) || []).length;
    const closes = (partial.match(/\}/g) || []).length;
    
    // Se faltam chaves de fechamento, tenta adicionar
    if (opens > closes) {
      const missing = opens - closes;
      tryCandidates.push(partial + "}".repeat(missing));
    }
    
    // Se a string termina dentro de uma string não fechada, tenta fechar
    if (partial.endsWith('"') && !partial.endsWith('":')) {
      tryCandidates.push(partial + '"');
    }
    
    // Tenta forçar fechar a string reason se estiver truncada
    if (partial.includes('"reason":') && !partial.includes('"reason":"')) {
      // Tenta adicionar a string reason se estiver truncada
      const reasonIdx = partial.indexOf('"reason":');
      const beforeReason = partial.slice(0, reasonIdx + 10);
      tryCandidates.push(beforeReason + '"motivo qualquer"');
    }
  }

  let lastError: unknown;
  for (const candidate of tryCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.possible !== "boolean" || typeof parsed?.reason !== "string") {
        throw new Error("JSON não contém os campos esperados: possible(boolean), reason(string)");
      }
      return parsed as { possible: boolean; reason: string };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao fazer parse do JSON de possible_response");
}

export default async function isPossibleResponse(data: SummaryData, messages: Message[]) {
  // Limita a 30 mensagens mais recentes para evitar custos excessivos
  const recentMessages = messages.slice(-30);
  const messagesMaped: string = recentMessages
    .map((message) => message.content)
    .join("\n");

  const formatDataForPrompt = (data: SummaryData): string => {
    let formattedData = "Resumo da conversa e opiniões dos usuários:\n\n";

    if (data.summary) {
      formattedData += `📋 RESUMO DA CONVERSA:\n${data.summary}\n\n`;
    }

    if (data.opinions && data.opinions.length > 0) {
      formattedData += `👥 OPINÕES SOBRE OS USUÁRIOS:\n`;
      data.opinions.forEach((opinion) => {

        let opnion = "NEUTRO/MISTO";
        if (opinion.opinion < 20) opnion = "ODEIO ELE";
        else if (opinion.opinion < 40) opnion = "NÃO GOSTO";
        else if (opinion.opinion < 60) opnion = "NEUTRO/MISTO";
        else if (opinion.opinion < 80) opnion = "GOSTO BASTANTE";
        else if (opinion.opinion <= 100) opnion = "APAIXONADO";
        formattedData += `• ${opinion.name} (${opinion.jid}):\n`;
        formattedData += `  - Nível de opinião: ${opinion.opinion}/100 (${opnion})\n`;
        if (opinion.traits && opinion.traits.length > 0) {
          formattedData += `  - O que acho dele (Características): ${opinion.traits.join(", ")}\n`;
        }
        formattedData += "\n";
      });
    }

    return formattedData.trim();
  };

  const contextData = formatDataForPrompt(data);

  const responseSchema = {
    type: "json_schema" as const,
    json_schema: {
      name: "possible_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          possible: {
            type: "boolean",
          },
          reason: {
            type: "string",
            description: "Motivo pelo qual a resposta é considerada possível ou não.",
          },
        },
        required: ["possible", "reason"],
        additionalProperties: false,
      },
    },
  };

  const PARSE_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
    const response = await withRetry(async () => {
      return await openai.chat.completions.create({
        model: config.free.MODEL_NAME,
        messages: [
          { role: "system", content: POSSIBLE_RESPONSE_PROMPT },
          {
            role: "assistant",
            content: `Opiniões já formadas dos usuários: ${contextData}`,
          },
          {
            role: "user",
            content: `Conversa: \n\n${messagesMaped}`
          },
        ],
        response_format: responseSchema,
        max_tokens: 100
      });
    }, 3, 1000);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      if (attempt === PARSE_ATTEMPTS) {
        throw new Error("Nenhuma resposta foi gerada pela IA (conteúdo nulo)");
      }
      continue;
    }

    try {
      return tryParsePossibleResponse(content);
    } catch (error) {
      console.error(`Erro ao fazer parse da resposta do resumo (tentativa ${attempt}/${PARSE_ATTEMPTS}):`, error);
      console.error("Conteúdo recebido que falhou o parse:", content);
      if (attempt === PARSE_ATTEMPTS) {
        throw new Error("A resposta da IA não é um JSON válido, mesmo com o modo estruturado.");
      }
    }
  }

  throw new Error("Falha inesperada ao validar possible_response");
}
