export function ViewportStatus({ enabled }: { readonly enabled: boolean }) {
  return (
    <p aria-label="Viewport status">
      {enabled ? "Viewport tracking enabled" : "Viewport tracking disabled"}
    </p>
  );
}
