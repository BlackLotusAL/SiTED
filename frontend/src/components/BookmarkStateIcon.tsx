import { Bookmark } from "lucide-react";

interface BookmarkStateIconProps {
  isBookmarked: boolean;
  size?: number;
}

export function BookmarkStateIcon({ isBookmarked, size = 16 }: BookmarkStateIconProps) {
  return <Bookmark aria-hidden="true" fill={isBookmarked ? "currentColor" : "none"} size={size} strokeWidth={2.2} />;
}
