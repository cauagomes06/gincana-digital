// Palavras do jogo. Para mudar, edite esta lista: uma palavra por item, em minusculas, com acento.
// O teste (npm test) avisa se houver palavra repetida ou com letra maiuscula.
module.exports = [
  // sem acento
  'abacaxi', 'teclado', 'janela', 'computador', 'girassol', 'borboleta', 'montanha', 'chocolate',
  'elefante', 'bicicleta', 'guarda-chuva', 'travesseiro', 'cachoeira', 'dinossauro', 'futebol',
  'tartaruga', 'esqueleto', 'astronauta', 'biblioteca', 'pipoca', 'sorvete', 'labirinto', 'foguete',
  'internet', 'programa', 'velocidade', 'campeonato', 'espelho', 'galinha', 'mochila', 'piscina',
  'xadrez', 'zebra', 'escola', 'caderno', 'professor', 'mercado', 'cidade', 'floresta', 'girafa',
  'cavalo', 'macaco', 'tomate', 'banana', 'laranja', 'morango', 'cenoura', 'brigadeiro', 'quadro',
  'aventura', 'amizade', 'planeta', 'universo', 'tesoura', 'apontador', 'estojo', 'recreio',
  'merenda', 'uniforme', 'formiga', 'coruja', 'baleia', 'pinguim', 'canguru', 'tigre',
  'leopardo', 'chuveiro', 'geladeira', 'bandeira', 'capoeira', 'samba', 'carnaval', 'pandeiro',
  // com acento
  'paralelepípedo', 'helicóptero', 'relâmpago', 'trovão', 'caminhão', 'abóbora', 'jacaré', 'avião',
  'pão', 'mamãe', 'irmão', 'coração', 'canção', 'educação', 'atenção', 'informação', 'eleição',
  'feijão', 'limão', 'melão', 'mamão', 'violão', 'balão', 'leão', 'gavião', 'tubarão', 'botão',
  'café', 'sofá', 'maracujá', 'picolé', 'chapéu', 'céu', 'pé', 'boné', 'jacarandá', 'tatu-bola',
  'música', 'matemática', 'geografia', 'história', 'ciências', 'português', 'inglês', 'física',
  'química', 'gramática', 'lâmpada', 'pássaro', 'árvore', 'água', 'óculos', 'ônibus', 'fósforo',
  'xícara', 'príncipe', 'médico', 'técnico', 'público', 'número', 'último', 'próximo', 'rápido',
  'difícil', 'fácil', 'útil', 'possível', 'incrível', 'automóvel', 'túnel', 'açúcar', 'açaí',
  'pêssego', 'você', 'avô', 'avó', 'robô', 'metrô', 'três', 'mês', 'vulcão', 'fogão',
  'criança', 'caçador', 'abraço', 'palhaço', 'cabeça', 'bagunça', 'praça', 'onça', 'maçã', 'sabiá',
  'paçoca', 'pescoço', 'almoço', 'calçada', 'louça', 'açougue', 'lápis', 'régua', 'borracha',
  'mágico', 'pólen', 'herói', 'anéis', 'papéis', 'chapéus', 'heróis', 'país', 'saúde', 'baú',
  'juíza', 'egoísta', 'ninguém', 'também', 'parabéns', 'armazém', 'refém', 'trânsito', 'sábado',
  'segunda-feira', 'guarda-roupa', 'beija-flor', 'arco-íris', 'bem-te-vi', 'cachorro-quente',
  'jabuticaba', 'tapioca', 'mandioca', 'caju', 'domingo', 'dicionário', 'calendário', 'aniversário',
].map((w) => w.normalize('NFC'));
