"use client";

import { useState } from "react";
import { productImage } from "@/lib/products";

type Props = {
  skuId?: string;
  name: string;
  size?: "hero" | "rail";
  peek?: boolean;
};

export function ProductShot({ skuId, name, size = "hero", peek }: Props) {
  const src = productImage(skuId);
  const [open, setOpen] = useState(false);
  const canPeek = peek ?? size === "hero";
  const frame =
    size === "hero"
      ? "w-full max-w-[220px] overflow-hidden border border-ink bg-cream"
      : "h-14 w-11 shrink-0 overflow-hidden border border-ink bg-cream";

  if (!src) {
    return <div className={`grid place-items-center text-[14px] text-mute ${frame}`}>{name}</div>;
  }

  return (
    <>
      {canPeek ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${frame} text-left`}
        aria-label={`Look at ${name}`}
      >
        <img
          src={src}
          alt={name}
          className={size === "hero" ? "aspect-[3/4] w-full object-cover" : "h-full w-full object-cover"}
        />
      </button>
      ) : (
        <img
          src={src}
          alt={name}
          className={`${frame} ${size === "hero" ? "aspect-[3/4] object-cover" : "object-cover"}`}
        />
      )}
      {open ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-6"
          role="dialog"
          aria-label={name}
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={name}
            className="max-h-[82vh] max-w-[min(92vw,420px)] object-cover"
          />
        </div>
      ) : null}
    </>
  );
}
