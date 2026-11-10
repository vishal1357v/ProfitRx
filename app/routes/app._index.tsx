import { redirect } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { SettingsRepository } from "../infrastructure/repositories/settings.repository";
import { loader as dashboardLoader } from "./app.dashboard";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export { default, ErrorBoundary } from "./app.dashboard";

export const loader = async (args: LoaderFunctionArgs) => {
  const url = new URL(args.request.url);
  const isPreview = url.searchParams.get("preview") === "true" || url.searchParams.get("demo") === "true";
  const host = url.searchParams.get("host") || "";

  if (isPreview) {
    return dashboardLoader(args);
  }

  const { session } = await authenticate.admin(args.request);
  const shop = session.shop;

  const settings = await SettingsRepository.getByShop(shop);
  if (!settings?.onboardingCompleted) {
    throw redirect(`/app/onboarding?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
  }

  return dashboardLoader(args);
};
