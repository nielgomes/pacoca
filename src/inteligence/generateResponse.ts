//src/inteligence/generateResponse.ts
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources";
import { openai } from "../services/openai";
import { SummaryData } from "../utils/database";
import beautifulLogger from "../utils/beautifulLogger";
import models from '../../model.json';
import config from "../utils/config";
import mediaCatalog from '../../media_catalog.json';
import { Message, BotResponse, GenerateResponseResult, BotAction } from "./types";
import PERSONALITY_PROMPT from "../constants/PERSONALITY_PROMPT";
import { withRetry } from "../utils/retry";
import { searchGifs, pickRandomGif, pickRandomGifs, getBestGifUrl, getBestGifMp4Url, GiphyGif } from "../services/giphy";
import { generateAudioResponse, shouldUseAudio } from "./generateAudio";

// Re-exporta para compatibilidade
export { Message };


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
const formatDataForPrompt = (data: SummaryData): string => {
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

// --- DEFINIÇÃO DAS FERRAMENTAS ---
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Envia uma mensagem de texto no chat.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "O conteúdo da mensagem de texto a ser enviada (máx 300 caracteres).",
          },
          reply_to_id: {
            type: "string",
            description: "O ID da mensagem à qual esta mensagem deve responder (opcional).",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sticker",
      description: "Envia um sticker (figurinha) para expressar uma emoção.",
      parameters: {
        type: "object",
        properties: {
          sticker_name: {
            type: "string",
            description: "O nome exato do arquivo do sticker (ex: 'feliz.webp').",
            enum: stickerOptions, // Usamos a lista carregada do mediaCatalog
          },
        },
        required: ["sticker_name"],
      },
    },
  },
    {
    type: "function",
    function: {
      name: "send_audio",
      description: "Envia um meme de áudio curto (.mp3).",
      parameters: {
        type: "object",
        properties: {
          audio_name: {
            type: "string",
            description: "O nome exato do arquivo de áudio (ex: 'WINDOWS-STARTUP.mp3').",
            enum: audioOptions,
          },
        },
        required: ["audio_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_meme_image",
      description: "Envia uma imagem de meme (.jpg).",
      parameters: {
        type: "object",
        properties: {
          meme_name: {
            type: "string",
            description: "O nome exato do arquivo da imagem do meme (ex: 'ai-que-burro-da-zero-pra-ele.jpg').",
            enum: memeOptions,
          },
        },
        required: ["meme_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_poll",
      description: "Cria uma enquete no chat.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "A pergunta da enquete." },
          options: {
            type: "array",
            description: "Uma lista de exatamente 3 opções de texto para a enquete.",
            items: { type: "string" },
            minItems: 3,
            maxItems: 3,
          },
        },
        required: ["question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_location",
      description: "Envia uma localização geográfica.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number", description: "A latitude." },
          longitude: { type: "number", description: "A longitude." },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_contact",
      description: "Envia um cartão de contato.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "O nome a ser exibido no cartão de contato." },
          cell: { type: "string", description: "O número de telefone no formato internacional (ex: +5561999999999)." },
        },
        required: ["cell", "name"], // Tornando name obrigatório aqui
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_gif",
      description: "Busca e envia um GIF do Giphy. Use quando quiser enviar um GIF online. A ferramenta busca GIFs automaticamente, então você só precisa passar o tema/conceito do GIF desejado.",
      parameters: {
        type: "object",
        properties: {
          search_query: {
            type: "string",
            description: "O termo ou tema para buscar o GIF (ex: 'feliz aniversário', 'parabéns', 'risada', 'paixão', 'triste', 'flamengo'). Use termos em português ou inglês.",
          },
          quantity: {
            type: "number",
            description: "Quantos GIFs buscar (1 a 5). Se 1, envia um GIF aleatório dos resultados. Se mais, você receberá uma lista e poderá escolher qual enviar.",
            minimum: 1,
            maximum: 5,
          },
        },
        required: ["search_query"],
      },
    },
  },
];


export default async function generateResponse(
  data: SummaryData,
  messages: Message[],
  sessionId: string
): Promise<GenerateResponseResult> {
  beautifulLogger.aiGeneration("start", "Iniciando geração de resposta...");
  
  // Limite de mensagens para evitar custos excessivos e contexto muito longo
  const MAX_MESSAGES_FOR_AI = 50;
  const recentMessages = messages.slice(-MAX_MESSAGES_FOR_AI);
  
  const messagesMaped = recentMessages
    .map((message) => `${message.name}: ${message.content}`)
    .join("\n");

  const lastMsg = recentMessages.length > 0 ? recentMessages[recentMessages.length - 1] : null;
  beautifulLogger.aiGeneration("processing", {
    "mensagens processadas": recentMessages.length,
    "mensagem mais recente": lastMsg?.content || "nenhuma",
  });

  // Contexto de mídia e dados (permanecem iguais)
  let mediaContext = "INFORMAÇÕES SOBRE MÍDIAS DISPONÍVEIS PARA USO:\n\n";
  // ... (código para montar mediaContext inalterado) ...
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
  const contextData = formatDataForPrompt(data);

  // Acessamos o modelo principal da config simplificada
  const modelsData = models as Record<string, { MODEL_NAME: string; MODEL_PRICING: { input: number; output: number; } }>;
  const modelConfig = modelsData[config.MAIN_MODEL];
  const MODEL_NAME = modelConfig.MODEL_NAME;
  const MODEL_PRICING = modelConfig.MODEL_PRICING;

  beautifulLogger.aiGeneration("mode", `Executando no modo TOOL CALLING com modelo: ${MODEL_NAME}`);

  // Montamos as mensagens para a IA
  const inputMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: PERSONALITY_PROMPT }, // Prompt simplificado
    { role: "assistant", content: `${contextData}\n\n${mediaContext}` },
    { role: "user", content: `Histórico da Conversa:\n\n${messagesMaped}\n\n---\nCom base na conversa e na sua personalidade, escolha quais ferramentas usar (se alguma).` },
  ];
  
  const inputText = inputMessages.map((msg) => msg.content || '').join("\n");
  const inputTokens = calculateTokens(inputText);

  beautifulLogger.aiGeneration("tokens", { "tokens de entrada (estimado)": inputTokens });
  beautifulLogger.aiGeneration("processing", `Enviando requisição com ferramentas para: ${MODEL_NAME}`);
  
  
