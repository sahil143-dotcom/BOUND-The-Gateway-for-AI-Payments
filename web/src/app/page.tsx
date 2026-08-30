"use client";

import { useLayoutEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CommandCenter } from "@/components/CommandCenter";
import { Landing } from "@/components/Landing";

export default function Page() {
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    if (sessionStorage.getItem("bound.entered") === "1") setEntered(true);
  }, []);

  function enter() {
    sessionStorage.setItem("bound.entered", "1");
    setEntered(true);
  }

  if (!entered) {
    return <Landing onEnter={enter} />;
  }

  return (
    <AppShell current="/" flush>
      <CommandCenter />
    </AppShell>
  );
}
