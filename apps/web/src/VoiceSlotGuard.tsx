import { useEffect } from 'react';

/**
 * VoiceDock mounts its participant list into a small DOM slot next to the
 * connected channel. React can reorder the keyed channel buttons after a
 * live channel update/drag without disconnecting that slot, which can leave
 * the participant list at the top of the category. Keep the slot anchored
 * immediately after the currently connected voice channel.
 */
export function VoiceSlotGuard() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const channel = document.querySelector<HTMLElement>('.flow-group .channel.voice-connected');
        const slot = document.querySelector<HTMLElement>('.voice-channel-members-slot');
        if (!channel || !slot) return;

        const correctlyPlaced = slot.parentElement === channel.parentElement && slot.previousElementSibling === channel;
        if (!correctlyPlaced) channel.insertAdjacentElement('afterend', slot);
      });
    };

    sync();
    const root = document.querySelector('.channels') || document.body;
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
