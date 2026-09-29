/** Native video is published by a screen-only participant. UI, volume and
 * viewer notifications belong to its regular voice participant on every client. */
export function isNativeScreenIdentity(identity: string) { return identity.startsWith('screen:'); }
export function screenOwner(identity: string) { return isNativeScreenIdentity(identity) ? identity.slice(7) : identity; }
export function nativeScreenIdentity(identity: string) { return `screen:${screenOwner(identity)}`; }
