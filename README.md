# WEB HERO — Mundo SENAI

Jogo de tiro ao alvo com tema aracnídeo, controlado por um disparador de pulso
(**ESP32 + MPU6050**) ligado ao navegador por USB (Web Serial). Só HTML, CSS e JavaScript:
não há servidor nem banco de dados. O ranking é gravado em um **arquivo JSON**.

## Como executar
1. Abra a pasta no VS Code e execute `index.html` com a extensão **Live Server**
   (a Web Serial só funciona em `localhost`/`https`, em **Chrome ou Edge**).
2. Conecte o ESP32 por USB e clique em **CONECTAR DISPARADOR**.
3. Calibre (braço parado, controle no pulso) e jogue.
4. No final da partida, digite o codinome para entrar no ranking.

**Sem o controle?** Clique em **JOGAR SEM CONTROLE (DEMO)** ou abra `?demo`: a mira segue o
mouse/toque e o clique dispara. Use como plano B no evento.

## Ranking em arquivo JSON
1. Na tela **Ranking**, clique em **VINCULAR ARQUIVO JSON** (ou no painel do operador, tecla `O`)
   e escolha onde salvar, por exemplo `ranking-webhero.json`. Só precisa fazer isso **uma vez** por computador.
2. A partir daí, **cada pontuação salva reescreve o arquivo**. Ele pode ser aberto em qualquer editor.
3. Se abrir o jogo de novo, o navegador lembra do arquivo. Ele pode pedir autorização de novo:
   clique em **AUTORIZAR ARQUIVO** (ou apenas aceite o aviso do navegador no primeiro clique).
4. O ranking também fica copiado no navegador, então nada se perde se o arquivo ainda não foi vinculado.
   A tela de ranking sempre mostra onde ele está sendo gravado.

Formato do arquivo:
```json
{
  "version": 1,
  "app": "web-hero",
  "updatedAt": "2026-11-05T00:50:00.000Z",
  "entries": [
    { "id": "...", "name": "Ana", "character": "Spider-Gwen", "score": 500,
      "accuracy": 80, "maxCombo": 7, "date": "05/11/2026", "createdAt": "2026-11-05T00:49:59.000Z" }
  ]
}
```
- Vincular um arquivo que já tem ranking **junta** os dois (sem duplicar). Isso permite levar o arquivo de um computador para outro.
- Se o arquivo escolhido não for um ranking válido, o jogo pergunta antes de sobrescrevê-lo.
- **EXPORTAR CSV** abre no Excel; **BACKUP JSON** baixa uma cópia (funciona em qualquer navegador).
- Arquivos `ranking*.json` estão no `.gitignore`, porque têm nomes de pessoas.

> A gravação em arquivo usa a *File System Access API*, disponível no Chrome e no Edge
> (os mesmos navegadores que a Web Serial já exige).

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
| `O` | Painel do operador (senha em `OPERATOR_PIN`, `js/main.js`, padrão `2025`): recalibrar, sensibilidade, pular fase, encerrar, ranking |

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
index.html          páginas e painel do operador
style.css           visual
js/utils.js         utilidades (toast, storage, download)
js/audio.js         efeitos sonoros (Web Audio)
js/ranking.js       ranking: arquivo JSON (File System Access) + cópia no navegador
js/game.js          regras do jogo, fases, alvos, combo, chefe, efeitos
js/calibration-ui.js  tela de calibração e contagem regressiva
js/controller.js    Web Serial, protocolo do ESP32 e modo demo
js/main.js          ligação da interface, atalhos, operador, modo atração
esp32/              firmware
```
O protocolo serial está documentado no topo de `js/controller.js`.

## Checklist para o evento
- [ ] Testar no computador do evento (Chrome/Edge) com a mesma porta USB.
- [ ] Na tela Ranking, **vincular o arquivo JSON** e conferir a mensagem "Ranking gravado no arquivo ...".
- [ ] Fontes: o jogo carrega *Press Start 2P* e *Pixelify Sans* do Google Fonts.
      **Sem internet** usa fontes alternativas (funciona, mas o visual muda).
- [ ] Ter um ESP32 reserva já gravado, cabo extra e o modo demo (`?demo`) como plano B.
- [ ] Ao final do dia, copiar o arquivo JSON e exportar o CSV.
