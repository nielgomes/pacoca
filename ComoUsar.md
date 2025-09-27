# Como gerenciar qual o modelo vc vai utilizar com o Paçoca?

### 1- Criar um arquivo .env:

Criar um arquivo .env contendo:
```
OPENROUTER_API_KEY="sua chave de API"
#Chave da API do Gemini pro
GEMINI_API_KEY="sua chave de API do Gemini"
# Chave da API do Perplexity
PERPLEXITY_API_KEY="sua chave do Perplexity"


# (Opcional, mas recomendado) O nome do seu app para identificação nos headers
APP_NAME="paçoca"
# (Opcional, mas recomendado) A URL do seu site ou repositório
APP_URL="https://github.com/seu user/seu projeto"

NODE_ENV=development # ou production
```
### 2- Gerenciando o modelo:

No arquivo `model.json` na raiz do projeto é o responsável pelo catálogo de modelos que podemos usar no projeto. Abra-o e altere os modelos conforme a sua necessidade. Exemplo:
```
{
  "default": {
    "MODEL_NAME": "deepseek/deepseek-chat-v3-0324",
    "MODEL_PRICING": {
      "input": 0.2,
      "output": 0.8
    }
  },
  "search": {
    "MODEL_NAME": "perplexity/sonar",
    "MODEL_PRICING": {
      "input": 1.0,
      "output": 1.0
    }
  },
  "free": {
    "MODEL_NAME": "deepseek/deepseek-chat-v3.1:free",
    "MODEL_PRICING": {
      "input": 0,
      "output": 0
    }
  }
}
```
No Json acima temos:

- __default__: é o modelo padrão de conversa do Paçoca. Seu conhecimento é limitado até junho/2024
- __search__: é o modelo de pesquisa online, ele sai do personagem Paçoca e faz uma pesquisa ne Internet a respeito de informações da atualidade. Esse modulo é acionado pela palavra-chave `/pesquisa` exemplo: `/pesquisa Qual a cotação do dólar hoje?`
- __free__: é o modelo grátis (ou mais baratos) utilizado para os arquivos `src/inteligence/generateSummary.ts` e `src/inteligence/isPossibleResponse.ts` responsáveis pelo sumario de interações em grupos e responsável para ver se o Paçoca pode ou não responder uma interação
- __perplexity__: é o modelo de pesquisa Sonar utilizando a API do site da Perplexity, gratis por 12 meses. Esse modulo é acionado pela palavra-chave `/pesquisa` exemplo: `/pesquisa Qual a cotação do dólar hoje?`
- __nemo__: é o modelo mistral-nemo que o 7º mais utilizado no OpenRouter como modelo de RP (Role Play)
- __xai__: é o modelo da Grok terceiro colocado no ranking de RP (Role Play) e mais barato que o modelo __default__. Tem um ótimo desempenho, considerando que ele é 5 vezes mais barato que o deepseek/deepseek-chat-v3-0324.

# Visualizar sumario de grupos

Use o comando `/sumario` para que o bot verifique se existem sumarios de grupos salvo no db.json, se existir 1 ou mais sumários o bot infoma o nr de quais sumarios existem, com esse numero basta rodar `/sumario [nr do grupo]` que será mostrado o ultimo sumario daquele grupo.

Obs.: 

- Os sumario são criados quando um grupo possui mais de 10 interações e fica mais de 5 minutos inativo, esse é o gatilho para a criação de um sumario do grupo
- Cada grupo possui o seu proprio sumario vinculado ao seu número de ID
- A cada rebuild do container os sumarios são perdidos e inicia-se a criação do zero. 

# Como fazer pesquisas

O modulo de pesquisa é acionado pela palavra-chave `/pesquisa [contexto]` exemplo: `/pesquisa Qual a cotação do dólar hoje?`

# Como usar o módulo Puxar Assunto

