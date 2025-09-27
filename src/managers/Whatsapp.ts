import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  WAMessageContent,
  proto,
  WAPresence,
  ConnectionState,
 // extractMessageContent,
  MessageUpsertType,
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
  }
) => void;

const OFFLINE_DELAY_MS = 60_000;
const RECONNECT_DELAY_S = 5;

export default class Whatsapp {
  private sock: WASocket | undefined;
  private onMessage?: MessageHandler;
  private presence: WAPresence = "available";

  // O método 'init' agora é chamado de 'connect' para maior clareza.
  // Ele será o responsável por iniciar e reiniciar a conexão.
  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState("whatsapp_session");

    this.sock = makeWASocket({
      browser: ["Paçoca", "Chrome", "123.0.0.0"],
      auth: state,
      markOnlineOnConnect: false,
      logger: LoggerConfig.forBaileys(
        process.env.NODE_ENV === "production" ? "error" : "warn"
      ),
    });

    // Registra os handlers de eventos, que agora são métodos privados da classe.
    // Usamos .bind(this) para garantir que o 'this' dentro dos handlers se refira à nossa classe.
    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", (update) => this.handleConnectionUpdate(update));
    this.sock.ev.on("messages.upsert", (args) => this.handleMessagesUpsert(args));

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
            if (file !== '.gitkeep') {
              fs.rmSync(path.join(sessionDir, file), { recursive: true, force: true });
            }
          }
          console.log("Credenciais da sessão anterior limpas com sucesso, .gitkeep preservado.");
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
      // --- PONTO DE DEBUG 2: ELE ESCUTOU ALGUMA COISA? ---
      /*const messageContent = extractMessageContent(msg.message);
      let textContent = " (não é uma mensagem de texto)";
      if (messageContent?.conversation) {
        textContent = `: "${messageContent.conversation}"`;
      } else if (messageContent?.extendedTextMessage) {
        textContent = `: "${messageContent.extendedTextMessage.text}"`;
      }
      console.log(`📬 Mensagem recebida de ${msg.key.remoteJid}${textContent}`);
      */
      /*Força uma atualização de presença para o remetente da mensagem.
        Isso age como um "handshake", garantindo que a sessão criptográfica seja
        estabelecida corretamente antes de tentarmos enviar uma resposta. */

      const sessionId = msg.key.remoteJid;
      if (!sessionId) continue;
      await this.sock!.sendPresenceUpdate('available', sessionId);

      if (this.presence === "unavailable") {
        await this.sock!.sendPresenceUpdate("available");
        this.presence = "available";
        console.log("Presença atualizada para 'online'.");
      }
      this.debaunceOffline();

      const content = msg.message as WAMessageContent;
      if (!content || !sessionId) continue;

      let senderInfo: { jid: string; name?: string } | undefined;
      if (msg.key.participant) {
        senderInfo = {
          jid: msg.key.participant,
          name: msg.pushName || undefined,
        };
      }

      if (content.conversation || content.extendedTextMessage) {
        this.onMessage?.(sessionId, msg, "text", senderInfo);
      } else if (content.imageMessage) {
        this.onMessage?.(sessionId, msg, "image", senderInfo);
      } else if (content.audioMessage) {
        this.onMessage?.(sessionId, msg, "audio", senderInfo);
      } else if (content.documentMessage) {
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
    //console.log(`📤 Tentando enviar texto para ${jid}: "${text}"`);

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

  async sendImage(jid: string, filePath: string) {
    if (!this.sock) throw new Error("Não conectado");

    try {
      const imageBuffer = fs.readFileSync(filePath);
      await this.sock.sendMessage(jid, {
        image: imageBuffer,
        mimetype: "image/jpeg",
      });
    } catch (error) {
      console.error("Erro ao enviar imagem:", error);
      throw error;
    }
  }

  async sendAudio(jid: string, filePath: string) {
    if (!this.sock) throw new Error("Não conectado");
    await this.sock.sendMessage(jid, {
      audio: { url: filePath },
      ptt: false,
      mimetype: "audio/mpeg",
    });
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