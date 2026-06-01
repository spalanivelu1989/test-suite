import type { SVGProps } from "react";

interface RobotFaceProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * A line-art AI robot face with all features clearly visible: a domed head,
 * a topped antenna, two round eyes, side ears, and a mouth. Drawn in the same
 * stroke style as lucide icons (stroke="currentColor") so it inherits color
 * from its container — including the stage status tint in ThreeProgressBar.
 */
export function RobotFace({ size = 24, ...props }: RobotFaceProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* antenna */}
      <line x1="12" y1="1.5" x2="12" y2="4" />
      <circle cx="12" cy="1" r="1" fill="currentColor" stroke="none" />
      {/* head */}
      <rect x="4" y="4" width="16" height="18" rx="3.5" />
      {/* ears */}
      <line x1="2" y1="11" x2="2" y2="15" />
      <line x1="22" y1="11" x2="22" y2="15" />
      {/* eyes */}
      <circle cx="9" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
      {/* mouth */}
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