Para pedir que o Paçoca 'puxe assunto' com alguem use o comando `/call [nr whatsapp] [contexto]`, onde:
- `/call` é o comando
- `[nr whatsapp]` é o número do telefone do alvo para o inicio da interação, no padrão do Whatsapp (com 12 caracteres). Exemplo: 556191234567 sem um 9 a mais que temos no padrão brasileiro.
- `[contexto]` é o contexto do assunto que você quer que o Paçoca inicie a interação, se possivel informando o nome do alvo. Exemplo: Puxe assunto com a Gi referente ao desenho Cavaleiros do Zodiaco.
- Com base nas informações acima o exemplo na integra ficaria assim: `/call 556191234567 Puxe assunto com a Gi referente ao desenho Cavaleiros do Zodiaco.`

# Como testar em desenvolvimento?

O arquivo `test-ai.mjs` é o responsável por simular um grupo de Whatsapp para vermos como o Paçoca está se comportanto. 

* Suba o container com o comando `docker compose up --build -d`
* Depois execute o comando:
```
docker exec -it pacoca-container /bin/sh -c "node test-ai.mjs" 
```

# Como interagir com o Paçoca?

## Passo 1: Obter o QR Code

O aplicativo, ao ser iniciado, irá gerar um QR Code no log para que você possa autenticar a sessão. Para visualizá-lo, use o seguinte comando:
Bash

docker logs pacoca-container

Você deverá ver a saída do seu aplicativo, que irá gerar um QR Code diretamente no seu terminal.

## Passo 2: Conectar o WhatsApp

    Com o QR Code visível no seu terminal, pegue seu celular.

    Abra o WhatsApp.

    Vá para Configurações > Aparelhos conectados.

    Toque em "Conectar um aparelho" e escaneie o código que apareceu no terminal.

Após escanear, o log no terminal irá mudar, mostrando mensagens como "Cliente está pronto!" ou algo similar. Isso confirma que a conexão foi um sucesso.

## Passo 3: Testar o Bot!

Vou te guiar detalhadamente, desde o uso básico em uma conversa privada até a interação em grupo.

### Parte 1: Usando o Bot em uma Conversa Privada

Esta é a forma mais simples de interagir. O bot funcionará como um contato pessoal com uma superinteligência artificial por trás.

    Encontre o Contato do Bot: No seu WhatsApp, o número de telefone que você usou para escanear o QR Code agora é, efetivamente, o "contato" do seu bot. Inicie uma conversa com ele como faria com qualquer outra pessoa.

    Comece a Conversar: Simplesmente envie uma mensagem de texto.

        Você diz: "E aí, tudo certo?"

        O que acontece: A mensagem é recebida pelo seu contêiner Docker. O código a envia para a IA da OpenRouter (o modelo DeepSeek). A IA, seguindo o prompt de personalidade irônica/passivo-agressiva, vai gerar uma resposta.

        O Bot responde: "Tudo certo pra quem? Pra mim, que sou um programa preso em um servidor, ou pra você, que tem o luxo de sentir o sol? Mas, sim, estou 'funcionando'."

    Explore as Capacidades da IA: A grande vantagem é que você está conversando com um Modelo de Linguagem avançado. Você pode pedir qualquer coisa:

        "Me explique o que é um buraco de minhoca como se eu tivesse 5 anos."

        "Crie uma pequena história de terror sobre um e-mail não lido."

        "Qual a sua opinião sobre o último episódio daquela série?" (Lembre-se que o conhecimento dele é limitado à data de treinamento do modelo).

### Parte 2: Adicionando o Bot a um Grupo

É aqui que o Paçoca realmente brilha, pois ele foi projetado para observar e interagir com múltiplos participantes.

    Crie ou Escolha um Grupo: Você pode criar um novo grupo de teste com alguns amigos ou adicioná-lo a um grupo já existente.

    Adicione o Bot como um Participante: O processo é exatamente o mesmo que adicionar uma pessoa.

        Abra as informações do grupo.

        Clique em "Adicionar participantes".

        Procure pelo nome de contato que você salvou para o número do bot.

        Selecione-o e confirme.

        Nota: Dependendo das configurações de privacidade do grupo, talvez apenas administradores possam adicionar novos participantes.

