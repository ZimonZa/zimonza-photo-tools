declare module "pica" {
  /** Minimal declaration — we cast the instance to our own type in lib/process.ts. */
  const pica: () => unknown;
  export default pica;
}
