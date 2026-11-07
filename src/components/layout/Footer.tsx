import { useBell } from '@/state/useBell';
import { DitherVeil } from '@/components/ui/DitherVeil';
import { Reveal } from '@/components/ui/Reveal';
import { Button } from '@/components/ui/Controls';
import { BookOpen, FileCode2, Github, ShieldCheck, Coins } from 'lucide-react';

/** Shared brand footer; operational status belongs in Activity. */
export function Footer() {
  const v = useBell();
  return (
    <footer className="bell-footer home-footer" id="sources" data-spark-color="#FFFFFF">
        <DitherVeil rgb={[255,255,255]} alpha={0.22} pixelSize={5} className="footer-dither" />
        <Reveal><div className="footer-statement">
          <p>THE MARKET WILL CLOSE AGAIN.</p>
          <h2>THIS TIME, THE BUYER IS ALREADY THERE.</h2>
          <div className="footer-wordmark"><span className="font-display">BELL</span><i aria-hidden="true" /></div>
          <span>BACKED BEFORE THE BELL.</span>
          <div className="footer-actions">
            <Button variant="secondary" onClick={v.goBorrow}><ShieldCheck size={17} aria-hidden="true"/>PROTECT A LOAN</Button>
            <Button variant="ghost" onClick={v.goBackup}><Coins size={17} aria-hidden="true"/>FUND A BACKUP</Button>
          </div>
        </div></Reveal>
      <div className="flex flex-wrap justify-between gap-4">
        <nav className="flex flex-wrap gap-5" aria-label="Footer">
          <a className="text-white" href="https://github.com/pallavi240303/Bell/blob/main/docs/PRD.md" target="_blank" rel="noreferrer">
            <BookOpen size={16} aria-hidden="true"/> DOCS
          </a>
          <a className="text-white" href="https://github.com/pallavi240303/Bell/tree/main/contracts/src" target="_blank" rel="noreferrer">
            <FileCode2 size={16} aria-hidden="true"/> CONTRACTS
          </a>
          <a className="text-white" href="https://github.com/pallavi240303/Bell" target="_blank" rel="noreferrer">
            <Github size={16} aria-hidden="true"/> GITHUB
          </a>
        </nav>
      </div>
    </footer>
  );
}