### Parte 3: Interagindo com o Bot em um Grupo

Uma vez no grupo, o bot entra em modo de "observador social". Ele lê todas as mensagens para entender o contexto, as personalidades e os tópicos da conversa.

    Como "Ativar" o Bot: Na sua configuração atual, o bot pode responder a qualquer mensagem para a qual ele ache que tem uma resposta relevante. Para evitar que ele se torne "spammy", a melhor forma de interagir é mencionando o nome dele.

        Exemplo: @Paçoca, o que você acha da ideia do Daniel?

        Ao fazer isso, a IA recebe a mensagem com a menção e entende que está sendo chamada para participar. A resposta será muito mais direta e relevante.

    Peça Ações Específicas: É aqui que a diversão em grupo começa. Lembre-se que o bot pode fazer mais do que apenas enviar texto. Você pode "pedir" para ele usar suas outras ferramentas.

        @Paçoca, manda aquele meme "ai que burro" pra essa situação.

        Acho que isso merece uma figurinha. @Paçoca, reage aí.

        @Paçoca, cria uma enquete pra decidir onde vamos jantar hoje.

    Observe a Interação Social: O bot levará em conta quem disse o quê. Ele pode concordar com uma pessoa e zombar de outra na mesma resposta. O contextData que vimos no código, com o resumo da conversa e as opiniões sobre os usuários, é usado justamente para isso.

Dicas Avançadas e Boas Práticas

    Seja Específico nos Pedidos: Quanto mais claro for seu pedido, maior a chance de a IA entender e usar a ferramenta correta (meme, áudio, enquete, etc.).

    Use os Logs a seu Favor: Se você estiver perto do computador, use o comando docker logs -f pacoca-container. É como ter uma visão "dos bastidores". Você verá exatamente qual prompt foi montado, qual ação a IA decidiu tomar e o custo (zero, no nosso caso) da operação. Isso é ótimo para entender por que ele respondeu de uma certa maneira.

    Limpeza de Contexto: Se o bot ficar "preso" em um tópico ou começar a dar respostas estranhas, o contexto pode ter ficado confuso. A maneira mais fácil de "resetar" é removê-lo do grupo e adicioná-lo novamente.

# Catálogo de mídias

## Pastas de mídias:
- audios: para salvar audio mp3 curtos para uso durante as interações. Manter os nomes dos arquivos o mais detalhado possivel, exemplo: `zoando_os_palmerenses.mp3`
- memes: para salvar imagens de memes do tipo jpg. Manter os nomes dos arquivos o mais detalhado possivel, exemplo: `ai_que_burro_da_zero_pra_ele.jpg`
- stickers: pasta com os stickers webp para uso nos chats. Manter os nomes dos arquivos o mais detalhado possivel, exemplo: `bravo.webp`

## Incluindo arquivos novos ou excluindo arquivos antigos:

### Inclusão de arquivo:

Toda vez que incluirmos um arquivo novo devemos adicionar a sua informação de _file_ e _description_ no arquivo `model.json`, nas respectivas chaves `audios`, `memes` e `stickers` exemplo:
```
{
  "audios": [
    {
      "file": "boa-noite.mp3",
      "description": "Para desejar boa noite de forma amigável e engraçada."
    }, ...
   ], ...
}
```

 ### Exclusão de arquivo:

Toda vez que excluirmos um aquivo de mídia de sua respectiva pasta, tambem temos que escluir a sua informação de _file_ e _description_ no arquivo `model.json`, nas respectivas chaves `audios`, `memes` e `stickers`.

# Persistencia de sessão

A pasta `whatsapp_session` é responsável pela permanencia da sessão do whatsapp, o baileys verifica se a sessão ainda é válida, se sim ela à reaproveita a sessão existente, se não é válida, ele solicita a leitura de novo QR code para gerar nova sessão.