import "dotenv/config";
import Whatsapp from "./managers/Whatsapp";
import rapy from "./rapy";

async function main() {
  // 1. Criamos a instância do cliente Whatsapp aqui, uma única vez.
  const whatsapp = new Whatsapp();

  // 2. Passamos a instância para a lógica principal do Rapy.
  //    O Rapy irá registrar seus "ouvidos" (handlers) na instância.
  await rapy(whatsapp);

  // 3. APÓS TUDO ESTAR CONFIGURADO, iniciamos a conexão.
  //    Esta é a única chamada para 'connect' em todo o projeto.
  await whatsapp.connect();
}

main();
export { default as generateResponse } from "./inteligence/generateResponse";