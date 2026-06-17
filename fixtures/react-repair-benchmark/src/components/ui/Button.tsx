import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children: ReactNode;
};

export function Button({ children, ...props }: ButtonProps) {
  return <button {...props}>{children}</button>;
}
