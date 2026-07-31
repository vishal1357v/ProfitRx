import { ErrorPage } from "../components/ErrorPage";

export default function CatchAll() {
  return (
    <ErrorPage
      type="404"
      title="Page not found"
      message="The page you're looking for doesn't exist or has been moved."
    />
  );
}
