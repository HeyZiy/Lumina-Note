import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type DatabaseIconButtonVariant = "default" | "subtle" | "danger";

const iconButtonVariantClass: Record<DatabaseIconButtonVariant, string> = {
  default:
    "ui-icon-btn text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border",
  subtle:
    "ui-icon-btn text-muted-foreground hover:text-foreground hover:bg-background hover:border-border",
  danger:
    "ui-icon-btn text-destructive hover:text-destructive hover:bg-destructive/15 hover:border-destructive/40",
};

export function DatabaseSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("db-surface", className)} {...props} />;
}

export function DatabasePanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("db-panel", className)} {...props} />;
}

export function DatabaseMenuSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("db-menu", className)} {...props} />;
}

export function DatabaseIconButton({
  className,
  variant = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: DatabaseIconButtonVariant;
}) {
  return (
    <button
      type={type}
      className={cn(iconButtonVariantClass[variant], className)}
      {...props}
    />
  );
}

export function DatabaseActionButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn("db-action-btn", className)}
      {...props}
    />
  );
}

export function DatabaseTextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ui-input", className)} {...props} />;
}
