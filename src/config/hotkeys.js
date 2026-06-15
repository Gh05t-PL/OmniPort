const createHotkey = ({
  id,
  label,
  description,
  scope = 'global',
  bindings,
  allowInEditable = false,
  allowRepeat = false,
  allowWhileComposing = false,
  preventDefault = true,
  stopPropagation = false,
  captureWhenDisabled = false,
  priority = 0
}) => Object.freeze({
  id,
  label,
  description,
  scope,
  bindings: Object.freeze(bindings.map(binding => Object.freeze(binding))),
  allowInEditable,
  allowRepeat,
  allowWhileComposing,
  preventDefault,
  stopPropagation,
  captureWhenDisabled,
  priority
});

export const APP_HOTKEYS = Object.freeze({
  saveRequest: createHotkey({
    id: 'save-request',
    label: 'Zapisz request',
    description: 'Aktualizuje request w kolekcji lub otwiera wybór miejsca zapisu.',
    bindings: [{ key: 's', primary: true }],
    allowInEditable: true,
    captureWhenDisabled: true,
    priority: 100
  })
});

export const APP_HOTKEY_LIST = Object.freeze(Object.values(APP_HOTKEYS));

const normalizeKey = (value) => String(value || '').toLocaleLowerCase('en');

export const hotkeyBindingMatchesEvent = (binding, event) => {
  if (normalizeKey(binding.key) !== normalizeKey(event.key)) return false;

  const hasPrimaryModifier = Boolean(event.ctrlKey || event.metaKey);
  if (binding.primary) {
    if (!hasPrimaryModifier) return false;
  } else {
    if (Boolean(binding.ctrl) !== Boolean(event.ctrlKey)) return false;
    if (Boolean(binding.meta) !== Boolean(event.metaKey)) return false;
  }
  if (Boolean(binding.alt) !== Boolean(event.altKey)) return false;
  if (Boolean(binding.shift) !== Boolean(event.shiftKey)) return false;

  return true;
};

export const hotkeyMatchesEvent = (hotkey, event) => (
  hotkey.bindings.some(binding => hotkeyBindingMatchesEvent(binding, event))
);

export const isEditableHotkeyTarget = (target) => {
  if (!target) return false;
  const tagName = String(target.tagName || '').toLocaleLowerCase('en');
  return Boolean(
    target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || target.closest?.('[contenteditable]:not([contenteditable="false"])')
  );
};

const getPlatformPrimaryModifier = () => {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = String(navigator.userAgentData?.platform || navigator.platform || '');
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
};

const formatBinding = (binding) => {
  const parts = [];
  if (binding.primary) parts.push(getPlatformPrimaryModifier());
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.meta) parts.push('⌘');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(String(binding.key || '').length === 1
    ? String(binding.key).toLocaleUpperCase('en')
    : String(binding.key));
  return parts.join('+');
};

export const getHotkeyDisplayLabel = (hotkey) => (
  hotkey.bindings.map(formatBinding).join(' / ')
);

const bindingToAriaShortcut = (binding, primaryModifier) => {
  const parts = [];
  if (binding.primary) parts.push(primaryModifier);
  if (binding.ctrl) parts.push('Control');
  if (binding.meta) parts.push('Meta');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(String(binding.key || '').length === 1
    ? String(binding.key).toLocaleUpperCase('en')
    : String(binding.key));
  return parts.join('+');
};

export const getHotkeyAriaKeyShortcuts = (hotkey) => hotkey.bindings.flatMap(binding => (
  binding.primary
    ? [
        bindingToAriaShortcut(binding, 'Control'),
        bindingToAriaShortcut(binding, 'Meta')
      ]
    : [bindingToAriaShortcut(binding, '')]
)).join(' ');
