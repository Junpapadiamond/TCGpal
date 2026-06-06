import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f4f7f3",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 46,
            position: "relative",
            width: 46,
          }}
        >
          <div
            style={{
              background: "#d7a84e",
              border: "2px solid #24585c",
              borderRadius: 7,
              height: 38,
              left: 8,
              position: "absolute",
              top: 4,
              transform: "rotate(-11deg)",
              width: 30,
            }}
          />
          <div
            style={{
              background: "#fcfbf6",
              border: "2px solid #24585c",
              borderRadius: 7,
              height: 40,
              left: 6,
              position: "absolute",
              top: 3,
              transform: "rotate(7deg)",
              width: 33,
            }}
          />
          <div
            style={{
              alignItems: "center",
              background: "#2f6f73",
              border: "2px solid #1f474a",
              borderRadius: 7,
              color: "#fcfbf6",
              display: "flex",
              fontSize: 23,
              fontWeight: 900,
              height: 36,
              justifyContent: "center",
              left: 5,
              position: "absolute",
              top: 5,
              width: 36,
            }}
          >
            T
          </div>
          <div
            style={{
              background: "rgba(252,251,246,0.85)",
              borderRadius: 999,
              height: 3,
              left: 15,
              position: "absolute",
              top: 28,
              width: 16,
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
