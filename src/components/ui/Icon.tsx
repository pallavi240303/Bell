import {
  ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronUp, FileCode2, Landmark, Menu, Minus, Pause, Play, Plus,
  ShieldCheck, Vault, Wallet, X, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'book-open': BookOpen, 'chevron-down': ChevronDown,
  'chevron-up': ChevronUp, 'file-code-2': FileCode2, landmark: Landmark, menu: Menu, minus: Minus, pause: Pause,
  play: Play, plus: Plus, 'shield-check': ShieldCheck, vault: Vault, wallet: Wallet, x: X,
};

type IconProps = { name: string; size?: number; stroke?: number; className?: string; style?: React.CSSProperties };

/** Lucide icon by kebab-case name: a size×size inline box, 1.5 stroke, sitting slightly below the baseline. */
export function Icon({ name, size = 14, stroke = 1.5, className = '', style }: IconProps) {
  const Cmp = ICONS[name];
  return (
    <span aria-hidden="true" className={`inline-block flex-none leading-[0] align-[-0.15em] ${className}`} style={{ width: size, height: size, ...style }}>
      {Cmp && <Cmp size={size} strokeWidth={stroke} absoluteStrokeWidth={false} className="block overflow-visible" />}
    </span>
  );
}
