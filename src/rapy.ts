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
import generateSearchResponse from './inteligence/generateSearchResponse';
import generateConversationStarter from './inteligence/generateConversationStarter';
import fs from "fs/promises"; 
import analyzeAudio from "./inteligence/analyzeAudio"; 
import analyzeImage from "./inteligence/analyzeImage";


let messages: Message[] = [];
const privateMessages = new Map<string, Message[]>();
let lastRapyResponseTime = 0;
const messagesIds = new Map<string, string>();
let silenced = false;
const privateChatActivity = new Map<string, number>();
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos em milissegundos
const PENDING_REPLY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 horas
const pendingFirstReply = new Set<string>(); // "Memória" para quem estamos esperando a primeira resposta


/**
 * Valida e formata um número de telefone brasileiro para o formato JID do WhatsApp.
 * Trata o 9º dígito, código de país, espaços e caracteres especiais.
 * @param number O número de telefone informado pelo usuário.
 * @returns Um objeto indicando sucesso com o JID, ou falha com uma mensagem de erro.
 */
function normalizeAndValidateJid(number: string): { success: true; jid: string } | { success: false; error: string } {
  // Caso 3 e 4: Remove todos os caracteres não numéricos (+, -, espaços, etc.)
  const cleanNumber = number.replace(/\D/g, "");

  // Caso 1: Validação de tamanho mínimo (DDD de 2 dígitos + número de 8 dígitos = 10)
  if (cleanNumber.length < 10) {
    return { 
      success: false, 
      error: `O número "${number}" parece curto demais. Ele deve ter pelo menos 10 dígitos (DDD + número).` 
    };
  }

  // Adiciona o código do Brasil (55) se ele estiver faltando
  let fullNumber = cleanNumber;
  if (!cleanNumber.startsWith('55')) {
    fullNumber = '55' + cleanNumber;
  }
  
  // Caso 2: Remove o '9' extra se for um celular de 13 dígitos (55 + DDD + 9 + 8 dígitos)
  if (fullNumber.length === 13 && fullNumber.charAt(4) === '9') {
    const finalNumber = fullNumber.substring(0, 4) + fullNumber.substring(5);
    beautifulLogger.info("NORMALIZAÇÃO", `Número ${fullNumber} corrigido para ${finalNumber}`);
    return { success: true, jid: `${finalNumber}@s.whatsapp.net` };
  }

  // Se o número tiver 12 dígitos (55 + DDD + 8 dígitos), ele já está no formato correto
  if (fullNumber.length === 12) {
    return { success: true, jid: `${fullNumber}@s.whatsapp.net` };
  }

  // Se, após todas as tentativas, o formato ainda for inválido
  return { 
    success: false, 
    error: `O número "${number}" não parece ser um celular ou fixo brasileiro válido. Verifique o DDD e o número.` 
  };
}

