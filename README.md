# Quadro

**Download e uso gratuitos.** Qualquer pessoa pode baixar, instalar e usar este aplicativo sem pagar ao Dobs by Azura. Serviços externos, assinaturas e conteúdos de terceiros mantêm suas próprias condições.

[Baixar para Windows](https://github.com/Dobs7/quadro/releases/download/v1.0.1/Quadro-Instalador-1.0.1.exe) · [Ver a release e os arquivos](https://github.com/Dobs7/quadro/releases/tag/v1.0.1)

## Como foi feito
Desenvolvido com Electron e JavaScript, com o mpv como processo separado de reprodução. A interface se comunica com o motor por IPC para oferecer controles e ferramentas de revisão.

Player de vídeo e áudio para Windows, com ferramentas para revisar motion e animação. Contribuições por **Dobs by Azura**. A interface usa Electron; a reprodução usa mpv em processo separado.

## Baixar e usar
Baixe `Quadro-Instalador-1.0.1.exe` em **Releases**. Instale e abra o Quadro pelo atalho.

1. Abra um vídeo pelo botão da tela inicial ou arraste um arquivo para o player.
2. Use os controles para reproduzir, pausar, navegar, mudar velocidade e acompanhar a posição.
3. Consulte **F1** para os atalhos de revisão. Use guias de enquadramento, repetição de trechos e avanço de quadros conforme necessário.
4. **S** captura o quadro do vídeo e salva em Imagens/Quadro.
5. A opção de player padrão é voluntária e abre a configuração do Windows; a instalação não altera suas associações de arquivos automaticamente.

## Privacidade
O pacote começa sem arquivos recentes, posições de reprodução ou preferências do desenvolvedor. Histórico e configurações são criados localmente durante o uso. Esta distribuição usa a fonte do app.asar mais recente identificado, já sem as capturas temporárias de diagnóstico da área de trabalho. Capturar um quadro do vídeo continua sendo uma ação do usuário.

## Desenvolvimento
Electron 33.2.1. `npm install` e `npm start`; para desenvolver, disponibilize o motor em `../mpv/mpv.exe` ou informe `QUADRO_MPV`. O instalador NSIS usa o runtime em `../build/win-unpacked`. Build Windows x64 sem assinatura digital de editor.

## Créditos e licenças
Código próprio: licença MIT preservada. Electron/Chromium: respectivos créditos e licenças na distribuição. mpv: https://mpv.io — build v0.41.0-1293-g1140d3cc2, com FFmpeg N-128008-g19c06936f; mantenha os créditos, licenças e fontes correspondentes dos componentes ao redistribuir. Esta preparação não afirma autoria sobre o mpv ou o FFmpeg.
