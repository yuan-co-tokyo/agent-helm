export const CSRF_HEADER = 'x-helm-csrf';
export const SUPPORTED_AGTX_VERSION = '1.0.6';
export const DEFAULT_INSTRUCTION_MAX_CHARS = 8000;
export function isUuid(value: string): boolean {
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export const TERMINAL_ONLY_MESSAGE = 'この確認は端末（agtx TUI）で操作してください';
