import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/useVoice.ts');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);
let text = fs.readFileSync(file, 'utf8');

const duplicateEffect = `  useEffect(() => {\n    const room = roomRef.current;\n    if (!room) return;\n    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;\n    if (!publication?.track) return;\n    void applyMicrophoneTuning(room, publication).catch(() => { /* Runtime tuning is best effort. */ });\n  }, [applyMicrophoneTuning]);\n\n`;

if (text.includes(duplicateEffect)) {
  text = text.replace(duplicateEffect, '');
  fs.writeFileSync(file, text);
  console.log('Audio Stability v3 hotfix: duplicate applyMicrophoneTuning effect kaldirildi.');
} else if (text.includes('Runtime tuning is best effort.')) {
  throw new Error('Eski runtime tuning effect bulundu ama beklenen blokla eslesmedi. Elle inceleme gerekli.');
} else {
  console.log('Audio Stability v3 hotfix: duplicate effect zaten yok.');
}
