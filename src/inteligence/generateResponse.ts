//src/inteligence/generateResponse.ts
import { ChatCompletionMessageParam } from "openai/resources";
import { openai } from "../services/openai";
import { Data } from "../utils/database";
import { CREATIVE_PROMPT, JSON_CODER_PROMPT } from "../constants/DUAL_MODEL_PROMPTS";
import beautifulLogger from "../utils/beautifulLogger";
import models from '../../model.json';
import config from "../utils/config";
import mediaCatalog from '../../media_catalog.json';
import { Message, BotResponse, GenerateResponseResult } from "./types";
import PERSONALITY_PROMPT from "../constants/PERSONALITY_PROMPT";


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
  messages: Message[],
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

  // Acessamos os nomes e valores dos modelos dinamicamente a partir do model.json
  const modelsData = models as Record<string, { MODEL_NAME: string; MODEL_PRICING: { input: number; output: number; } }>;

  try {
    if (config.MODE === 'dual') {
      beautifulLogger.aiGeneration("mode", `Executando no modo DUAL.`);
      
      // --- PASSO 1: CHAMADA CRIATIVA ---
      const creativeModelConfig = modelsData[config.CREATIVE_MODEL];
      beautifulLogger.aiGeneration("processing", `[DUAL-1] Enviando requisição para modelo criativo: ${creativeModelConfig.MODEL_NAME}`);

      const creativeMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: CREATIVE_PROMPT },
        { role: "assistant", content: `${contextData}\n\n${mediaContext}` },
        { role: "user", content: `Conversa: \n\n${messagesMaped}` },
      ];
      
      const creativeInputText = creativeMessages.map((msg) => msg.content || '').join("\n");
      const creativeInputTokens = calculateTokens(creativeInputText);

      const creativeResponse = await openai.chat.completions.create({
        model: creativeModelConfig.MODEL_NAME,
        messages: creativeMessages,
        temperature: 0.8,
        max_tokens: 200,
      }, { timeout: 30 * 1000 });
      
      const creativeContent = creativeResponse.choices[0]?.message?.content;
      if (!creativeContent) throw new Error("[DUAL-1] Modelo criativo não retornou conteúdo.");
      
      const creativeOutputTokens = calculateTokens(creativeContent);
      beautifulLogger.aiGeneration("processing", `[DUAL-1] Plano de ação recebido: "${creativeContent}"`);

      // =========================================================================
      // Limpeza da resposta do modelo criativo antes de enviar ao codificador.
      // Isso remove qualquer texto extra (como "Plano:") que a IA possa ter adicionado.
      // =========================================================================
      let cleanedContent = creativeContent;
      const planKeyword = "plano:";
      const lastPlanIndex = cleanedContent.toLowerCase().lastIndexOf(planKeyword);

      if (lastPlanIndex !== -1) {
          // Pega tudo que vem DEPOIS da última ocorrência de "plano:"
          cleanedContent = cleanedContent.substring(lastPlanIndex + planKeyword.length).trim();
          beautifulLogger.aiGeneration("processing", `[DUAL-1.5] Resposta "suja" detectada. Limpando para: "${cleanedContent}"`);
      }
      // =========================================================================

      // --- PASSO 2: CHAMADA CODIFICADORA ---
      const reliableModelConfig = modelsData[config.RELIABLE_MODEL];
      beautifulLogger.aiGeneration("processing", `[DUAL-2] Enviando plano para modelo codificador: ${reliableModelConfig.MODEL_NAME}`);

      const coderMessages: ChatCompletionMessageParam[] = [
        // Usamos o PERSONALITY_PROMPT aqui para dar contexto sobre o formato JSON esperado
        { role: "system", content: PERSONALITY_PROMPT }, 
        // CORREÇÃO: Usamos o conteúdo limpo E removemos as aspas extras
        { role: "user", content: `${JSON_CODER_PROMPT}\n\n${cleanedContent}` },
      ];

      const coderInputText = coderMessages.map((msg) => msg.content || '').join("\n");
      const coderInputTokens = calculateTokens(coderInputText);

      const coderResponse = await openai.chat.completions.create({
        model: reliableModelConfig.MODEL_NAME,
        messages: coderMessages,
        response_format: RESPONSE_SCHEMA,
        temperature: 0.8,
        max_tokens: 200,
      }, { timeout: 30 * 1000 });

      const coderContent = coderResponse.choices[0]?.message?.content;
      if (!coderContent) throw new Error("[DUAL-2] Modelo codificador não retornou conteúdo.");

      const coderOutputTokens = calculateTokens(coderContent);

      // --- CÁLCULO DE CUSTO COMBINADO ---
      const totalInputTokens = creativeInputTokens + coderInputTokens;
      const totalOutputTokens = creativeOutputTokens + coderOutputTokens;
      const totalTokens = totalInputTokens + totalOutputTokens;

      const creativeCost = (creativeInputTokens * creativeModelConfig.MODEL_PRICING.input / 1000000) + (creativeOutputTokens * creativeModelConfig.MODEL_PRICING.output / 1000000);
      const reliableCost = (coderInputTokens * reliableModelConfig.MODEL_PRICING.input / 1000000) + (coderOutputTokens * reliableModelConfig.MODEL_PRICING.output / 1000000);
      const totalCost = creativeCost + reliableCost;
      
      beautifulLogger.aiGeneration("cost", {
        "modo": "DUAL",
        "modelo criativo": creativeModelConfig.MODEL_NAME,
        "modelo codificador": reliableModelConfig.MODEL_NAME,
        "tokens total (est.)": totalTokens,
        "custo total (USD)": `$${totalCost.toFixed(8)}`,
      });

      const jsonMatch = coderContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch || !jsonMatch[0]) throw new Error("[DUAL-2] Nenhum bloco JSON válido foi encontrado na resposta do codificador.");
      
      const parsedResponse = JSON.parse(jsonMatch[0]) as { actions: BotResponse };
      if (!Array.isArray(parsedResponse.actions)) throw new Error("O JSON extraído não contém um array de 'actions' válido.");

      beautifulLogger.aiGeneration("complete", {
        "ações processadas": parsedResponse.actions.length,
        "tipos de ação": parsedResponse.actions.map((a) => a.type).join(", "),
      });
      
      return { actions: parsedResponse.actions, cost: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens, cost: totalCost } };

    } else {
      // =========================================================================
      // ALTERAÇÃO: MODO SINGLE - SUA LÓGICA ORIGINAL FOI MOVIDA PARA CÁ
      // =========================================================================
      beautifulLogger.aiGeneration("mode", `Executando no modo SINGLE.`);

      const modelConfig = modelsData[config.RELIABLE_MODEL];
      const MODEL_NAME = modelConfig.MODEL_NAME;
      const MODEL_PRICING = modelConfig.MODEL_PRICING;

      const inputMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: PERSONALITY_PROMPT },
        { role: "assistant", content: `${contextData}\n\n${mediaContext}` },
        { role: "user", content: `Conversa: \n\n${messagesMaped}` },
      ];

      const inputText = inputMessages.map((msg) => msg.content || '').join("\n");
      const inputTokens = calculateTokens(inputText);

      beautifulLogger.aiGeneration("tokens", { "tokens de entrada (estimado)": inputTokens });
      beautifulLogger.aiGeneration("processing", `[SINGLE] Enviando requisição para: ${MODEL_NAME}`);
      
      const response = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: inputMessages,
          response_format: RESPONSE_SCHEMA,
          temperature: 0.8,
          max_tokens: 200,
      }, {
          timeout: 30 * 1000,
      });

      if (!response.choices || response.choices.length === 0 || !response.choices[0].message) {
          throw new Error("A IA não retornou nenhuma opção de resposta (array 'choices' vazio).");
      }
      const content = response.choices[0]?.message?.content;
      if (!content) {
          throw new Error("Nenhuma resposta foi gerada pela IA (conteúdo vazio).");
      }

      const outputTokens = calculateTokens(content);
      const totalTokens = inputTokens + outputTokens;
      const cost = (inputTokens * MODEL_PRICING.input / 1000000) + (outputTokens * MODEL_PRICING.output / 1000000);
      const costMessage = cost === 0 ? `$${cost.toFixed(8)} (modelo gratuito)` : `$${cost.toFixed(8)}`;

      beautifulLogger.aiGeneration("cost", {
          "modelo utilizado": MODEL_NAME,
          "tokens entrada (est.)": inputTokens,
          "tokens saída (est.)": outputTokens,
          "tokens total (est.)": totalTokens,
          "custo (USD)": costMessage,
      });
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch || !jsonMatch[0]) {
          throw new Error("Nenhum bloco JSON válido foi encontrado na resposta da IA.");
      }
      const jsonString = jsonMatch[0];
      const parsedResponse = JSON.parse(jsonString) as { actions: BotResponse };
      if (!Array.isArray(parsedResponse.actions)) {
          throw new Error("O JSON extraído não contém um array de 'actions' válido.");
      }

      beautifulLogger.aiGeneration("complete", {
          "ações processadas": parsedResponse.actions.length,
          "tipos de ação": parsedResponse.actions.map((a) => a.type).join(", "),
      });
      
      return { actions: parsedResponse.actions, cost: { inputTokens, outputTokens, totalTokens, cost } };
    }
  } catch (error: any) {
    // ALTERAÇÃO: Este bloco de catch agora lida com erros de AMBOS os modos.
    beautifulLogger.aiGeneration("error", {
      erro: "Falha crítica na chamada da API ou na análise da resposta.",
      "mensagem de erro": error.message,
    });
    // Lançamos o erro para que o 'catch' principal em rapy.ts possa lidar com ele.
    throw error;
  }
}