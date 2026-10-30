FROM python:3.11-slim
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir transformers==4.46.3 fastapi uvicorn scipy numpy
ENV HF_HOME=/models OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
RUN python -c "from transformers import VitsModel,AutoTokenizer as T;n='facebook/mms-tts-eng';T.from_pretrained(n);VitsModel.from_pretrained(n);from transformers import Wav2Vec2ForCTC as W,Wav2Vec2Processor as P;m='facebook/wav2vec2-base-960h';P.from_pretrained(m);W.from_pretrained(m)"
COPY app.py /app.py
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["nice","-n","10","uvicorn","app:app","--app-dir","/","--host","0.0.0.0","--port","8000","--workers","1"]
