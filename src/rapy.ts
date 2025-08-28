import path from "path";
import generateResponse, { Message } from "./inteligence/generateResponse";
import Whatsapp from "./managers/Whatsapp";
import database from "./utils/database";
import debounce from "./utils/debounce";
import generateSummary from "./inteligence/generateSummary";
import getHomeDir from "./utils/getHomeDir";
import log from "./utils/log";
import isPossibleResponse from "./inteligence/isPossibleResponse";
import beautifulLogger from "./utils/beautifulLogger";
import silenceRapy from "./inteligence/silenceRapy";

let messages: Message = [];
let lastRapyResponseTime = 0;
const messagesIds = new Map<string, string>();
let silenced = false;
const privateChatActivity = new Map<string, number>();
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos em milissegundos

export default async function rapy(whatsapp: Whatsapp) {
  const db = database();
  let isGenerating = false;
  let recentMessageTimes: number[] = [];

  whatsapp.registerMessageHandler(async (sessionId, msg, type, senderInfo) => {
    if (type !== "text") return;
    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    // Verificamos se é um grupo pelo ID da sessão
    const isGroup = sessionId.endsWith('@g.us');

    // --- INÍCIO DA NOVA LÓGICA DE TIMEOUT ---
    if (!isGroup) {
      const now = Date.now();
      const lastActivity = privateChatActivity.get(sessionId) || 0;

      // Verifica se a conversa está inativa há mais de 5 minutos
      if (now - lastActivity > CONVERSATION_TIMEOUT) {
        beautifulLogger.info("CONTEXTO", `Conversa com ${sessionId} reiniciada por inatividade.`);
        // Limpa as mensagens antigas desta conversa específica para começar do zero
        messages = messages.filter(m => m.jid !== sessionId && m.jid !== ""); // Mantém mensagens de grupo e as próprias respostas do bot
      }
      // Atualiza o timer da conversa para o momento atual
      privateChatActivity.set(sessionId, now);
    }
    // --- FIM DA NOVA LÓGICA DE TIMEOUT ---    

    // Se não tivermos conteúdo, ou se for um grupo mas não tivermos os dados do participante, ignoramos.
    if (!content || (isGroup && !senderInfo)) {
      beautifulLogger.warn("HANDLER", "Mensagem ignorada: sem conteúdo ou dados do remetente em grupo.");
      return;
    }

    // Definimos o JID e o Nome do remetente de forma segura
    const senderJid = isGroup ? senderInfo!.jid : sessionId;
    const senderName = isGroup ? senderInfo!.name : msg.pushName || "Desconhecido";
    const messageId = msg.key.id;

    const silence = await silenceRapy(whatsapp, sessionId, msg, messages, silenced);
    silenced = silence?.silenced;
    messages.push(...(silence?.messages || []));

    const currentTime = Date.now();

    recentMessageTimes.push(currentTime);

    if (recentMessageTimes.length > 10) {
      recentMessageTimes.shift();
    }

    const curtMessageId = (messagesIds.size + Math.floor(Math.random() * 1000)).toString();
    messagesIds.set(curtMessageId, messageId ?? "");

    const threeMinutesAgo = currentTime - 3 * 60 * 1000;
    recentMessageTimes = recentMessageTimes.filter((time) => time > threeMinutesAgo);

    messages.push({
      content: `(${senderName}{userid: ${senderJid} (messageid: ${curtMessageId})}): ${content}`,
      name: senderName,
      jid: senderJid,
      ia: false,
    });

    messages.slice(-3).forEach((msg, i) => {
      console.log(`  ${i + 1}: ${msg.content.substring(0, 80)}...`);
    });

    if (silenced) return;
    if (isGenerating) return;
    if (content.length > 300) return;

    if (messages.length > 10) {
      debounce(
        async () => {
          const summary = await generateSummary(db.getAll(), messages);
          db.set("summary", summary.summary);
          db.set("opinions", summary.opinions);
          db.save();
          messages = [];
        },
        1000 * 60 * 5,
        "debounce-summary"
      );
    }

    const isRapyMentioned = content.toLowerCase().includes("rapy") || content.toLowerCase().includes("paçoca");
    const isGroupActive = () => {
      if (recentMessageTimes.length < 4) return "normal";

      const intervals = [];
      for (let i = 1; i < recentMessageTimes.length; i++) {
        intervals.push(recentMessageTimes[i] - recentMessageTimes[i - 1]);
      }

      const averageInterval =
        intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

      if (averageInterval <= 5 * 1000) return "very_active";
      if (averageInterval <= 9 * 1000) return "active";

      return "normal";
    };

    const getDebounceTime = () => {
      const activity = isGroupActive();
      if (activity === "very_active") return 8 * 1000 + Math.random() * 4 * 1000;
      if (activity === "active") return 5 * 1000 + Math.random() * 3 * 1000;
      return 2 * 1000 + Math.random() * 2 * 1000;
    };

    const processResponse = async () => {
      const timeSinceLastResponse = Date.now() - lastRapyResponseTime;
      const minTimeBetweenResponses = isGroupActive() === "very_active" ? 15 * 1000 : 8 * 1000;
      const activity = isGroupActive();

      beautifulLogger.groupActivity(activity, {
        "mensagens recentes": recentMessageTimes.length,
        "intervalo médio": `${Math.floor(
          recentMessageTimes.length > 1
            ? (recentMessageTimes[recentMessageTimes.length - 1] - recentMessageTimes[0]) /
                (recentMessageTimes.length - 1) /
                1000
            : 0
        )}s`,
        "tempo desde última resposta": `${Math.floor(timeSinceLastResponse / 1000)}s`,
        "rapy mencionado": isRapyMentioned ? "sim" : "não",
      });

      if (timeSinceLastResponse < minTimeBetweenResponses && !isRapyMentioned) {
        beautifulLogger.info("DEBOUNCE", "Resposta bloqueada por cooldown", {
          "tempo restante": `${Math.floor(
            (minTimeBetweenResponses - timeSinceLastResponse) / 1000
          )}s`,
        });
        return;
      }

      isGenerating = true;
      try {
        beautifulLogger.separator("VERIFICAÇÃO DE POSSIBILIDADE");
        const { possible, reason } = await isPossibleResponse(db.getAll(), messages);

        if (!possible) {
          beautifulLogger.warn("POSSIBILIDADE", "Resposta não é apropriada por: " + reason);
          isGenerating = false;
          return;
        }

        beautifulLogger.success("POSSIBILIDADE", "Resposta aprovada por: " + reason);
        await whatsapp.setTyping(sessionId);

        const result = await generateResponse(db.getAll(), messages);
        const response = result.actions;

        try {
          const l = log();
          l.add({
            input: messages[messages.length - 1].content,
            output: JSON.stringify(response, null, 2),
          });
          l.save();
          beautifulLogger.success("LOG", "Interação salva no arquivo de log");
        } catch (error) {
          beautifulLogger.error("LOG", "Erro ao salvar log", error);
        }

        if (response.length === 0) {
          beautifulLogger.warn("RESPOSTA", "Nenhuma ação foi gerada pela IA");
          isGenerating = false;
          await whatsapp.pauseTyping(sessionId);
          return;
        }

        lastRapyResponseTime = Date.now();
        beautifulLogger.separator("EXECUTANDO AÇÕES");

        for (const action of response) {
          if (action.message) {
            const realMessageId = messagesIds.get(action.message.reply ?? "not-is-message");
            if (action.message.reply && realMessageId) {
              const message = action.message.text;
              await whatsapp.sendTextReply(sessionId, realMessageId, message);
              messages.push({
                content: `(Rapy): ${message}`,
                name: "Rapy",
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
              const message = action.message.text;
              await whatsapp.sendText(sessionId, message);
              messages.push({
                content: `(Rapy): ${message}`,
                name: "Rapy",
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
            const stickerPath = path.join(getHomeDir(), "stickers", action.sticker);
            await whatsapp.sendSticker(sessionId, stickerPath);
            messages.push({
              content: `(Rapy): <usou o sticker ${action.sticker}>`,
              name: "Rapy",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("sticker", {
              arquivo: action.sticker,
            });
          } else if (action.audio) {
            const audioPath = path.join(getHomeDir(), "audios", action.audio);
            await whatsapp.sendAudio(sessionId, audioPath);
            messages.push({
              content: `(Rapy): <enviou o áudio ${action.audio}>`,
              name: "Rapy",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("audio", {
              arquivo: action.audio,
            });
          } else if (action.meme) {
            const memePath = path.join(getHomeDir(), "memes", action.meme);
            await whatsapp.sendImage(sessionId, memePath);
            messages.push({
              content: `(Rapy): <enviou o meme ${action.meme}>`,
              name: "Rapy",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("meme", {
              arquivo: action.meme,
            });
          } else if (action.poll) {
            await whatsapp.createPoll(sessionId, action.poll.question, action.poll.options);
            messages.push({
              content: `(Rapy): <criou uma enquete: ${action.poll.question}>`,
              name: "Rapy",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("poll", {
              pergunta: action.poll.question,
              opções: action.poll.options.join(", "),
            });
          } else if (action.location) {
            messages.push({
              content: `(Rapy): <enviou uma localização (${action.location.latitude}, ${action.location.longitude})>`,
              name: "Rapy",
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
            messages.push({
              content: `(Rapy): <enviou um contato (${action.contact.name} (${action.contact.cell}))>`,
              name: "Rapy",
              jid: "",
              ia: true,
            });
            await whatsapp.sendContact(sessionId, action.contact.cell, action.contact.name);
            beautifulLogger.actionSent("contact", {
              nome: action.contact.name,
              telefone: action.contact.cell,
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));
        }
        // Se a resposta foi em um chat privado, atualize o timer de atividade
        if (!isGroup) {
            privateChatActivity.set(sessionId, Date.now());
            beautifulLogger.info("TIMER", `Timer de atividade para ${sessionId} atualizado após resposta.`);
        }
        lastRapyResponseTime = Date.now();
      } catch (error) {
        beautifulLogger.error("GERAÇÃO", "Erro ao gerar resposta", error);
      } finally {
        await whatsapp.setOnline(sessionId);
        isGenerating = false;
        beautifulLogger.success("FINALIZAÇÃO", "Processo de resposta finalizado");
        beautifulLogger.separator("FIM");
      }
    };

    if (isRapyMentioned || !isGroup) { // Agora também responde se não for um grupo
      beautifulLogger.info("TRIGGER", isGroup ? "Paçoca foi mencionado" : "Mensagem privada recebida", "- processando imediatamente");
      await processResponse();
    } else {
      const debounceTime = getDebounceTime();
      beautifulLogger.info("TRIGGER", "Processamento agendado via debounce", {
        delay: `${Math.floor(debounceTime / 1000)}s`,
        atividade: isGroupActive(),
      });
      debounce(processResponse, debounceTime, "debounce-response");
    }
  });

  await whatsapp.connect();
}
