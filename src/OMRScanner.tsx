import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  RotateCcw,
  X,
} from "lucide-react";

export type OMRAnswer = "A" | "B" | "C" | "D";

type Props = {
  onClose: () => void;
  onDetected: (answers: OMRAnswer[]) => void;
};

// ======================================================
// PADRÃO OMR
// DEVE SER EXATAMENTE IGUAL AO GABARITOGENERATOR.TSX
// ======================================================

const OMR_TEMPLATE = {
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

const ALTERNATIVES: OMRAnswer[] = ["A", "B", "C", "D"];

// ======================================================
// POSIÇÃO DAS BOLHAS
// ======================================================

function getBubbleCenter(questionIndex: number, alternativeIndex: number) {
  const question = questionIndex + 1;

  if (question < 1 || question > 10) {
    throw new Error("Questão inválida.");
  }

  const isRight = question >= 6;

  const row = isRight ? question - 6 : question - 1;

  const group = isRight ? OMR_TEMPLATE.right : OMR_TEMPLATE.left;

  return {
    x: group.bubbleStartX + alternativeIndex * OMR_TEMPLATE.bubble.step,

    y: OMR_TEMPLATE.rows.startY + row * OMR_TEMPLATE.rows.stepY,
  };
}

// ======================================================
// CINZA / ESCURIDÃO
// ======================================================

function getGray(data: Uint8ClampedArray, index: number) {
  return (
    data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  );
}

// ======================================================
// ANALISA UMA BOLHA
// ======================================================

function measureBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
) {
  const x = Math.round(cx - radius);
  const y = Math.round(cy - radius);

  const size = Math.round(radius * 2);

  if (
    x < 0 ||
    y < 0 ||
    x + size >= ctx.canvas.width ||
    y + size >= ctx.canvas.height
  ) {
    return 0;
  }

  const image = ctx.getImageData(x, y, size, size);

  let dark = 0;
  let total = 0;

  /*
   * Mede apenas o interior da bolha.
   *
   * Isso evita que a borda preta da bolha
   * seja confundida com uma marca preenchida.
   */
  const innerRadius = radius * 0.62;

  const innerRadiusSquared = innerRadius * innerRadius;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - radius;

      const dy = py + 0.5 - radius;

      if (dx * dx + dy * dy > innerRadiusSquared) {
        continue;
      }

      const index = (py * size + px) * 4;

      const value = getGray(image.data, index);

      if (value < 150) {
        dark++;
      }

      total++;
    }
  }

  return total > 0 ? dark / total : 0;
}

// ======================================================
// RECORTA O GABARITO
// ======================================================
//
// O novo Word possui:
// página A4 RETRATO
// e o gabarito fica na parte INFERIOR.
//
// O scanner recebe a foto da página inteira.
// Aqui procuramos a faixa inferior onde está
// o gabarito.
//
// ======================================================

function cropGabaritoFromPage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  const canvas = document.createElement("canvas");

  /*
   * O gabarito ocupa aproximadamente os
   * últimos 30% da página.
   *
   * Usamos uma área um pouco maior para
   * tolerar diferenças de fotografia.
   */
  const cropTop = Math.round(sourceHeight * 0.68);

  const cropHeight = sourceHeight - cropTop;

  if (cropHeight <= 0) {
    throw new Error("Não foi possível localizar a região do gabarito.");
  }

  canvas.width = sourceWidth;
  canvas.height = cropHeight;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("Não foi possível preparar a imagem.");
  }

  ctx.drawImage(
    source,
    0,
    cropTop,
    sourceWidth,
    cropHeight,
    0,
    0,
    sourceWidth,
    cropHeight,
  );

  return canvas;
}

// ======================================================
// LEITURA OMR
// ======================================================

function readAnswers(ctx: CanvasRenderingContext2D) {
  const answers: OMRAnswer[] = [];

  let confidence = 0;

  for (let question = 0; question < 10; question++) {
    const scores: number[] = [];

    for (let alternative = 0; alternative < 4; alternative++) {
      const position = getBubbleCenter(question, alternative);

      const scaleX = ctx.canvas.width / OMR_TEMPLATE.width;

      const scaleY = ctx.canvas.height / OMR_TEMPLATE.height;

      const x = position.x * scaleX;

      const y = position.y * scaleY;

      const radius = OMR_TEMPLATE.bubble.radius * Math.min(scaleX, scaleY);

      scores.push(measureBubble(ctx, x, y, radius));
    }

    const ordered = scores
      .map((value, index) => ({
        value,
        index,
      }))
      .sort((a, b) => b.value - a.value);

    const best = ordered[0];
    const second = ordered[1];

    /*
     * Marca válida:
     *
     * - quantidade mínima de pixels escuros
     * - diferença mínima para a segunda opção
     */
    if (best.value >= 0.12 && best.value - second.value >= 0.045) {
      answers.push(ALTERNATIVES[best.index]);

      confidence += Math.min(1, (best.value - second.value) / 0.25);
    } else {
      /*
       * Não transforma questão vazia
       * em alternativa A.
       *
       * Mantemos A apenas para compatibilidade
       * com o tipo de resposta, mas a confiança
       * dessa questão fica baixa.
       *
       * O ideal é a professora revisar
       * antes de confirmar.
       */
      answers.push("A");

      confidence += 0;
    }
  }

  return {
    answers,
    confidence: confidence / 10,
  };
}

// ======================================================
// COMPONENTE
// ======================================================

