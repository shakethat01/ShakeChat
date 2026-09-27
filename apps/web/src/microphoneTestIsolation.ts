/** Coordinate the settings portal and the voice session without publishing the
 * test capture. A lease is active before we await the room's mute operation. */
type Reconcile = () => Promise<void>;
let reconcile: Reconcile | undefined;
let leases = 0;

export function isMicrophoneTestActive() { return leases > 0; }

export function registerMicrophoneTestIsolation(handler: Reconcile) {
  reconcile = handler;
  return () => { if (reconcile === handler) reconcile = undefined; };
}

export async function acquireMicrophoneTestIsolation(): Promise<() => Promise<void>> {
  leases += 1;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    leases -= 1;
    await reconcile?.();
  };
  try {
    await reconcile?.();
    return release;
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}
