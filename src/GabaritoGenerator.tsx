import { useMemo } from "react";
import { Download, FileImage, FileText, FileType } from "lucide-react";
import { jsPDF } from "jspdf";
import { Document, ImageRun, Packer, Paragraph } from "docx";

export type GabaritoAnswer = "A" | "B" | "C" | "D";

export const ALTERNATIVES: GabaritoAnswer[] = ["A", "B", "C", "D"];

/**
 * ============================================================
 * PADRÃO OFICIAL DO GABARITO / OMR
 * ============================================================
 *
 * O gerador do gabarito e o leitor OMR devem utilizar
 * exatamente estas mesmas coordenadas.
 */
export const OMR_TEMPLATE = {
  width: 1123,
  height: 380,

  marker: {
    size: 18,
    offset: 20,
  },

  left: {
    questionX: 155,
    bubbleStartX: 220,
  },

  right: {
    questionX: 665,
    bubbleStartX: 730,
  },

  bubble: {
    radius: 18,
    step: 68,
  },

  rows: {
    startY: 145,
    stepY: 45,
  },
} as const;

/**
 * Retorna a posição exata de uma bolha.
 */
export function getBubblePosition(question: number, answer: GabaritoAnswer) {
  if (question < 1 || question > 10) {
    throw new Error("A questão deve estar entre 1 e 10.");
  }

  const answerIndex = ALTERNATIVES.indexOf(answer);

  if (answerIndex === -1) {
    throw new Error("Alternativa inválida.");
  }

  const isRight = question >= 6;

  const row = isRight ? question - 6 : question - 1;

  const group = isRight ? OMR_TEMPLATE.right : OMR_TEMPLATE.left;

  return {
    x: group.bubbleStartX + answerIndex * OMR_TEMPLATE.bubble.step,
    y: OMR_TEMPLATE.rows.startY + row * OMR_TEMPLATE.rows.stepY,
  };
}

/**
 * ============================================================
 * SVG
 * ============================================================
 */