try {
    // --- CHAMADA DA API COM FERRAMENTAS (com retry) ---
    const response = await withRetry(async () => {
      return await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: inputMessages,
        tools: tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 500,
      }, {
        timeout: 45 * 1000,
      });
    }, 3, 1500); // 3 tentativas, delay progressivo: 1.5s, 3s, 6s

    const responseMessage = response.choices[0]?.message;
    if (!responseMessage) {
      throw new Error("A IA não retornou nenhuma mensagem de resposta.");
    }

    // Calculamos custo e tokens (simplificado, APIs podem cobrar por tool calls de forma diferente)
    const outputContent = JSON.stringify(responseMessage.tool_calls || responseMessage.content || '');
    const outputTokens = calculateTokens(outputContent);
    const totalTokens = inputTokens + outputTokens;
    const cost = (inputTokens * MODEL_PRICING.input / 1000000) + (outputTokens * MODEL_PRICING.output / 1000000);
    const costResult = { inputTokens, outputTokens, totalTokens, cost };
    const costMessage = cost === 0 ? `$${cost.toFixed(8)} (modelo gratuito)` : `$${cost.toFixed(8)}`;

     beautifulLogger.aiGeneration("cost", {
          "modelo utilizado": MODEL_NAME,
          "tokens entrada (est.)": inputTokens,
          "tokens saída (est.)": outputTokens,
          "tokens total (est.)": totalTokens,
          "custo (USD)": costMessage,
     });

    // --- PROCESSAMENTO DA RESPOSTA COM TOOL CALLING ---
    const toolCalls = responseMessage.tool_calls;
    const finalActions: BotAction[] = [];

    if (toolCalls && toolCalls.length > 0) {
      beautifulLogger.aiGeneration("processing", `IA solicitou ${toolCalls.length} chamada(s) de ferramenta.`);

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const rawArgsString = toolCall.function.arguments;
        let functionArgs: any;
        try {
            let jsonStringToParse = rawArgsString;

            // Tentativa de extrair apenas o objeto JSON principal da string
            const firstBrace = rawArgsString.indexOf('{');
            const lastBrace = rawArgsString.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                // Extrai o conteúdo entre o primeiro { e o último }
                jsonStringToParse = rawArgsString.substring(firstBrace, lastBrace + 1);
                if (rawArgsString !== jsonStringToParse) {
                     beautifulLogger.warn("TOOL_CALL_CLEAN", `Limpando string de argumentos potencialmente suja para ${functionName}. Original: "${rawArgsString}", Limpa: "${jsonStringToParse}"`);
                }
            } else {
                 beautifulLogger.warn("TOOL_CALL_FORMAT", `String de argumentos para ${functionName} não parece conter um objeto JSON válido: "${rawArgsString}"`);
                 // Mesmo assim, tentamos parsear a string original, pode ser um JSON simples (ex: "true")
            }

            // Tentamos parsear a string (original ou limpa)
            functionArgs = JSON.parse(jsonStringToParse);
        } catch (e: any) {
            // Se mesmo após a limpeza o parse falhar, logamos e pulamos
            beautifulLogger.error("TOOL_CALL_PARSE", `Erro FINAL ao parsear argumentos para ${functionName} mesmo após limpeza.`, {
                original_args: rawArgsString,
                error_message: e.message
             });
            continue;
        }

        // Convertemos a chamada da ferramenta para o nosso formato BotAction
        if (functionName === 'send_message' && functionArgs.text) {
          finalActions.push({
            type: 'message',
            message: { text: functionArgs.text, reply: functionArgs.reply_to_id },
          });
        } else if (functionName === 'send_sticker' && functionArgs.sticker_name) {
          finalActions.push({ type: 'sticker', sticker: functionArgs.sticker_name });
        } else if (functionName === 'send_audio' && functionArgs.audio_name) {
          finalActions.push({ type: 'audio', audio: functionArgs.audio_name });
        } else if (functionName === 'send_meme_image' && functionArgs.meme_name) {
           finalActions.push({ type: 'meme', meme: functionArgs.meme_name });
        } else if (functionName === 'create_poll' && functionArgs.question && functionArgs.options) {
           finalActions.push({ type: 'poll', poll: { question: functionArgs.question, options: functionArgs.options } });
        } else if (functionName === 'send_location' && functionArgs.latitude && functionArgs.longitude) {
           finalActions.push({ type: 'location', location: { latitude: functionArgs.latitude, longitude: functionArgs.longitude } });
        } else if (functionName === 'send_contact' && functionArgs.cell && functionArgs.name) {
           finalActions.push({ type: 'contact', contact: { name: functionArgs.name, cell: functionArgs.cell } });
        } else if (functionName === 'send_gif' && functionArgs.search_query) {
          // Processar busca de GIF
          const quantity = Math.min(Math.max(functionArgs.quantity || 1, 1), 5);
          const searchQuery = functionArgs.search_query;
          
          beautifulLogger.info("GIF", `Buscando GIFs para: "${searchQuery}" (quantidade: ${quantity})`);
          
          const gifs = await searchGifs(searchQuery, 5, "g", "pt");
          
          if (gifs && gifs.length > 0) {
            if (quantity === 1) {
              // Se pediu 1 GIF, escolhe aleatoriamente e adiciona diretamente
              const selectedGif = pickRandomGif(gifs);
              if (selectedGif) {
                // Preferir MP4 para WhatsApp, senão usar URL do GIF
                const mp4Url = getBestGifMp4Url(selectedGif);
                const finalUrl = mp4Url || getBestGifUrl(selectedGif);
                
                finalActions.push({
                  type: 'gif',
                  gif: {
                    url: finalUrl,
                    title: selectedGif.title,
                    altText: selectedGif.alt_text || selectedGif.title,
                    pageUrl: selectedGif.url,
                    isMp4: !!mp4Url, // Flag para indicar se é MP4
                  },
                });
                beautifulLogger.actionSent("gif", { 
                  titulo: selectedGif.title, 
                  query: searchQuery,
                  tipo: mp4Url ? "mp4" : "gif"
                });
              }
            } else {
              // Se pediu mais de 1 GIF, seleciona múltiplos aleatórios
              const selectedGifs = pickRandomGifs(gifs, quantity);
              for (const gif of selectedGifs) {
                // Preferir MP4 para WhatsApp, senão usar URL do GIF
                const mp4Url = getBestGifMp4Url(gif);
                const finalUrl = mp4Url || getBestGifUrl(gif);
                
                finalActions.push({
                  type: 'gif',
                  gif: {
                    url: finalUrl,
                    title: gif.title,
                    altText: gif.alt_text || gif.title,
                    pageUrl: gif.url,
                    isMp4: !!mp4Url,
                  },
                });
              }
              beautifulLogger.actionSent("gif", { 
                quantidade: selectedGifs.length, 
                query: searchQuery 
              });
            }
          } else {
            beautifulLogger.warn("GIF", `Nenhum GIF encontrado para: "${searchQuery}"`);
          }
        } else {
            beautifulLogger.warn("TOOL_CALL_UNKNOWN", `IA chamou uma ferramenta desconhecida ou com argumentos inválidos: ${functionName}`);
        }
      }
    } else {
        // Se a IA não chamou nenhuma ferramenta, ela pode ter respondido com texto normal.
        // Podemos tratar isso como uma mensagem ou simplesmente ignorar (preferível se ela deveria usar ferramentas).
        if (responseMessage.content) {
             beautifulLogger.warn("TOOL_CALL_MISSING", "IA respondeu com texto normal em vez de usar uma ferramenta.", { content: responseMessage.content });
             // Opcional: Poderia adicionar uma ação de mensagem aqui, mas pode indicar erro no prompt.
             // finalActions.push({ type: 'message', message: { text: responseMessage.content } });
        } else {
            beautifulLogger.aiGeneration("complete", "IA decidiu não tomar nenhuma ação.");
        }
    }

    // --- LÓGICA DE DECISÃO ÁUDIO VS TEXTO ---
    // Se temos apenas uma ação de mensagem (sem mídia) e o texto é curto,
    // convertemos para áudio gerado dinamicamente
    const hasMedia = finalActions.some(action => 
      action.type === 'sticker' || 
      action.type === 'gif' || 
      action.type === 'meme' || 
      action.type === 'audio' ||
      action.type === 'poll' ||
      action.type === 'location' ||
      action.type === 'contact'
    );

    // Verifica se deve converter mensagem para áudio
    if (finalActions.length === 1 && finalActions[0].type === 'message' && !hasMedia) {
      const messageText = finalActions[0].message?.text || "";
      const replyTo = finalActions[0].message?.reply;
      
      if (shouldUseAudio(messageText, hasMedia)) {
        try {
          beautifulLogger.aiGeneration("audio", "Convertendo mensagem para áudio...");
          
          // Obtém a última mensagem do usuário para contexto
          const lastUserMessage = recentMessages.length > 0 
            ? recentMessages[recentMessages.length - 1].content 
            : "";
          
          // Gera o áudio
          const audioResult = await generateAudioResponse(
            lastUserMessage,
            contextData
          );
          
          // Substitui a ação de mensagem pela ação de áudio gerado
          finalActions[0] = {
            type: 'generated_audio',
            generatedAudio: {
              path: audioResult.audioPathOgg || audioResult.audioPath,
              transcript: audioResult.transcript,
              reply: replyTo,
            },
          };
          
          beautifulLogger.aiGeneration("audio", {
            status: "sucesso",
            transcript: audioResult.transcript.substring(0, 50) + "...",
            fileSize: audioResult.fileSize,
          });
        } catch (audioError: any) {
          // Se falhar a geração de áudio, mantém a mensagem de texto
          beautifulLogger.error("AUDIO_FALLBACK", "Falha ao gerar áudio, mantendo texto", {
            error: audioError.message,
          });
        }
      }
    }

    beautifulLogger.aiGeneration("complete", {
        "ações processadas": finalActions.length,
        "tipos de ação": finalActions.map((a) => a.type).join(", ") || "Nenhuma",
    });

    return { actions: finalActions, cost: costResult };

  } catch (error: any) {
    beautifulLogger.aiGeneration("error", {
      erro: "Falha crítica na chamada da API ou no processamento da resposta.",
      "mensagem de erro": error.message,
    });
    // Lançamos o erro para que o 'catch' principal em rapy.ts possa lidar com ele.
    throw error;
  }
}