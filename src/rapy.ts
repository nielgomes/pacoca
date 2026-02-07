import generateResponse, { Message } from "./inteligence/generateResponse";
import Whatsapp from "./managers/Whatsapp";
import database from "./utils/database";
import debounce from "./utils/debounce";
import isPossibleResponse from "./inteligence/isPossibleResponse";
import beautifulLogger from "./utils/beautifulLogger";
import fs from "fs/promises"; 
import analyzeAudio from "./inteligence/analyzeAudio"; 
import analyzeImage from "./inteligence/analyzeImage";
import { handleCommand } from "./managers/CommandManager";
import { memory } from "./managers/MemoryManager"; 
import { executeActions } from "./managers/ActionExecutor";
import generateSummary from "./inteligence/generateSummary";


export default async function rapy(whatsapp: Whatsapp) {
  const db = database();
  const SUMMARY_IDLE_MS = 5 * 60 * 1000;
  const SUMMARY_MIN_MESSAGES = 10;
  const summaryTimers = new Map<string, NodeJS.Timeout>();

  const scheduleSummary = (sessionId: string, messages: Message[]) => {
      if (!sessionId.endsWith("@g.us")) return;
      if (messages.length < SUMMARY_MIN_MESSAGES) return;

      const existingTimer = summaryTimers.get(sessionId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
          try {
              beautifulLogger.info("SUMARIO", `Gerando sumário para ${sessionId} após inatividade.`);
              const groupData = db.getGroup(sessionId);
              const summaryResult = await generateSummary(groupData, messages);

              db.setGroup(sessionId, summaryResult);
              db.save();

              beautifulLogger.success("SUMARIO", `Sumário salvo para ${sessionId}.`);
          } catch (error) {
              beautifulLogger.error("SUMARIO", "Falha ao gerar/salvar sumário", error);
          } finally {
              summaryTimers.delete(sessionId);
          }
      }, SUMMARY_IDLE_MS);

      summaryTimers.set(sessionId, timer);
  };

  let recentMessageTimes: number[] = [];


    const processResponse = async (sessionId: string, currentMessages: Message[], isGroup: boolean) => {
      if (memory.isGenerating()) return;

      const lastMessageContent = currentMessages.at(-1)?.content?.toLowerCase() || "";
      const isRapyMentioned = lastMessageContent.includes("rapy") || lastMessageContent.includes("paçoca");
      const timeSinceLastResponse = Date.now() - memory.getLastResponseTime();

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

      memory.setGenerating(true);

      try {
        beautifulLogger.separator("VERIFICAÇÃO DE POSSIBILIDADE");
        const groupData = db.getGroup(sessionId);
        const { possible, reason } = await isPossibleResponse(groupData, currentMessages);
        if (!possible) {
             beautifulLogger.warn("POSSIBILIDADE", "Resposta não é apropriada por: " + reason);

             return;
        }

        beautifulLogger.success("POSSIBILIDADE", "Resposta aprovada por: " + reason);
        await whatsapp.setTyping(sessionId);

        const result = await generateResponse(groupData, currentMessages, sessionId);

        beautifulLogger.separator("EXECUTANDO AÇÕES");

        console.log("🕵️ DEBUG: Ações recebidas da IA para execução:", JSON.stringify(result.actions, null, 2));

        // DELEGA A EXECUÇÃO PARA O MÓDULO ESPECIALISTA
        await executeActions(result.actions, { whatsapp, sessionId, currentMessages, isGroup });

        // Se a resposta foi em um chat privado, atualize o timer de atividade
        if (!isGroup) {
            memory.setPrivateChatActivity(sessionId, Date.now());
            beautifulLogger.info("TIMER", `Timer de atividade para ${sessionId} atualizado após resposta.`);
        }
        memory.updateLastResponseTime();

      } catch (error) {
        // SUBSTITUÍMOS O LOGGER PADRÃO POR UM CONSOLE.ERROR DETALHADO
        console.error("❌ ERRO DETALHADO CAPTURADO EM 'processResponse':");
        console.error(error);
        beautifulLogger.error("GERAÇÃO", "Ocorreu um erro detalhado acima.");
      } finally {
        memory.setGenerating(false);

        await whatsapp.setOnline(sessionId);
        
        beautifulLogger.success("FINALIZAÇÃO", "Processo de resposta finalizado");
        beautifulLogger.separator("FIM");
      }
    };

    whatsapp.registerMessageHandler(async (sessionId, msg, type, senderInfo, mediaPath) => {
        const isGroup = sessionId.endsWith('@g.us');
        const senderName = isGroup ? senderInfo?.name || "Desconhecido" : msg.pushName || "Desconhecido";
        const senderJid = isGroup ? senderInfo!.jid : sessionId;
        // Usa o MemoryManager para obter o histórico da conversa
        const currentMessages = memory.getMessages(sessionId, isGroup);

if (type === "audio" || type === "image") {
            if (!mediaPath) return;

            await whatsapp.setTyping(sessionId);
            
            // Capturamos a legenda original do usuário primeiro
            const userCaption = msg.message?.imageMessage?.caption || "";

            let analysisResult = "";
            if (type === "audio") {
                beautifulLogger.info("GEMINI", `Processando áudio de ${senderName}...`);
                analysisResult = await analyzeAudio(mediaPath);
            } else {
                beautifulLogger.info("GEMINI", `Processando imagem de ${senderName}...`);
                // Passamos a legenda para o Gemini (como você já fazia)
                analysisResult = await analyzeImage(mediaPath, userCaption);
            }

            try {
                await fs.unlink(mediaPath);
                beautifulLogger.info("CLEANUP", `Arquivo temporário ${mediaPath} removido.`);
            } catch (e) {
                beautifulLogger.error("CLEANUP", `Falha ao remover arquivo temporário ${mediaPath}`, e);
            }
            
            // Se o usuário mandou uma legenda (pergunta), nós a adicionamos
            if (userCaption) {
                currentMessages.push({
                    content: `(${senderName}{userid: ${senderJid}}): ${userCaption} (junto com uma ${type})`,
                    name: senderName,
                    jid: senderJid,
                    ia: false,
                });
            }
            
            // adicionamos a análise do Gemini como um "FATO" no chat.
            const contextMessage: Message = { // Corrige a tipagem de Message[0] para Message
              content: `[Contexto da ${type} enviada por ${senderName}: ${analysisResult}]`,
              name: "Contexto",
              jid: "",
              ia: true,
            };
            currentMessages.push(contextMessage);

            // Passamos os parâmetros de contexto para a processResponse
            setTimeout(() => processResponse(sessionId, currentMessages, isGroup), 1000);
            return;
        }


        if (type !== "text") return;
        const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!content) return;

        const commandContext = { 
            whatsapp, sessionId, currentMessages, 
            memory
        };

      // =========================================================================
      // PONTO CENTRAL DA REFATORAÇÃO: Delega para o CommandManager /call /pesquisa /sumario
      // /silencio /liberado
      // =========================================================================
      const commandResult = await handleCommand(content, commandContext);

      if (commandResult.commandHandled) {
          // Se o comando alterou o estado 'silenced', atualizamos a variável principal.
          if (typeof commandResult.newSilencedState === 'boolean') {
              memory.setSilenced(commandResult.newSilencedState);
              beautifulLogger.info("ESTADO", `Estado de silêncio alterado para: ${memory.isSilenced()}`);
          }
          return; // O fluxo para aqui, pois o comando foi executado.
      }
      // =========================================================================

      // =========================================================================
      // Lógica para lidar com a primeira resposta de um /call
      // =========================================================================
      if (!isGroup && memory.isPendingFirstReply(sessionId)) {
        beautifulLogger.info("TIMER", `Primeira resposta recebida de ${sessionId}. Removendo flag 'pendingFirstReply'.`);
        memory.removePendingFirstReply(sessionId);
        // A conversa agora flui normalmente para a lógica de resposta abaixo.
      }
      // =========================================================================

      // A lógica reativa (não-comando) de 'silenceRapy' agora vive aqui.
      if (memory.isSilenced() && content.toLowerCase().includes("paçoca")) {
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

      if (isGroup) {
          scheduleSummary(sessionId, currentMessages);
      }

    if (memory.isSilenced() || memory.isGenerating() || content.length > 300) return;

      // CORREÇÃO: A chamada para mensagens de texto também passa os parâmetros
        if (isGroup) {
            const getDebounceTime = () => 2000 + Math.random() * 2000;
            debounce(() => processResponse(sessionId, currentMessages, isGroup), getDebounceTime(), "debounce-response");
        } else {
            await processResponse(sessionId, currentMessages, isGroup);
        }
  });
}