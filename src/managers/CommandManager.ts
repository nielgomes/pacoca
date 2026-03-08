import path from "path";
import fs from "fs/promises";
import Whatsapp from "./Whatsapp";
import { Message } from "../inteligence/types";
import { normalizeAndValidateJid } from "../utils/jid";
import beautifulLogger from "../utils/beautifulLogger";
import generateConversationStarter from "../inteligence/generateConversationStarter";
import generateSearchResponse from "../inteligence/generateSearchResponse";
import database from "../utils/database";
import getHomeDir from "../utils/getHomeDir";
import DEFAULT_MESSAGES from "../constants/DEFAULT_MESSAGES";
import { memory } from "./MemoryManager";

// Define um "pacote" de contexto que os comandos precisam para funcionar
type CommandContext = {
    whatsapp: Whatsapp;
    sessionId: string;
    currentMessages: Message[]; // Ainda útil para comandos que possam ler o chat atual
    memory: typeof memory; // Recebe a instância completa do MemoryManager
};

type CommandResult = {
    commandHandled: boolean;
    newSilencedState?: boolean; // Opcional: só é retornado se o estado mudar
};

/**
 * Ponto de entrada para todos os comandos. Verifica se a mensagem é um comando e o delega para a função correta.
 * @returns 'true' se a mensagem foi tratada como um comando, 'false' caso contrário.
 */

export async function handleCommand(content: string, context: CommandContext): Promise<CommandResult> {
    if (!content.startsWith('/')) {
        return { commandHandled: false };
    }

    const command = content.split(' ')[0].toLowerCase();

    switch (command) {
        case '/call':
            await handleCallCommand(content, context);
            return { commandHandled: true };
        case '/sumario':
            await handleSumarioCommand(content, context);
            return { commandHandled: true };
        case '/pesquisa':
            await handlePesquisaCommand(content, context);
            return { commandHandled: true };
        case '/silencio':
            await handleSilencioCommand(context);
            return { commandHandled: true, newSilencedState: true }; // Retorna o novo estado
        case '/liberado':
            await handleLiberadoCommand(context);
            return { commandHandled: true, newSilencedState: false }; // Retorna o novo estado
        default:
            return { commandHandled: false };
    }
}

// =========================================================================
// LÓGICA DETALHADA DE CADA COMANDO
// =========================================================================

async function handleCallCommand(content: string, { whatsapp, sessionId, memory }: CommandContext) {
    const match = content.match(/^\/call\s+((?:[+()0-9-\s])+)\s+(.*)$/);

    if (!match) {
        await whatsapp.sendText(sessionId, "Formato inválido. Use: /call [numero] [contexto]");
        return;
    }

    const targetNumber = match[1];
    const callContext = match[2];
    const validationResult = normalizeAndValidateJid(targetNumber);

    if (!validationResult.success) {
        await whatsapp.sendText(sessionId, validationResult.error);
        beautifulLogger.warn("COMANDO /call", "Validação do número falhou.", { erro: validationResult.error });
        return;
    }

    const targetJid = validationResult.jid;
    beautifulLogger.info("COMANDO /call", `Iniciando conversa com ${targetJid} sobre: "${callContext}"`);

    try {
        const [exists] = await whatsapp.sock!.onWhatsApp(targetJid);
        if (!exists || !exists.exists) {
            await whatsapp.sendText(sessionId, `O número ${targetNumber} não foi encontrado no WhatsApp.`);
            beautifulLogger.error("COMANDO /call", "Número de destino não existe no WhatsApp.", { targetJid });
            return;
        }

        await whatsapp.setOnline(targetJid);
        await whatsapp.setTyping(targetJid);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const finalMessage = await generateConversationStarter(callContext);
        
        await whatsapp.sendText(targetJid, finalMessage);

        const privateHistory = memory.getMessages(targetJid, false);
        privateHistory.push({ content: `(Paçoca): ${finalMessage}`, name: "Paçoca", jid: "", ia: true });

        memory.addPendingFirstReply(targetJid);
        beautifulLogger.info("TIMER", `Conversa com ${targetJid} marcada como pendente de primeira resposta.`);
        memory.setPrivateChatActivity(targetJid, Date.now());
        
        await whatsapp.sendText(sessionId, `Ok, conversa iniciada com ${targetNumber}.`);
    } catch (error) {
        beautifulLogger.error("COMANDO /call", "O agente 'Puxa-Assunto' falhou", error);
        await whatsapp.sendText(sessionId, "Desculpe, não consegui gerar a mensagem de abertura.");
    }
}

