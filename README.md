# Corretor de Gabaritos

PWA para professores cadastrarem turmas e alunos, criarem avaliações de 10 questões e corrigirem gabaritos por leitura OMR.

## Incluído nesta versão

- React + TypeScript + Vite
- Tailwind CSS
- Layout responsivo para celular e computador
- Cadastro de turmas e alunos
- Criação de avaliações com gabarito oficial
- Folha de gabarito em A4 com 10 questões e alternativas A-D
- Leitura OMR pela câmera do dispositivo
- Revisão das respostas identificadas antes da confirmação
- Cálculo e armazenamento dos resultados no Firebase
- Cadastro manual de notas (Atv1, Atv2 e Atv3)
- Exportação das notas e resultados para Excel
- Manifest PWA básico

## Leitura OMR

O leitor usa os quatro marcadores técnicos da folha para alinhar a imagem e analisa o preenchimento das bolhas por contraste local. Leituras ambíguas ficam bloqueadas para revisão antes de salvar.

A folha oficial possui:

- 10 questões;
- alternativas A, B, C e D;
- questões 01 a 05 no bloco esquerdo;
- questões 06 a 10 no bloco direito;
- marcadores técnicos nos quatro cantos.

## Instalação

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

A câmera exige HTTPS em produção ou `localhost` durante o desenvolvimento.