export default async function rapy(whatsapp: Whatsapp) {
  const db = database();
  let isGenerating = false;
  let recentMessageTimes: number[] = [];

whatsapp.registerMessageHandler(async (sessionId, msg, type, senderInfo, mediaPath) => {

  if (type === "audio" || type === "image") {
    if (!mediaPath) return; // Se não houver caminho de mídia, ignora
   const senderJid = senderInfo?.jid || sessionId;
    const senderName = senderInfo?.name || "Desconhecido";
    const currentMessages = sessionId.endsWith('@g.us') ? messages : (privateMessages.get(sessionId) || []);
    
    let analysisResult = "";
   if (type === "audio") {
      beautifulLogger.info("GEMINI", `Processando áudio de ${senderName}...`);
      analysisResult = await analyzeAudio(mediaPath);
    } else { // type === "image"
      beautifulLogger.info("GEMINI", `Processando imagem de ${senderName}...`);
      const userCaption = msg.message?.imageMessage?.caption || "";
      analysisResult = await analyzeImage(mediaPath, userCaption);
    }
   // Limpa o arquivo temporário
    try {
      await fs.unlink(mediaPath);
      beautifulLogger.info("CLEANUP", `Arquivo temporário ${mediaPath} removido.`);
    } catch(e) {
      beautifulLogger.error("CLEANUP", `Falha ao remover arquivo temporário ${mediaPath}`, e);
    }
   // Adiciona o resultado da análise ao histórico de mensagens como contexto
    const contextMessage: Message[0] = {
      content: `(Contexto de ${type} enviado por ${senderName}): ${analysisResult}`,
      name: senderName,
      jid: senderJid,
      ia: false, // É um fato, não uma fala da IA
    };
    currentMessages.push(contextMessage);
   // Agora, acionamos a resposta da IA, que verá o contexto
    // Usamos uma pequena pausa para simular que ele "ouviu/viu" e está pensando
    setTimeout(processResponse, 1000); 
   // Encerra aqui o fluxo para mídias
    return;
  }  

  if (type !== "text") return;
    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    // --- INÍCIO DO CÓDIGO DO COMANDO /call ---
    if (content?.toLowerCase().startsWith("/call")) {
      // Usamos uma expressão regular para extrair o número e o contexto
      const match = content.match(/^\/call\s+((?:[+()0-9-\s])+)\s+(.*)$/);
    
      if (!match) {
        await whatsapp.sendText(sessionId, "Formato inválido. Use: /call [numero] [contexto]");
        return;
      }
    
      const targetNumber = match[1];
      const context = match[2];
      // Chamamos nossa nova função validadora
      const validationResult = normalizeAndValidateJid(targetNumber);
      // Se a validação falhar, enviamos o erro para o usuário e paramos
      if (!validationResult.success) {
        await whatsapp.sendText(sessionId, validationResult.error);
        beautifulLogger.warn("COMANDO /call", "Validação do número falhou.", { erro: validationResult.error });
        return;
      }

      // Se a validação for bem-sucedida, usamos o JID retornado
      const targetJid = validationResult.jid;
    
      beautifulLogger.info("COMANDO /call", `Iniciando conversa com ${targetJid} sobre: "${context}"`);
    
      try {
        // 1. Verificamos se o número existe no WhatsApp.
        const [exists] = await whatsapp.sock!.onWhatsApp(targetJid);
        if (!exists || !exists.exists) {
            await whatsapp.sendText(sessionId, `O número ${targetNumber} não foi encontrado no WhatsApp.`);
            beautifulLogger.error("COMANDO /call", "Número de destino não existe no WhatsApp.", { targetJid });
            return;
        }

        // 2. "Aquecemos" a conversa enviando uma presença e status de "digitando".
        beautifulLogger.info("COMANDO /call", `Iniciando handshake de presença para ${targetJid}`);
        await whatsapp.setOnline(targetJid);
        await whatsapp.setTyping(targetJid);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pequena pausa para simular digitação
      
        // 3. Gera a mensagem de abertura (agora corrigida para ser texto puro ou json)
        const rawMessage = await generateConversationStarter(context);
        let finalMessage = rawMessage; // Por padrão, usamos a resposta bruta

        // 4. Verificamos se a IA "desobedeceu" e mandou um JSON
        if (rawMessage.trim().startsWith('{"actions":')) {
          beautifulLogger.warn("PARSER", "IA do 'Puxa-Assunto' retornou JSON. Extraindo texto...");
          try {
            const parsed = JSON.parse(rawMessage);
            // Encontra a primeira ação de mensagem e pega o texto dela
            const messageAction = parsed.actions.find(a => a.type === 'message' && a.message?.text);
            if (messageAction) {
              finalMessage = messageAction.message.text;
            }
          } catch (e) {
            beautifulLogger.error("PARSER", "Falha ao extrair JSON da resposta do 'Puxa-Assunto', usando texto bruto como fallback.", e);
            // Se o parse falhar, por segurança, usamos a resposta bruta mesmo.
            finalMessage = rawMessage;
          }
        }        

        // 5. Envia a mensagem final (limpa) para o alvo
        await whatsapp.sendText(targetJid, finalMessage);
      
        // 6. Salva a mensagem final (limpa) na memória do alvo
        const privateHistory = privateMessages.get(targetJid) || [];
        privateHistory.push({
          content: `(Paçoca): ${finalMessage}`,
          name: "Paçoca",
          jid: "",
          ia: true,
        });
        privateMessages.set(targetJid, privateHistory);
      
        // Marcamos este usuário como "aguardando a primeira resposta"
        pendingFirstReply.add(targetJid);
        beautifulLogger.info("TIMER", `Conversa com ${targetJid} marcada como pendente de primeira resposta.`);
        
        // 7. Inicia o timer de 5 minutos para a conversa
        privateChatActivity.set(targetJid, Date.now());
      
        // 8. Confirma a operação para você
        await whatsapp.sendText(sessionId, `Ok, conversa iniciada com ${targetNumber}.`);
      
      } catch (error) {
        beautifulLogger.error("COMANDO /call", "O agente 'Puxa-Assunto' falhou", error);
        await whatsapp.sendText(sessionId, "Desculpe, não consegui gerar a mensagem de abertura.");
      }
    
      return; // Encerra o fluxo para não processar o comando como uma mensagem normal
    }
    // --- FIM DO CÓDIGO DO COMANDO /call ---
    
    // --- INÍCIO DO NOVO CÓDIGO DO COMANDO VER SUMARIOS ---
    if (content?.toLowerCase().startsWith("/sumario")) {
      beautifulLogger.info("COMANDO", "Comando '/sumario' recebido.");
      const allData = db.getAll();
      // Filtramos o banco de dados para pegar apenas as chaves que são de grupos
      const groupSummaries = Object.keys(allData).filter(key => key.endsWith('@g.us'));
    
      if (groupSummaries.length === 0) {
        await whatsapp.sendText(sessionId, "Ainda não tenho nenhum sumário de grupo em memória.");
        return; // Encerra o processamento
      }
    
      const parts = content.split(" ");
      // Caso o usuário queira ver um sumário específico (ex: /sumario 1)
      if (parts.length > 1 && !isNaN(parseInt(parts[1]))) {
        const index = parseInt(parts[1]) - 1;
        if (index >= 0 && index < groupSummaries.length) {
          const targetGroupId = groupSummaries[index];
          const summaryData = allData[targetGroupId];

          let responseText = `📋 *Sumário do Grupo ${index + 1}*\n\n`;
          responseText += `*Resumo:* ${summaryData.summary}\n\n`;
          responseText += "*Opiniões Formadas:*\n";
          summaryData.opinions.forEach(op => {
            responseText += `  - *${op.name}:* Nível ${op.opinion}/100 (${op.traits.join(', ')})\n`;
          });
          await whatsapp.sendText(sessionId, responseText);
        
        } else {
          await whatsapp.sendText(sessionId, "Número de sumário inválido. Verifique a lista e tente novamente.");
        }
      } else {
        // Caso o usuário só digite /sumario, listamos os disponíveis
        let responseText = "Encontrei sumários para os seguintes grupos:\n\n";
      
        // Usamos um loop for...of para poder usar 'await' e buscar cada nome
        let index = 0;
        for (const groupId of groupSummaries) {
          // Usamos nossa nova função para buscar o nome do grupo!
          const groupName = await whatsapp.getGroupName(groupId);
          responseText += `${index + 1}. ${groupName}\n`;
          index++;
        }
      
        responseText += "\nPara ver um sumário específico, use o comando `/sumario [número]`.";
        await whatsapp.sendText(sessionId, responseText);
      }
      return; // Encerra o processamento para não tratar como uma mensagem normal
    }
    // --- FIM DO NOVO CÓDIGO DO COMANDO VER SUMARIOS---

    // --- INÍCIO DO GATILHO DO NOVO AGENTE DE PESQUISA ONLINE ---
    const searchTrigger = "/pesquisa ";
    if (content?.toLowerCase().startsWith(searchTrigger)) {
      const query = content.substring(searchTrigger.length);
      beautifulLogger.info("ORQUESTRADOR", `Agente de Pesquisa ativado com a query: "${query}"`);

      try {
        // Avisa ao usuário que está pesquisando (melhora a experiência)
        await whatsapp.sendText(sessionId, "🔎 Certo, pesquisando na internet sobre isso...");

        const searchResult = await generateSearchResponse(query);
        await whatsapp.sendText(sessionId, searchResult);
      } catch (error) {
        beautifulLogger.error("AGENTE PESQUISADOR", "O agente falhou", error);
        await whatsapp.sendText(sessionId, "Desculpe, não consegui concluir a pesquisa. Tente novamente mais tarde.");
      }

      return; // Encerra o fluxo aqui, não precisa da IA conversacional normal.
    }
    // --- FIM DO GATILHO DO NOVO AGENTE DE PESQUISA ONLINE ---

    const isGroup = sessionId.endsWith('@g.us');
    
    if (!isGroup) {
      const now = Date.now();
      const lastActivity = privateChatActivity.get(sessionId) || 0;
    
      // Verifica se esta conversa estava aguardando a primeira resposta
      if (pendingFirstReply.has(sessionId)) {
        // Se a primeira resposta chegou, a conversa se torna 'ativa'
        beautifulLogger.info("CONTEXTO", `Primeira resposta recebida de ${sessionId}. A conversa agora está ativa.`);
        pendingFirstReply.delete(sessionId); // Remove da lista de espera
      
        // Usamos o timeout longo (24h) para esta primeira verificação
        if (now - lastActivity > PENDING_REPLY_TIMEOUT) {
          beautifulLogger.info("CONTEXTO", `Conversa com ${sessionId} reiniciada por inatividade (24h).`);
          privateMessages.set(sessionId, []);
        }
      } else {
        // Se é uma conversa normal, usa o timeout padrão de 5 minutos
        if (now - lastActivity > CONVERSATION_TIMEOUT) {
          beautifulLogger.info("CONTEXTO", `Conversa com ${sessionId} reiniciada por inatividade (5min).`);
          privateMessages.set(sessionId, []);
        }
      }
    
      // Atualiza o timer da conversa para o momento da mensagem atual
      privateChatActivity.set(sessionId, now);
    }
    
    if (!content || (isGroup && !senderInfo)) {
      return;
    }

    const senderJid = isGroup ? senderInfo!.jid : sessionId;
    const senderName = isGroup ? senderInfo!.name : msg.pushName || "Desconhecido";
    const messageId = msg.key.id;

    // --- LÓGICA DE SEPARAÇÃO DE CONTEXTO ---
    // Selecionamos qual array de mensagens usar com base no tipo de chat.
    const currentMessages = isGroup ? messages : (privateMessages.get(sessionId) || []);
    // -----------------------------------------

    const silence = await silenceRapy(whatsapp, sessionId, msg, currentMessages, silenced);
    silenced = silence?.silenced;

    if (silence) {
        // Atualiza a memória correta após a ação de silenciar/dessilenciar
        if (isGroup) {
            messages = silence.messages;
        } else {
            privateMessages.set(sessionId, silence.messages);
        }
    }

    const currentTime = Date.now();
    recentMessageTimes.push(currentTime);
    if (recentMessageTimes.length > 10) {
      recentMessageTimes.shift();
    }

    const curtMessageId = (messagesIds.size + Math.floor(Math.random() * 1000)).toString();
    messagesIds.set(curtMessageId, messageId ?? "");

    const newMessage: Message[0] = {
      content: `(${senderName}{userid: ${senderJid} (messageid: ${curtMessageId})}): ${content}`,
      name: senderName,
      jid: senderJid,
      ia: false,
    };

    // Adiciona a nova mensagem à memória correta
    currentMessages.push(newMessage);
    if(isGroup) {
        messages = currentMessages;
    } else {
        privateMessages.set(sessionId, currentMessages);
    }

    if (silenced) return;
    if (isGenerating) return;
    if (content.length > 300) return;

    if (isGroup && messages.length > 10) {
      // A lógica de resumo só faz sentido para grupos com contexto compartilhado
      debounce(
        async () => {
          const summaryResult = await generateSummary(db.getAll(), messages);
          // Agrupamos os dados do resumo em um único objeto
          const summaryData = {
            summary: summaryResult.summary,
            opinions: summaryResult.opinions,
          };
          // Salvamos o objeto inteiro usando o ID do grupo como chave
          db.set(sessionId, summaryData);
          db.save();
          messages = []; // Limpa a memória do grupo após resumir
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

      if (timeSinceLastResponse < minTimeBetweenResponses && !isRapyMentioned && isGroup) {
        return;
      }

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
        const { possible, reason } = await isPossibleResponse(db.getAll(), currentMessages);

        if (!possible) {
          beautifulLogger.warn("POSSIBILIDADE", "Resposta não é apropriada por: " + reason);
          isGenerating = false;
          return;
        }

        beautifulLogger.success("POSSIBILIDADE", "Resposta aprovada por: " + reason);
        await whatsapp.setTyping(sessionId);

        // Passamos a memória correta para a IA.
        const result = await generateResponse(db.getAll(), currentMessages, sessionId);
        // -----------------------------------------
        const response = result.actions;

        try {
          const l = log();
          const lastMessage = currentMessages.filter(m => !m.ia).at(-1)?.content || "N/A";
          const outputText = response.map(action => action.message?.text || `<${action.type}>`).join('\n');
          l.add({ input: lastMessage, output: outputText });
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
              currentMessages.push({
                content: `(Rapy): ${message}`,
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
              const message = action.message.text;
              await whatsapp.sendText(sessionId, message);
              currentMessages.push({
                content: `(Rapy): ${message}`,
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
            const stickerPath = path.join(getHomeDir(), "stickers", action.sticker);
            await whatsapp.sendSticker(sessionId, stickerPath);
            currentMessages.push({
              content: `(Rapy): <usou o sticker ${action.sticker}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("sticker", {
              arquivo: action.sticker,
            });
          } else if (action.audio) {
            const audioPath = path.join(getHomeDir(), "audios", action.audio);
            await whatsapp.sendAudio(sessionId, audioPath);
            currentMessages.push({
              content: `(Rapy): <enviou o áudio ${action.audio}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("audio", {
              arquivo: action.audio,
            });
          } else if (action.meme) {
            const memePath = path.join(getHomeDir(), "memes", action.meme);
            await whatsapp.sendImage(sessionId, memePath);
            currentMessages.push({
              content: `(Rapy): <enviou o meme ${action.meme}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("meme", {
              arquivo: action.meme,
            });
          } else if (action.poll) {
            await whatsapp.createPoll(sessionId, action.poll.question, action.poll.options);
            currentMessages.push({
              content: `(Rapy): <criou uma enquete: ${action.poll.question}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("poll", {
              pergunta: action.poll.question,
              opções: action.poll.options.join(", "),
            });
          } else if (action.location) {
            currentMessages.push({
              content: `(Rapy): <enviou uma localização (${action.location.latitude}, ${action.location.longitude})>`,
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
            currentMessages.push({
              content: `(Rapy): <enviou um contato (${action.contact.name} (${action.contact.cell}))>`,
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

}
