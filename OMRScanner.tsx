import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, ImageUp, X } from "lucide-react";

export type OMRAnswer = "A" | "B" | "C" | "D";

const WIDTH = 794;
const HEIGHT = 1123;
const XS_LEFT = [186, 248, 310, 372];
const XS_RIGHT = [536, 598, 660, 722];
const YS = [330, 455, 580, 705, 830];
const LETTERS: OMRAnswer[] = ["A", "B", "C", "D"];

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a foto.")); };
    image.src = url;
  });
}

function scoreCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const radius = 14;
  const image = ctx.getImageData(cx - radius, cy - radius, radius * 2 + 1, radius * 2 + 1);
  let dark = 0;
  let total = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const dx = x - radius;
      const dy = y - radius;
      if (dx * dx + dy * dy > radius * radius) continue;
      const i = (y * image.width + x) * 4;
      const gray = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
      if (gray < 130) dark++;
      total++;
    }
  }
  return total ? dark / total : 0;
}

async function detectAnswers(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

  const answers: OMRAnswer[] = [];
  const confidence: number[] = [];
  for (let row = 0; row < 5; row++) {
    for (const xs of [XS_LEFT, XS_RIGHT]) {
      const scores = xs.map((x) => scoreCircle(ctx, x, YS[row]));
      const sorted = [...scores].sort((a, b) => b - a);
      const best = sorted[0];
      const second = sorted[1];
      // A marca preenchida deve se destacar da borda de uma bolha vazia.
      if (best < 0.18 || best - second < 0.055) {
        throw new Error(`Não foi possível identificar com segurança a questão ${row + (xs === XS_LEFT ? 1 : 6)}. Tire a foto novamente mantendo a folha inteira visível.`);
      }
      answers.push(LETTERS[scores.indexOf(best)]);
      confidence.push(best - second);
    }
  }
  return { answers, confidence };
}

export default function OMRScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (answers: OMRAnswer[]) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [message, setMessage] = useState("Escolha uma foto ou use a câmera.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  async function openCamera() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setStream(media);
      setMessage("Centralize o A4 e mantenha os quatro marcadores visíveis.");
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setMessage("Não foi possível acessar a câmera. Você pode selecionar uma foto.");
    }
  }

  async function processImage(image: HTMLImageElement) {
    try {
      setBusy(true);
      setMessage("Lendo as marcações...");
      const { answers } = await detectAnswers(image);
      onDetected(answers);
      onClose();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o gabarito.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await processImage(await readImage(file)); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao abrir a foto."); }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const image = new Image();
    image.onload = () => void processImage(image);
    image.src = canvas.toDataURL("image/jpeg", 0.95);
  }

  return <div className="fixed inset-0 z-50 bg-slate-950 p-4"><div className="mx-auto flex h-full max-w-4xl flex-col"><div className="flex items-center justify-between py-3 text-white"><div><p className="font-black">Ler gabarito</p><p className="text-xs text-slate-300">{message}</p></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><X /></button></div><div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-3xl bg-black"><video ref={videoRef} muted playsInline className="max-h-full w-full object-contain" /><div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-dashed border-white/60" />{!stream && <div className="absolute inset-0 grid place-items-center p-6"><div className="rounded-3xl bg-white p-6 text-center"><Camera className="mx-auto text-blue-600" size={42}/><h3 className="mt-3 font-black">Foto do gabarito</h3><p className="mt-1 text-sm text-slate-500">Use uma foto nítida da folha inteira.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => void openCamera()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"><Camera size={17}/>Abrir câmera</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 font-bold"><ImageUp size={17}/>Escolher foto<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFile(e)}/></label></div></div></div>}</div><div className="flex flex-wrap justify-center gap-2 py-3">{stream && <><button disabled={busy} onClick={() => void capture()} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-50"><Check size={18}/>Capturar e corrigir</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-slate-900"><ImageUp size={18}/>Usar outra foto<input type="file" accept="image/*" className="hidden" onChange={(e) => void handleFile(e)}/></label></>}</div></div></div>;
}
