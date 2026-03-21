import { z } from 'zod';

// --- Schemas para Validação de Tools ---

/**
 * Schema para send_message
 */
export const SendMessageSchema = z.object({
  text: z.string().min(1).max(300).describe("O conteúdo da mensagem (máx 300 caracteres)"),
  reply_to_id: z.string().optional().describe("O ID da mensagem à qual esta mensagem deve responder (opcional)"),
});

/**
 * Schema para send_sticker
 */
export const SendStickerSchema = z.object({
  sticker_name: z.string().min(1).describe("O nome exato do arquivo do sticker (ex: 'feliz.webp')"),
});

/**
 * Schema para send_audio
 */
export const SendAudioSchema = z.object({
  audio_name: z.string().min(1).describe("O nome exato do arquivo de áudio (ex: 'WINDOWS-STARTUP.mp3')"),
});

/**
 * Schema para send_meme_image
 */
export const SendMemeImageSchema = z.object({
  meme_name: z.string().min(1).describe("O nome exato do arquivo da imagem do meme (ex: 'ai-que-burro-da-zero-pra-ele.jpg')"),
});

/**
 * Schema para create_poll
 */
export const CreatePollSchema = z.object({
  question: z.string().min(1).max(200).describe("A pergunta da enquete."),
  options: z.tuple([
    z.string().min(1).max(50),
    z.string().min(1).max(50),
    z.string().min(1).max(50),
  ]).describe("Uma lista de exatamente 3 opções de texto para a enquete."),
});

/**
 * Schema para send_location
 */
export const SendLocationSchema = z.object({
  latitude: z.number().min(-90).max(90).describe("A latitude (-90 a 90)."),
  longitude: z.number().min(-180).max(180).describe("A longitude (-180 a 180)."),
});

/**
 * Schema para send_contact
 */
export const SendContactSchema = z.object({
  name: z.string().min(1).describe("O nome a ser exibido no cartão de contato."),
  cell: z.string().min(1).describe("O número de telefone no formato internacional (ex: +5561999999999)."),
});

/**
 * Schema para send_gif
 */
export const SendGifSchema = z.object({
  search_query: z.string().min(1).max(100).describe("Termo de busca para o GIF (em português ou inglês)."),
  quantity: z.number().int().min(1).max(5).default(1).describe("Quantidade de GIFs para buscar (1-5)."),
});

/**
 * Schema para generate_audio
 */
export const GenerateAudioSchema = z.object({
  text: z.string().min(1).max(500).describe("O texto para gerar áudio (máx 500 caracteres)."),
  reply_to_id: z.string().optional().describe("O ID da mensagem à qual este áudio deve responder (opcional)."),
});

// --- Tipos TypeScript inferidos dos Schemas ---

export type SendMessageData = z.infer<typeof SendMessageSchema>;
export type SendStickerData = z.infer<typeof SendStickerSchema>;
export type SendAudioData = z.infer<typeof SendAudioSchema>;
export type SendMemeImageData = z.infer<typeof SendMemeImageSchema>;
export type CreatePollData = z.infer<typeof CreatePollSchema>;
export type SendLocationData = z.infer<typeof SendLocationSchema>;
export type SendContactData = z.infer<typeof SendContactSchema>;
export type SendGifData = z.infer<typeof SendGifSchema>;
export type GenerateAudioData = z.infer<typeof GenerateAudioSchema>;

// --- Funções de Validação ---

/**
 * Valida dados usando um schema Zod
 * @param schema - O schema Zod para validação
 * @param data - Os dados a serem validados
 * @returns Objeto com success: true e data validada, ou success: false e error
 */
export function validateData<T>(
  schema: z.ZodType<T>,
  data: any
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error: any) {
    const errors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, error: `Validation failed: ${errors}` };
  }
}

/**
 * Valida dados usando um schema Zod ou lança erro se falhar
 * @param schema - O schema Zod para validação
 * @param data - Os dados a serem validados
 * @returns Dados validados
 * @throws Error se a validação falhar
 */
export function assertValidData<T>(
  schema: z.ZodType<T>,
  data: any
): T {
  return schema.parse(data);
}