async function handleSumarioCommand(content: string, { whatsapp, sessionId }: CommandContext) {
    beautifulLogger.info("COMANDO", "Comando '/sumario' recebido.");
    const allData = database().getAllGroups();
    const groupSummaries = Object.keys(allData).filter(key => key.endsWith('@g.us'));

    if (groupSummaries.length === 0) {
        await whatsapp.sendText(sessionId, "Ainda não tenho nenhum sumário de grupo em memória.");
        return;
    }

    const parts = content.split(" ");
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
        let responseText = "Encontrei sumários para os seguintes grupos:\n\n";
        let index = 0;
        for (const groupId of groupSummaries) {
            const groupName = await whatsapp.getGroupName(groupId);
            responseText += `${index + 1}. ${groupName}\n`;
            index++;
        }
        responseText += "\nPara ver um sumário específico, use o comando `/sumario [número]`.";
        await whatsapp.sendText(sessionId, responseText);
    }
}

async function handlePesquisaCommand(content: string, { whatsapp, sessionId }: CommandContext) {
    const searchTrigger = "/pesquisa ";
    const query = content.substring(searchTrigger.length);
    beautifulLogger.info("ORQUESTRADOR", `Agente de Pesquisa ativado com a query: "${query}"`);

    try {
        await whatsapp.sendText(sessionId, "🔎 Certo, pesquisando na internet sobre isso...");
        const searchResult = await generateSearchResponse(query);
        await whatsapp.sendText(sessionId, searchResult);
    } catch (error) {
        beautifulLogger.error("AGENTE PESQUISADOR", "O agente falhou", error);
        await whatsapp.sendText(sessionId, "Desculpe, não consegui concluir a pesquisa. Tente novamente mais tarde.");
    }
}

async function handleSilencioCommand({ whatsapp, sessionId, currentMessages }: CommandContext) {
    beautifulLogger.info("COMANDO", "Comando '/silencio' recebido.");
    const stickerPath = path.join(getHomeDir(), "stickers", "silenciado.webp");
    
    // Verificar se o arquivo existe antes de enviar
    try {
        await fs.access(stickerPath);
    } catch {
        beautifulLogger.warn("COMANDO", "Sticker 'silenciado.webp' não encontrado, enviando texto apenas.");
        await whatsapp.sendText(sessionId, DEFAULT_MESSAGES.SILENCED);
        currentMessages.push({
            content: `(Paçoca): ${DEFAULT_MESSAGES.SILENCED}`,
            name: "Paçoca", jid: "", ia: true,
        });
        return;
    }
    
    await whatsapp.sendSticker(sessionId, stickerPath);
    currentMessages.push({
        content: `(Paçoca): <usou o sticker silenciado.webp>`,
        name: "Paçoca", jid: "", ia: true,
    });
    beautifulLogger.actionSent("sticker", { arquivo: "silenciado.webp" });

    await whatsapp.sendText(sessionId, DEFAULT_MESSAGES.SILENCED);
    currentMessages.push({
        content: `(Paçoca): ${DEFAULT_MESSAGES.SILENCED}`,
        name: "Paçoca", jid: "", ia: true,
    });
    beautifulLogger.actionSent("message", { conteúdo: DEFAULT_MESSAGES.SILENCED.substring(0, 50) });
}

async function handleLiberadoCommand({ whatsapp, sessionId, currentMessages }: CommandContext) {
    beautifulLogger.info("COMANDO", "Comando '/liberado' recebido.");
    const stickerPath = path.join(getHomeDir(), "stickers", "livre-para-falar.webp");
    
    // Verificar se o arquivo existe antes de enviar
    try {
        await fs.access(stickerPath);
        await whatsapp.sendSticker(sessionId, stickerPath);
        currentMessages.push({
            content: `(Paçoca): <usou o sticker livre-para-falar.webp>`,
            name: "Paçoca", jid: "", ia: true,
        });
        beautifulLogger.actionSent("sticker", { arquivo: "livre-para-falar.webp" });
    } catch {
        beautifulLogger.warn("COMANDO", "Sticker 'livre-para-falar.webp' não encontrado, enviando texto apenas.");
    }

    await whatsapp.sendText(sessionId, DEFAULT_MESSAGES.UNSILENCED);
    currentMessages.push({
        content: `(Paçoca): ${DEFAULT_MESSAGES.UNSILENCED}`,
        name: "Paçoca", jid: "", ia: true,
    });
    beautifulLogger.actionSent("message", { conteúdo: DEFAULT_MESSAGES.UNSILENCED.substring(0, 50) });
}