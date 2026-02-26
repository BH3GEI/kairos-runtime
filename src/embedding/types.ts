export interface DenseEmbedder {
  embedDense(input: string[]): Promise<number[][]>;
  dimension?: number;
}

export interface CreateDenseEmbedderOptions {
  provider?: "ollama" | "native";
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  batchSize?: number;
}
