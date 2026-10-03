// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingPhoto } from "./SellerPhotoGallery";
import { LanguageProvider, setLanguage } from "./i18n";

vi.mock("next/image", () => ({ default: ({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} onError={onError} /> }));
afterEach(() => { cleanup(); setLanguage("en"); });

describe("provider listing previews", () => {
  it.each(["en", "zh"] as const)("opens the preview without claiming seller-photo evidence in %s", (lang) => {
    setLanguage(lang);
    render(<LanguageProvider><ListingPhoto listing={{ marketplace: "Whatnot", title: "Blastoise preview", imageKind: "listing_preview",
      imageUrl: "https://images.whatnot.com/preview.jpg", imageUrls: [] }} /></LanguageProvider>);
    const opener = screen.getByRole("button", { name: lang === "zh" ? "查看商品预览图：Blastoise preview" : "Inspect listing preview: Blastoise preview" });
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: lang === "zh" ? "商品预览图" : "Listing preview" })).toBeTruthy();
    expect(screen.getByText(lang === "zh" ? /不代表已核实的品相证据/ : /not verified condition evidence/)).toBeTruthy();
    expect(screen.getByRole("button", { name: lang === "zh" ? "关闭预览图" : "Close preview" })).toBeTruthy();
    expect(screen.queryByText(/Seller photos|卖家实拍/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("shows image failure honestly instead of substituting catalog art as a listing photo", () => {
    render(<LanguageProvider><ListingPhoto listing={{ marketplace: "Mercari", title: "Missing preview", imageKind: "listing_preview",
      imageUrl: "https://u-mercari-images.mercdn.net/preview.jpg", imageUrls: [] }} /></LanguageProvider>);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Image unavailable")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
