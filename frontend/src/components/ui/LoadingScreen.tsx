import { cn } from '@/lib/utils';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingScreen({ message, fullScreen = true }: LoadingScreenProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center bg-navy',
        fullScreen ? 'min-h-screen' : 'h-64',
      )}
    >
      {/* Logo mark */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-accent-cyan/30 flex items-center justify-center">
          <span className="text-2xl font-mono font-bold text-gradient-cyan">M</span>
        </div>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-accent-cyan animate-spin" />
      </div>

      <p className="text-sm text-muted animate-pulse">
        {message ?? 'Loading Matrix Pro…'}
      </p>
    </div>
  );
}
