"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedListing } from "@/lib/schemas";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPhotoProof,
  IconReceipt,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "./icons";
import { useT } from "./i18n";

type ListingPhotoProps = {
  listing: Pick<NormalizedListing, "imageUrl" | "imageUrls" | "marketplace" | "title">;
};

export function ListingPhoto({ listing }: ListingPhotoProps) {
  const t = useT();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const photos = useMemo(() => [...new Set([
    ...(listing.imageUrl ? [listing.imageUrl] : []),
    ...listing.imageUrls,
  ])], [listing.imageUrl, listing.imageUrls]);
  const closeGallery = useCallback(() => setGalleryOpen(false), []);

  return (
    <figure className="w-[64px] min-w-0 lg:w-[72px]">
      {photos.length > 0 ? (
        <button
          ref={openerRef}
          type="button"
          aria-label={t.result.inspectSellerPhotos(photos.length, listing.title)}
          className="group relative block aspect-[2.5/3.5] w-full overflow-hidden rounded-md border border-[#c9d7ce] bg-[#e7efe8] text-[#fcfbf6] transition hover:border-[#2f6f73] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/30"
          onClick={() => setGalleryOpen(true)}
        >
          <Image
            src={photos[0]}
            alt={t.result.listingEvidenceAlt(listing.title)}
            fill
            loading="eager"
            sizes="72px"
            className="object-contain transition duration-200 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[#24312f]/78 px-1 py-1 text-[9px] font-black">
            <IconPhotoProof className="h-3 w-3" />
            {photos.length}
          </span>
        </button>
      ) : (
        <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-md border border-[#c9d7ce] bg-[#e7efe8]">
          <span className="absolute inset-0 grid place-items-center text-[#94a59c]"><IconReceipt className="h-5 w-5" /></span>
        </div>
      )}
      <figcaption className="mt-1 text-center text-[9px] font-black uppercase leading-3 tracking-[0.04em] text-[#64736c]">
        {t.result.listingEvidencePhoto}
      </figcaption>
      {galleryOpen && photos.length > 0 && (
        <SellerPhotoDialog
          photos={photos}
          listing={listing}
          openerRef={openerRef}
          onClose={closeGallery}
        />
      )}
    </figure>
  );
}

function SellerPhotoDialog({
  photos,
  listing,
  openerRef,
  onClose,
}: {
  photos: string[];
  listing: Pick<NormalizedListing, "marketplace" | "title">;
  openerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const showPrevious = useCallback(() => {
    setIndex((current) => (current - 1 + photos.length) % photos.length);
    setZoom(1);
  }, [photos.length]);
  const showNext = useCallback(() => {
    setIndex((current) => (current + 1) % photos.length);
    setZoom(1);
  }, [photos.length]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = openerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && photos.length > 1) {
        event.preventDefault();
        showPrevious();
        return;
      }
      if (event.key === "ArrowRight" && photos.length > 1) {
        event.preventDefault();
        showNext();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose, openerRef, photos.length, showNext, showPrevious]);

  const photoNumber = index + 1;
  const zoomClass = zoom === 2 ? "scale-200" : zoom === 1.5 ? "scale-150" : "scale-100";
  const marketplaceName = listing.marketplace === "eBay" ? "eBay" : listing.marketplace;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17201e]/82 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.result.sellerPhotosTitle}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-xl border border-[#52635c] bg-[#182220] text-[#fcfbf6] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#52635c]/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconPhotoProof className="h-4 w-4 shrink-0 text-[#d7a84e]" />
              <h2 className="font-serif text-lg font-black">{t.result.sellerPhotosTitle}</h2>
              <span className="rounded border border-[#64736c] px-1.5 py-0.5 text-[10px] font-black text-[#d7ddd8]">
                {t.result.sellerPhotoCount(photoNumber, photos.length)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-bold text-[#becac3]">{listing.title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t.result.closePhotoGallery}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#64736c] text-[#fcfbf6] transition hover:bg-[#2b3935] focus:outline-none focus:ring-2 focus:ring-[#d7a84e]"
            onClick={onClose}
          >
            <IconX className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-auto bg-[#0f1715] touch-pinch-zoom">
          <div className="grid min-h-[48vh] place-items-center overflow-hidden p-5 sm:min-h-[58vh] sm:p-8">
            <Image
              key={photos[index]}
              src={photos[index]}
              alt={t.result.sellerPhotoAlt(photoNumber, photos.length, listing.title)}
              width={1200}
              height={1600}
              unoptimized
              className={`max-h-[68vh] w-auto max-w-full object-contain transition-transform duration-200 motion-reduce:transition-none ${zoomClass}`}
            />
          </div>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t.result.previousPhoto}
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#7a8982] bg-[#182220]/90 text-[#fcfbf6] shadow-lg transition hover:bg-[#2b3935] focus:outline-none focus:ring-2 focus:ring-[#d7a84e] sm:left-4"
                onClick={showPrevious}
              >
                <IconChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label={t.result.nextPhoto}
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#7a8982] bg-[#182220]/90 text-[#fcfbf6] shadow-lg transition hover:bg-[#2b3935] focus:outline-none focus:ring-2 focus:ring-[#d7a84e] sm:right-4"
                onClick={showNext}
              >
                <IconChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        <footer className="border-t border-[#52635c]/70 bg-[#182220] px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-[#becac3]">
              {listing.marketplace === "eBay"
                ? t.result.sellerPhotosDisclaimer
                : t.result.sellerPhotosDisclaimer.replace("eBay", marketplaceName)}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label={t.result.zoomOut}
                disabled={zoom === 1}
                className="grid h-10 w-10 place-items-center rounded-md border border-[#64736c] transition hover:bg-[#2b3935] focus:outline-none focus:ring-2 focus:ring-[#d7a84e] disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setZoom((current) => current === 2 ? 1.5 : 1)}
              >
                <IconZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t.result.zoomIn}
                disabled={zoom === 2}
                className="grid h-10 w-10 place-items-center rounded-md border border-[#64736c] transition hover:bg-[#2b3935] focus:outline-none focus:ring-2 focus:ring-[#d7a84e] disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setZoom((current) => current === 1 ? 1.5 : 2)}
              >
                <IconZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label={t.result.sellerPhotosTitle}>
              {photos.map((photo, photoIndex) => (
                <button
                  key={photo}
                  type="button"
                  role="listitem"
                  aria-label={t.result.selectSellerPhoto(photoIndex + 1)}
                  aria-current={photoIndex === index ? "true" : undefined}
                  className={`relative h-14 w-11 shrink-0 overflow-hidden rounded border-2 bg-[#0f1715] transition focus:outline-none focus:ring-2 focus:ring-[#d7a84e] ${photoIndex === index ? "border-[#d7a84e]" : "border-[#52635c] hover:border-[#9fb3a8]"}`}
                  onClick={() => {
                    setIndex(photoIndex);
                    setZoom(1);
                  }}
                >
                  <Image src={photo} alt="" fill unoptimized loading="lazy" sizes="44px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
