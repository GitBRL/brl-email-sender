'use client';

import { useEffect, useRef, useState } from 'react';

export type HeatmapLink = { id: string; clicks: number };

/**
 * Heatmap overlay — renders the campaign's email HTML in an iframe and paints
 * a canvas of radial gradient hotspots on top, one per tracked link, with
 * intensity proportional to click count. Looks like classic heatmap.js but
 * built from scratch (no third-party dep) using the canvas 2D API.
 *
 * Hotspots use multiply blend mode so the email content underneath stays
 * legible — red over text reads as a tinted overlay, not an opaque blob.
 *
 * The iframe auto-sizes to its content height after load (and on resize)
 * so the whole email is visible without an internal scrollbar.
 */
export function HeatmapOverlay({
  documentHtml,
  links,
}: {
  documentHtml: string;
  links: HeatmapLink[];
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [contentHeight, setContentHeight] = useState<number>(700);

  useEffect(() => {
    const iframe = iframeRef.current;
    const canvas = canvasRef.current;
    if (!iframe || !canvas) return;

    function draw() {
      const doc = iframe?.contentDocument;
      if (!doc || !canvas || !iframe) return;
      const body = doc.body;
      const docEl = doc.documentElement;
      const w = Math.max(body.scrollWidth, docEl.scrollWidth, iframe.clientWidth);
      const h = Math.max(body.scrollHeight, docEl.scrollHeight);

      // Resize the iframe to fit its content (no inner scroll), and the canvas
      // to match exactly so coords line up 1:1.
      setContentHeight(h);
      // Use device-pixel-ratio for crisp gradient rendering on retina screens
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const maxClicks = Math.max(1, ...links.map((l) => l.clicks));

      // Two-pass: first draw all hotspots additively to build up density,
      // then overlay a colour gradient based on the cumulative alpha. The
      // simple single-pass version below produces the heatmap.js look in
      // one go and is good enough at this scale.
      for (const link of links) {
        if (link.clicks <= 0) continue;
        const el = doc.querySelector(`[data-link-id="${CSS.escape(link.id)}"]`);
        if (!el) continue;
        const rect = (el as HTMLElement).getBoundingClientRect();
        // Add iframe scroll offsets — bgr is relative to the viewport, but we
        // sized the iframe to fit content so scroll == 0.
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const intensity = link.clicks / maxClicks; // 0..1
        // Radius scales with intensity but stays meaningful for low click
        // counts (60px floor ensures even single-click links show a tint).
        const radius = 60 + intensity * 90;

        // Classic heatmap gradient: red center → orange → yellow → transparent.
        // Higher intensity = denser opacity at the centre.
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(255, 0, 0, ${Math.min(0.85, 0.35 + 0.5 * intensity)})`);
        grad.addColorStop(0.4, `rgba(255, 120, 0, ${Math.min(0.6, 0.25 + 0.35 * intensity)})`);
        grad.addColorStop(0.7, `rgba(255, 220, 0, ${0.25 * intensity})`);
        grad.addColorStop(1, 'rgba(255, 220, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function onLoad() {
      // Run on next tick so layout has settled
      setTimeout(draw, 50);
    }

    iframe.addEventListener('load', onLoad);
    const ro = new ResizeObserver(() => draw());
    ro.observe(iframe);
    window.addEventListener('resize', draw);

    return () => {
      iframe.removeEventListener('load', onLoad);
      ro.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [links, documentHtml]);

  return (
    <div className="relative bg-white" style={{ height: contentHeight }}>
      <iframe
        ref={iframeRef}
        srcDoc={documentHtml}
        title="Email heatmap"
        sandbox="allow-same-origin"
        className="block w-full bg-white"
        style={{ height: contentHeight, border: 0 }}
        scrolling="no"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'multiply' }}
        aria-hidden
      />
    </div>
  );
}
