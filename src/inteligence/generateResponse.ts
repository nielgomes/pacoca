//src/inteligence/generateResponse.ts
import { ChatCompletionMessageParam } from "openai/resources";
import * as fs from "fs";
import { openai } from "../services/openai";
import { Data } from "../utils/database";
import PERSONALITY_PROMPT from "../constants/PERSONALITY_PROMPT";
import beautifulLogger from "../utils/beautifulLogger";
import config from '../../model.json';
import mediaCatalog from '../../media_catalog.json';
import { Message, Action, BotResponse, GenerateResponseResult } from "./types";


// --- Constantes Centralizadas ---
// ATUALIZAÇÃO: Alterado para o modelo gratuito DeepSeek da OpenRouter.
const MODEL_NAME = config.xai.MODEL_NAME;
const MODEL_PRICING = {
  // Geralmente informado em USD$ por Milhão de tokens
  // se o modelo é gratuito, então o custo é zero.
  input: config.xai.MODEL_PRICING.input,
  output: config.xai.MODEL_PRICING.output,
};

// --- Carregamento Único de Mídia ---
const stickerOptions = mediaCatalog.stickers.map(sticker => sticker.file);
const audioOptions = mediaCatalog.audios.map(audio => audio.file);
const memeOptions = mediaCatalog.memes.map(meme => meme.file);

/**
 * Estima o número de tokens para um determinado texto.
 */
function calculateTokens(text: string): number {
  // O 'tiktoken' é específico para modelos OpenAI. Usamos uma aproximação
  // genérica (caracteres / 4) para evitar erros com outros modelos.
  return Math.ceil(text.length / 4);
}

/**
 * Formata os dados de contexto (resumo e opiniões) para o prompt da IA.
 */
const formatDataForPrompt = (data: Data): string => {
  let formattedData = "Resumo da conversa e opiniões dos usuários:\n\n";
  if (data.summary) {
    formattedData += `📋 RESUMO DA CONVERSA:\n${data.summary}\n\n`;
  }
  if (data.opinions && data.opinions.length > 0) {
    formattedData += `👥 OPINÕES SOBRE OS USUÁRIOS:\n`;
    data.opinions.forEach((opinion) => {
      let opinionText = "NEUTRO/MISTO";
      if (opinion.opinion < 20) opinionText = "ODEIO ELE";
      else if (opinion.opinion < 40) opinionText = "NÃO GOSTO";
      else if (opinion.opinion < 60) opinionText = "NEUTRO/MISTO";
      else if (opinion.opinion < 80) opinionText = "GOSTO BASTANTE";
      else if (opinion.opinion <= 100) opinionText = "APAIXONADA";
      formattedData += `• ${opinion.name} (${opinion.jid}):\n`;
      formattedData += `  - Nível de opinião: ${opinion.opinion}/100 (${opinionText})\n`;
      if (opinion.traits?.length) {
        formattedData += `  - Características: ${opinion.traits.join(", ")}\n`;
      }
      formattedData += "\n";
    });
  }
  return formattedData.trim();
};

// --- Schema da Resposta da IA ---
const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "bot_response",
    strict: false,
    schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["message", "sticker", "audio", "poll", "location", "meme", "contact"],
              },
              message: {
                type: "object",
                properties: {
                  reply: { type: "string" },
                  text: { type: "string", description: "Resposta irônica (máximo 300 caracteres)" },
                },
                required: ["text"],
              },
              sticker: { type: "string", enum: stickerOptions },
              audio: { type: "string", enum: audioOptions },
              meme: { type: "string", enum: memeOptions },
              poll: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                },
                required: ["question", "options"],
              },
              location: {
                type: "object",
                properties: { latitude: { type: "number" }, longitude: { type: "number" } },
                required: ["latitude", "longitude"],
              },
              contact: {
                type: "object",
                properties: { name: { type: "string" }, cell: { type: "string" } },
                required: ["cell"],
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["actions"],
    },
  },
};

