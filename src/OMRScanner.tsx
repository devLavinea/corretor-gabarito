import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

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

type AnswerCandidate = {
  answer: OMRAnswer;
  score: number;
};

type AnswerResult = {
  answer: OMRAnswer | null;
  confidence: number;
  scores: number[];
  candidates: AnswerCandidate[];
  ambiguous: boolean;
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

// A leitura das bolhas não usa mais um limiar absoluto.
// A iluminação da fotografia pode mudar bastante de uma sala para outra.
// Os valores abaixo são usados apenas para a detecção dos marcadores técnicos;
// as respostas são avaliadas por contraste LOCAL dentro de cada bolha.
const MARKER_LOCAL_WINDOW = 31;
const MARKER_CONTRAST = 28;

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

function buildAdaptiveDarkMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  windowSize: number,
  contrast: number,
) {
  const size = width * height;
  const gray = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    gray[i] = Math.round(getGray(data, i * 4));
  }

  // Integral image: permite calcular rapidamente a iluminação média local.
  const stride = width + 1;
  const integral = new Float64Array((height + 1) * stride);
  const radius = Math.floor(windowSize / 2);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;

    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * stride + (x + 1)] =
        integral[y * stride + (x + 1)] + rowSum;
    }
  }

  const mask = new Uint8Array(size);

  const areaSum = (x1: number, y1: number, x2: number, y2: number) => {
    return (
      integral[(y2 + 1) * stride + (x2 + 1)] -
      integral[y1 * stride + (x2 + 1)] -
      integral[(y2 + 1) * stride + x1] +
      integral[y1 * stride + x1]
    );
  };

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const localMean = areaSum(x1, y1, x2, y2) / area;
      const value = gray[y * width + x];

      // O pixel precisa ser significativamente mais escuro que a vizinhança.
      // Isso funciona mesmo quando a folha inteira está sob uma sombra.
      if (value < localMean - contrast) {
        mask[y * width + x] = 1;
      }
    }
  }

  return mask;
}

