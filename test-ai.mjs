// test-ai.mjs (versão final com importação correta)

// Agora podemos importar diretamente usando a sintaxe de desestruturação
import { generateResponse } from './dist/index.js';

// O resto do arquivo permanece o mesmo...
const mockData = {
  summary: "A conversa é sobre os planos para o fim de semana. Bia sugeriu praia, mas Leo prefere ficar em casa jogando.",
  opinions: [
    { name: "Bia", jid: "123", opinion: 80, traits: ["animada", "extrovertida"] },
    { name: "Leo", jid: "456", opinion: 45, traits: ["caseiro", "preguiçoso"] }
  ]
};
const mockMessages = [
  { name: "Bia", content: "Gente, vamos ver quem é inteligente... Quem sabe o que é um buraco de minhoca na astrofísica?", ia: false, jid: "123" },
  { name: "Leo", content: "Ah, não... Só conheço as minhocas que ficam debaixo da terra. O @Paçoca me disse q sabe o que é isso...", ia: false, jid: "456" },
  { name: "Bia", content: "Nossa, Leo, você só pensa em pescar! Bora aprender coisas novas kkkk.", ia: false, jid: "123" },
  { name: "Leo", content: "/pesquisa fale resumidamente sobre buraco de minhoca na astrofísica de forma que um adolescente de 16 anos consiga entender", ia: false, jid: "456" }
];

(async () => {
  console.log("🚀 Iniciando teste do módulo de IA...");
  console.log("-----------------------------------------");
  try {
    // include a dummy session id so audio heuristics can track cooldown
    const result = await generateResponse(mockData, mockMessages, "test-session");
    console.log("
📌 Resultado normal:", JSON.stringify(result, null, 2));

    // agora simular comandos para verificar handlers básicos (sem WhatsApp connection)
    const { handleCommand } = await import('./src/managers/CommandManager.js');
    const fakeContext = { whatsapp: { sendText: async () => {}, sendAudio: async () => {}, sendImage: async () => {} }, sessionId: 'test', currentMessages: [], memory: {} };
    await handleCommand('/tts me fale algo aleatório', fakeContext);
    await handleCommand('/meme festa', fakeContext);
    await handleCommand('/audio oi', fakeContext);
    console.log("\n✅ Teste concluído com sucesso! Resposta da IA:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\n❌ Teste falhou:", error);
  } finally {
    console.log("\n-----------------------------------------");
    console.log("🏁 Teste finalizado.");
  }
})();