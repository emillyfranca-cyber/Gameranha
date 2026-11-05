# WEB HERO — Mundo SENAI

Jogo de tiro ao alvo com tema aracnídeo, controlado por um disparador de pulso
(**ESP32 + MPU6050**) ligado ao navegador por USB (Web Serial). O ranking é salvo
em um banco **SQLite**.

## Como executar
Precisa do **Node.js 22.13 ou mais novo** (o SQLite já vem dentro do Node; não há `npm install`).

```bash
node server.js
```

Abra **http://localhost:3333** no **Chrome ou Edge** (a Web Serial só funciona em `localhost`/`https`).

1. Conecte o ESP32 por USB e clique em **CONECTAR DISPARADOR**.
2. Calibre (braço parado, controle no pulso) e jogue.
3. No final da partida, digite o codinome para entrar no ranking.

O banco fica em `data/ranking.db` (não vai para o Git). Faça backup copiando esse arquivo
ou pelo botão **EXPORTAR CSV** da tela de ranking.

Opções do servidor (variáveis de ambiente):
| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3333` | porta do site |
| `HOST` | `127.0.0.1` | use `0.0.0.0` para abrir o ranking em outro aparelho da rede (ex.: telão) |
| `OPERATOR_PIN` | `2025` | senha para apagar o ranking (o painel do operador usa `OPERATOR_PIN` em `js/main.js`; mantenha os dois iguais) |
| `DB_PATH` | `data/ranking.db` | local do banco |

**Sem o servidor?** O site também abre pelo Live Server/`index.html`, mas o ranking passa a ser
salvo só no navegador (a tela de ranking avisa). Para usar o servidor de ranking a partir de outra
origem: `index.html?api=http://IP:3333`.

**Sem o controle?** Clique em **JOGAR SEM CONTROLE (DEMO)** ou abra `?demo`: a mira segue o
mouse/toque e o clique dispara. Use como plano B no evento.

## Como o jogo funciona
- 3 fases de 30 s. **O jogo sempre começa fácil e a dificuldade sobe a cada fase** (FÁCIL → MÉDIO → DIFÍCIL):
  alvos mais rápidos, mais curtos, em maior número e com área de acerto menor.
- O **disparo só acontece ao apertar o botão do controle.** Mexer a mão não atira.
- **Combo** (x2 com 5 acertos, x3 com 10, x4 com 15).
- Alvos: bandido (10), dourado (50), relógio (+3 s), **civil** (−30 e zera o combo) e **chefe** na fase 3.
- O **codinome é pedido só no final**, na tela de resultado (precisão, melhor combo e posição no ranking).
  Sem salvar, volta sozinho ao início em 60 s.
- Modo atração: com a tela parada por 60 s, mostra o ranking em tela cheia.

## Atalhos
| Tecla | Ação |
|---|---|
| `Espaço` | Disparar (**só no modo demo**) |
| `C` | Centralizar a mira |
| `M` | Ligar/desligar o som |
| `F` | Tela cheia |
| `O` | Painel do operador (recalibrar, sensibilidade, pular fase, encerrar, exportar) |

## Hardware
| Peça | Pino do ESP32 | Observação |
|---|---|---|
| MPU6050 SDA / SCL | GPIO 23 / GPIO 22 | 3V3, GND e AD0 no GND |
| Buzzer passivo | GPIO 19 | |
| **Botão de disparo** | GPIO 18 → GND | pull-up interno; **obrigatório para atirar** |
| Motor de vibração | GPIO 5 | via transistor NPN + resistor 1 kΩ + diodo; opcional |
| LED de status | GPIO 2 | LED da própria placa |

LED: aceso = pronto · pisca lento = precisa calibrar · pisca médio = calibrando · pisca rápido = erro.
Com o controle sem calibrar, **segurar o botão por 1 s** inicia a calibração.

A mira usa **girar/inclinar o pulso** (roll e pitch, que não derivam). Apontar o braço para os lados
não move a mira, pois o MPU6050 não tem bússola.

### Gravar o firmware
Arduino IDE → placa **ESP32 Dev Module** → abra `esp32/Gameranha_ESP32/Gameranha_ESP32.ino` → Upload.
O firmware se identifica com `HELLO:FW3`; o site avisa se a versão estiver desatualizada.

## Estrutura do projeto
```
server.js           servidor (site + API do ranking em SQLite)
index.html          páginas e painel do operador
style.css           visual
js/utils.js         utilidades (toast, storage, download)
js/audio.js         efeitos sonoros (Web Audio)
js/ranking.js       ranking (API SQLite com reserva no navegador) e exportação
js/game.js          regras do jogo, fases, alvos, combo, chefe, efeitos
js/calibration-ui.js  tela de calibração e contagem regressiva
js/controller.js    Web Serial, protocolo do ESP32 e modo demo
js/main.js          ligação da interface, atalhos, operador, modo atração
esp32/              firmware
```
O protocolo serial está documentado no topo de `js/controller.js`.

### API do ranking
| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/ranking?limit=30` | lista, da maior para a menor pontuação |
| `POST` | `/api/ranking` | salva `{name, character, score, accuracy, maxCombo}` e devolve a posição |
| `DELETE` | `/api/ranking` | apaga tudo (cabeçalho `X-Operator-Pin`) |

## Checklist para o evento
- [ ] Testar no computador do evento (Chrome/Edge) com a mesma porta USB.
- [ ] Iniciar com `node server.js` e conferir que o ranking diz "salvo no banco de dados (SQLite)".
- [ ] Fontes: o jogo carrega *Press Start 2P* e *Pixelify Sans* do Google Fonts.
      **Sem internet** usa fontes alternativas (funciona, mas o visual muda).
- [ ] Ter um ESP32 reserva já gravado, cabo extra e o modo demo (`?demo`) como plano B.
- [ ] Exportar o ranking (CSV) ao final do dia.
