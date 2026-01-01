// Minimal type shims for optional runtime deps used by the analyzer.
// These avoid TS compile errors when type declarations are not installed.

declare module "pdf-parse" {
  const pdfParse: any;
  export default pdfParse;
}
