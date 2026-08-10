import { ExperienceClient } from "../stage5/experience-client";
import { resolveContentEnvironment } from "../content/environment";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSession = params.session;
  const sessionId =
    typeof rawSession === "string" && rawSession.trim().length > 0
      ? rawSession
      : null;
  const environment = resolveContentEnvironment(process.env);
  return (
    <ExperienceClient
      sessionId={sessionId}
      requestedMode={environment.agentMode}
      contentMode={environment.contentMode}
      targetEnvironment={environment.appEnvironment}
    />
  );
}
