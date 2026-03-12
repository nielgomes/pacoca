import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
  WAPresence,
  ConnectionState,
  MessageUpsertType,
  downloadMediaMessage,
  fetchLatestBaileysVersion,  
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import { LoggerConfig } from "../utils/logger";
import debounce from "../utils/debounce";
import fs from "fs";
import path from "path";
import getHomeDir from "../utils/getHomeDir";

export type MessageHandler = (
  sessionId: string,
  msg: proto.IWebMessageInfo,
  type: "text" | "image" | "audio" | "document",
  senderInfo?: {
    jid: string;
    name?: string;
  },
  mediaPath?: string // <-- ADICIONAR ESTA PROPRIEDADE OPCIONAL
) => void;

const OFFLINE_DELAY_MS = 60_000;
const RECONNECT_DELAY_S = 5;

export default class Whatsapp {
  public sock: WASocket | undefined;
  private onMessage?: MessageHandler;
  private presence: WAPresence = "available";
  // Adicionamos uma propriedade privada para armazenar o caminho da pasta temporária.
  private tempDirPath: string;

  // Adicionamos um construtor para a classe.
  constructor() {
    // Definimos o caminho correto para a pasta temp, dentro de 'whatsapp_session'.
    this.tempDirPath = path.join(getHomeDir(), 'whatsapp_session', 'temp');
    // Chamamos a nova função que garante que este diretório exista.
    this.ensureTempDirExists();
  }

  // ALTERAÇÃO 3: Criamos um novo método para verificar e criar a pasta temporária.
  private async ensureTempDirExists() {
    try {
      // O 'recursive: true' garante que a pasta seja criada mesmo que 'whatsapp_session' não exista.
      // Se a pasta já existir, este comando não faz nada e não gera erro.
      await fs.promises.mkdir(this.tempDirPath, { recursive: true });
      console.log(`✅ Diretório temporário verificado/criado em: ${this.tempDirPath}`);
    } catch (error) {
      console.error("❌ Falha crítica ao criar o diretório temporário:", error);
      // Se não conseguirmos criar a pasta, a aplicação não pode continuar salvando mídias.
      // É importante parar o processo para evitar mais erros.
      process.exit(1);
    }
  }

