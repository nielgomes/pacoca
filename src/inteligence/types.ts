export interface Message {
  content: string;
  name: string | undefined;
  ia: boolean;
  jid: string;
}

export interface BotAction {
  type: 'message' | 'sticker' | 'audio' | 'meme' | 'poll' | 'location' | 'contact' | 'gif' | 'generated_audio';
  message?: {
    text: string;
    reply?: string;
  };
  sticker?: string;
  /** Áudio pré-gravado do catálogo */
  audio?: string;
  /** Áudio gerado dinamicamente pelo modelo de IA */
  generatedAudio?: {
    path: string;          // Caminho do arquivo de áudio gerado
    transcript?: string;   // Texto que foi falado no áudio
    reply?: string;        // ID da mensagem para responder
  };
  meme?: string;
  poll?: {
    question: string;
    options: string[];
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  contact?: {
    name: string;
    cell: string;
  };
  gif?: {
    url: string;           // URL do GIF/MP4 para download/envio
    title: string;         // Título do GIF
    altText: string;       // Descrição alternativa
    pageUrl: string;       // URL da página do Giphy
    isMp4?: boolean;       // Flag indicando se é um vídeo MP4 (para WhatsApp)
  };
}

export type BotResponse = BotAction[];

export interface GenerateResponseResult {
  actions: BotResponse;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
}
