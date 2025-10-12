import path from "path";
import generateResponse, { Message } from "./inteligence/generateResponse";
import Whatsapp from "./managers/Whatsapp";
import database from "./utils/database";
import debounce from "./utils/debounce";
import getHomeDir from "./utils/getHomeDir";
import isPossibleResponse from "./inteligence/isPossibleResponse";
import beautifulLogger from "./utils/beautifulLogger";
import fs from "fs/promises"; 
import analyzeAudio from "./inteligence/analyzeAudio"; 
import analyzeImage from "./inteligence/analyzeImage";
import { handleCommand } from "./managers/CommandManager";


let messages: Message[] = [];
const privateMessages = new Map<string, Message[]>();
let lastRapyResponseTime = 0;
const messagesIds = new Map<string, string>();
let silenced = false;
const privateChatActivity = new Map<string, number>();
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos em milissegundos
const PENDING_REPLY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 horas
const pendingFirstReply = new Set<string>(); // "Memória" para quem estamos esperando a primeira resposta



export default async function rapy(whatsapp: Whatsapp) {
  const db = database();
  let isGenerating = false;
  let recentMessageTimes: number[] = [];


  const processResponse = async (sessionId: string, currentMessages: Message[], isGroup: boolean) => {
      if (isGenerating) return;
      const lastMessageContent = currentMessages.at(-1)?.content?.toLowerCase() || "";
      const isRapyMentioned = lastMessageContent.includes("rapy") || lastMessageContent.includes("paçoca");
      const timeSinceLastResponse = Date.now() - lastRapyResponseTime;
      // A lógica de `isGroupActive` agora usa a variável `isGroup` passada como parâmetro
      const isGroupActive = () => {
          if (!isGroup || recentMessageTimes.length < 4) return "normal";
          const intervals = recentMessageTimes.slice(1).map((time, i) => time - recentMessageTimes[i]);
          const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
          if (averageInterval <= 5000) return "very_active";
          if (averageInterval <= 9000) return "active";
          return "normal";
      };
      const minTimeBetweenResponses = isGroupActive() === "very_active" ? 15 * 1000 : 8 * 1000;
      if (timeSinceLastResponse < minTimeBetweenResponses && !isRapyMentioned && isGroup) {
          return;
      }
      beautifulLogger.groupActivity(isGroupActive(), {
          "mensagens recentes": recentMessageTimes.length,
          "tempo desde última resposta": `${Math.floor(timeSinceLastResponse / 1000)}s`,
          "rapy mencionado": isRapyMentioned ? "sim" : "não",
      });
      isGenerating = true;
      try {
        beautifulLogger.separator("VERIFICAÇÃO DE POSSIBILIDADE");
        const { possible, reason } = await isPossibleResponse(db.getAll(), currentMessages);
        if (!possible) {
             beautifulLogger.warn("POSSIBILIDADE", "Resposta não é apropriada por: " + reason);
             isGenerating = false;
             return;
        }
        beautifulLogger.success("POSSIBILIDADE", "Resposta aprovada por: " + reason);
        await whatsapp.setTyping(sessionId);
        const result = await generateResponse(db.getAll(), currentMessages, sessionId);
        const response = result.actions;

        lastRapyResponseTime = Date.now();
        beautifulLogger.separator("EXECUTANDO AÇÕES");

        console.log("🕵️ DEBUG: Ações recebidas da IA para execução:", JSON.stringify(response, null, 2));

        for (const action of response) {
          // LOG DENTRO DO LOOP para sabermos qual ação está sendo processada
          console.log(`🕵️ DEBUG: Processando ação do tipo: ${action.type}`);

          if (action.message) {
            // LOG DENTRO DO IF para confirmar que a ação de mensagem foi reconhecida
            console.log("🕵️ DEBUG: Entrou no bloco if (action.message)");

            // Verifica se a mensagem é uma resposta a outra mensagem
            const realMessageId = messagesIds.get(action.message.reply ?? "not-is-message");
            if (action.message.reply && realMessageId) {
              const message = action.message.text;

              // Envia a mensagem como uma resposta
              await whatsapp.sendTextReply(sessionId, realMessageId, message);

              // Adiciona a resposta do bot à memória
              currentMessages.push({
                content: `(Paçoca): ${message}`,
                name: "Paçoca",
                jid: "",
                ia: true,
              });
              console.log(`🤖 DEBUG: Bot respondeu (reply). Total no array: ${messages.length}`);
              beautifulLogger.actionSent("message", {
                tipo: "resposta",
                conteúdo: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
                respondendo_a: action.message.reply,
              });
            } else {
              // Se não for uma resposta, envia como uma mensagem normal
              const message = action.message.text;
              console.log(`🕵️ DEBUG: Preparando para enviar mensagem normal: "${message}"`); // LOG ANTES DE ENVIAR
              await whatsapp.sendText(sessionId, message);

              // Adiciona a resposta do bot à memória
              currentMessages.push({
                content: `(Paçoca): ${message}`,
                name: "Paçoca",
                jid: "",
                ia: true,
              });
              console.log(`🤖 DEBUG: Bot respondeu (normal). Total no array: ${messages.length}`);
              beautifulLogger.actionSent("message", {
                tipo: "mensagem normal",
                conteúdo: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
              });
            }
          } else if (action.sticker) {
            // LOG PARA STICKERS para confirmar que a ação de sticker foi reconhecida
            console.log("🕵️ DEBUG: Entrou no bloco if (action.sticker)");
            const stickerPath = path.join(getHomeDir(), "stickers", action.sticker);
            await whatsapp.sendSticker(sessionId, stickerPath);

            currentMessages.push({
              content: `(Paçoca): <usou o sticker ${action.sticker}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("sticker", {
              arquivo: action.sticker,
            });
          } else if (action.audio) {
            // Lógica para enviar áudio
            const audioPath = path.join(getHomeDir(), "audios", action.audio);
            await whatsapp.sendAudio(sessionId, audioPath);

            currentMessages.push({
              content: `(Paçoca): <enviou o áudio ${action.audio}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("audio", {
              arquivo: action.audio,
            });
          } else if (action.meme) {
            // Lógica para enviar meme (imagem)
            const memePath = path.join(getHomeDir(), "memes", action.meme);
            await whatsapp.sendImage(sessionId, memePath);

            currentMessages.push({
              content: `(Paçoca): <enviou o meme ${action.meme}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("meme", {
              arquivo: action.meme,
            });
          } else if (action.poll) {
            // Lógica para criar uma enquete
            await whatsapp.createPoll(sessionId, action.poll.question, action.poll.options);

            currentMessages.push({
              content: `(Paçoca): <criou uma enquete: ${action.poll.question}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("poll", {
              pergunta: action.poll.question,
              opções: action.poll.options.join(", "),
            });
          } else if (action.location) {
            // Lógica para enviar uma localização
            currentMessages.push({
              content: `(Paçoca): <enviou uma localização (${action.location.latitude}, ${action.location.longitude})>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            await whatsapp.sendLocation(
              sessionId,
              action.location.latitude,
              action.location.longitude
            );
            beautifulLogger.actionSent("location", {
              coordenadas: `${action.location.latitude}, ${action.location.longitude}`,
            });
          } else if (action.contact) {
            // Lógica para enviar um contato
            currentMessages.push({
              content: `(Paçoca): <enviou um contato (${action.contact.name} (${action.contact.cell}))>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            await whatsapp.sendContact(sessionId, action.contact.cell, action.contact.name);
            beautifulLogger.actionSent("contact", {
              nome: action.contact.name,
              telefone: action.contact.cell,
            });
          }
        }

        // Se a resposta foi em um chat privado, atualize o timer de atividade
        if (!isGroup) {
            privateChatActivity.set(sessionId, Date.now());
            beautifulLogger.info("TIMER", `Timer de atividade para ${sessionId} atualizado após resposta.`);
        }

        lastRapyResponseTime = Date.now();

      } catch (error) {
        // SUBSTITUÍMOS O LOGGER PADRÃO POR UM CONSOLE.ERROR DETALHADO
        console.error("❌ ERRO DETALHADO CAPTURADO EM 'processResponse':");
        console.error(error);
        beautifulLogger.error("GERAÇÃO", "Ocorreu um erro detalhado acima.");
      } finally {
        isGenerating = false;
          
          await whatsapp.setOnline(sessionId);
          
          beautifulLogger.success("FINALIZAÇÃO", "Processo de resposta finalizado");
          beautifulLogger.separator("FIM");
      }
    };

    whatsapp.registerMessageHandler(async (sessionId, msg, type, senderInfo, mediaPath) => {
        const isGroup = sessionId.endsWith('@g.us');
        const senderName = isGroup ? senderInfo?.name || "Desconhecido" : msg.pushName || "Desconhecido";
        const senderJid = isGroup ? senderInfo!.jid : sessionId;
        // A variável `currentMessages` agora é a fonte da verdade para esta interação.
        const currentMessages = isGroup ? messages : (privateMessages.get(sessionId) || []);
        
        if (!isGroup && currentMessages.length === 0) { // Garante que o array exista para conversas privadas
            privateMessages.set(sessionId, currentMessages);
        }

        if (type === "audio" || type === "image") {
            if (!mediaPath) return;

            await whatsapp.setTyping(sessionId);
            
            let analysisResult = "";
            if (type === "audio") {
                beautifulLogger.info("GEMINI", `Processando áudio de ${senderName}...`);
                analysisResult = await analyzeAudio(mediaPath);
            } else {
                beautifulLogger.info("GEMINI", `Processando imagem de ${senderName}...`);
                analysisResult = await analyzeImage(mediaPath, msg.message?.imageMessage?.caption || "");
            }

            try {
                await fs.unlink(mediaPath);
                beautifulLogger.info("CLEANUP", `Arquivo temporário ${mediaPath} removido.`);
            } catch (e) {
                beautifulLogger.error("CLEANUP", `Falha ao remover arquivo temporário ${mediaPath}`, e);
            }

            const contextMessage: Message[0] = {
              // A mensagem agora é uma observação interna do Paçoca
              content: `(Paçoca pensou sobre a ${type} que recebeu de ${senderName}: "${analysisResult}")`,
              // O autor da "mensagem" é o próprio Paçoca
              name: "Paçoca",
              // Não está associado a nenhum usuário específico
              jid: "",
              // É uma ação/pensamento da IA
              ia: true,
            };
            currentMessages.push(contextMessage);

            // CORREÇÃO: Passamos os parâmetros de contexto para a processResponse
            setTimeout(() => processResponse(sessionId, currentMessages, isGroup), 1000);
            return;
        }


      if (type !== "text") return;
      const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      if (!content) return;

      // =========================================================================
      // PONTO CENTRAL DA REFATORAÇÃO: Delega para o CommandManager /call /pesquisa /sumario
      // /silencio /liberado
      // =========================================================================
      const commandResult = await handleCommand(content, { 
          whatsapp, 
          sessionId, 
          currentMessages, // Passa o histórico da conversa atual
          privateMessages, 
          pendingFirstReply, 
          privateChatActivity 
      });

      if (commandResult.commandHandled) {
          // Se o comando alterou o estado 'silenced', atualizamos a variável principal.
          if (typeof commandResult.newSilencedState === 'boolean') {
              silenced = commandResult.newSilencedState;
              beautifulLogger.info("ESTADO", `Estado de silêncio alterado para: ${silenced}`);
          }
          return; // O fluxo para aqui, pois o comando foi executado.
      }
      // =========================================================================

      // A lógica reativa (não-comando) de 'silenceRapy' agora vive aqui.
      if (silenced && content.toLowerCase().includes("paçoca")) {
          beautifulLogger.info("ESTADO", "Usuário tentou falar com o Paçoca enquanto silenciado.");
          const messageId = msg.key.id;
          if (messageId) {
              await whatsapp.sendTextReply(sessionId, messageId, DEFAULT_MESSAGES.TRYING_TO_SPEAK);
          } else {
              await whatsapp.sendText(sessionId, DEFAULT_MESSAGES.TRYING_TO_SPEAK);
          }
          currentMessages.push({
              content: `(Paçoca): ${DEFAULT_MESSAGES.TRYING_TO_SPEAK}`,
              name: "Paçoca", jid: "", ia: true,
          });
          return; // Para o fluxo, pois esta é a única resposta permitida.
      }
      // =========================================================================
      currentMessages.push({
          content: `(${senderName}{userid: ${senderJid}}): ${content}`,
          name: senderName,
          jid: senderJid,
          ia: false,
      });

      if (silenced || isGenerating || content.length > 300) return;

      // CORREÇÃO: A chamada para mensagens de texto também passa os parâmetros
      if (isGroup) {
          const getDebounceTime = () => { /* ... lógica do debounce ... */ return 2000; };
          debounce(() => processResponse(sessionId, currentMessages, isGroup), getDebounceTime(), "debounce-response");
      } else {
          await processResponse(sessionId, currentMessages, isGroup);
      }
  });
}