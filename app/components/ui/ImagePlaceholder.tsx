import { Image as ImageIcon, User } from "lucide-react";

interface ImagePlaceholderProps {
  kind: "equipment" | "player";
  className?: string;
  iconClassName?: string;
}

export function ImagePlaceholder({
  kind,
  className = "",
  iconClassName = "size-8",
}: ImagePlaceholderProps) {
  const Icon = kind === "player" ? User : ImageIcon;
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-neutral-100 text-neutral-400 ${className}`}
    >
      <Icon className={iconClassName} strokeWidth={1.5} />
    </div>
  );
}
