import { useState, useEffect } from 'react';
import { parseSignal, validateParsedSignal } from '@/lib/signalParser';
import type { ParsedSignal } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clipboard } from 'lucide-react';

interface SignalParserProps {
  onParsed: (signal: ParsedSignal | null) => void;
}

export default function SignalParserInput({ onParsed }: SignalParserProps) {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedSignal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!input.trim()) {
      setParsed(null);
      setError(null);
      onParsed(null);
      return;
    }
    const result = parseSignal(input);
    if (!result) {
      setError('Could not parse signal. Check the format.');
      setParsed(null);
      onParsed(null);
      return;
    }
    const validationError = validateParsedSignal(result);
    if (validationError) {
      setError(validationError);
      setParsed(null);
      onParsed(null);
    } else {
      setError(null);
      setParsed(result);
      onParsed(result);
    }
  }, [input, onParsed]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
    } catch {
      // clipboard not available
    }
  };

  return (
    <div className="space-y-3">
      {/* Textarea */}
      <div className="relative">
        <textarea
          rows={3}
          placeholder={`Paste signal here...\ne.g. NIFTY 25100 CE Above 70 TGT 85/100/120 SL 55`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className={cn(
            'input-base resize-none font-mono text-xs leading-relaxed pr-10',
            error && 'border-loss/60',
            parsed && 'border-profit/60',
          )}
        />
        <button
          type="button"
          onClick={handlePaste}
          className="absolute top-2 right-2 text-muted hover:text-foreground transition-colors"
          title="Paste from clipboard"
        >
          <Clipboard size={14} />
        </button>
      </div>

      {/* Parse result */}
      {parsed && (
        <div className="bg-profit/5 border border-profit/20 rounded-xl p-3 animate-fade-in">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 size={14} className="text-profit" />
            <span className="text-xs font-semibold text-profit">Signal parsed successfully</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Symbol', value: parsed.symbol },
              { label: 'Strike', value: parsed.strike },
              { label: 'Entry', value: parsed.entryPrice },
              { label: 'T1', value: parsed.t1 },
              { label: 'T2', value: parsed.t2 },
              { label: 'T3', value: parsed.t3 },
              { label: 'SL', value: parsed.sl },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] text-muted/60 uppercase tracking-wide">{label}</p>
                <p className="text-xs price text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && input.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-loss animate-fade-in">
          <XCircle size={13} />
          <span>{error}</span>
        </div>
      )}

      {/* Format hint */}
      {!input && (
        <p className="text-[10px] text-muted/50 leading-relaxed">
          Supported: <span className="font-mono">SYMBOL STRIKE Above ENTRY TGT T1/T2/T3 SL X</span>
        </p>
      )}
    </div>
  );
}
