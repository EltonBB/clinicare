import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
  className?: string;
  includeSubtitle?: boolean;
};

export function BrandMark({
  compact = false,
  href = "/dashboard",
  className,
  includeSubtitle = true,
}: BrandMarkProps) {
  const imageWidth = compact ? 40 : includeSubtitle ? 168 : 132;
  const imageHeight = compact ? 40 : includeSubtitle ? 72 : 56;

  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-xl text-foreground ${className ?? ""}`}
    >
      <Image
        src="/vela-logo.png"
        alt="Vela Clinic Management"
        width={imageWidth}
        height={imageHeight}
        priority
        className={compact ? "h-10 w-10 object-contain" : "h-auto w-auto object-contain"}
      />
    </Link>
  );
}
