import path from "path";
import fs from "fs/promises"; 
import { BotResponse, Message } from "../inteligence/types";
import getHomeDir from "../utils/getHomeDir";
import Whatsapp from "./Whatsapp";
import beautifulLogger from "../utils/beautifulLogger";
import { memory } from "./MemoryManager";


// função auxiliar para encontrar mídias de forma case-insensitive.
/**
 * Procura um arquivo de mídia em um diretório, ignorando maiúsculas/minúsculas.
 * @param mediaDir O diretório onde procurar (ex: "stickers", "audios").
 * @param requestedFile O nome do arquivo solicitado pela IA.
 * @returns O caminho completo para o arquivo encontrado ou null se não encontrar.
 */
async function findMediaPath(mediaDir: string, requestedFile: string): Promise<string | null> {
    const homeDir = getHomeDir();
    const fullDir = path.join(homeDir, mediaDir);

    // PONTO DE VERIFICAÇÃO 1: Vamos ver o que 'getHomeDir()' e o caminho final se tornam.
    console.log(`🕵️ DEBUG [MediaFinder]: getHomeDir() retornou: "${homeDir}"`);
    console.log(`🕵️ DEBUG [MediaFinder]: Tentando ler o diretório: "${fullDir}"`);

    try {
        const files = await fs.readdir(fullDir);
        const foundFile = files.find(file => file.toLowerCase() === requestedFile.toLowerCase());

        if (foundFile) {
            const finalPath = path.join(fullDir, foundFile);
            console.log(`🕵️ DEBUG [MediaFinder]: Arquivo encontrado em: "${finalPath}"`);
            return finalPath;
        }

        beautifulLogger.warn("MediaFinder", `Arquivo "${requestedFile}" não encontrado no diretório "${mediaDir}".`);
        return null;
    } catch (error) {
        // PONTO DE VERIFICAÇÃO 2: Se 'readdir' falhar, este log nos dará o erro completo.
        console.error(`🕵️ DEBUG [MediaFinder]: ERRO DETALHADO ao tentar ler "${fullDir}":`, error);
        beautifulLogger.error("MediaFinder", `Erro ao ler o diretório "${mediaDir}".`, {});
        return null;
    }
}


type ActionContext = {
    whatsapp: Whatsapp;
    sessionId: string;
    currentMessages: Message[];
    isGroup: boolean;
};

