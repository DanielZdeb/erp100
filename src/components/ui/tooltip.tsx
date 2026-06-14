"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// Hybrid tooltip:
//   • Trigger pozostaje pure CSS (group-hover stan) — SSR-safe.
//   • Content używa createPortal + position: fixed, pozycja liczona przez
//     ResizeObserver/scroll listener na trigger. Dzięki temu tooltip
//     pojawia się NAD wszystkim (overflow-hidden ancestors, Card, table)
//     i nie jest ucinany.

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const TooltipCtx = React.createContext<{
  triggerRef: React.RefObject<HTMLSpanElement | null>;
} | null>(null);

function Tooltip({
  children,
  className,
  ...props
}: React.ComponentProps<"span">) {
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  return (
    <TooltipCtx.Provider value={{ triggerRef }}>
      <span
        ref={triggerRef}
        className={cn(
          "relative inline-flex items-center group/tooltip",
          className,
        )}
        {...props}
      >
        {children}
      </span>
    </TooltipCtx.Provider>
  );
}

function TooltipTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tooltip-trigger"
      className={cn("inline-flex items-center", className)}
      {...props}
    >
      {children}
    </span>
  );
}

function TooltipContent({
  className,
  side = "top",
  children,
  ...props
}: React.ComponentProps<"span"> & {
  side?: "top" | "bottom" | "left" | "right";
}) {
  const ctx = React.useContext(TooltipCtx);
  const contentRef = React.useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = React.useState<{
    left: number;
    top: number;
    visible: boolean;
  }>({ left: 0, top: 0, visible: false });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const recompute = React.useCallback(() => {
    const trigger = ctx?.triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;
    const tr = trigger.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = 0;
    let top = 0;
    if (side === "top") {
      left = tr.left + tr.width / 2 - cr.width / 2;
      top = tr.top - cr.height - margin;
    } else if (side === "bottom") {
      left = tr.left + tr.width / 2 - cr.width / 2;
      top = tr.bottom + margin;
    } else if (side === "left") {
      left = tr.left - cr.width - margin;
      top = tr.top + tr.height / 2 - cr.height / 2;
    } else {
      left = tr.right + margin;
      top = tr.top + tr.height / 2 - cr.height / 2;
    }
    // Clamp do widocznego obszaru — nie wychodź poza viewport.
    left = Math.max(4, Math.min(left, vw - cr.width - 4));
    top = Math.max(4, Math.min(top, vh - cr.height - 4));
    setPos((p) => (p.left === left && p.top === top ? p : { left, top, visible: true }));
  }, [ctx, side]);

  React.useEffect(() => {
    if (!mounted || !ctx) return;
    const trigger = ctx.triggerRef.current;
    if (!trigger) return;
    function onEnter() {
      // Pierwszy render z visibility:hidden → zmierz → ustaw position.
      requestAnimationFrame(recompute);
    }
    function onLeave() {
      setPos((p) => ({ ...p, visible: false }));
    }
    trigger.addEventListener("mouseenter", onEnter);
    trigger.addEventListener("mouseleave", onLeave);
    trigger.addEventListener("focusin", onEnter);
    trigger.addEventListener("focusout", onLeave);
    return () => {
      trigger.removeEventListener("mouseenter", onEnter);
      trigger.removeEventListener("mouseleave", onLeave);
      trigger.removeEventListener("focusin", onEnter);
      trigger.removeEventListener("focusout", onLeave);
    };
  }, [ctx, mounted, recompute]);

  React.useEffect(() => {
    if (!pos.visible) return;
    const onScroll = () => recompute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [pos.visible, recompute]);

  // SSR / pierwszy render: nie portaluj nic.
  if (!mounted || typeof document === "undefined") return null;

  // Renderujemy zawsze (dla pomiaru w useEffect), ale pokazujemy tylko
  // gdy `pos.visible`. Domyślne położenie poza ekranem zapobiega błyskowi.
  const inlineStyle: React.CSSProperties = {
    position: "fixed",
    left: pos.left,
    top: pos.top,
    visibility: pos.visible ? "visible" : "hidden",
    opacity: pos.visible ? 1 : 0,
    pointerEvents: "none",
  };

  return reactDomCreatePortal(
    <span
      ref={contentRef}
      data-slot="tooltip-content"
      role="tooltip"
      style={inlineStyle}
      className={cn(
        "z-[9999] rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md transition-opacity duration-100",
        // Wymuś biały tekst na wszystkich potomkach (przeciw <Link>/code
        // z własnym kolorem).
        "[&_*]:text-background",
        className,
      )}
      {...props}
    >
      {children}
    </span>,
    document.body,
  );
}

// Wrapper na createPortal — `react-dom` import na górze pliku nie jest
// SSR-safe w starszych setupach. Dynamiczny require działa zawsze.
function reactDomCreatePortal(
  node: React.ReactNode,
  container: Element,
): React.ReactPortal {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPortal } = require("react-dom") as typeof import("react-dom");
  return createPortal(node, container);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