  // O método 'init' agora é chamado de 'connect' para maior clareza.
  // Ele será o responsável por iniciar e reiniciar a conexão.
  async connect() {
    // ALTERAÇÃO: O fetchLatestBaileysVersion agora é crucial para a conexão.
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando Baileys v${version.join('.')}, é a mais recente: ${isLatest}`);
    
    const { state, saveCreds } = await useMultiFileAuthState("whatsapp_session");

    this.sock = makeWASocket({
      version, // Passar a versão que acabamos de buscar
      auth: state,
      markOnlineOnConnect: false,
      logger: LoggerConfig.forBaileys(
        process.env.NODE_ENV === "production" ? "error" : "warn"
      ),

      // Adicionar shouldIgnoreJid (recomendado pela v7)
      shouldIgnoreJid: (jid: string) => jid.includes("@broadcast")
    });

    // Registra os handlers de eventos, que agora são métodos privados da classe.
    // Usamos .bind(this) para garantir que o 'this' dentro dos handlers se refira à nossa classe.
    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", (update: Partial<ConnectionState>) => this.handleConnectionUpdate(update));
    this.sock.ev.on(
      "messages.upsert",
      (args: { messages: proto.IWebMessageInfo[]; type: MessageUpsertType }) => this.handleMessagesUpsert(args)
    );

    // --- PONTO DE DEBUG 1: O BOT ESTÁ ESCUTANDO? ---
    //console.log("👂 Bot inicializado e escutando por eventos...");

  }

  // Registra o handler principal que virá do index.ts
  public registerMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  // Lógica de atualização de conexão foi movida para um método separado.
  private handleConnectionUpdate(update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Escaneie o QR code abaixo para conectar:");
      // ALTERAÇÃO: Descomentamos a linha abaixo para que o NOSSO código
      // imprima o QR Code, já que a biblioteca não faz mais isso.
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "🔴 Conexão fechada. Motivo:",
        lastDisconnect?.error,
        ". Tentando reconectar:",
        shouldReconnect
      );

      if (shouldReconnect) {
        console.log(`Reconectando em ${RECONNECT_DELAY_S} segundos...`);
        // Adicionamos um timeout para evitar sobrecarregar o servidor do WhatsApp com tentativas.
        setTimeout(() => this.connect(), RECONNECT_DELAY_S * 1000);
      } else {
        console.log("Desconectado permanentemente. Limpando credenciais...");
        const sessionDir = path.join(getHomeDir(), "whatsapp_session");
        try {
          if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
              // condição para pular o arquivo .gitkeep
              if (file !== ".gitkeep" && file !== "temp") { // Adicionado 'temp' para não apagar a pasta
                fs.rmSync(path.join(sessionDir, file), { recursive: true, force: true });
              }
            }
            console.log("Credenciais da sessão anterior limpas com sucesso, .gitkeep e pasta temp preservados.");
          }
        } catch (err) {
          console.error("Falha ao limpar os arquivos da pasta de autenticação:", err);
        }
        // Encerra o processo para que o Docker/Railway reinicie o contêiner e gere um novo QR code
        process.exit(1);
      }
    } else if (connection === "open") {
      console.log("✅ Conexão aberta e estável com o WhatsApp!");
    }
  }
  
  // Lógica de recebimento de mensagens, agora em um método separado.
  private async handleMessagesUpsert({ messages, type }: { messages: proto.IWebMessageInfo[], type: MessageUpsertType }) {
    if (type !== "notify") return;

    for (const msg of messages) {
      // ALTERAÇÃO: A v7 "desembrulha" a mensagem. O conteúdo não está mais em 'msg.message'
      // O 'msg' (IWebMessageInfo) agora contém o texto e os tipos de mídia diretamente.

      const sessionId = msg.key?.remoteJid;
      if (!sessionId) continue;

      // PROTEÇÃO: Ignorar mensagens do próprio bot para evitar loops de resposta
      if (msg.key?.fromMe) {
        continue;
      }

      if (msg.key) {
        await this.sock!.readMessages([msg.key]);
      }

      await this.sock!.sendPresenceUpdate("available", sessionId);

      if (this.presence === "unavailable") {
        await this.sock!.sendPresenceUpdate("available");
        this.presence = "available";
        console.log("Presença atualizada para 'online'.");
      }
      this.debaunceOffline();

      // Verificamos se há algum conteúdo de mensagem
      if (!msg) continue; 

      let senderInfo: { jid: string; name?: string } | undefined;
      if (msg.key.participant) {
        senderInfo = {
          jid: msg.key.participant,
          name: msg.pushName || undefined,
        };
      }

      // ALTERAÇÃO: Lógica de verificação de tipo simplificada para v7
      if (msg.message?.conversation) {
        this.onMessage?.(sessionId, msg, "text", senderInfo);

      } else if (msg.message?.extendedTextMessage) {
        // O texto de uma 'extendedMessage' (como respostas) agora está em 'msg.message.extendedTextMessage.text'
        // Mas para simplificar, o Baileys v7 coloca o texto principal em 'msg.text'
        // No entanto, seu handler de mensagens espera 'msg' inteiro, então vamos manter a verificação.
        this.onMessage?.(sessionId, msg, "text", senderInfo);

      } else if (msg.message?.imageMessage || msg.message?.audioMessage) { // AGRUPAMOS A LÓGICA
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: this.sock?.logger, reuploadRequest: this.sock?.updateMediaMessage! }
          );

          const fileType = msg.message?.imageMessage ? 'jpg' : 'ogg';
          const tempFilePath = path.join(this.tempDirPath, `${msg.key.id}.${fileType}`);

          await fs.promises.writeFile(tempFilePath, buffer);
          console.log(`📥 Mídia salva em: ${tempFilePath}`);

          if (msg.message?.imageMessage) {
            this.onMessage?.(sessionId, msg, "image", senderInfo, tempFilePath);
          } else if (msg.message?.audioMessage) {
            this.onMessage?.(sessionId, msg, "audio", senderInfo, tempFilePath);
          }

        } catch (error) {
          console.error("❌ Erro ao baixar ou salvar mídia:", error);
        }
      } else if (msg.message?.documentMessage) {
        this.onMessage?.(sessionId, msg, "document", senderInfo);
      }
    }
  }

  private debaunceOffline() {
    debounce(
      async () => {
        try {
          await this.sock!.sendPresenceUpdate("unavailable");
          this.presence = "unavailable";
        } catch {}
      },
      OFFLINE_DELAY_MS,
      "debounce-offline"
    );
  }

  async sendText(jid: string, text: string) {
    if (!this.sock) throw new Error("Não conectado");
    // --- PONTO DE DEBUG 3: ELE TENTOU ENVIAR ALGUMA MENSAGEM? ---
    console.log(`📤 Tentando enviar texto para ${jid}: "${text}"`);

    await this.sock.sendMessage(jid, { text });
  }

  async sendTextReply(jid: string, replyTo: string, text: string) {
    if (!this.sock) throw new Error("Não conectado");
    //console.log(`📤 Tentando responder para ${jid}: "${text}"`); //Debug extra
    await this.sock.sendMessage(
      jid,
      { text },
      {
        quoted: {
          key: { id: replyTo, remoteJid: jid },
          message: {},
        },
      }
    );
  }

  async sendSticker(jid: string, filePath: string) {
    if (!this.sock) throw new Error("Não conectado");
    await this.sock.sendMessage(jid, { sticker: { url: filePath } });
  }

  async sendContact(jid: string, cell: string, name?: string) {
    if (!this.sock) throw new Error("Não conectado");
    const vcard =
      "BEGIN:VCARD\n" +
      "VERSION:3.0\n" +
      `FN:${name}\n` +
      `TEL;TYPE=CELL:${cell.replace(/\D/g, "")}\n` +
      "END:VCARD";

    await this.sock!.sendMessage(jid, {
      contacts: {
        displayName: name,
        contacts: [{ vcard }],
      },
    });
  }

  async createPoll(jid: string, name: string, options: string[], selectableCount: number = 1) {
    if (!this.sock) throw new Error("Não conectado");
    await this.sock.sendMessage(jid, { poll: { name, values: options, selectableCount } });
  }

  async sendLocation(jid: string, latitude: number, longitude: number) {
    if (!this.sock) throw new Error("Não conectado");
    await this.sock.sendMessage(jid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude },
    });
  }

  async sendImage(jid: string, filePathOrUrl: string) {
    if (!this.sock) throw new Error("Não conectado");

    try {
      // Verificar se é uma URL (http/https) ou um arquivo local
      const isUrl = filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://');
      
      if (isUrl) {
        // Verificar se é um GIF pela extensão ou pelo mimetype
        const isGif = filePathOrUrl.toLowerCase().includes('.gif') || filePathOrUrl.includes('giphy');
        
        if (isGif) {
          // Para GIFs animados, o WhatsApp precisa receber como vídeo com flag de GIF
          // Isso garante que o GIF seja animado quando enviado
          try {
            const response = await fetch(filePathOrUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            await this.sock.sendMessage(jid, {
              video: buffer,
              mimetype: "image/gif",
              gif: true, // Flag importante para manter animação
            });
          } catch (downloadError) {
            console.error("Erro ao baixar GIF, tentando enviar como URL:", downloadError);
            // Fallback: tentar enviar como URL direta
            await this.sock.sendMessage(jid, {
              video: { url: filePathOrUrl },
              mimetype: "image/gif",
              gif: true,
            });
          }
        } else {
          // Para imagens normais, enviar por URL
          await this.sock.sendMessage(jid, {
            image: { url: filePathOrUrl },
            mimetype: "image/jpeg",
          });
        }
      } else {
        // Verificar se é GIF pelo nome do arquivo
        const isGif = filePathOrUrl.toLowerCase().includes('.gif');
        
        if (isGif) {
          // Enviar GIF local como vídeo com flag de animação
          const imageBuffer = fs.readFileSync(filePathOrUrl);
          await this.sock.sendMessage(jid, {
            video: imageBuffer,
            mimetype: "image/gif",
            gif: true,
          });
        } else {
          // Enviar arquivo local (para memes e stickers)
          const imageBuffer = fs.readFileSync(filePathOrUrl);
          await this.sock.sendMessage(jid, {
            image: imageBuffer,
            mimetype: "image/jpeg",
          });
        }
      }
    } catch (error) {
      console.error("Erro ao enviar imagem:", error);
      throw error;
    }
  }

  /**
   * Envia um GIF animado para o WhatsApp
   * O WhatsApp requer MP4 com gifPlayback: true para GIFs animados
   * @param jid O ID do chat
   * @param url URL do GIF/MP4
   * @param isMp4 Indica se a URL é um arquivo MP4
   */
  async sendGif(jid: string, url: string, isMp4: boolean = false) {
    if (!this.sock) throw new Error("Não conectado");

    try {
      console.log(`🕵️ DEBUG [Whatsapp.sendGif]: Enviando GIF/MP4 para ${jid}`);
      console.log(`🕵️ DEBUG [Whatsapp.sendGif]: URL: ${url}`);
      console.log(`🕵️ DEBUG [Whatsapp.sendGif]: isMp4: ${isMp4}`);

      // Baixar o conteúdo primeiro
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Falha ao baixar: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      console.log(`🕵️ DEBUG [Whatsapp.sendGif]: Buffer criado, tamanho: ${buffer.length} bytes`);

      // Enviar como vídeo com gifPlayback: true
      await this.sock.sendMessage(jid, {
        video: buffer,
        mimetype: isMp4 ? "video/mp4" : "image/gif",
        gifPlayback: true, // Flag oficial do Baileys para GIF animado
      });
      
      console.log(`🕵️ DEBUG [Whatsapp.sendGif]: GIF enviado com sucesso!`);
    } catch (error) {
      console.error("🕵️ DEBUG [Whatsapp.sendGif]: Erro ao enviar GIF:", error);
      throw error;
    }
  }

  async sendAudio(jid: string, filePath: string, replyTo?: string) {
    if (!this.sock) throw new Error("Não conectado");
    
    // Detecta o mimetype baseado na extensão do arquivo
    const isWav = filePath.toLowerCase().endsWith('.wav');
    const mimetype = isWav ? "audio/wav" : "audio/mpeg";
    
    try {
      // Lê o arquivo como buffer (mais confiável que URL)
      const audioBuffer = fs.readFileSync(filePath);
      
      const messageOptions: any = {
        audio: audioBuffer,
        // WAV como nota de voz costuma falhar em alguns clientes; enviar como áudio normal
        ptt: isWav ? false : true,
        mimetype: mimetype,
      };
      
      // Adiciona resposta se fornecida
      if (replyTo) {
        messageOptions.quoted = {
          key: { id: replyTo, remoteJid: jid },
          message: {},
        };
      }
      
      const result = await this.sock.sendMessage(jid, messageOptions);
      if (!result?.key?.id) {
        throw new Error("Envio de áudio retornou sem message id (possível falha silenciosa)");
      }
      console.log("🕵️ DEBUG [sendAudio]: Áudio enviado com buffer, tamanho:", audioBuffer.length);
    } catch (audioError) {
      console.error("🕵️ DEBUG [sendAudio]: Erro ao enviar áudio:", audioError);
      // Fallback: enviar como documento
      const docMessage: any = {
        document: { url: filePath },
        mimetype: mimetype,
        fileName: filePath.split('/').pop(),
      };
      
      if (replyTo) {
        docMessage.quoted = {
          key: { id: replyTo, remoteJid: jid },
          message: {},
        };
      }
      
      await this.sock.sendMessage(jid, docMessage);
      console.log("🕵️ DEBUG [sendAudio]: Áudio enviado como documento (fallback)");
    }
  }

  private async updatePresence(to: string, presence: WAPresence) {
    if (!this.sock) throw new Error("Não conectado");
    await this.sock.sendPresenceUpdate(presence, to);
  }

  async setOnline(to: string) {
    await this.updatePresence(to, "available");
  }

  async setOffline(to: string) {
    await this.updatePresence(to, "unavailable");
  }

  async setTyping(to: string) {
    await this.updatePresence(to, "composing");
  }

  async pauseTyping(to: string) {
    await this.updatePresence(to, "paused");
  }

  /**
   * Busca os metadados de um grupo e retorna seu nome (subject).
   * @param jid O ID do grupo (ex: '12345@g.us')
   * @returns O nome do grupo ou o próprio JID caso não encontre.
   */
  public async getGroupName(jid: string): Promise<string> {
    if (!this.sock || !jid.endsWith('@g.us')) {
      return jid; // Retorna o ID se não for um grupo ou se não estiver conectado
    }
    try {
      const metadata = await this.sock.groupMetadata(jid);
      return metadata.subject; // 'subject' é o campo que contém o nome do grupo
    } catch (error) {
      console.error(`Falha ao buscar metadados para o grupo ${jid}:`, error);
      return jid; // Em caso de erro, retorna o ID como fallback
    }
  }
}