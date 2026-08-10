import type {
  Stage6ProviderAttemptOutcome,
  Stage6ProviderAttemptRequest,
  Stage6ProviderTransport,
} from "../provider-execution";

export class FakeStage6ProviderTransport implements Stage6ProviderTransport {
  readonly calls: Stage6ProviderAttemptRequest[] = [];

  constructor(
    readonly outcomes: readonly Stage6ProviderAttemptOutcome[],
    readonly provider = "fake-provider",
    readonly modelName = "fake-text-model",
  ) {}

  async execute(
    request: Stage6ProviderAttemptRequest,
    signal: AbortSignal,
  ): Promise<Stage6ProviderAttemptOutcome> {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    this.calls.push(request);
    const outcome = this.outcomes[this.calls.length - 1];
    if (outcome === undefined) {
      throw new Error("Fake provider outcome queue exhausted");
    }
    return Promise.resolve(outcome);
  }
}
