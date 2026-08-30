export function inr(paise: number | null | undefined): string {
  return (
    "₹" +
    (Number(paise || 0) / 100).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })
  );
}

export function inr2(paise: number | null | undefined): string {
  return (
    "₹" +
    (Number(paise || 0) / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
