import Image from "next/image";

import { cn } from "@/lib/utils";

import brandLogo from "./brand-logo.png";
import brandMark from "./brand-mark.png";

interface LogoMarkProps {
  className?: string;
}

/**
 * The standalone Digital Leap mark (the pink leaping figure). Reads on any
 * background, so it suits compact / square placements (avatars, collapsed nav).
 */
export function LogoMark({ className }: LogoMarkProps) {
  return (
    <Image
      src={brandMark}
      alt="Digital Leap"
      priority
      className={cn("h-9 w-9 object-contain", className)}
    />
  );
}

interface LogoProps {
  className?: string;
  /**
   * When the logo sits on a dark/navy surface, set `light` to place it on a
   * white chip so the navy wordmark stays legible (the official artwork uses
   * navy text, which would otherwise disappear on a dark background).
   */
  light?: boolean;
}

/**
 * Full Digital Leap lockup using the official logo artwork.
 */
export function Logo({ className, light = false }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center",
        light && "rounded-lg bg-white px-3 py-2 shadow-sm",
        className,
      )}
    >
      <Image
        src={brandLogo}
        alt="Digital Leap — Marketing Solutions"
        priority
        className="h-8 w-auto object-contain"
      />
    </span>
  );
}

export default Logo;
