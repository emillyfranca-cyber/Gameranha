# WEB HERO — Mundo SENAI (v6)

Jogo de tiro ao alvo com tema aracnídeo, controlado por um disparador de pulso
(**ESP32 + MPU6050**) ligado ao navegador por USB (Web Serial).

## Como executar
1. Abra a pasta no VS Code e execute `index.html` com a extensão **Live Server**
   (a Web Serial só funciona em `localhost`/`https`, em **Chrome ou Edge**).
2. Conecte o ESP32 por USB e clique em **CONECTAR DISPARADOR**.
3. Calibre (braço parado) e jogue.

**Sem o controle?** Clique em **JOGAR SEM CONTROLE (DEMO)** ou abra `index.html?demo`:
a mira segue o mouse/toque e o clique dispara. Use como plano B no evento.

## Recursos do jogo
- 3 fases de 30 s, 3 dificuldades (fácil, normal, difícil).
- **Combo** (x2 com 5 acertos, x3 com 10, x4 com 15) e pontos flutuantes.
- Alvos: bandido (10), dourado (50), relógio (+3 s), **civil** (−30 e zera o combo) e **chefe** na fase 3.
- Sons gerados no navegador, tremor de tela, partículas, barra de tempo.
- Tela final com precisão, melhor combo e posição no ranking; volta sozinha ao início.
- Ranking local com **exportar CSV / backup JSON** e **modo telão**.
- **Modo atração:** com a tela parada por 60 s, mostra o ranking em tela cheia.
- Reconexão automática do controle USB.

## Atalhos
| Tecla | Ação |
|---|---|
| `Espaço` | Disparar (teste, durante a partida) |
| `C` | Centralizar a mira |
| `M` | Ligar/desligar o som |
| `F` | Tela cheia |
| `O` | Painel do operador (senha em `OPERATOR_PIN`, em `js/main.js`; padrão `2025`) |

O painel do operador permite recalibrar, centralizar, ajustar a **sensibilidade**,
pular fase, encerrar a partida e exportar o ranking.

## Hardware
| Peça | Pino do ESP32 | Observação |
|---|---|---|
| MPU6050 SDA / SCL | GPIO 23 / GPIO 22 | 3V3 e GND |
| Buzzer passivo | GPIO 19 | |
| **Botão de disparo** | GPIO 18 → GND | pull-up interno; opcional |
| **Motor de vibração** | GPIO 5 | via transistor NPN + resistor 1 kΩ + diodo; opcional |
| LED de status | GPIO 2 | LED da própria placa |

LED: aceso = pronto · pisca lento = precisa calibrar · pisca médio = calibrando · pisca rápido = erro.
Com o controle sem calibrar, **segurar o botão por 1 s** inicia a calibração.
Sem botão ligado, o disparo funciona por movimento brusco do pulso (a mira é
congelada na posição de ~150 ms antes do tiro). Ao apertar o botão pela primeira vez,
esse modo é desativado automaticamente.

### Gravar o firmware
Arduino IDE → placa **ESP32 Dev Module** → abra `esp32/Gameranha_ESP32/Gameranha_ESP32.ino` → Upload.
O firmware se identifica com `HELLO:FW2`; o site avisa se a versão estiver desatualizada.

## Estrutura do projeto
```
index.html          páginas e painel do operador
style.css           visual
js/utils.js         utilidades (toast, storage, download)
js/audio.js         efeitos sonoros (Web Audio)
js/ranking.js       ranking local e exportação
js/game.js          regras do jogo, alvos, combo, chefe, efeitos
js/calibration-ui.js  tela de calibração e contagem regressiva
js/controller.js    Web Serial, protocolo do ESP32 e modo demo
js/main.js          ligação da interface, atalhos, operador, modo atração
esp32/              firmware
```
O protocolo serial está documentado no topo de `js/controller.js`.

## Checklist para o evento
- [ ] Testar no computador do evento (Chrome/Edge) com a mesma porta USB.
- [ ] Fontes: o jogo carrega *Press Start 2P* e *Pixelify Sans* do Google Fonts.
      **Sem internet** usa fontes alternativas (funciona, mas o visual muda).
- [ ] Ter um ESP32 reserva já gravado, cabo extra e o modo demo (`?demo`) como plano B.
- [ ] Exportar o ranking (CSV) ao final do dia.
