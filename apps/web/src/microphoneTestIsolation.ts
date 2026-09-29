/** Coordinate the settings portal and the voice session without publishing the
 * test capture. A lease is active before we await the room's mute operation. */
type Reconcile = () => Promise<void>;
const handlers = new Set<Reconcile>();
let leases = 0;

async function reconcileAll() {
  const results = await Promise.allSettled([...handlers].map(handler => handler()));
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

export function isMicrophoneTestActive() { return leases > 0; }

export function registerMicrophoneTestIsolation(handler: Reconcile) {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

export async function acquireMicrophoneTestIsolation(): Promise<() => Promise<void>> {
  leases += 1;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    leases -= 1;
    await reconcileAll();
  };
  try {
    await reconcileAll();
    return release;
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}
