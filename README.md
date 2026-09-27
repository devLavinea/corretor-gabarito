# Corretor de Gabaritos

PWA inicial para professores corrigirem provas de 10 questões.

## Incluído nesta versão
- React + TypeScript + Vite
- Tailwind CSS
- Layout responsivo para celular/computador
- Cadastro de avaliação e gabarito oficial (10 questões, A-E)
- Leitor de QR Code pela câmera usando `html5-qrcode`
- Registro de correção de teste
- Cálculo da nota em escala 0–10
- Exportação dos resultados para Excel com `xlsx`
- Manifest PWA básico

## Próxima implementação: OMR
O fluxo de leitura do papel deve ser desenvolvido como OMR (Optical Mark Recognition): detectar o contorno/alinhamento da folha, localizar as 50 bolhas (10 x 5), medir o preenchimento de cada bolha, identificar marcações duplas/ausentes e pedir confirmação quando houver baixa confiança.

## Instalação
```bash
npm install
npm run dev
```

Para build:
```bash
npm run build
```

> A câmera exige HTTPS em produção (ou localhost durante desenvolvimento).
