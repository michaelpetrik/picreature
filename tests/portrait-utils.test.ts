import { describe, expect, it, vi } from "vitest";
import { PortraitError } from "@/lib/server/portrait-errors";

const getImageDimensionsMock = vi.fn();

vi.mock("@/lib/server/portrait-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/portrait-utils")>(
    "@/lib/server/portrait-utils",
  );

  return {
    ...actual,
    getImageDimensions: getImageDimensionsMock,
  };
});

const { ensureValidUpload } = await import("@/lib/server/portrait-utils");

describe("ensureValidUpload", () => {
  it("rejects unsupported mime type", async () => {
    const file = new File([Buffer.from("abc")], "portrait.svg", {
      type: "image/svg+xml",
    });

    await expect(ensureValidUpload(file)).rejects.toBeInstanceOf(PortraitError);
  });

  it("rejects small portraits", async () => {
    getImageDimensionsMock.mockResolvedValueOnce({ width: 600, height: 800 });

    const file = new File([Buffer.from("fake-image")], "portrait.png", {
      type: "image/png",
    });

    await expect(ensureValidUpload(file)).rejects.toBeInstanceOf(PortraitError);
  });
});
