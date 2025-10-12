import beautifulLogger from "./beautifulLogger";

/**
 * Valida e formata um número de telefone brasileiro para o formato JID do WhatsApp.
 * Trata o 9º dígito, código de país, espaços e caracteres especiais.
 * @param number O número de telefone informado pelo usuário.
 * @returns Um objeto indicando sucesso com o JID, ou falha com uma mensagem de erro.
 */
export function normalizeAndValidateJid(number: string): { success: true; jid: string } | { success: false; error: string } {
  const cleanNumber = number.replace(/\D/g, "");

  if (cleanNumber.length < 10) {
    return { 
      success: false, 
      error: `O número "${number}" parece curto demais. Ele deve ter pelo menos 10 dígitos (DDD + número).` 
    };
  }

  let fullNumber = cleanNumber;
  if (!cleanNumber.startsWith('55')) {
    fullNumber = '55' + cleanNumber;
  }

  if (fullNumber.length === 13 && fullNumber.charAt(4) === '9') {
    const finalNumber = fullNumber.substring(0, 4) + fullNumber.substring(5);
    beautifulLogger.info("NORMALIZAÇÃO", `Número ${fullNumber} corrigido para ${finalNumber}`);
    return { success: true, jid: `${finalNumber}@s.whatsapp.net` };
  }

  if (fullNumber.length === 12) {
    // CORREÇÃO: Usar 'fullNumber' em vez do 'finalNumber' que não existe aqui.
    return { success: true, jid: `${fullNumber}@s.whatsapp.net` };
  }

  return { 
    success: false, 
    error: `O número "${number}" não parece ser um celular ou fixo brasileiro válido. Verifique o DDD e o número.` 
  };
}