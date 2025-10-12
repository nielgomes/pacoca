import path from 'path';

/**
 * Retorna o diretório raiz do projeto de forma confiável.
 * Usa `process.cwd()` que aponta para o diretório onde o processo Node.js foi iniciado,
 * que é a raiz do projeto no nosso contêiner Docker.
 * Isso evita problemas com caminhos relativos ao se executar o código compilado da pasta 'dist'.
 * @returns O caminho absoluto para a raiz do projeto.
 */
export default function getHomeDir(): string {
  return path.resolve(process.cwd());
}
