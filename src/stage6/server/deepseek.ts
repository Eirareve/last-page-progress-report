import "server-only";

import { DeepSeekLiveAgentAdapter } from "../deepseek/agent-adapter";
import { parseDeepSeekServerConfig } from "../deepseek/config";
import {
  DeepSeekCharlieSignatureReviewCandidatePort,
  DeepSeekLiveFinalReviewService,
} from "../deepseek/final-review";
import { DeepSeekOpenAICompatibleTransport } from "../deepseek/transport";

export function createDeepSeekServerComponents(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = parseDeepSeekServerConfig(environment);
  const transport = new DeepSeekOpenAICompatibleTransport({ config });
  const agentAdapter = new DeepSeekLiveAgentAdapter({ transport, config });
  const finalReviewCandidatePort =
    new DeepSeekCharlieSignatureReviewCandidatePort({ transport, config });
  const finalReviewService = new DeepSeekLiveFinalReviewService({
    candidatePort: finalReviewCandidatePort,
  });
  return Object.freeze({
    config,
    transport,
    agentAdapter,
    finalReviewCandidatePort,
    finalReviewService,
  });
}