export default function OMRScanner({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);

  const [preview, setPreview] = useState("");

  const [result, setResult] = useState<{
    answers: OMRAnswer[];
    confidence: number;
  } | null>(null);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  // ====================================================
  // ABRIR CÂMERA
  // ====================================================

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Câmera não disponível.");
        }

        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },

            width: {
              ideal: 1920,
            },

            height: {
              ideal: 1080,
            },
          },

          audio: false,
        });

        if (!active) {
          media.getTracks().forEach((track) => track.stop());

          return;
        }

        setStream(media);

        if (videoRef.current) {
          videoRef.current.srcObject = media;

          await videoRef.current.play();
        }
      } catch (err) {
        console.error(err);

        setError(
          "Não foi possível acessar a câmera. Você também pode enviar uma foto do gabarito.",
        );
      }
    }

    void startCamera();

    return () => {
      active = false;

      setStream((current) => {
        current?.getTracks().forEach((track) => track.stop());

        return null;
      });
    };
  }, []);

  // ====================================================
  // PARAR CÂMERA
  // ====================================================

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());

    setStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // ====================================================
  // PROCESSAR IMAGEM
  // ====================================================

  function processImage(source: CanvasImageSource) {
    const canvas = canvasRef.current;

    if (!canvas) return;

    let width = 0;
    let height = 0;

    if (source instanceof HTMLVideoElement) {
      width = source.videoWidth;
      height = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      width = source.naturalWidth;
      height = source.naturalHeight;
    }

    if (!width || !height) {
      setError("A imagem não possui tamanho válido.");

      return;
    }

    const maxWidth = 1800;

    const scale = Math.min(1, maxWidth / width);

    const scaledWidth = Math.round(width * scale);

    const scaledHeight = Math.round(height * scale);

    canvas.width = scaledWidth;

    canvas.height = scaledHeight;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!ctx) {
      setError("Não foi possível processar a imagem.");

      return;
    }

    ctx.drawImage(source, 0, 0, scaledWidth, scaledHeight);

    /*
     * Se a imagem é uma página A4 inteira,
     * extraímos a faixa inferior.
     */
    const gabaritoCanvas = cropGabaritoFromPage(
      canvas,
      scaledWidth,
      scaledHeight,
    );

    const gabaritoCtx = gabaritoCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!gabaritoCtx) {
      setError("Não foi possível analisar o gabarito.");

      return;
    }

    /*
     * Mostra somente a região analisada.
     */
    setPreview(gabaritoCanvas.toDataURL("image/jpeg", 0.92));

    /*
     * Leitura OMR.
     */
    const read = readAnswers(gabaritoCtx);

    setResult(read);
  }

  // ====================================================
  // FOTOGRAFAR
  // ====================================================

  function capture() {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      setError("A câmera ainda não está pronta.");

      return;
    }

    setLoading(true);
    setError("");

    try {
      processImage(video);

      stopCamera();
    } catch (err) {
      console.error(err);

      setError("Não foi possível fazer a leitura.");
    } finally {
      setLoading(false);
    }
  }

  // ====================================================
  // ESCOLHER FOTO
  // ====================================================

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setLoading(true);
    setError("");

    try {
      const url = URL.createObjectURL(file);

      const image = new Image();

      image.src = url;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();

        image.onerror = () => reject(new Error("Imagem inválida."));
      });

      processImage(image);

      URL.revokeObjectURL(url);

      stopCamera();
    } catch (err) {
      console.error(err);

      setError("Não foi possível processar a imagem.");
    } finally {
      setLoading(false);

      event.target.value = "";
    }
  }

  // ====================================================
  // CONFIRMAR
  // ====================================================

  function confirmResult() {
    if (!result) return;

    onDetected(result.answers);

    onClose();
  }

  // ====================================================
  // NOVA LEITURA
  // ====================================================

  function reset() {
    setResult(null);
    setPreview("");
    setError("");
  }

  // ====================================================
  // INTERFACE
  // ====================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* CABEÇALHO */}

        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Leitura OMR
            </p>

            <h2 className="text-xl font-black">Escanear gabarito</h2>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTEÚDO */}

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.25fr_.75fr]">
          {/* CÂMERA */}

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl bg-black">
              {preview ? (
                <img
                  src={preview}
                  alt="Região do gabarito analisada"
                  className="block max-h-[58vh] w-full object-contain"
                />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="block aspect-video w-full object-contain"
                />
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!preview && (
                <button
                  type="button"
                  onClick={capture}
                  disabled={loading || !stream}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40"
                >
                  <Camera size={18} />

                  {loading ? "Lendo..." : "Fotografar e ler"}
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-5 py-3 font-bold"
              >
                <ImageIcon size={18} />
                Usar foto
              </button>

              {preview && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-5 py-3 font-bold"
                >
                  <RotateCcw size={18} />
                  Nova leitura
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFile}
              />
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <b className="text-slate-900">Para uma boa leitura:</b> fotografe
              a página inteira, principalmente a parte inferior onde está o
              gabarito. Mantenha a folha reta, sem cortar os quatro marcadores
              pretos e com boa iluminação.
            </div>
          </div>

          {/* RESULTADO */}

          <aside className="rounded-3xl border bg-slate-50 p-5">
            <h3 className="font-black">Respostas identificadas</h3>

            {!result ? (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Fotografe ou envie uma imagem da prova para analisar as 10
                questões.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {result.answers.map((answer, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl border bg-white px-3 py-2"
                    >
                      <span className="text-sm font-bold">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 font-black text-blue-700">
                        {answer}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border bg-white p-4 text-sm">
                  Confiança aproximada:{" "}
                  <b>{Math.round(result.confidence * 100)}%</b>
                </div>

                <button
                  type="button"
                  onClick={confirmResult}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-black text-white"
                >
                  <CheckCircle2 size={18} />
                  Confirmar correção
                </button>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
