// src/utils/jid.ts

/**
 * Valida e formata um número de telefone (principalmente brasileiro)
 * para o formato JID do WhatsApp (@s.whatsapp.net).
 * Remove caracteres não numéricos, garante o código de país '55' (se ausente
 * e o número parecer brasileiro), e valida o comprimento final.
 *
 * @param numberInput O número de telefone informado pelo usuário (ex: "+55 61 99999-1234", "61999991234").
 * @returns Um objeto indicando sucesso com o JID formatado, ou falha com uma mensagem de erro.
 */
export function normalizeAndValidateJid(numberInput: string): { success: true; jid: string } | { success: false; error: string } {
  if (!numberInput) {
    return { success: false, error: "Número de telefone não pode ser vazio." };
  }

  // 1. Remove tudo que não for dígito.
  const cleanNumber = numberInput.replace(/\D/g, "");

  // Tratamento inicial para números obviamente inválidos após limpeza
  if (!cleanNumber) {
    return { success: false, error: `"${numberInput}" não contém dígitos válidos.` };
  }

  let fullNumber = cleanNumber;

  // 2. Garante que o código do país '55' esteja presente para números brasileiros.
  //    Supomos que seja brasileiro se não começar com '55' E tiver 10 ou 11 dígitos (DDD + Número).
  if (!cleanNumber.startsWith('55')) {
    if (cleanNumber.length === 10 || cleanNumber.length === 11) {
      // Parece um número brasileiro sem o código do país, adicionamos o 55.
      fullNumber = '55' + cleanNumber;
      // console.log(`INFO: Adicionado código de país 55 ao número ${cleanNumber}, resultado: ${fullNumber}`); // Log opcional
    } else {
      // Se não começa com 55 E não tem 10 ou 11 dígitos, provavelmente não é um número brasileiro válido.
      // Poderia ser um número internacional já formatado ou um número inválido.
      // Por segurança, vamos rejeitá-lo por enquanto, ou poderíamos tentar usá-lo como está se a validação de tamanho abaixo permitir.
      // Decisão: Rejeitar para evitar JIDs inválidos de números curtos não brasileiros.
       return {
           success: false,
           error: `O número "${numberInput}" não começa com 55 e não tem 10 ou 11 dígitos. Verifique o formato.`
       };
    }
  }

  // 3. Valida o comprimento FINAL do número (JÁ COM o '55').
  //    Números brasileiros no WhatsApp têm 12 (55+DD+8d) ou 13 (55+DD+9d) dígitos.
  if (fullNumber.length === 12 || fullNumber.length === 13) {
    // Número parece válido em termos de comprimento.
    return { success: true, jid: `${fullNumber}@s.whatsapp.net` };
  } else if (fullNumber.length < 12) {
    // Se mesmo após adicionar 55 (se necessário), ainda for curto, está errado.
    return {
      success: false,
      error: `O número "${numberInput}" parece curto demais (${fullNumber.length} dígitos). Precisa ter 12 ou 13 dígitos no total (55 + DDD + número).`
    };
  } else { // fullNumber.length > 13
    // Se for longo demais, está errado.
    return {
      success: false,
      error: `O número "${numberInput}" parece longo demais (${fullNumber.length} dígitos). Verifique se digitou corretamente.`
    };
  }
}