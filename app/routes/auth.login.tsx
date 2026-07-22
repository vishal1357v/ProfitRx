import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = await login(request);

  return errors;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);

  return errors;
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData ?? loaderData;
  const [shop, setShop] = useState("");

  const shopError =
    errors?.shop === LoginErrorType.MissingShop
      ? "Please enter your shop domain"
      : errors?.shop === LoginErrorType.InvalidShop
        ? "Please enter a valid shop domain"
        : undefined;

  return (
    <Page>
      <Card>
        <Form method="post">
          <FormLayout>
            <Text variant="headingMd" as="h2">
              Log in to ProfitRx
            </Text>
            <Text as="p" tone="subdued">
              Enter your Shopify store domain to install or open the app.
            </Text>
            <TextField
              type="text"
              name="shop"
              label="Shop domain"
              helpText="e.g. my-store.myshopify.com"
              value={shop}
              onChange={setShop}
              autoComplete="on"
              error={shopError}
            />
            <Button variant="primary" submit>
              Continue
            </Button>
          </FormLayout>
        </Form>
      </Card>
    </Page>
  );
}
