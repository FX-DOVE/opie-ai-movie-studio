import io, os, threading, torch, numpy as np, scipy.io.wavfile as wf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from transformers import VitsModel, AutoTokenizer
torch.set_num_threads(int(os.getenv("TTS_THREADS", "1")))
LANGS = {"eng","yor","hau","ibo","pcm"}
_m, _lock = {}, threading.Lock()
def load(lang):
    if lang not in _m:
        n = f"facebook/mms-tts-{lang}"
        _m[lang] = (AutoTokenizer.from_pretrained(n), VitsModel.from_pretrained(n).eval())
    return _m[lang]
load("eng")
app = FastAPI()
class Req(BaseModel):
    text: str
    lang: str = "eng"
@app.get("/health")
def health(): return {"ok": True, "loaded": list(_m)}
@app.post("/tts")
def tts(r: Req):
    if r.lang not in LANGS: raise HTTPException(400, "lang")
    if not r.text.strip() or len(r.text) > 1000: raise HTTPException(400, "text")
    with _lock:
        try: tok, m = load(r.lang)
        except Exception as e: raise HTTPException(404, str(e))
        with torch.inference_mode():
            w = m(**tok(r.text, return_tensors="pt")).waveform[0].numpy()
    b = io.BytesIO(); wf.write(b, m.config.sampling_rate, (np.clip(w, -1, 1) * 32767).astype(np.int16))
    return Response(b.getvalue(), media_type="audio/wav")

# Dialogue-clarity ASR: Meta wav2vec2 (facebook/wav2vec2-base-960h), lazy-loaded, 16 kHz mono wav in.
from fastapi import Request
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
_asr = {}
@app.post("/stt")
async def stt(req: Request):
    data = await req.body()
    sr, a = wf.read(io.BytesIO(data))
    a = a.astype(np.float32) / (32768.0 if a.dtype == np.int16 else 1.0)
    if a.ndim > 1: a = a.mean(1)
    if sr != 16000: raise HTTPException(400, "need 16 kHz wav")
    with _lock:
        if not _asr:
            n = "facebook/wav2vec2-base-960h"
            _asr["p"], _asr["m"] = Wav2Vec2Processor.from_pretrained(n), Wav2Vec2ForCTC.from_pretrained(n).eval()
        with torch.inference_mode():
            ids = _asr["m"](_asr["p"](a, sampling_rate=16000, return_tensors="pt").input_values).logits.argmax(-1)
    return {"text": _asr["p"].batch_decode(ids)[0].lower()}
