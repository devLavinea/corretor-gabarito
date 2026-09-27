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

A câmera está preparada para a leitura. O algoritmo de reconhecimento das bolhas ainda precisa ser calibrado de acordo com a folha de respostas definitiva. O sistema não usa QR Code.
