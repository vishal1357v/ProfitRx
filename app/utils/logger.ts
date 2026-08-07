const isDev = process.env.NODE_ENV === "development";

export function logDev(...args: any[]): void {
  if (isDev) {
    console.log(...args);
  }
}

export function logInfo(...args: any[]): void {
  console.log(...args);
}

export function logError(...args: any[]): void {
  console.error(...args);
}
