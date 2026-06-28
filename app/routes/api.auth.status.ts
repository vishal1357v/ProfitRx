import { authenticate } from "../shopify.server";

export async function loader({ request }: { request: Request }) {
  try {
    await authenticate.admin(request);
    return Response.json({ authenticated: true });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return Response.json({ authenticated: false });
  }
}