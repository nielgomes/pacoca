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

        if (!content) return;

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