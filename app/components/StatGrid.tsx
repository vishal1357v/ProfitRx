import { Grid } from "@shopify/polaris";

interface StatGridProps {
  columns?: { xs: number; sm: number; md: number; lg: number };
  children: React.ReactNode;
}

export function StatGrid({
  columns = { xs: 1, sm: 2, md: 3, lg: 5 },
  children,
}: StatGridProps) {
  return (
    <Grid columns={columns}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <Grid.Cell key={i}>{child}</Grid.Cell>
          ))
        : <Grid.Cell>{children}</Grid.Cell>
      }
    </Grid>
  );
}
