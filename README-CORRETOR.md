# Corretor Marineide

Sistema personalizado e exclusivo para a professora Marineide.

## Fluxo

1. Marineide cadastra os alunos na aba **Alunos**.
2. Pode pesquisar ou retirar alunos.
3. Cria uma nova avaliação.
4. Seleciona a turma.
5. Seleciona o aluno.
6. Abre a câmera para o gabarito.
7. O resultado é salvo no Firebase.
8. Os resultados podem ser exportados para Excel.

## Instalação

No Windows, execute `INSTALAR-E-RODAR.bat` ou rode:

```bash
npm install
npm run dev
```

## Firebase

Configure `src/firebase.ts` e ative o login anônimo. Veja `FIREBASE-CONFIGURACAO.md`.

## OMR

A câmera faz a leitura OMR da folha padronizada de 10 questões. O sistema não usa QR Code.

## Leitura OMR — melhorias de precisão

A versão atual do leitor usa uma estratégia mais robusta para fotografias reais:

- detecção adaptativa dos quatro marcadores, usando contraste local em vez de depender somente de um nível absoluto de preto;
- leitura das bolhas por contraste em relação ao fundo imediatamente ao redor da própria bolha;
- análise em núcleo, corpo e coroa externa da bolha;
- tolerância para preenchimento incompleto e para tinta que ultrapasse um pouco a borda;
- comparação entre as quatro alternativas da mesma questão;
- tratamento conservador de duas marcações fortes ou de leitura ambígua;
- questões sem confiança suficiente não são transformadas automaticamente em uma resposta válida;
- confirmação final é bloqueada quando existe alguma questão duvidosa.

Isso reduz bastante a dependência da iluminação do ambiente. Nenhum sistema baseado em fotografia pode garantir matematicamente 100% em qualquer imagem (por exemplo, desfoque extremo, marcador oculto ou ausência de informação), por isso o sistema prefere pedir nova leitura em situações realmente ambíguas em vez de inventar uma resposta.
