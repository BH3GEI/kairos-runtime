import { createDenseEmbedder } from "./embedding";

const samples = [
  "今天天气不错，适合散步。",
  "今天是个好天气，要不要出来走走？",
  "BGE-M3 dense embedding test.",
  "你好，世界。",
];

async function main() {
  const embedder = createDenseEmbedder();
  const vectors = await embedder.embedDense(samples);

  console.log(`[embed] provider=${process.env.EMBED_PROVIDER ?? "ollama"}`);
  console.log(`[embed] inputs=${samples.length}, outputs=${vectors.length}`);

  for (let i = 0; i < vectors.length; i += 1) {
    const vector = vectors[i] ?? [];
    const preview = vector.slice(0, 5).map((value) => value.toFixed(6));
    console.log(
      `[embed] #${i + 1} dim=${vector.length}, head=[${preview.join(", ")}]`,
    );
  }
}

main().catch((error) => {
  console.error("[embed] test failed:", error);
  process.exit(1);
});
