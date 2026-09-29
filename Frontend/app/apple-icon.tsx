import { ImageResponse } from "next/og";

// Home-screen icon for iOS / iPadOS (Safari doesn't use SVG favicons there).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f12",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <g fill="none" stroke="#c9a45c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M32 13v37" />
            <path d="M23 51h18" />
            <path d="M14 21h36" />
            <path d="M18.5 21 12 35h13l-6.5-14Z" />
            <path d="M45.5 21 39 35h13l-6.5-14Z" />
            <path d="M12 35c0 3.4 2.9 5.5 6.5 5.5S25 38.4 25 35" />
            <path d="M39 35c0 3.4 2.9 5.5 6.5 5.5S52 38.4 52 35" />
          </g>
          <circle cx="32" cy="12.5" r="3" fill="#c9a45c" />
        </svg>
      </div>
    ),
    size,
  );
}
