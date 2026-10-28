# Gincana Digital

Provas de teclado e mouse para jogar com a turma, direto no navegador. Até **30 alunos por sala**, em **3 salas** ao mesmo tempo. Todos jogam a mesma prova durante um tempo fixo (2 minutos), cada um no seu ritmo, e quem fizer mais pontos vence.

Feito para o laboratório de informática da escola pública: roda em computador com **mouse e teclado** (não é pensado para celular), não precisa instalar nada nos computadores dos alunos, não tem login e funciona em qualquer navegador atual.

## As provas

| Prova | O que o aluno faz | Pontos |
|---|---|---|
| **Corrida das Letras** (teclado) | Digita a palavra que aparece. As letras certas ficam marcadas e as erradas, vermelhas. São 207 palavras, 121 com acento ou ç. | +1 por palavra. Pular a palavra (botão ou **Esc**) custa −1. |
| **Caça às Letras** (mouse) | Clica nas letras antes que elas sumam. Um anel em volta mostra o tempo restante. As letras ficam menores e mais rápidas. | +1 por letra. Letra perdida ou clique no lugar errado só fazem um som. |
| **Leva o Lápis** (mouse) | Arrasta o lápis da largada até a bandeira sem encostar em borrões de tinta, borrachas que deslizam e réguas que giram. Os percursos ficam mais difíceis, e a partir do 4º há um **ponto seguro** no meio do caminho. | +1 por percurso. Encostar faz o lápis voltar ao ponto seguro. Pular o percurso custa −1. |
| **Estoura Balões** (mouse) | Balões sobem pela tela e cada cor pede um clique diferente: **vermelho** com 1 clique, **amarelo** com 2 cliques rápidos (o 1º clique segura o balão parado por 0,6 s esperando o 2º) e **verde** com o botão direito. Os 3 primeiros ensinam um de cada, depois os balões ficam menores e mais rápidos. | +1 por balão. Clique do tipo errado não estoura, e balão que foge só faz um som. |
| **Monta Palavra** (mouse) | Arrasta as sílabas para os espaços e forma a palavra (MA + RA + CU + JÁ). Sobram 2 sílabas de outras palavras para confundir. São 70 palavras. | +1 por palavra. Sílaba errada volta para o lugar. Pular a palavra custa −1. |

Para ser justo, **todos da sala recebem as mesmas palavras, letras, percursos e balões, na mesma ordem**.

## Como jogar

1. Abra o link do jogo, digite seu nome e **escolha a prova** nos cartões.
2. **Escolha a sala** (Azul, Verde ou Roxa). Numa sala vazia, vale a prova que você escolheu. Numa sala com gente, vale a prova da turma. Só o **dono da sala** (quem entrou primeiro) pode trocar a prova lá dentro, antes de começar; se ele sair, o próximo da fila vira o dono.
3. Todos clicam em **"Estou pronto!"**. A partida começa sozinha quando **todos** estão prontos, com uma contagem 3, 2, 1.
4. No fim aparece um **pódio** com os 3 primeiros, e cada aluno vê a própria colocação.

Outras regras:

- O botão **Sair da sala**, no alto da tela, volta para a tela inicial.
- Uma sala com partida em andamento fica **bloqueada** para quem chega. Se todos saírem, ela destrava na hora.
- Um computador que "dorme" ou perde o Wi-Fi sem avisar sai da sala em até 1 minuto, para não travar o "todos prontos".
- Se a internet cair ou alguém apertar F5, a página **reconecta sozinha** e o aluno volta para a mesma partida, com os mesmos pontos.
- Nomes repetidos ganham um número ("Maria", "Maria 2").
- Há trilha sonora e efeitos sonoros, todos gerados pelo navegador, sem arquivos de áudio. Os botões **Música** e **Efeitos** ligam e desligam cada um.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Alunos na mesma rede Wi-Fi podem entrar por `http://SEU-IP:3000`; o IP aparece no comando `ipconfig`.

## Testes

```bash
npm test
```

Os testes cobrem:

- a lista de palavras;
- quais arquivos o servidor entrega;
- as regras de cada prova: tempo, pontos, pular e anti-trapaça;
- que todo percurso do Leva o Lápis tem saída e que a largada, o ponto seguro e a chegada nunca são atingidos;
- reconexão, nomes repetidos e salas isoladas;
- que mensagens inválidas não derrubam o servidor;
- que um aluno mandando mensagens demais não deixa as salas lentas;
- que uma conexão "morta" é derrubada e destrava a sala;
- que o código da página (`public/app.js`) não tem erro de sintaxe.

## Configuração

Variáveis de ambiente, todas opcionais:

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3000` | Porta do servidor (o Render define sozinho) |
| `DURATION_MS` | `120000` | Duração da partida em milissegundos (120000 = 2 minutos) |
| `COUNTDOWN_MS` | `3000` | Contagem "3, 2, 1" antes de começar |
| `HEARTBEAT_MS` | `30000` | De quanto em quanto tempo o servidor confere se cada computador ainda está conectado |

O texto da tela inicial lê a duração do servidor, então ele muda junto.

## Publicar no Render

1. No [Render](https://render.com), crie um **Web Service** ligado a este repositório do GitHub.
2. Use **Build Command** `npm install`, **Start Command** `npm start` e o plano **Free**.
3. Cada `git push` na branch `main` atualiza o jogo sozinho.

Cuidados:

- No plano grátis, o servidor "dorme" depois de cerca de 15 minutos sem uso. O primeiro acesso depois disso demora uns 30 segundos, então abra o link um pouco antes da aula.
- Cada atualização reinicia o servidor e **zera as partidas em andamento**. Não publique durante a aula.

## Estrutura

```
server.js          entrega os arquivos de public/ e liga cada aluno ao jogo (WebSocket)
game.js            regras: salas, prontos, tempo, pontos, reconexão e as provas
words.js           lista de palavras da Corrida das Letras
syllables.js       palavras separadas em sílabas do Monta Palavra
public/
  index.html       estrutura da tela e ícones
  style.css        visual de caderno
  app.js           lógica do navegador: digitação, cliques, arrastar, som e placar
  favicon.svg      ícone da aba do navegador
test/game.test.js  testes automáticos (npm test)
```

- **Para mudar as palavras**, edite `words.js` (em minúsculas, com acento). O `npm test` avisa se houver palavra repetida.
- **Para mudar as palavras do Monta Palavra**, edite `syllables.js` (sílabas separadas por hífen, ex.: `ca-va-lo`). O `npm test` confere o formato, mas a separação das sílabas é responsabilidade de quem edita.
- **Para criar uma prova nova**, siga estes passos:
  1. Em `game.js`, adicione em `MODES` a função que gera a lista de desafios.
  2. Ainda em `game.js`, trate o envio em `sendChallenge` e as mensagens da prova em `message`.
  3. Em `public/app.js`, adicione a prova em `PROVAS` (nome, ícone e explicação) e a parte que desenha a prova na tela.

O servidor sempre confere cada ponto. O navegador só mostra e envia as ações do aluno.

## Créditos

- Ícones: [Phosphor Icons](https://phosphoricons.com), licença MIT. Os desenhos ficam dentro de `public/index.html` e `public/favicon.svg`, sem carregar nada de fora.
- Fontes: [Lilita One](https://fonts.google.com/specimen/Lilita+One) e [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible), pelo Google Fonts.