function detectMarkers(canvas: HTMLCanvasElement): MarkerSet | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const maxDimension = 1600;
  const scale = Math.min(
    1,
    maxDimension / Math.max(canvas.width, canvas.height),
  );
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));

  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = width;
  scanCanvas.height = height;

  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!scanCtx) return null;

  scanCtx.drawImage(canvas, 0, 0, width, height);
  const image = scanCtx.getImageData(0, 0, width, height);
  const data = image.data;

  // Primeira tentativa: contraste local. Segunda tentativa: threshold absoluto.
  // A segunda via ajuda em fotografias muito homogêneas e muito bem iluminadas.
  const adaptiveMask = buildAdaptiveDarkMask(
    data,
    width,
    height,
    MARKER_LOCAL_WINDOW,
    MARKER_CONTRAST,
  );

  const absoluteMask = new Uint8Array(width * height);
  for (let i = 0; i < absoluteMask.length; i++) {
    absoluteMask[i] = getGray(data, i * 4) < BLACK_THRESHOLD ? 1 : 0;
  }

  const collectCandidates = (mask: Uint8Array) => {
    const visited = new Uint8Array(width * height);
    const candidates: {
      center: Point;
      area: number;
      width: number;
      height: number;
      fill: number;
    }[] = [];

    const minSize = Math.max(7, Math.round(width * 0.006));
    const maxSize = Math.max(55, Math.round(width * 0.12));
    const indexOf = (x: number, y: number) => y * width + x;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const start = indexOf(x, y);
        if (visited[start] || !mask[start]) {
          visited[start] = 1;
          continue;
        }

        const queue: number[] = [start];
        visited[start] = 1;
        let queueIndex = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let count = 0;
        let tooLarge = false;

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
            tooLarge = true;
            continue;
          }

          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = indexOf(nx, ny);
            if (visited[next]) continue;
            visited[next] = 1;
            if (mask[next]) queue.push(next);
          }
        }

        if (tooLarge) continue;

        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        if (
          componentWidth < minSize ||
          componentHeight < minSize ||
          componentWidth > maxSize ||
          componentHeight > maxSize
        )
          continue;

        const ratio = componentWidth / componentHeight;
        if (ratio < 0.55 || ratio > 1.8) continue;

        const boundingArea = componentWidth * componentHeight;
        const fill = count / boundingArea;
        if (fill < 0.28) continue;

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

    return candidates;
  };

  const adaptiveCandidates = collectCandidates(adaptiveMask);
  const candidates =
    adaptiveCandidates.length >= 4
      ? adaptiveCandidates
      : collectCandidates(absoluteMask);

  if (candidates.length < 4) return null;

  const sortedByArea = [...candidates].sort((a, b) => a.area - b.area);
  const middle = sortedByArea[Math.floor(sortedByArea.length / 2)];
  const sizeTolerance = 3.2;
  const filtered = candidates.filter(
    (candidate) =>
      candidate.area >= middle.area / sizeTolerance &&
      candidate.area <= middle.area * sizeTolerance,
  );

  const pool = filtered
    .sort(
      (a, b) => Math.abs(a.area - middle.area) - Math.abs(b.area - middle.area),
    )
    .slice(0, 36);

  let best: { markers: MarkerSet; score: number } | null = null;

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
          if (top.length !== 2 || bottom.length !== 2) continue;

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

          if (horizontal < 100 || vertical < 30) continue;

          const aspect = horizontal / vertical;
          const aspectError = Math.abs(Math.log(aspect / 2.95));
          if (aspectError > 1.25) continue;

          const score =
            aspectError * 5 +
            Math.abs(topDistance - bottomDistance) / horizontal +
            Math.abs(leftDistance - rightDistance) / vertical;

          if (!best || score < best.score) {
            best = {
              markers: { topLeft, topRight, bottomLeft, bottomRight },
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

type BubbleMeasurement = {
  score: number;
  coreContrast: number;
  bodyContrast: number;
  darkRatio: number;
  colorInk: number;
  blackInk: number;
  coreMean: number;
  backgroundMean: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function median(values: number[]) {
  if (!values.length) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getBlueInk(r: number, g: number, b: number) {
  // Detecta tinta azul sem exigir que ela seja muito escura.
  // Caneta preta terá valor próximo de zero aqui e será detectada pelo canal
  // de luminância. A combinação permite usar preto E azul.
  return clamp01((b - (r + g) * 0.5) / 70);
}

function measureBubble(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
): BubbleMeasurement {
  /*
   * LEITURA ROBUSTA:
   * - o círculo impresso é ignorado sempre que possível;
   * - a região central da bolha tem peso maior;
   * - a iluminação é comparada com um anel imediatamente ao redor;
   * - preto e azul são aceitos;
   * - várias regiões da bolha são medidas para não depender de um único ponto.
   */
  const outer = radius * 2.2;
  const size = Math.max(28, Math.ceil(outer * 2 + 10));
  const x = Math.round(center.x - size / 2);
  const y = Math.round(center.y - size / 2);

  const empty: BubbleMeasurement = {
    score: 0,
    coreContrast: 0,
    bodyContrast: 0,
    darkRatio: 0,
    colorInk: 0,
    blackInk: 0,
    coreMean: 255,
    backgroundMean: 255,
  };

  if (
    x < 0 ||
    y < 0 ||
    x + size > ctx.canvas.width ||
    y + size > ctx.canvas.height
  ) {
    return empty;
  }

  const image = ctx.getImageData(x, y, size, size);
  const c = size / 2;

  const ringGray: number[] = [];
  const ringBlue: number[] = [];
  const core: { gray: number; blue: number; r: number; angle: number }[] = [];
  const body: { gray: number; blue: number; r: number; angle: number }[] = [];

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - c;
      const dy = py + 0.5 - c;
      const r = Math.hypot(dx, dy) / radius;

      if (r > 2.0) continue;

      const index = (py * size + px) * 4;
      const red = image.data[index];
      const green = image.data[index + 1];
      const blueChannel = image.data[index + 2];
      const gray = getGray(image.data, index);
      const blue = getBlueInk(red, green, blueChannel);
      const angle = Math.atan2(dy, dx);

      // O anel externo é uma referência da iluminação local.
      // Ele fica fora da linha impressa da bolha.
      if (r >= 1.45 && r <= 1.95) {
        ringGray.push(gray);
        ringBlue.push(blue);
      }

      // O núcleo evita a borda impressa da bolha.
      if (r <= 0.58) {
        core.push({ gray, blue, r, angle });
      } else if (r <= 0.92) {
        body.push({ gray, blue, r, angle });
      }
    }
  }

  const backgroundMean = median(ringGray);
  const backgroundBlueMean = median(ringBlue);
  const denominator = Math.max(30, backgroundMean);

  if (!core.length || !body.length) return empty;

  const coreMean = median(core.map((p) => p.gray));
  const bodyMean = median(body.map((p) => p.gray));

  const coreContrast = clamp01((backgroundMean - coreMean) / denominator);
  const bodyContrast = clamp01((backgroundMean - bodyMean) / denominator);

  // Detecta tinta escura de forma relativa à iluminação local.
  const darkThreshold = backgroundMean - Math.max(8, backgroundMean * 0.075);
  const darkRatio =
    core.filter((p) => p.gray <= darkThreshold).length / core.length;

  const coreBlue = core.reduce((sum, p) => sum + p.blue, 0) / core.length;
  const bodyBlue = body.reduce((sum, p) => sum + p.blue, 0) / body.length;

  const colorInk = clamp01(
    ((coreBlue - backgroundBlueMean) / 0.16) * 0.72 +
      ((bodyBlue - backgroundBlueMean) / 0.16) * 0.28,
  );

  const blackInk = clamp01(
    coreContrast * 0.48 + bodyContrast * 0.27 + darkRatio * 0.25,
  );

  /*
   * Uma marca real normalmente ocupa uma parte relevante do núcleo.
   * Medir por setores reduz o risco de confundir sombra/reflexo localizado
   * com uma bolha preenchida.
   */
  const sectors: number[] = [];

  for (let sector = 0; sector < 12; sector++) {
    const start = (sector / 12) * Math.PI * 2;
    const end = ((sector + 1) / 12) * Math.PI * 2;

    const values = core.filter((p) => {
      const a = (p.angle + Math.PI * 2) % (Math.PI * 2);
      return a >= start && a < end;
    });

    if (!values.length) {
      sectors.push(0);
      continue;
    }

    const meanGray = values.reduce((sum, p) => sum + p.gray, 0) / values.length;
    const meanBlue = values.reduce((sum, p) => sum + p.blue, 0) / values.length;

    const grayEvidence = clamp01(
      (backgroundMean - meanGray) / Math.max(30, backgroundMean),
    );
    const blueEvidence = clamp01((meanBlue - backgroundBlueMean) / 0.16);

    sectors.push(grayEvidence * 0.62 + blueEvidence * 0.38);
  }

  const sortedSectors = [...sectors].sort((a, b) => b - a);
  const strongestSectorEvidence =
    sortedSectors.slice(0, 7).reduce((sum, value) => sum + value, 0) / 7;

  /*
   * Um preenchimento verdadeiro tende a aparecer em múltiplas escalas:
   * centro, corpo e densidade escura. A borda impressa praticamente não
   * participa da decisão.
   */
  const density = clamp01(
    coreContrast * 0.3 +
      bodyContrast * 0.16 +
      darkRatio * 0.24 +
      colorInk * 0.3,
  );

  const consistency = clamp01(strongestSectorEvidence * 0.55 + density * 0.45);

  const score = clamp01(
    density * 0.58 + consistency * 0.22 + blackInk * 0.1 + colorInk * 0.1,
  );

  return {
    score,
    coreContrast,
    bodyContrast,
    darkRatio,
    colorInk,
    blackInk,
    coreMean,
    backgroundMean,
  };
}

function readQuestion(
  ctx: CanvasRenderingContext2D,
  homography: Homography,
  questionIndex: number,
): AnswerResult {
  /*
   * Fazemos múltiplas leituras da mesma questão:
   * 1. centro exato;
   * 2. pequenos deslocamentos;
   * 3. pequenos ajustes no raio.
   *
   * Isso reduz bastante erros causados por uma homografia ligeiramente
   * deslocada, compressão da foto ou preenchimento fora do centro.
   */
  const baseA = transformPoint(getBubbleCenter(questionIndex, 0), homography);
  const baseB = transformPoint(getBubbleCenter(questionIndex, 1), homography);

  const bubbleStep = distance(baseA, baseB);
  const baseRadius = Math.max(
    4,
    bubbleStep * (OMR_TEMPLATE.bubble.radius / OMR_TEMPLATE.bubble.step),
  );

  const passes = [
    { dx: 0, dy: 0, radius: 1 },
    { dx: -0.08, dy: 0, radius: 1 },
    { dx: 0.08, dy: 0, radius: 1 },
    { dx: 0, dy: -0.08, radius: 1 },
    { dx: 0, dy: 0.08, radius: 1 },
    { dx: -0.06, dy: -0.06, radius: 1 },
    { dx: 0.06, dy: -0.06, radius: 1 },
    { dx: -0.06, dy: 0.06, radius: 1 },
    { dx: 0.06, dy: 0.06, radius: 1 },
    { dx: 0, dy: 0, radius: 0.9 },
    { dx: 0, dy: 0, radius: 1.1 },
  ];

  const allPassScores: number[][] = [];
  const finalMeasurements: BubbleMeasurement[] = [];

  for (const pass of passes) {
    const passScores: number[] = [];

    for (let alternative = 0; alternative < 4; alternative++) {
      const base = transformPoint(
        getBubbleCenter(questionIndex, alternative),
        homography,
      );

      const center = {
        x: base.x + pass.dx * bubbleStep,
        y: base.y + pass.dy * bubbleStep,
      };

      const measurement = measureBubble(ctx, center, baseRadius * pass.radius);

      passScores.push(measurement.score);

      if (pass.dx === 0 && pass.dy === 0 && pass.radius === 1) {
        finalMeasurements[alternative] = measurement;
      }
    }

    allPassScores.push(passScores);
  }

  /*
   * Consenso ponderado:
   * cada alternativa recebe a média das leituras, mas também é penalizada
   * quando os resultados dos diferentes enquadramentos discordam.
   */
  const scores = ALTERNATIVES.map((_, alternative) => {
    const values = allPassScores.map((pass) => pass[alternative] ?? 0);

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    const sorted = [...values].sort((a, b) => a - b);
    const trimmed =
      sorted.length >= 5 ? sorted.slice(2, sorted.length - 2) : sorted;

    const stableMean =
      trimmed.reduce((sum, value) => sum + value, 0) /
      Math.max(1, trimmed.length);

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const stability = clamp01(
      1 - (maxValue - minValue) / Math.max(0.08, mean + 0.04),
    );

    return clamp01(stableMean * 0.82 + mean * 0.1 + stability * 0.08);
  });

  const ordered = scores
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);

  const best = ordered[0];
  const second = ordered[1];

  if (!best || !second) {
    return {
      answer: null,
      confidence: 0,
      scores,
      candidates: [],
      ambiguous: false,
    };
  }

  const bestMeasurement = finalMeasurements[best.index] ?? {
    score: best.value,
    coreContrast: 0,
    bodyContrast: 0,
    darkRatio: 0,
    colorInk: 0,
    blackInk: 0,
    coreMean: 255,
    backgroundMean: 255,
  };

  const secondMeasurement = finalMeasurements[second.index] ?? {
    score: second.value,
    coreContrast: 0,
    bodyContrast: 0,
    darkRatio: 0,
    colorInk: 0,
    blackInk: 0,
    coreMean: 255,
    backgroundMean: 255,
  };

  const rowMedian = median(scores);
  const relativeEvidence = best.value - rowMedian;
  const separation = best.value - second.value;

  const hasInkEvidence =
    best.value >= 0.045 &&
    (bestMeasurement.blackInk >= 0.035 ||
      bestMeasurement.colorInk >= 0.035 ||
      bestMeasurement.coreContrast >= 0.012 ||
      bestMeasurement.bodyContrast >= 0.012 ||
      bestMeasurement.darkRatio >= 0.035 ||
      relativeEvidence >= 0.025);

  const secondHasInk =
    second.value >= 0.04 &&
    (secondMeasurement.blackInk >= 0.03 ||
      secondMeasurement.colorInk >= 0.03 ||
      secondMeasurement.coreContrast >= 0.01 ||
      secondMeasurement.bodyContrast >= 0.01 ||
      secondMeasurement.darkRatio >= 0.03);

  /*
   * Regra de segurança:
   * se duas letras estão próximas, NÃO escolhemos uma arbitrariamente.
   * É preferível pedir confirmação do que gravar uma resposta errada.
   */
  const ambiguous =
    hasInkEvidence &&
    secondHasInk &&
    second.value >= Math.max(0.055, best.value * 0.84) &&
    separation < Math.max(0.045, best.value * 0.2);

  if (!hasInkEvidence) {
    return {
      answer: null,
      confidence: 0,
      scores,
      candidates: [],
      ambiguous: false,
    };
  }

  const candidates = ordered
    .filter(({ value, index }) => {
      const measurement = finalMeasurements[index];
      if (!measurement) return false;

      return (
        value >= Math.max(0.045, best.value * 0.74) &&
        (measurement.coreContrast >= 0.008 ||
          measurement.bodyContrast >= 0.008 ||
          measurement.darkRatio >= 0.025 ||
          measurement.blackInk >= 0.025 ||
          measurement.colorInk >= 0.025)
      );
    })
    .slice(0, 4)
    .map(({ index, value }) => ({
      answer: ALTERNATIVES[index],
      score: value,
    }));

  const separationConfidence = clamp01(
    separation / Math.max(0.055, best.value * 0.32),
  );

  const strengthConfidence = clamp01(best.value / 0.24);

  const relativeConfidence = clamp01(relativeEvidence / 0.085);

  const confidence = clamp01(
    separationConfidence * 0.5 +
      strengthConfidence * 0.25 +
      relativeConfidence * 0.25,
  );

  return {
    answer: ALTERNATIVES[best.index],
    confidence: ambiguous ? 0 : confidence,
    scores,
    candidates,
    ambiguous,
  };
}

// ======================================================
// COMPONENTE
// ======================================================

export default function OMRScanner({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);

  const [preview, setPreview] = useState("");

  const [result, setResult] = useState<{
    answers: OMRAnswer[];
    confidence: number;
    uncertain: number[];
    ambiguous: Record<number, OMRAnswer[]>;
  } | null>(null);

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);

  // ====================================================
  // PARAR CÂMERA
  // ====================================================

  const stopCamera = useCallback(() => {
    const currentStream = streamRef.current;

    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;

    setStream(null);

    const video = videoRef.current;

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    setCameraReady(false);
  }, []);

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      torch?: boolean;
    };
    if (!capabilities.torch) {
      setError(
        "O flash/lanterna não é compatível com esta câmera ou navegador.",
      );
      return;
    }
    try {
      await track.applyConstraints({
        advanced: [{ torch: !flashOn } as MediaTrackConstraintSet],
      });
      setFlashOn((value) => !value);
      setFlashSupported(true);
    } catch (err) {
      console.error(err);
      setError("Não foi possível ativar o flash da câmera.");
    }
  }

  // ====================================================
  // ABRIR CÂMERA
  // ====================================================

  const startCamera = useCallback(async () => {
    try {
      setError("");
      setCameraReady(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Câmera não disponível neste navegador.");
      }

      stopCamera();

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

      streamRef.current = media;
      const track = media.getVideoTracks()[0];

      // Quando o aparelho oferece esses controles, manter foco/exposição
      // contínuos ajuda bastante em fotos feitas rapidamente sobre a mesa.
      try {
        await track?.applyConstraints({
          advanced: [
            { focusMode: "continuous" } as MediaTrackConstraintSet,
            { exposureMode: "continuous" } as MediaTrackConstraintSet,
            { whiteBalanceMode: "continuous" } as MediaTrackConstraintSet,
          ],
        });
      } catch {
        // Nem todo navegador/câmera expõe esses controles. A leitura continua
        // normalmente usando a imagem capturada.
      }

      const capabilities = track?.getCapabilities() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setFlashSupported(Boolean(capabilities?.torch));
      setFlashOn(false);

      setStream(media);

      const video = videoRef.current;

      if (!video) {
        media.getTracks().forEach((track) => track.stop());

        streamRef.current = null;

        setStream(null);

        throw new Error("Vídeo da câmera não foi encontrado.");
      }

      video.srcObject = media;

      await video.play();

      setCameraReady(true);
    } catch (err) {
      console.error(err);

      stopCamera();

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível acessar a câmera. Verifique a permissão do navegador ou use uma foto.",
      );
    }
  }, [stopCamera]);

  // ====================================================
  // INICIA CÂMERA AO ABRIR
  // ====================================================

  useEffect(() => {
    void startCamera();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ====================================================
  // PROCESSA IMAGEM
  // ====================================================

  function processImage(source: CanvasImageSource) {
    const canvas = canvasRef.current;

    if (!canvas) {
      throw new Error("Canvas de processamento indisponível.");
    }

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

    // ==================================================
    // REDIMENSIONAMENTO
    // ==================================================

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

    // ==================================================
    // DETECTA MARCADORES
    // ==================================================

    const markers = detectMarkers(canvas);

    if (!markers) {
      throw new Error(
        "Não encontrei os 4 marcadores pretos do gabarito. Enquadre o gabarito inteiro, incluindo os quatro cantos.",
      );
    }

    // ==================================================
    // HOMOGRAFIA
    // ==================================================

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

    const homography = calculateHomography(destinationPoints, sourcePoints);

    // ==================================================
    // LEITURA DAS 10 QUESTÕES
    // ==================================================

    const answers: OMRAnswer[] = [];
    const uncertain: number[] = [];
    const ambiguous: Record<number, OMRAnswer[]> = {};
    let confidenceTotal = 0;

    for (let question = 0; question < 10; question++) {
      const read = readQuestion(ctx, homography, question);
      const questionNumber = question + 1;

      if (!read.answer) {
        // A questão fica pendente para o professor escolher manualmente.
        answers.push("A");
        uncertain.push(questionNumber);
      } else {
        answers.push(read.answer);
      }

      if (read.ambiguous) {
        ambiguous[questionNumber] = read.candidates.map((item) => item.answer);
        if (!uncertain.includes(questionNumber)) uncertain.push(questionNumber);
      }

      confidenceTotal += read.confidence;
    }

    // ==================================================
    // PREVIEW
    // ==================================================

    setPreview(canvas.toDataURL("image/jpeg", 0.9));

    setResult({
      answers,
      confidence: confidenceTotal / 10,
      uncertain,
      ambiguous,
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

    const url = URL.createObjectURL(file);

    try {
      const image = new Image();

      image.src = url;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();

        image.onerror = () => reject(new Error("Imagem inválida."));
      });

      processImage(image);

      stopCamera();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível processar a imagem.",
      );
    } finally {
      URL.revokeObjectURL(url);

      setLoading(false);

      event.target.value = "";
    }
  }

  // ====================================================
  // RESOLVER QUESTÃO AMBÍGUA
  // ====================================================

  function chooseAmbiguous(questionNumber: number, answer: OMRAnswer) {
    setResult((current) => {
      if (!current) return current;

      const nextAmbiguous = { ...current.ambiguous };
      delete nextAmbiguous[questionNumber];

      return {
        ...current,
        answers: current.answers.map((value, index) =>
          index === questionNumber - 1 ? answer : value,
        ),
        uncertain: current.uncertain.filter(
          (value) => value !== questionNumber,
        ),
        ambiguous: nextAmbiguous,
      };
    });
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
     * Reabre a câmera sem recarregar
     * a página inteira.
     */
    window.setTimeout(() => {
      void startCamera();
    }, 100);
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
        {!preview ? (
          <>
            {/* ==================================================
                CÂMERA
            ================================================== */}

            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
            />

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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFlash()}
                  disabled={!flashSupported}
                  className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur-md ${flashOn ? "bg-amber-300 text-slate-900" : "bg-black/60 text-white disabled:opacity-40"}`}
                  aria-label="Ativar flash"
                >
                  <span className="text-lg">⚡</span>
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md"
                  aria-label="Fechar câmera"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* ==================================================
                MOLDURA
            ================================================== */}

            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-5">
              <div className="relative w-full max-w-[1100px]">
                <div className="aspect-[1123/380] w-full rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />

                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white" />

                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white" />

                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />

                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white" />
              </div>
            </div>

            {/* ==================================================
                INSTRUÇÃO
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

                {error && (
                  <div className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-200">
                    {error}
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
                aria-label="Fechar resultado"
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
                          <b>Atenção:</b>{" "}
                          {Object.keys(result.ambiguous).length > 0
                            ? "foram detectadas duas ou mais bolinhas em algumas questões. Escolha abaixo qual resposta considerar."
                            : "algumas questões não tiveram uma marca suficientemente clara. Escolha a resposta manualmente antes de confirmar."}
                        </div>
                      )}

                      {result.uncertain
                        .filter((question) => !result.ambiguous[question])
                        .map((question) => (
                          <div
                            key={question}
                            className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-black text-amber-950">
                                  Questão {question}: leitura insuficiente
                                </p>
                                <p className="mt-1 text-xs text-amber-800">
                                  Nenhuma marca ficou clara o bastante. Escolha
                                  a alternativa correta.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {ALTERNATIVES.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() =>
                                      chooseAmbiguous(question, option)
                                    }
                                    className="grid h-11 w-11 place-items-center rounded-xl border-2 border-amber-300 bg-white font-black text-amber-900 hover:bg-amber-100"
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}

                      {Object.entries(result.ambiguous).map(
                        ([question, options]) => (
                          <div
                            key={question}
                            className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-black text-amber-950">
                                  Questão {question}: múltiplas marcações
                                  detectadas
                                </p>
                                <p className="mt-1 text-xs text-amber-800">
                                  Selecione a alternativa que deve ser
                                  considerada.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(options.length ? options : ALTERNATIVES).map(
                                  (option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() =>
                                        chooseAmbiguous(
                                          Number(question),
                                          option,
                                        )
                                      }
                                      className="grid h-11 w-11 place-items-center rounded-xl border-2 border-amber-300 bg-white font-black text-amber-900 hover:bg-amber-100"
                                    >
                                      {option}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        ),
                      )}

                      {result.uncertain.length === 0 &&
                        result.confidence < 0.999 && (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <b>Dica:</b> a leitura não chegou a 100%. Tente um
                            local melhor iluminado ou ative o flash/lanterna
                            antes de fotografar novamente.
                          </div>
                        )}

                      {result.uncertain.length === 0 &&
                        result.confidence >= 0.999 && (
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
                          disabled={result.uncertain.length > 0}
                          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <CheckCircle2 size={18} />
                          {result.uncertain.length > 0
                            ? "Revise antes de confirmar"
                            : "Confirmar correção"}
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
                          A leitura usa contraste local, área preenchida e
                          normalização da iluminação para tolerar sombras, folha
                          mais escura e preenchimentos imperfeitos. Quando duas
                          bolinhas parecem marcadas, o sistema não escolhe
                          sozinho: ele pede a decisão do professor.
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
