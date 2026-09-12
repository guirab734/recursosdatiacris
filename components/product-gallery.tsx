"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { Media } from "@/lib/types";

function GalleryVideo({
  media,
  name,
  poster,
}: {
  media: Media;
  name: string;
  poster?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const interactive = useRef(false);
  const [controls, setControls] = useState(false);
  const [state, setState] = useState<
    "loading" | "playing" | "paused" | "error"
  >("loading");

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let active = true;
    let visible = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = () => {
      if (
        !visible ||
        document.hidden ||
        interactive.current ||
        reducedMotion.matches
      )
        return;
      void player.play().catch(() => {
        if (active && !player.error) setState("paused");
      });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else player.pause();
      },
      { threshold: 0.15 },
    );
    observer.observe(player);
    const visibilityChanged = () => {
      if (document.hidden) player.pause();
      else start();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    if (reducedMotion.matches) {
      player.pause();
      setState("paused");
    }
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      player.pause();
    };
  }, []);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("paused"), 12000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  function activate() {
    const player = video.current;
    if (!player) return;
    interactive.current = true;
    setControls(true);
    if (player.error) {
      setState("loading");
      player.load();
    }
    void player.play().catch(() => {
      setState(player.error ? "error" : "paused");
    });
  }

  return (
    <div className="gallery-video" data-playback={state}>
      <video
        ref={video}
        src={media.url}
        poster={poster}
        controls={controls}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={`Vídeo de ${name}`}
        onPlaying={() => setState("playing")}
        onPause={() =>
          setState((current) => (current === "error" ? current : "paused"))
        }
        onWaiting={() => setState("loading")}
        onError={() => setState("error")}
      />
      {!controls && state === "playing" && (
        <button
          type="button"
          className="gallery-video-activate"
          onClick={activate}
          aria-label={`Mostrar controles do vídeo de ${name}`}
        >
          <span>
            <SlidersHorizontal size={13} /> Toque para controlar
          </span>
        </button>
      )}
      {state === "loading" && (
        <div className="gallery-video-status" role="status">
          <LoaderCircle size={24} className="gallery-video-spinner" />
          <span>Carregando vídeo</span>
        </div>
      )}
      {(state === "error" || (!controls && state === "paused")) && (
        <div className="gallery-video-fallback">
          {state === "error" && <p>Não foi possível reproduzir o vídeo.</p>}
          <button type="button" onClick={activate}>
            {state === "error" ? <RotateCcw size={18} /> : <Play size={18} />}
            {state === "error" ? "Tentar novamente" : "Reproduzir vídeo"}
          </button>
        </div>
      )}
    </div>
  );
}

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
      (event.target as HTMLElement).closest(
        "video[controls], button:not(.gallery-video-activate)",
      )
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
          <GalleryVideo
            key={current.id}
            media={current}
            name={name}
            poster={media.find((item) => item.type === "image")?.url}
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
            Use as setas ou deslize para explorar.
            {media.some((item) => item.type === "video") &&
              " Toque no vídeo para controlar."}
          </p>
        </>
      )}
    </div>
  );
}
