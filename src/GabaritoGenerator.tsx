import { useMemo } from "react";
import { Download, FileImage, FileText, FileType } from "lucide-react";
import { jsPDF } from "jspdf";
import { Document, ImageRun, Packer, Paragraph } from "docx";

export type GabaritoAnswer = "A" | "B" | "C" | "D";

const WIDTH = 1123;
const HEIGHT = 794;

export function createGabaritoSvg() {
  const alternatives: GabaritoAnswer[] = ["A", "B", "C", "D"];
  const leftX = 150;
  const rightX = 500;
  const bubbleStep = 62;
  const rowStart = 330;
  const rowStep = 125;

  const markers = [
    [24, 24],
    [WIDTH - 42, 24],
    [24, HEIGHT - 42],
    [WIDTH - 42, HEIGHT - 42],
  ]
    .map(
      ([x, y]) =>
        `<rect x="${x}" y="${y}" width="18" height="18" fill="#000"/>`,
    )
    .join("");

  const header = alternatives
    .map(
      (letter, i) =>
        `<text x="${leftX + 36 + i * bubbleStep}" y="275" text-anchor="middle" class="alt">${letter}</text>`,
    )
    .join("");
  const headerRight = alternatives
    .map(
      (letter, i) =>
        `<text x="${rightX + 36 + i * bubbleStep}" y="275" text-anchor="middle" class="alt">${letter}</text>`,
    )
    .join("");

  const rows = (start: number, x: number) =>
    Array.from({ length: 5 }, (_, row) => {
      const number = start + row;
      const y = rowStart + row * rowStep;
      const bubbles = alternatives
        .map(
          (_, i) =>
            `<circle cx="${x + 36 + i * bubbleStep}" cy="${y}" r="20" class="bubble"/>`,
        )
        .join("");
      return `<text x="${x - 18}" y="${y + 7}" text-anchor="end" class="number">${String(number).padStart(2, "0")}</text>${bubbles}`;
    }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>
  <style>
    .title{font:700 34px Arial,sans-serif;letter-spacing:2px;fill:#111}
    .alt{font:700 18px Arial,sans-serif;fill:#111}
    .number{font:700 18px Arial,sans-serif;fill:#111}
    .bubble{fill:white;stroke:#111;stroke-width:3}
  </style>
  ${markers}
  <text x="${WIDTH / 2}" y="145" text-anchor="middle" class="title">GABARITO</text>
  ${header}${headerRight}
  ${rows(1, leftX)}
  ${rows(6, rightX)}
</svg>`;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function svgToPngBlob(svg: string, scale = 2) {
  const image = new Image();
  image.src = svgToDataUrl(svg);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Não foi possível gerar a imagem do gabarito."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG.")),
      "image/png",
    ),
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadGabaritoPng() {
  downloadBlob(
    await svgToPngBlob(createGabaritoSvg(), 2),
    "gabarito-marineide.png",
  );
}

export async function downloadGabaritoPdf() {
  const png = await svgToPngBlob(createGabaritoSvg(), 3);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao preparar PDF."));
    reader.readAsDataURL(png);
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(data, "PNG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save("gabarito-marineide.pdf");
}

export async function downloadGabaritoWord() {
  const png = await svgToPngBlob(createGabaritoSvg(), 2);
  const bytes = new Uint8Array(await png.arrayBuffer());
  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                data: bytes,
                transformation: { width: 595, height: 842 },
                type: "png",
              }),
            ],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  downloadBlob(blob, "gabarito-marineide.docx");
}

export default function GabaritoGenerator() {
  const preview = useMemo(() => svgToDataUrl(createGabaritoSvg()), []);
  return (
    <div className="rounded-3xl border bg-slate-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">FOLHA PADRONIZADA</p>
          <h3 className="mt-1 text-xl font-black">Gabarito A4</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            10 questões, alternativas A–D, cinco questões de cada lado e
            marcadores técnicos para facilitar a leitura automática da foto.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            onClick={() => void downloadGabaritoPng()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200"
          >
            <FileImage size={16} />
            PNG
          </button>
          <button
            onClick={() => void downloadGabaritoPdf()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white"
          >
            <FileText size={16} />
            PDF
          </button>
          <button
            onClick={() => void downloadGabaritoWord()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200"
          >
            <FileType size={16} />
            Word
          </button>
        </div>
      </div>
      <div className="mt-5 overflow-auto rounded-2xl border bg-white p-3">
        <img
          src={preview}
          alt="Modelo da folha de gabarito"
          className="mx-auto block w-full max-w-[520px]"
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Download size={14} /> Imprima em A4, preferencialmente em escala 100%,
        sem ajustar à página.
      </div>
    </div>
  );
}
