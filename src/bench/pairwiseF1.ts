/**
 * Pairwise F1 for session segmentation evaluation.
 * For each pair of messages: same session in ground truth vs predicted.
 * TP = both say same session, FP = pred same / gt different, FN = gt same / pred different.
 */
import type { DramaticBenchMessage } from "./dramaticDataset";

export function pairwiseF1(
  messages: DramaticBenchMessage[],
  getGroundTruthSessionId: (messageId: number) => string,
  getPredictedSessionId: (messageId: number, chatId: number) => string | null
): { precision: number; recall: number; f1: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;

  const n = messages.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const idA = messages[i].messageId;
      const idB = messages[j].messageId;
      const gtA = getGroundTruthSessionId(idA);
      const gtB = getGroundTruthSessionId(idB);
      const predA = getPredictedSessionId(idA, messages[i].chatId);
      const predB = getPredictedSessionId(idB, messages[j].chatId);

      const sameGt = gtA === gtB;
      const samePred = predA !== null && predB !== null && predA === predB;

      if (samePred && sameGt) tp++;
      else if (samePred && !sameGt) fp++;
      else if (!samePred && sameGt) fn++;
    }
  }

  console.log("tp", tp, "fp", fp, "fn", fn);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}
