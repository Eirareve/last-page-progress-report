import { canonicalizeJson } from "../content/canonical-json";
import { sha256NfcUtf8 } from "../domain";
import type {
  Stage4PersistenceSidecars,
  Stage4SessionState,
} from "../fsm";

export function computeStage4SnapshotChecksum(input: {
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
}) {
  return sha256NfcUtf8(
    canonicalizeJson({ state: input.state, sidecars: input.sidecars }),
  );
}
