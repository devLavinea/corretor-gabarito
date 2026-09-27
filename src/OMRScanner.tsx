import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  RotateCcw,
  ScanLine,
  X,
  ZoomIn,
} from "lucide-react";

export type OMRAnswer = "A" | "B" | "C" | "D";

type Props = {
  onClose: () => void;
  onDetected: (answers: OMRAnswer[]) => void;
};

type Point = {
  x: number;
  y: number;
};

type MarkerSet = {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
};

type Homography = {
  h11: number;
  h12: number;
  h13: number;
  h21: number;
  h22: number;
  h23: number;
  h31: number;
  h32: number;
};

type AnswerResult = {
  answer: OMRAnswer | null;
  confidence: number;
  scores: number[];
};

// ======================================================
// PADRÃO OMR
// EXATAMENTE IGUAL AO GABARITOGENERATOR.TSX
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

const BLACK_THRESHOLD = 105;

// ======================================================
// POSIÇÃO DAS BOLHAS
// ======================================================

function getBubbleCenter(
  questionIndex: number,
  alternativeIndex: number,
): Point {
  const question = questionIndex + 1;

  const isRight = question >= 6;

  const row = isRight ? question - 6 : question - 1;

  const group = isRight ? OMR_TEMPLATE.right : OMR_TEMPLATE.left;

  return {
    x: group.bubbleStartX + alternativeIndex * OMR_TEMPLATE.bubble.step,

    y: OMR_TEMPLATE.rows.startY + row * OMR_TEMPLATE.rows.stepY,
  };
}

// ======================================================
// CINZA
// ======================================================

function getGray(data: Uint8ClampedArray, index: number) {
  return (
    data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  );
}

// ======================================================
// DISTÂNCIA
// ======================================================

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ======================================================
// RESOLVE SISTEMA LINEAR
// ======================================================

function solveLinearSystem(matrix: number[][], values: number[]) {
  const n = values.length;

  const a = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < n; column++) {
    let pivot = column;

    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][column]) < 1e-10) {
      throw new Error("Não foi possível corrigir a perspectiva.");
    }

    [a[column], a[pivot]] = [a[pivot], a[column]];

    const divisor = a[column][column];

    for (let j = column; j <= n; j++) {
      a[column][j] /= divisor;
    }

    for (let row = 0; row < n; row++) {
      if (row === column) continue;

      const factor = a[row][column];

      for (let j = column; j <= n; j++) {
        a[row][j] -= factor * a[column][j];
      }
    }
  }

  return a.map((row) => row[n]);
}

// ======================================================
// HOMOGRAFIA
// ======================================================

function calculateHomography(
  source: Point[],
  destination: Point[],
): Homography {
  if (source.length !== 4 || destination.length !== 4) {
    throw new Error(
      "São necessários quatro pontos para corrigir a perspectiva.",
    );
  }

  const matrix: number[][] = [];
  const values: number[] = [];

  for (let i = 0; i < 4; i++) {
    const s = source[i];
    const d = destination[i];

    matrix.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);

    values.push(d.x);

    matrix.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);

    values.push(d.y);
  }

  const result = solveLinearSystem(matrix, values);

  return {
    h11: result[0],
    h12: result[1],
    h13: result[2],
    h21: result[3],
    h22: result[4],
    h23: result[5],
    h31: result[6],
    h32: result[7],
  };
}

// ======================================================
// APLICA HOMOGRAFIA
// ======================================================

function transformPoint(point: Point, homography: Homography): Point {
  const denominator = homography.h31 * point.x + homography.h32 * point.y + 1;

  return {
    x:
      (homography.h11 * point.x + homography.h12 * point.y + homography.h13) /
      denominator,

    y:
      (homography.h21 * point.x + homography.h22 * point.y + homography.h23) /
      denominator,
  };
}

// ======================================================
// DETECÇÃO DOS MARCADORES
// ======================================================
//
// Procura quadrados pretos semelhantes aos quatro
// marcadores existentes no gabarito.
//
// Não depende mais da posição fixa da página.
// ======================================================

