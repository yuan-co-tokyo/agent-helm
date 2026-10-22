export function stripControl(text: string): string {
 // Preserve tabs and newlines; remove OSC, CSI and remaining terminal controls.
 // eslint-disable-next-line no-control-regex
 return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b[@-_]/g,'').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
}