export function createGabaritoSvg() {
  const { width, height, marker, left, right, bubble, rows } = OMR_TEMPLATE;

  const markers = [
    [marker.offset, marker.offset],
    [width - marker.offset - marker.size, marker.offset],
    [marker.offset, height - marker.offset - marker.size],
    [width - marker.offset - marker.size, height - marker.offset - marker.size],
  ]
    .map(
      ([x, y]) =>
        `<rect
          x="${x}"
          y="${y}"
          width="${marker.size}"
          height="${marker.size}"
          rx="2"
          fill="#000"
        />`,
    )
    .join("");

  const createHeaders = (bubbleStartX: number) =>
    ALTERNATIVES.map(
      (letter, index) => `
        <text
          x="${bubbleStartX + index * bubble.step}"
          y="105"
          text-anchor="middle"
          class="alt"
        >
          ${letter}
        </text>
      `,
    ).join("");

  const createRows = (
    startQuestion: number,
    questionX: number,
    bubbleStartX: number,
  ) =>
    Array.from({ length: 5 }, (_, row) => {
      const question = startQuestion + row;

      const y = rows.startY + row * rows.stepY;

      const bubbles = ALTERNATIVES.map(
        (_, index) => `
          <circle
            cx="${bubbleStartX + index * bubble.step}"
            cy="${y}"
            r="${bubble.radius}"
            class="bubble"
          />
        `,
      ).join("");

      return `
        <text
          x="${questionX}"
          y="${y + 7}"
          text-anchor="middle"
          class="number"
        >
          ${String(question).padStart(2, "0")}
        </text>

        ${bubbles}
      `;
    }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>
  <rect
    x="0"
    y="0"
    width="${width}"
    height="${height}"
    fill="white"
  />

  <style>
    .title {
      font-family: Arial, sans-serif;
      font-size: 27px;
      font-weight: 700;
      letter-spacing: 3px;
      fill: #111;
    }

    .alt {
      font-family: Arial, sans-serif;
      font-size: 18px;
      font-weight: 700;
      fill: #111;
    }

    .number {
      font-family: Arial, sans-serif;
      font-size: 18px;
      font-weight: 700;
      fill: #111;
    }

    .bubble {
      fill: white;
      stroke: #111;
      stroke-width: 3;
    }

    .separator {
      stroke: #d5d5d5;
      stroke-width: 2;
      stroke-dasharray: 5 5;
    }
  </style>

  <!-- Marcadores técnicos OMR -->
  ${markers}

  <!-- Título -->
  <text
    x="${width / 2}"
    y="53"
    text-anchor="middle"
    class="title"
  >
    GABARITO
  </text>

  <!-- Cabeçalhos -->
  ${createHeaders(left.bubbleStartX)}
  ${createHeaders(right.bubbleStartX)}

  <!-- Separação dos dois blocos -->
  <line
    x1="560"
    y1="78"
    x2="560"
    y2="${height - 45}"
    class="separator"
  />

  <!-- Questões 01–05 -->
  ${createRows(1, left.questionX, left.bubbleStartX)}

  <!-- Questões 06–10 -->
  ${createRows(6, right.questionX, right.bubbleStartX)}

</svg>`;
}

/**
 * ============================================================
 * SVG → DATA URL
 * ============================================================
 */
function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * ============================================================
 * SVG → PNG
 * ============================================================
 */
async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const image = new Image();

  image.src = svgToDataUrl(svg);

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();

    image.onerror = () =>
      reject(new Error("Não foi possível gerar a imagem do gabarito."));
  });

  const canvas = document.createElement("canvas");

  canvas.width = OMR_TEMPLATE.width * scale;
  canvas.height = OMR_TEMPLATE.height * scale;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas indisponível.");
  }

  ctx.fillStyle = "white";

  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Falha ao gerar PNG."));
      }
    }, "image/png");
  });
}

/**
 * ============================================================
 * DOWNLOAD
 * ============================================================
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}

/**
 * ============================================================
 * PNG
 * ============================================================
 */
export async function downloadGabaritoPng() {
  const blob = await svgToPngBlob(createGabaritoSvg(), 2);

  downloadBlob(blob, "gabarito-marineide-horizontal.png");
}

/**
 * ============================================================
 * PDF
 * ============================================================
 */
export async function downloadGabaritoPdf() {
  const png = await svgToPngBlob(createGabaritoSvg(), 3);

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));

    reader.onerror = () => reject(new Error("Falha ao preparar PDF."));

    reader.readAsDataURL(png);
  });

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 297;
  const pageHeight = 210;

  const marginX = 10;

  const imageWidth = pageWidth - marginX * 2;

  const imageHeight = imageWidth * (OMR_TEMPLATE.height / OMR_TEMPLATE.width);

  const y = (pageHeight - imageHeight) / 2;

  pdf.addImage(
    data,
    "PNG",
    marginX,
    y,
    imageWidth,
    imageHeight,
    undefined,
    "FAST",
  );

  pdf.save("gabarito-marineide-horizontal.pdf");
}

/**
 * ============================================================
 * WORD
 * ============================================================
 */
export async function downloadGabaritoWord() {
  const png = await svgToPngBlob(createGabaritoSvg(), 2);

  const bytes = new Uint8Array(await png.arrayBuffer());

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 16838,
              height: 11906,
            },

            margin: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            },
          },
        },

        children: [
          new Paragraph({
            children: [
              new ImageRun({
                data: bytes,

                transformation: {
                  width: 842,

                  height: Math.round(
                    842 * (OMR_TEMPLATE.height / OMR_TEMPLATE.width),
                  ),
                },

                type: "png",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(document);

  downloadBlob(blob, "gabarito-marineide-horizontal.docx");
}

/**
 * ============================================================
 * COMPONENTE
 * ============================================================
 */
export default function GabaritoGenerator() {
  const preview = useMemo(() => svgToDataUrl(createGabaritoSvg()), []);

  return (
    <div className="rounded-3xl bg-slate-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">MODELO OMR</p>

          <h3 className="mt-1 text-xl font-black">Gabarito horizontal</h3>

          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            Faixa horizontal para ser colocada na parte inferior da prova. São
            10 questões, com alternativas A–D, sendo 01–05 no bloco esquerdo e
            06–10 no bloco direito.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void downloadGabaritoPng()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <FileImage size={16} />
            PNG
          </button>

          <button
            type="button"
            onClick={() => void downloadGabaritoPdf()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <FileText size={16} />
            PDF
          </button>

          <button
            type="button"
            onClick={() => void downloadGabaritoWord()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <FileType size={16} />
            Word
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-auto rounded-2xl bg-white p-4">
        <img
          src={preview}
          alt="Modelo horizontal do gabarito OMR"
          className="mx-auto block w-full"
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Download size={14} />
        Imprima em escala 100%, sem "ajustar à página", para preservar as
        posições utilizadas pelo leitor OMR.
      </div>
    </div>
  );
}
