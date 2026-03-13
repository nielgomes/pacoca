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

// necessário para forçar respostas de mídia
import mediaCatalog from '../../media_catalog.json';
import { convertAudioToOgg, generateAudioResponse } from "../inteligence/generateAudio";

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
            await handlePesquisaCommand(content, context, 'sonar_openrouter');
            return { commandHandled: true };
        case '/pesquisapro':
            await handlePesquisaCommand(content, context, 'sonar_pro_openrouter');
            return { commandHandled: true };
        case '/silencio':
            await handleSilencioCommand(context);
            return { commandHandled: true, newSilencedState: true }; // Retorna o novo estado
        case '/tts':
            await handleTtsCommand(content, context);
            return { commandHandled: true };
        case '/meme':
            await handleMemeCommand(content, context);
            return { commandHandled: true };
        case '/audio':
            await handleAudioCommand(content, context);
            return { commandHandled: true };
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

async function handlePesquisaCommand(content: string, { whatsapp, sessionId }: CommandContext, modelKey: string = 'sonar_openrouter') {
    const searchTrigger = "/pesquisa";
    // Remove /pesquisa ou /pesquisapro da query
    const query = content.replace(new RegExp(`^${searchTrigger}\\w*\\s*`), '').trim();
    
    beautifulLogger.info("ORQUESTRADOR", `Agente de Pesquisa ativado com a query: "${query}"`);

    try {
        await whatsapp.sendText(sessionId, "🔎 Certo, pesquisando na internet sobre isso...");
        const searchResult = await generateSearchResponse(query, modelKey);
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


// === helpers para comandos direcionados ===

/**
 * Escolhe um arquivo de mídia (meme ou áudio) com base em uma query opcional.
 * Tenta corresponder descrição ou nome; se nada for encontrado, retorna aleatório.
 */
function pickMediaByQuery(
    list: Array<{ file: string; description: string }>,
    query: string
): string | null {
    if (query) {
        const low = query.toLowerCase();
        const found = list.find(
            (item) =>
                item.description.toLowerCase().includes(low) ||
                item.file.toLowerCase().includes(low)
        );
        if (found) {
            return found.file;
        }
    }
    if (list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx].file;
}

async function handleTtsCommand(content: string, { whatsapp, sessionId, currentMessages }: CommandContext) {
    const query = content.replace(/^\/tts\s*/i, '').trim();
    if (!query) {
        await whatsapp.sendText(sessionId, "Use /tts <contexto> para gerar áudio falando algo sobre o que você escreveu.");
        return;
    }

    beautifulLogger.info("COMANDO /tts", `Gerando TTS forçado para contexto: "${query}"`);
    try {
        // gerar áudio diretamente a partir do texto informado
        const audioObj = await generateAudioResponse(query, "");

        await whatsapp.sendAudio(sessionId, audioObj.audioPathOgg || audioObj.audioPath);
        currentMessages.push({
            content: `(Paçoca): <enviou áudio via /tts: "${audioObj.transcript || query}">`,
            name: "Paçoca", jid: "", ia: true,
        });
        beautifulLogger.actionSent("generated_audio", { arquivo: audioObj.audioPath });
    } catch (err: any) {
        beautifulLogger.error("COMANDO /tts", "Falha ao gerar áudio TTS", err);
        await whatsapp.sendText(sessionId, "Desculpe, não consegui gerar o áudio 😢");
    }
}

async function handleMemeCommand(content: string, { whatsapp, sessionId, currentMessages }: CommandContext) {
    const query = content.replace(/^\/meme\s*/i, '').trim();
    const choice = pickMediaByQuery(mediaCatalog.memes, query);
    if (!choice) {
        await whatsapp.sendText(sessionId, "Não há memes cadastrados na biblioteca 🤷");
        return;
    }

    const memePath = path.join(getHomeDir(), "memes", choice);
    try {
        await fs.access(memePath);
        await whatsapp.sendImage(sessionId, memePath);
        currentMessages.push({ content: `(Paçoca): <enviou meme ${choice}>`, name: "Paçoca", jid: "", ia: true });
        beautifulLogger.actionSent("meme", { arquivo: choice });
    } catch {
        beautifulLogger.warn("COMANDO /meme", `Arquivo de meme ${choice} não encontrado`);
        await whatsapp.sendText(sessionId, `Desculpe, não achei o meme "${choice}" 😢`);
    }
}

async function handleAudioCommand(content: string, { whatsapp, sessionId, currentMessages }: CommandContext) {
    const query = content.replace(/^\/audio\s*/i, '').trim();
    const choice = pickMediaByQuery(mediaCatalog.audios, query);
    if (!choice) {
        await whatsapp.sendText(sessionId, "Não há áudios cadastrados na biblioteca 🎵");
        return;
    }

    const audioPath = path.join(getHomeDir(), "audios", choice);
    try {
        await fs.access(audioPath);
        let sendPath = audioPath;
        try {
            sendPath = await convertAudioToOgg(audioPath);
        } catch (convErr: any) {
            beautifulLogger.warn("COMANDO /audio", `Falha na conversão de áudio, usando original`, { err: convErr.message });
        }
        await whatsapp.sendAudio(sessionId, sendPath);
        currentMessages.push({ content: `(Paçoca): <enviou áudio ${choice}>`, name: "Paçoca", jid: "", ia: true });
        beautifulLogger.actionSent("audio", { arquivo: choice });
    } catch {
        beautifulLogger.warn("COMANDO /audio", `Áudio ${choice} não encontrado`);
        await whatsapp.sendText(sessionId, `Desculpe, não achei o áudio "${choice}" 🎵`);
    }
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