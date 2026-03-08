/**
 * Executa uma função com retry automático em caso de falha.
 * @param fn A função a ser executada.
 * @param maxAttempts Número máximo de tentativas (padrão: 3).
 * @param delayMs Tempo de espera entre tentativas em ms (padrão: 1000).
 * @returns O resultado da função se bem-sucedida.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Log do erro
      console.warn(`⚠️ Tentativa ${attempt}/${maxAttempts} falhou:`, error.message || error);
      
      // Se ainda restam tentativas, espera antes de tentar novamente
      if (attempt < maxAttempts) {
        // Espera progressiva: 1s, 2s, 4s (exponencial)
        const waitTime = delayMs * Math.pow(2, attempt - 1);
        console.log(`⏳ Tentando novamente em ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // Se todas as tentativas falharam, lança o último erro
  throw lastError;
}
