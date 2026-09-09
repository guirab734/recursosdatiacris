"use client";
import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Play,
  Sparkles,
} from "lucide-react";
import type { Media } from "@/lib/types";

export function ProductGallery({
  media,
  name,
  href,
  badge,
}: {
  media: Media[];
  name: string;
  href?: string;
  badge?: string | null;
}) {
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      media.findIndex((item) => item.type === "image"),
    ),
  );
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const thumbs = useRef<HTMLDivElement>(null);
  const index = selected < media.length ? selected : 0;
  const current = media[index];
  const multiple = media.length > 1;
  function select(next: number) {
    const normalized = (next + media.length) % media.length;
    setSelected(normalized);
    const strip = thumbs.current;
    const thumb = strip?.children[normalized] as HTMLElement | undefined;
    if (strip && thumb) {
      strip.scrollTo({
        left:
          thumb.offsetLeft -
          strip.offsetLeft -
          (strip.clientWidth - thumb.clientWidth) / 2,
        behavior: "auto",
      });
    }
  }
  function startSwipe(event: PointerEvent) {
    if (
      !multiple ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("video, button")
    )
      return;
    swipe.current = { x: event.clientX, y: event.clientY };
  }
  function endSwipe(event: PointerEvent) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.3) {
      select(index + (x < 0 ? 1 : -1));
      suppressClickUntil.current = Date.now() + 400;
    }
  }
  const picture =
    current?.type === "image" ? (
      <img
        key={current.id}
        src={current.url}
        alt={`${name}, foto ${index + 1}`}
        width="700"
        height="700"
        loading={href ? "lazy" : "eager"}
        draggable={false}
      />
    ) : null;
  return (
    <div
      className={`product-gallery ${href ? "gallery-card" : "gallery-detail"}`}
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Fotos e vídeos de ${name}`}
      tabIndex={multiple ? 0 : undefined}
      onKeyDown={(event) => {
        if (!multiple || (event.target as HTMLElement).closest("video")) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          select(index + (event.key === "ArrowLeft" ? -1 : 1));
        }
      }}
    >
      <div
        className={
          href ? "product-image gallery-stage" : "gallery-main gallery-stage"
        }
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => {
          swipe.current = null;
        }}
        onClickCapture={(event) => {
          if (Date.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {current?.type === "video" ? (
          <video
            key={current.id}
            src={current.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Vídeo de ${name}`}
          />
        ) : href ? (
          <Link href={href} className="gallery-photo-link" draggable={false}>
            {picture}
            <span className="view-product">
              Conhecer o recurso <ArrowUpRight size={17} />
            </span>
          </Link>
        ) : (
          picture
        )}
        {!current && (
          <div className="gallery-placeholder">
            <ImageIcon size={40} />
          </div>
        )}
        {badge && (
          <span className="product-badge">
            <Sparkles size={12} />
            {badge}
          </span>
        )}
        {(multiple || current?.type === "video") && (
          <span
            className="gallery-counter"
            aria-live="polite"
            aria-atomic="true"
          >
            {current?.type === "video" ? (
              <Play size={12} />
            ) : (
              <ImageIcon size={12} />
            )}
            <span>
              {index + 1} / {media.length}
            </span>
          </span>
        )}
        {multiple && (
          <>
            <button
              type="button"
              className="gallery-arrow gallery-previous"
              aria-label="Foto ou vídeo anterior"
              onClick={() => select(index - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <button
              type="button"
              className="gallery-arrow gallery-next"
              aria-label="Próxima foto ou vídeo"
              onClick={() => select(index + 1)}
            >
              <ChevronRight size={21} />
            </button>
          </>
        )}
      </div>
      {!href && multiple && (
        <>
          <div
            ref={thumbs}
            className="gallery-thumbs"
            aria-label="Escolher foto ou vídeo"
          >
            {media.map((item, i) => (
              <button
                type="button"
                key={item.id}
                className={i === index ? "selected" : ""}
                onClick={() => select(i)}
                aria-label={`Ver ${item.type === "video" ? "vídeo" : "foto"} ${i + 1}`}
                aria-pressed={i === index}
              >
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt=""
                    width="72"
                    height="72"
                    loading="lazy"
                  />
                ) : (
                  <span className="gallery-video-thumb">
                    <Play size={20} />
                    <small>Vídeo</small>
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="gallery-hint">
            Use as setas ou deslize sobre a foto para explorar.
          </p>
        </>
      )}
    </div>
  );
}
