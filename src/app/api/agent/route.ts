import { createStage6AgentPostHandler } from "../../../stage6/server/handler";
import { readStage6ServerConfig } from "../../../stage6/server/config";
import { createDeepSeekServerComponents } from "../../../stage6/server/deepseek";
import { createStage6ServerExecutor } from "../../../stage6/server/executor";
import { Stage6SessionLedger } from "../../../stage6/server/session-ledger";
import { resolveForwardedSourceKey } from "../../../stage6/http-guards";
import { getFirstRequestGatedContent } from "../../../content/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const config = readStage6ServerConfig();
const ledger = new Stage6SessionLedger();
let executor: ReturnType<typeof createStage6ServerExecutor> | null = null;

function getExecutor() {
  if (executor !== null) return executor;
  const components = createDeepSeekServerComponents();
  executor = createStage6ServerExecutor({
    agentPort: components.agentAdapter,
    finalReviewService: components.finalReviewService,
    loadGatedContent: getFirstRequestGatedContent,
    ledger,
  });
  return executor;
}

export const POST = createStage6AgentPostHandler({
  config,
  execute: (request, context) => getExecutor()(request, context),
  sourceKey: resolveForwardedSourceKey,
});
