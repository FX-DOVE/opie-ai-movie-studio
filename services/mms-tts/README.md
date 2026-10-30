# ReelForge voice service (Meta models, self-hosted, CPU)
- POST /tts {text, lang} -> wav. Meta MMS-TTS `facebook/mms-tts-{eng,yor,hau,ibo,pcm}` (eng preloaded, others lazy).
- POST /stt (16 kHz wav) -> {text}. Meta `facebook/wav2vec2-base-960h` (lazy) for the dialogue-clarity check.
- Licence: MMS-TTS weights are CC-BY-NC 4.0 (non-commercial). wav2vec2-base-960h is Apache-2.0.
Internal network only; 1 thread, nice 10.
