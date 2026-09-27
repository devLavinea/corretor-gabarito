import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
export function QRScanner({onClose,onResult}:{onClose:()=>void;onResult:(value:string)=>void}){
 const [error,setError]=useState(''); const started=useRef(false);
 useEffect(()=>{const id='qr-reader'; const scanner=new Html5Qrcode(id); let active=true;
  const start=async()=>{try{await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}},(decoded)=>{if(active){active=false;scanner.stop().catch(()=>{});onResult(decoded)}} ,()=>{});started.current=true}catch(e){setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.')}};start();
  return()=>{active=false;if(started.current)scanner.stop().catch(()=>{});};
 },[onResult]);
 return <div className="fixed inset-0 z-50 bg-slate-950/90 p-4"><div className="mx-auto flex h-full max-w-lg flex-col justify-center"><div className="mb-4 flex items-center justify-between text-white"><div className="flex items-center gap-2 font-bold"><Camera size={20}/> Leitor de QR Code</div><button onClick={onClose} className="rounded-xl bg-white/10 p-2"><X/></button></div><div className="overflow-hidden rounded-3xl bg-white p-3 shadow-2xl"><div id="qr-reader" className="scan-reader w-full"/><p className="px-2 py-3 text-center text-sm text-slate-500">Aponte a câmera para o QR Code do gabarito.</p>{error&&<p className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-700">{error}</p>}</div></div></div>
}
