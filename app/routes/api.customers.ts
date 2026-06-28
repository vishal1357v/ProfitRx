import { authenticate } from "../shopify.server";
import { ProfitIntelligenceService } from "../services/profit-intelligence.service";

export async function loader({ request }: { request: Request }) {
  try {
    const { admin, session } = await authenticate.admin(request);

    const response = await admin.graphql(`
      query GetCustomers {
        customers(first: 50) {
          edges {
            node {
              id
              displayName
              email
              ordersCount
              totalSpent
            }
          }
        }
      }
    `);

    const data = await response.json() as any;
    if (data.errors?.length) throw new Error(data.errors[0].message);

    const customers = (data.data.customers.edges || []).map((edge: any) => ({
      id: edge.node.id.split('/').pop(),
      displayName: edge.node.displayName,
      email: edge.node.email,
      ordersCount: parseInt(edge.node.ordersCount, 10) || 0,
      totalSpent: parseFloat(edge.node.totalSpent) || 0,
    }));

    const cohorts = await ProfitIntelligenceService.getLTVCohorts(session.shop);

    return Response.json({ customers, cohorts });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error('[Customers API] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}