function detectMarkers(canvas: HTMLCanvasElement): MarkerSet | null {
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) return null;

  const maxDimension = 1400;

  const scale = Math.min(
    1,
    maxDimension / Math.max(canvas.width, canvas.height),
  );

  const width = Math.max(1, Math.round(canvas.width * scale));

  const height = Math.max(1, Math.round(canvas.height * scale));

  const scanCanvas = document.createElement("canvas");

  scanCanvas.width = width;
  scanCanvas.height = height;

  const scanCtx = scanCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!scanCtx) return null;

  scanCtx.drawImage(canvas, 0, 0, width, height);

  const image = scanCtx.getImageData(0, 0, width, height);

  const data = image.data;

  const visited = new Uint8Array(width * height);

  const candidates: {
    center: Point;
    area: number;
    width: number;
    height: number;
    fill: number;
  }[] = [];

  const minSize = Math.max(6, Math.round(width * 0.006));

  const maxSize = Math.max(45, Math.round(width * 0.12));

  const indexOf = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = indexOf(x, y);

      if (visited[start]) continue;

      const pixel = start * 4;

      const gray = getGray(data, pixel);

      if (gray > BLACK_THRESHOLD) {
        visited[start] = 1;
        continue;
      }

      const queue: number[] = [start];

      visited[start] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      let queueIndex = 0;

      while (queueIndex < queue.length) {
        const current = queue[queueIndex++];

        const cy = Math.floor(current / width);
        const cx = current - cy * width;

        count++;

        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        if (maxX - minX > maxSize || maxY - minY > maxSize) {
          continue;
        }

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const next = indexOf(nx, ny);

          if (visited[next]) continue;

          const nextPixel = next * 4;

          const nextGray = getGray(data, nextPixel);

          if (nextGray <= BLACK_THRESHOLD) {
            visited[next] = 1;
            queue.push(next);
          } else {
            visited[next] = 1;
          }
        }
      }

      const componentWidth = maxX - minX + 1;

      const componentHeight = maxY - minY + 1;

      if (
        componentWidth < minSize ||
        componentHeight < minSize ||
        componentWidth > maxSize ||
        componentHeight > maxSize
      ) {
        continue;
      }

      const ratio = componentWidth / componentHeight;

      if (ratio < 0.55 || ratio > 1.8) {
        continue;
      }

      const boundingArea = componentWidth * componentHeight;

      const fill = count / boundingArea;

      if (fill < 0.35) continue;

      candidates.push({
        center: {
          x: (minX + maxX) / 2 / scale,

          y: (minY + maxY) / 2 / scale,
        },

        area: boundingArea / (scale * scale),

        width: componentWidth / scale,

        height: componentHeight / scale,

        fill,
      });
    }
  }

  if (candidates.length < 4) {
    return null;
  }

  /*
   * Os marcadores devem possuir tamanho parecido.
   * Ordenamos por proximidade do tamanho mediano.
   */
  const sortedByArea = [...candidates].sort((a, b) => a.area - b.area);

  const middle = sortedByArea[Math.floor(sortedByArea.length / 2)];

  const sizeTolerance = 3.2;

  const filtered = candidates.filter(
    (candidate) =>
      candidate.area >= middle.area / sizeTolerance &&
      candidate.area <= middle.area * sizeTolerance,
  );

  /*
   * Precisamos de quatro pontos formando
   * aproximadamente um quadrilátero.
   *
   * Tentamos várias combinações entre candidatos
   * e escolhemos a que melhor representa os quatro
   * cantos do gabarito.
   */
  const pool = filtered
    .sort(
      (a, b) => Math.abs(a.area - middle.area) - Math.abs(b.area - middle.area),
    )
    .slice(0, 30);

  let best: {
    markers: MarkerSet;
    score: number;
  } | null = null;

  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      for (let c = b + 1; c < pool.length; c++) {
        for (let d = c + 1; d < pool.length; d++) {
          const points = [
            pool[a].center,
            pool[b].center,
            pool[c].center,
            pool[d].center,
          ];

          const center = {
            x: points.reduce((sum, point) => sum + point.x, 0) / 4,

            y: points.reduce((sum, point) => sum + point.y, 0) / 4,
          };

          const top = points
            .filter((point) => point.y <= center.y)
            .sort((p1, p2) => p1.x - p2.x);

          const bottom = points
            .filter((point) => point.y > center.y)
            .sort((p1, p2) => p1.x - p2.x);

          if (top.length !== 2 || bottom.length !== 2) {
            continue;
          }

          const topLeft = top[0];
          const topRight = top[1];
          const bottomLeft = bottom[0];
          const bottomRight = bottom[1];

          const topDistance = distance(topLeft, topRight);

          const bottomDistance = distance(bottomLeft, bottomRight);

          const leftDistance = distance(topLeft, bottomLeft);

          const rightDistance = distance(topRight, bottomRight);

          const horizontal = (topDistance + bottomDistance) / 2;

          const vertical = (leftDistance + rightDistance) / 2;

          if (horizontal < 100 || vertical < 30) {
            continue;
          }

          const aspect = horizontal / vertical;

          /*
           * O gabarito é aproximadamente 1123/380 = 2.95.
           *
           * Aceitamos bastante distorção para não
           * rejeitar uma foto inclinada.
           */
          const aspectError = Math.abs(Math.log(aspect / 2.95));

          if (aspectError > 1.25) {
            continue;
          }

          const area = horizontal * vertical;

          const score =
            aspectError * 5 +
            Math.abs(topDistance - bottomDistance) / horizontal +
            Math.abs(leftDistance - rightDistance) / vertical;

          if (!best || score < best.score) {
            best = {
              markers: {
                topLeft,
                topRight,
                bottomLeft,
                bottomRight,
              },
              score,
            };
          }
        }
      }
    }
  }

  return best?.markers ?? null;
}