export default async function generateResponse(
  data: Data,
  messages: Message,
  sessionId: string
): Promise<GenerateResponseResult> {
  beautifulLogger.aiGeneration("start", "Iniciando geração de resposta...");
  const messagesMaped = messages
    .map((message) => `${message.name}: ${message.content}`)
    .join("\n");

  beautifulLogger.aiGeneration("processing", {
    "mensagens processadas": messages.length,
    "mensagem mais recente": messages.at(-1)?.content || "nenhuma",
  });

  let mediaContext = "INFORMAÇÕES SOBRE MÍDIAS DISPONÍVEIS PARA USO:\n\n";
  mediaContext += "STICKERS DISPONÍVEIS:\n";
  mediaCatalog.stickers.forEach(s => {
    mediaContext += `- arquivo: "${s.file}", descrição: "${s.description}"\n`;
  });
  mediaContext += "\nÁUDIOS DISPONÍVEIS:\n";
  mediaCatalog.audios.forEach(a => {
    mediaContext += `- arquivo: "${a.file}", descrição: "${a.description}"\n`;
  });
  mediaContext += "\nMEMES DISPONÍVEIS:\n";
  mediaCatalog.memes.forEach(m => {
    mediaContext += `- arquivo: "${m.file}", descrição: "${m.description}"\n`;
  });

  // Selecionamos apenas os dados do grupo atual (sessionId) do nosso banco de dados.
  // Se não houver dados, passamos um objeto vazio.
  const groupData = data[sessionId] || {};
  const contextData = formatDataForPrompt(groupData);

  const inputMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: PERSONALITY_PROMPT },
    { role: "assistant", content: `${contextData}\n\n${mediaContext}` },
    { role: "user", content: `Conversa: \n\n${messagesMaped}` },
  ];

  const inputText = inputMessages.map((msg) => msg.content || '').join("\n");
  const inputTokens = calculateTokens(inputText);

  beautifulLogger.aiGeneration("tokens", { "tokens de entrada (estimado)": inputTokens });
  beautifulLogger.aiGeneration("processing", "Enviando requisição para a IA...");

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: inputMessages,
    response_format: RESPONSE_SCHEMA,
    temperature: 0.8,
    max_tokens: 200, // Aumentei um pouco para dar mais liberdade à IA
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    beautifulLogger.aiGeneration("error", "Nenhuma resposta foi gerada pela IA.");
    throw new Error("Nenhuma resposta foi gerada pela IA.");
  }

  const outputTokens = calculateTokens(content);
  const totalTokens = inputTokens + outputTokens;
  const cost = (inputTokens * MODEL_PRICING.input / 100000 / 2) + (outputTokens * MODEL_PRICING.output / 100000 / 2);

  const costMessage = cost === 0 ? `$${cost.toFixed(8)} (modelo gratuito)` : `$${cost.toFixed(8)}`;

  beautifulLogger.aiGeneration("cost", {
    "modelo utilizado": MODEL_NAME,
    "tokens entrada (est.)": inputTokens,
    "tokens saída (est.)": outputTokens,
    "tokens total (est.)": totalTokens,
    "custo (USD)": costMessage,
  });

  try {
    const parsedResponse = JSON.parse(content) as { actions: BotResponse };
    const actions = parsedResponse.actions;

    if (!Array.isArray(actions) || actions.length === 0) {
      beautifulLogger.aiGeneration("error", "Resposta não contém um array de ações válido.");
      throw new Error("Resposta da IA não contém ações válidas.");
    }

    beautifulLogger.aiGeneration("complete", {
      "ações processadas": actions.length,
      "tipos de ação": actions.map((a) => a.type).join(", "),
    });

    return { actions, cost: { inputTokens, outputTokens, totalTokens, cost } };
  } catch (error) {
    beautifulLogger.aiGeneration("error", {
      erro: "Falha ao analisar a resposta JSON da IA.",
      "conteúdo recebido": content,
    });
    throw new Error("Resposta da IA não está no formato JSON válido.");
  }
}