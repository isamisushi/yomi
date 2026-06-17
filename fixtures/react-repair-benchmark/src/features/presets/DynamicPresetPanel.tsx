type PresetButtonProps = {
  readonly onClick: () => void;
};

function buildPresetButtonProps(onApply: () => void): PresetButtonProps {
  return {
    onClick: onApply,
  };
}

export function applySavedPreset(): void {
  // The real bug would live here, but Yomi cannot yet connect this through
  // dynamically returned JSX props.
}

export function DynamicPresetPanel() {
  const buttonProps = buildPresetButtonProps(applySavedPreset);

  return <button {...buttonProps}>Apply saved preset</button>;
}
