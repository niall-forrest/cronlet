import { cn } from "@/lib/utils";

interface LoadingProps {
  message?: string;
  className?: string;
}

export function Loading({ message, className }: LoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      <div className="relative mb-4">
        {/* Outer ring */}
        <div className="h-10 w-10 rounded-full border-2 border-primary/20" />
        {/* Spinning segment */}
        <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-primary" />
      </div>
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      )}
    </div>
  );
}

export function LoadingInline({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-primary" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}