// ======================================================
// MEDE A BOLHA
// ======================================================

function measureBubble(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
) {
  const size = Math.max(8, Math.round(radius * 2));

  const x = Math.round(center.x - size / 2);

  const y = Math.round(center.y - size / 2);

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
   * Usa somente a parte interna.
   * Assim a borda impressa da bolha não
   * é confundida com preenchimento.
   */
  const innerRadius = radius * 0.58;

  const centerPoint = size / 2;

  const innerSquared = innerRadius * innerRadius;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - centerPoint;

      const dy = py + 0.5 - centerPoint;

      if (dx * dx + dy * dy > innerSquared) {
        continue;
      }

      const index = (py * size + px) * 4;

      const gray = getGray(image.data, index);

      if (gray < 155) {
        dark++;
      }

      total++;
    }
  }

  return total > 0 ? dark / total : 0;
}

// ======================================================
// LEITURA DE UMA QUESTÃO
// ======================================================

function readQuestion(
  ctx: CanvasRenderingContext2D,
  homography: Homography,
  questionIndex: number,
): AnswerResult {
  const scores: number[] = [];

  for (let alternative = 0; alternative < 4; alternative++) {
    const templatePoint = getBubbleCenter(questionIndex, alternative);

    const center = transformPoint(templatePoint, homography);

    /*
     * Estima o tamanho real da bolha usando
     * a distância entre A e B.
     */
    const pointA = transformPoint(
      getBubbleCenter(questionIndex, 0),
      homography,
    );

    const pointB = transformPoint(
      getBubbleCenter(questionIndex, 1),
      homography,
    );

    const bubbleStep = distance(pointA, pointB);

    const radius = Math.max(
      4,
      bubbleStep * (OMR_TEMPLATE.bubble.radius / OMR_TEMPLATE.bubble.step),
    );

    scores.push(measureBubble(ctx, center, radius));
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
   * Questão sem marca.
   */
  if (best.value < 0.075) {
    return {
      answer: null,
      confidence: 0,
      scores,
    };
  }

  const difference = best.value - second.value;

  /*
   * Marca muito próxima entre duas alternativas.
   */
  if (difference < 0.035 && best.value < 0.28) {
    return {
      answer: null,
      confidence: 0,
      scores,
    };
  }

  /*
   * Se duas bolhas estão muito preenchidas,
   * consideramos a questão ambígua.
   */
  if (second.value > 0.42 && difference < 0.12) {
    return {
      answer: null,
      confidence: 0,
      scores,
    };
  }

  const confidence = Math.max(0, Math.min(1, difference / 0.28));

  return {
    answer: ALTERNATIVES[best.index],
    confidence,
    scores,
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
    uncertain: number[];
  } | null>(null);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [cameraReady, setCameraReady] = useState(false);

  // ====================================================
  // ABRIR CÂMERA
  // ====================================================

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        setError("");
        setCameraReady(false);

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

            aspectRatio: {
              ideal: 16 / 9,
            },
          },

          audio: false,
        });

        if (!active) {
          media.getTracks().forEach((track) => track.stop());

          return;
        }

        setStream(media);

        const video = videoRef.current;

        if (!video) return;

        video.srcObject = media;

        await video.play();

        if (active) {
          setCameraReady(true);
        }
      } catch (err) {
        console.error(err);

        if (active) {
          setError(
            "Não foi possível acessar a câmera. Verifique a permissão do navegador ou use uma foto.",
          );
        }
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
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  // ====================================================
  // PROCESSA IMAGEM
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
      throw new Error("A imagem não possui tamanho válido.");
    }

    /*
     * Mantém uma resolução suficiente para
     * detectar os marcadores sem exagerar
     * no processamento.
     */
    const maxWidth = 2400;

    const scale = Math.min(1, maxWidth / width);

    const scaledWidth = Math.round(width * scale);

    const scaledHeight = Math.round(height * scale);

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!ctx) {
      throw new Error("Não foi possível preparar a imagem.");
    }

    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(source, 0, 0, scaledWidth, scaledHeight);

    // -----------------------------------------------
    // PROCURA OS 4 MARCADORES
    // -----------------------------------------------

    const markers = detectMarkers(canvas);

    if (!markers) {
      throw new Error(
        "Não encontrei os 4 marcadores pretos do gabarito. Enquadre o gabarito inteiro, incluindo os quatro cantos.",
      );
    }

    // -----------------------------------------------
    // HOMOGRAFIA
    // -----------------------------------------------

    const sourcePoints = [
      markers.topLeft,
      markers.topRight,
      markers.bottomRight,
      markers.bottomLeft,
    ];

    const destinationPoints = [
      {
        x: OMR_TEMPLATE.marker.offset,
        y: OMR_TEMPLATE.marker.offset,
      },

      {
        x: OMR_TEMPLATE.width - OMR_TEMPLATE.marker.offset,
        y: OMR_TEMPLATE.marker.offset,
      },

      {
        x: OMR_TEMPLATE.width - OMR_TEMPLATE.marker.offset,
        y: OMR_TEMPLATE.height - OMR_TEMPLATE.marker.offset,
      },

      {
        x: OMR_TEMPLATE.marker.offset,
        y: OMR_TEMPLATE.height - OMR_TEMPLATE.marker.offset,
      },
    ];

    /*
     * A homografia abaixo transforma coordenadas
     * do gabarito original em coordenadas da foto.
     */
    const homography = calculateHomography(destinationPoints, sourcePoints);

    // -----------------------------------------------
    // LEITURA
    // -----------------------------------------------

    const answers: OMRAnswer[] = [];
    const uncertain: number[] = [];

    let confidenceTotal = 0;

    for (let question = 0; question < 10; question++) {
      const read = readQuestion(ctx, homography, question);

      /*
       * O sistema precisa devolver um array
       * compatível com o restante do aplicativo.
       *
       * Para questão sem marca ou duvidosa,
       * usamos A internamente, mas marcamos a
       * questão como INCERTA para revisão.
       */
      if (!read.answer) {
        answers.push("A");

        uncertain.push(question + 1);
      } else {
        answers.push(read.answer);
      }

      confidenceTotal += read.confidence;
    }

    // -----------------------------------------------
    // PREVIEW DA FOTO ORIGINAL
    // -----------------------------------------------

    setPreview(canvas.toDataURL("image/jpeg", 0.9));

    setResult({
      answers,
      confidence: confidenceTotal / 10,
      uncertain,
    });
  }

  // ====================================================
  // CAPTURAR
  // ====================================================

  function capture() {
    const video = videoRef.current;

    if (!video || video.readyState < 2 || !video.videoWidth) {
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

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível fazer a leitura.",
      );
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

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível processar a imagem.",
      );
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

    /*
     * A câmera é reaberta automaticamente porque
     * o componente continua montado.
     */
    if (!stream) {
      window.location.reload();
    }
  }

  // ====================================================
  // FECHAR
  // ====================================================

  function close() {
    stopCamera();
    onClose();
  }

  // ====================================================
  // INTERFACE
  // ====================================================

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black">
        {/* ==================================================
            CÂMERA
        ================================================== */}

        {!preview ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Escurecimento leve */}
            <div className="pointer-events-none absolute inset-0 bg-black/10" />

            {/* ==================================================
                TOPO
            ================================================== */}

            <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="rounded-2xl bg-black/60 px-4 py-2 text-white backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <ScanLine size={18} />

                  <span className="font-black">Escanear gabarito</span>
                </div>

                <p className="mt-0.5 text-xs text-white/70">
                  Enquadre os 4 marcadores pretos
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                className="grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md"
                aria-label="Fechar câmera"
              >
                <X size={22} />
              </button>
            </div>

            {/* ==================================================
                MOLDURA
            ================================================== */}

            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-5">
              <div className="relative w-full max-w-[1100px]">
                <div className="aspect-[1123/380] w-full rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />

                {/* Cantos da moldura */}

                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white" />

                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white" />

                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />

                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white" />
              </div>
            </div>

            {/* ==================================================
                INSTRUÇÃO INFERIOR
            ================================================== */}

            <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-xl rounded-3xl bg-black/65 p-4 text-center text-white backdrop-blur-md">
                <p className="text-sm font-bold">
                  Coloque o gabarito inteiro dentro da moldura
                </p>

                <p className="mt-1 text-xs text-white/70">
                  Os 4 quadrados pretos precisam aparecer. Evite reflexos e
                  sombras.
                </p>

                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={capture}
                    disabled={loading || !stream || !cameraReady}
                    className="flex h-16 min-w-[190px] items-center justify-center gap-3 rounded-full bg-blue-600 px-7 text-base font-black text-white shadow-xl disabled:opacity-40"
                  >
                    <Camera size={23} />

                    {loading ? "Lendo..." : "Fotografar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md"
                    aria-label="Usar foto"
                  >
                    <ImageIcon size={21} />
                  </button>
                </div>

                {cameraReady && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Câmera pronta
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ==================================================
             RESULTADO
          ================================================== */

          <div className="flex h-full flex-col bg-slate-100">
            <div className="flex items-center justify-between bg-white px-4 py-4 shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Resultado
                </p>

                <h2 className="text-lg font-black text-slate-900">
                  Leitura do gabarito
                </h2>
              </div>

              <button
                type="button"
                onClick={close}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-5xl space-y-4">
                <div className="overflow-hidden rounded-3xl bg-black shadow-lg">
                  <img
                    src={preview}
                    alt="Gabarito fotografado"
                    className="block max-h-[42vh] w-full object-contain"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {result && (
                  <>
                    <div className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-black text-slate-900">
                            Respostas identificadas
                          </h3>

                          <p className="mt-1 text-xs text-slate-500">
                            Confira antes de confirmar.
                          </p>
                        </div>

                        <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">
                          {Math.round(result.confidence * 100)}%
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {result.answers.map((answer, index) => {
                          const uncertain = result.uncertain.includes(
                            index + 1,
                          );

                          return (
                            <div
                              key={index}
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                uncertain
                                  ? "border-amber-300 bg-amber-50"
                                  : "bg-white"
                              }`}
                            >
                              <span className="text-sm font-bold">
                                {String(index + 1).padStart(2, "0")}
                              </span>

                              <span
                                className={`grid h-8 w-8 place-items-center rounded-full font-black ${
                                  uncertain
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-blue-50 text-blue-700"
                                }`}
                              >
                                {answer}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {result.uncertain.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          <b>Atenção:</b> as questões{" "}
                          {result.uncertain.join(", ")} ficaram duvidosas ou sem
                          marca clara. Revise antes de confirmar.
                        </div>
                      )}

                      {result.uncertain.length === 0 && (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                          Todas as questões foram identificadas com diferença
                          suficiente entre as alternativas.
                        </div>
                      )}

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={reset}
                          className="flex items-center justify-center gap-2 rounded-2xl border bg-white py-3 font-bold text-slate-700"
                        >
                          <RotateCcw size={18} />
                          Fotografar novamente
                        </button>

                        <button
                          type="button"
                          onClick={confirmResult}
                          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-black text-white"
                        >
                          <CheckCircle2 size={18} />
                          Confirmar correção
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
                      <div className="flex gap-3">
                        <ZoomIn
                          size={18}
                          className="mt-0.5 shrink-0 text-blue-600"
                        />

                        <p>
                          Para melhorar a precisão, mantenha os quatro
                          marcadores pretos visíveis e evite inclinar
                          excessivamente a folha.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INPUT DE FOTO */}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

        {/* CANVAS DE PROCESSAMENTO */}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
