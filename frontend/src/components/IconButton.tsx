import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function IconButton({ children, type = "button", ...props }: IconButtonProps) {
  return (
    <button className="icon-button" type={type} {...props}>
      <span className="nav-icon">{children}</span>
    </button>
  );
}