export async function executeActions(response: BotResponse, context: ActionContext) {
    const { whatsapp, sessionId, currentMessages } = context;

    for (const action of response) {
        console.log(`🕵️ DEBUG: Processando ação do tipo: ${action.type}`);

        if (action.message) {
            console.log("🕵️ DEBUG: Entrou no bloco if (action.message)");
            const realMessageId = memory.getMessageId(action.message.reply ?? "not-is-message");
            if (action.message.reply && realMessageId) {
                const message = action.message.text;
                await whatsapp.sendTextReply(sessionId, realMessageId, message);
                currentMessages.push({ content: `(Paçoca): ${message}`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("message", { tipo: "resposta", conteúdo: message.substring(0, 50) });
            } else {
                const message = action.message.text;
                console.log(`🕵️ DEBUG: Preparando para enviar mensagem normal: "${message}"`);
                await whatsapp.sendText(sessionId, message);
                currentMessages.push({ content: `(Paçoca): ${message}`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("message", { tipo: "mensagem normal", conteúdo: message.substring(0, 50) });
            }
        } else if (action.sticker) {
            const stickerPath = await findMediaPath("stickers", action.sticker);
            if (stickerPath) {
                await whatsapp.sendSticker(sessionId, stickerPath);
                currentMessages.push({ content: `(Paçoca): <usou o sticker ${action.sticker}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("sticker", { arquivo: action.sticker });
            } else {
                // Log de erro silencioso corrigido - agora notifica o usuário
                beautifulLogger.warn("STICKER", `Sticker '${action.sticker}' não encontrado, enviando mensagem de erro.`);
                await whatsapp.sendText(sessionId, `Desculpe, não encontrei o sticker '${action.sticker}' 😢`);
            }
        } else if (action.audio) {
            const audioPath = await findMediaPath("audios", action.audio);
            if (audioPath) {
                await whatsapp.sendAudio(sessionId, audioPath);
                currentMessages.push({ content: `(Paçoca): <enviou o áudio ${action.audio}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("audio", { arquivo: action.audio });
            } else {
                beautifulLogger.warn("AUDIO", `Áudio '${action.audio}' não encontrado.`);
                await whatsapp.sendText(sessionId, `Desculpe, não encontrei o áudio '${action.audio}' 🎵`);
            }
        } else if (action.generatedAudio) {
            // Áudio gerado dinamicamente pelo modelo de IA
            const audioPath = action.generatedAudio.path;
            const transcript = action.generatedAudio.transcript || "";
            const replyTo = action.generatedAudio.reply;
            
            try {
                // Verifica se o arquivo existe
                await fs.access(audioPath);
                
                // Obtém o ID real da mensagem para responder
                const realMessageId = replyTo ? memory.getMessageId(replyTo) : undefined;
                
                await whatsapp.sendAudio(sessionId, audioPath, realMessageId);
                currentMessages.push({ 
                    content: `(Paçoca): <enviou áudio gerado: "${transcript.substring(0, 50)}...">`, 
                    name: "Paçoca", 
                    jid: "", 
                    ia: true 
                });
                beautifulLogger.actionSent("generated_audio", { 
                    arquivo: audioPath,
                    transcript: transcript.substring(0, 100),
                });
                
                // Opcional: limpa o arquivo temporário após envio
                // await fs.unlink(audioPath);
            } catch (error) {
                beautifulLogger.error("GENERATED_AUDIO", `Erro ao enviar áudio gerado: ${audioPath}`, {});
                // Fallback para mensagem de texto se o áudio falhar
                if (transcript) {
                    await whatsapp.sendText(sessionId, transcript);
                } else {
                    await whatsapp.sendText(sessionId, "Desculpe, não consegui gerar o áudio 😢");
                }
            }
        } else if (action.meme) {
            const memePath = await findMediaPath("memes", action.meme);
            if (memePath) {
                await whatsapp.sendImage(sessionId, memePath);
                currentMessages.push({ content: `(Paçoca): <enviou o meme ${action.meme}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("meme", { arquivo: action.meme });
            } else {
                beautifulLogger.warn("MEME", `Meme '${action.meme}' não encontrado.`);
                await whatsapp.sendText(sessionId, `Desculpe, não encontrei o meme '${action.meme}' 🖼️`);
            }
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
        } else if (action.gif) {
            // Lógica para enviar um GIF do Giphy
            console.log(`🕵️ DEBUG [GIF]: Preparando para enviar GIF: "${action.gif.title}"`);
            console.log(`🕵️ DEBUG [GIF]: URL: ${action.gif.url}`);
            console.log(`🕵️ DEBUG [GIF]: É MP4: ${action.gif.isMp4}`);
            
            currentMessages.push({
              content: `(Paçoca): <enviou um GIF: ${action.gif.title}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            
            // O WhatsApp precisa de MP4 com gifPlayback para GIFs animados
            try {
              await whatsapp.sendGif(sessionId, action.gif.url, action.gif.isMp4);
              console.log(`🕵️ DEBUG [GIF]: GIF enviado com sucesso!`);
            } catch (gifError) {
              console.error(`🕵️ DEBUG [GIF]: Erro ao enviar GIF:`, gifError);
              // Tentar enviar como mensagem de fallback
              await whatsapp.sendText(sessionId, `Olha só que gif legal que achei: ${action.gif.pageUrl}`);
            }
            
            beautifulLogger.actionSent("gif", {
              titulo: action.gif.title,
              url: action.gif.url,
            });
      } 
    }
}