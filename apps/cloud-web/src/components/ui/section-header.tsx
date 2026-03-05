import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  label: string;
  className?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ label, className, action }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="section-label">{label}</span>
      {action}
    </div>
  );
}
