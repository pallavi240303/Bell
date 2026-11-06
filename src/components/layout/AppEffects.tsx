import { PointerEffects } from './PointerEffects';
import { TargetCursor } from './TargetCursor';

/** Page-wide effects, mounted once: click sparks, spotlight and tilt cards, and the target cursor. */
export function AppEffects() {
  return (
    <>
      <PointerEffects />
      <TargetCursor />
    </>
  );
}
