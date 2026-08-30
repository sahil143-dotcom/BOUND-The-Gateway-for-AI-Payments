"use client";

import { useEffect, useState } from "react";

const TEXT = "Buy me a red cotton shirt under ₹1,800.";

export function Claim({ play }: { play: boolean }) {
  const [n, setN] = useState(play ? 0 : TEXT.length);

  useEffect(() => {
    if (!play) {
      setN(TEXT.length);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(TEXT.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= TEXT.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [play]);

  return (
    <p className="max-w-[22rem] text-[32px] font-semibold leading-[1.2] tracking-[-0.03em] sm:max-w-[28rem] sm:text-[36px]">
      {TEXT.slice(0, n)}
    </p>
  );
}
