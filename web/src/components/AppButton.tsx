import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  ghost?: boolean;
  stamp?: boolean;
};

export function AppButton({ ghost, stamp, className = "", children, ...props }: Props) {
  return (
    <button
      type={props.type ?? "button"}
      className={`bound-btn ${ghost ? "ghost" : ""} ${stamp ? "stamp" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
