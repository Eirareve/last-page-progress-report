import { z } from "zod";

import { agentModeSchema } from "../runtime/schemas";
import { targetEnvironmentSchema } from "./schemas";

export const contentModeSchema = z.enum(["placeholder", "verified"]);

export const contentEnvironmentSchema = z.strictObject({
  appEnvironment: targetEnvironmentSchema,
  contentMode: contentModeSchema,
  agentMode: agentModeSchema,
});

export type ContentMode = z.infer<typeof contentModeSchema>;
export type ContentEnvironment = z.infer<typeof contentEnvironmentSchema>;

export class ContentEnvironmentConfigurationError extends Error {
  readonly code = "invalid_content_environment";

  constructor(message: string) {
    super(message);
    this.name = "ContentEnvironmentConfigurationError";
  }
}

export function resolveContentEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ContentEnvironment {
  const inferredAppEnvironment = inferAppEnvironment(environment);
  const candidate = {
    appEnvironment: environment.APP_ENV ?? inferredAppEnvironment,
    contentMode:
      environment.CONTENT_MODE ??
      (inferredAppEnvironment === "production" ? "verified" : "placeholder"),
    agentMode: environment.AGENT_MODE ?? "mock",
  };
  const parsed = contentEnvironmentSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new ContentEnvironmentConfigurationError(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
        .join("; "),
    );
  }

  return parsed.data;
}

export function isAllowedContentEnvironment(
  environment: ContentEnvironment,
): boolean {
  if (environment.appEnvironment === "test" && environment.agentMode !== "mock") {
    return false;
  }

  if (environment.contentMode === "placeholder") {
    return (
      environment.appEnvironment !== "production" &&
      environment.agentMode === "mock"
    );
  }

  return true;
}

function inferAppEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ContentEnvironment["appEnvironment"] {
  if (environment.NODE_ENV === "test") {
    return "test";
  }
  if (environment.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}
