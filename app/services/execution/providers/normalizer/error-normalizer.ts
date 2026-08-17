import { ProviderErrorCode } from "../../types";

export class ProviderErrorNormalizer {
  static normalize(error: any): ProviderErrorCode {
    if (!error) return "UNKNOWN_ERROR";
    
    const message = error.message ? error.message.toLowerCase() : String(error).toLowerCase();
    
    if (message.includes("timeout") || message.includes("econnreset") || error.code === "ETIMEDOUT") {
      return "PROVIDER_TIMEOUT";
    }

    if (message.includes("unauthorized") || message.includes("forbidden") || message.includes("invalid key") || error.status === 401 || error.status === 403) {
      return "INVALID_CONFIGURATION";
    }

    if (message.includes("rate limit") || message.includes("too many requests") || error.status === 429) {
      return "RATE_LIMITED";
    }

    if (message.includes("network") || message.includes("econnrefused") || message.includes("enotfound")) {
      return "NETWORK_ERROR";
    }

    if (message.includes("template") || message.includes("invalid format")) {
      return "INVALID_TEMPLATE";
    }

    if (message.includes("mutation") || message.includes("graphql") || message.includes("usererror")) {
      return "SHOPIFY_MUTATION_FAILED";
    }

    return "UNKNOWN_ERROR";
  }

  static isRetryable(code: ProviderErrorCode): boolean {
    switch (code) {
      case "PROVIDER_TIMEOUT":
      case "NETWORK_ERROR":
      case "RATE_LIMITED":
      case "SHOPIFY_MUTATION_FAILED":
      case "UNKNOWN_ERROR":
        return true;
      case "INVALID_CONFIGURATION":
      case "INVALID_TEMPLATE":
      case "UNSUPPORTED_ACTION":
        return false;
      default:
        return false;
    }
  }
}
