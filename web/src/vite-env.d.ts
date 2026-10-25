/// <reference types="vite/client" />

declare module "*.py?raw" {
  const source: string;
  export default source;
}

declare module "*.yaml?raw" {
  const source: string;
  export default source;
}
