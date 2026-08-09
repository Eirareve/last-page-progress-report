import { ExperienceClient } from "../stage5/experience-client";

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
  return <ExperienceClient sessionId={sessionId} />;
}
