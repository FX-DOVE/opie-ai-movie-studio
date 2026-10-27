import Link from "next/link";
export const metadata = { title: "Host LTX-Video on a GPU · ReelForge Studio" };

const Code = ({ children }: { children: string }) => <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] leading-relaxed text-ink-200"><code>{children}</code></pre>;
const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;

export default function LtxDocs() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-ink-300 sm:px-6">
      <Link href="/admin" className="text-xs text-ink-400 hover:text-white">← Admin</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Host LTX-Video on a GPU and connect it</h1>
      <p className="mt-2">ReelForge can send image→video (and first+last frame) jobs to your own LTX-Video server. Two options: <b className="text-white">ComfyUI</b> on a rented GPU (cheapest per clip, full control), or the <b className="text-white">LTX API</b> format (Lightricks’ hosted API, or any server that speaks the same <code>/v2/image-to-video</code> contract).</p>

      <H>1 · Rent a GPU</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><b className="text-white">RunPod</b> → Pods → Deploy. Pick a 24 GB+ card (RTX 4090 / L40S / A6000; 48–80 GB for the larger LTX-2 checkpoints). Template: <i>ComfyUI</i> (or <i>RunPod PyTorch</i> and install ComfyUI yourself). Expose HTTP port <code>8188</code>. Add a 60–100 GB volume so models survive restarts.</li>
        <li><b className="text-white">Vast.ai</b> → Search → filter VRAM ≥ 24 GB, “Direct ports”. Use a ComfyUI image, open port <code>8188</code>, disk ≥ 80 GB.</li>
        <li>Stop the pod when you’re not rendering — you pay per hour while it runs. Check current hourly prices on the provider; enter your own cost-per-second estimate in Admin so the project estimate is right.</li>
      </ul>

      <H>2 · Install the LTX nodes and models (ComfyUI)</H>
      <Code>{`cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/Lightricks/ComfyUI-LTXVideo
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite   # mp4 output node
pip install -r ComfyUI-LTXVideo/requirements.txt -r ComfyUI-VideoHelperSuite/requirements.txt

# models (Hugging Face: Lightricks/LTX-Video or Lightricks/LTX-2 — pick the checkpoint that fits your VRAM)
cd /workspace/ComfyUI/models
huggingface-cli download Lightricks/LTX-Video ltxv-2b-0.9.8-distilled.safetensors --local-dir checkpoints
huggingface-cli download comfyanonymous/flux_text_encoders t5xxl_fp16.safetensors --local-dir text_encoders

# restart ComfyUI listening on all interfaces
python main.py --listen 0.0.0.0 --port 8188`}</Code>
      <p className="mt-2">Open ComfyUI, load an LTX image-to-video example workflow from ComfyUI-LTXVideo, make sure it renders one clip, then <b className="text-white">Workflow → Export (API)</b>. Replace the prompt text with <code>{"{{PROMPT}}"}</code>, the LoadImage file name with <code>{"{{IMAGE}}"}</code> (and <code>{"{{END_IMAGE}}"}</code> for a last-frame LoadImage), and width/height/length/fps/seed with <code>{"{{WIDTH}} {{HEIGHT}} {{FRAMES}} {{FPS}} {{SEED}}"}</code>. Paste it into the provider’s “ComfyUI workflow” box. If you leave it blank, ReelForge uses a built-in LTX image→video graph (2B distilled checkpoint + T5 encoder names above).</p>

      <H>3 · Secure the endpoint</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>The RunPod proxy URL (<code>https://POD_ID-8188.proxy.runpod.net</code>) and Vast direct ports are reachable by anyone who knows them. Put a token in front: e.g. Caddy/nginx with <code>Authorization: Bearer …</code> check, or a Cloudflare Tunnel + Access service token.</li>
        <li>ReelForge sends the provider’s API key as <code>Authorization: Bearer &lt;key&gt;</code> on every ComfyUI request, so the same token works with that proxy. Keys are encrypted at rest and never sent to the browser.</li>
      </ul>

      <H>4 · Connect it in ReelForge</H>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Admin → <b className="text-white">Video providers</b> → Add <i>LTX-Video via ComfyUI</i>.</li>
        <li>Base URL: <code>https://POD_ID-8188.proxy.runpod.net</code> (or your proxy/tunnel URL). API key: your proxy token (optional if unsecured).</li>
        <li>Set max duration (LTX is happiest at 2–10 s), aspects, “First + last frame” if your workflow has the end image, and a cost per second.</li>
        <li>Save, then <b className="text-white">Test (2 s clip)</b> — the clip previews inline.</li>
        <li>Drag it up the list to make it the default fallback, or pick it per project in Video mode → Video provider.</li>
      </ol>

      <H>Option B · LTX API format</H>
      <p className="mt-2">Add <i>LTX-Video 2.x API server</i>. Base URL <code>https://api.ltx.io</code> (or your server), model e.g. <code>ltx-2-3-fast</code> / <code>ltx-2-3-pro</code>, resolution e.g. <code>1920x1080</code>. ReelForge posts <code>{"{image_uri, last_frame_uri?, prompt, model, duration, resolution}"}</code> to <code>/v2/image-to-video</code>, polls <code>/v2/image-to-video/&#123;id&#125;</code> and downloads <code>result.video_url</code>. Servers that only implement the older synchronous <code>/v1/image-to-video</code> (returns the MP4 directly) are detected automatically.</p>

      <H>Other providers</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><b className="text-white">Generic OpenAI-compatible</b>: defaults to the <code>POST /videos</code> → <code>GET /videos/&#123;id&#125;</code> → <code>/videos/&#123;id&#125;/content</code> flow; edit the JSON mapping for other gateways (paths, field names, multipart vs JSON data-URL, status/url paths).</li>
        <li><b className="text-white">MiniMax Hailuo</b>: <code>video_generation</code> → <code>query/video_generation</code> → <code>files/retrieve</code>, with <code>first_frame_image</code> + <code>last_frame_image</code>.</li>
        <li><b className="text-white">Veo</b>, <b className="text-white">fal.ai</b> (queue API) and <b className="text-white">Replicate</b> (predictions API) are also available.</li>
      </ul>
    </main>
  );
}
