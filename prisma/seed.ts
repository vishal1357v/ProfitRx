import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const shop = 'greek-god-wvwt8ptt.myshopify.com';

  // Clear existing test data
  await prisma.order.deleteMany({ where: { shop } });
  await prisma.productCOGS.deleteMany({ where: { shop } });
  await prisma.pincodeStats.deleteMany({ where: { shop } });
  await prisma.customerProfile.deleteMany({ where: { shop } });

  // Add COGS for products
  const products = [
    { id: 'prod_1', title: 'Hercules T-Shirt', cogs: 450 },
    { id: 'prod_2', title: 'Zeus Lightning Poster', cogs: 200 },
    { id: 'prod_3', title: 'Ares Protein Shake', cogs: 600 },
    { id: 'prod_4', title: 'Athena Olive Soap', cogs: 150 },
    { id: 'prod_5', title: 'Poseidon Beach Towel', cogs: 350 },
  ];

  for (const p of products) {
    await prisma.productCOGS.create({
      data: {
        id: `${shop}_${p.id}`,
        shop,
        productId: p.id,
        cogs: p.cogs,
      },
    });
  }

  // Add 15 test orders
  const orders = [
    { orderNumber: 1001, total: 2400, subtotal: 2200, tax: 100, shipping: 100, pincode: '635109', channel: 'Website', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1002, total: 800, subtotal: 700, tax: 50, shipping: 50, pincode: '400001', channel: 'ChatGPT', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1003, total: 4500, subtotal: 4200, tax: 150, shipping: 150, pincode: '560001', channel: 'Copilot', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1004, total: 2250, subtotal: 2100, tax: 100, shipping: 50, pincode: '635109', channel: 'Gemini', status: 'paid', fulfillment: 'RTO' },
    { orderNumber: 1005, total: 1900, subtotal: 1750, tax: 100, shipping: 50, pincode: '400001', channel: 'Website', status: 'paid', fulfillment: 'RTO' },
    { orderNumber: 1006, total: 1100, subtotal: 1000, tax: 50, shipping: 50, pincode: '560001', channel: 'ChatGPT', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1007, total: 1800, subtotal: 1650, tax: 100, shipping: 50, pincode: '110001', channel: 'Website', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1008, total: 2200, subtotal: 2000, tax: 150, shipping: 50, pincode: '500001', channel: 'Copilot', status: 'paid', fulfillment: 'RTO' },
    { orderNumber: 1009, total: 1950, subtotal: 1800, tax: 100, shipping: 50, pincode: '635109', channel: 'Gemini', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1010, total: 2600, subtotal: 2400, tax: 100, shipping: 100, pincode: '400001', channel: 'ChatGPT', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1011, total: 1200, subtotal: 1100, tax: 50, shipping: 50, pincode: '560001', channel: 'Website', status: 'COD', fulfillment: 'pending' },
    { orderNumber: 1012, total: 1600, subtotal: 1450, tax: 100, shipping: 50, pincode: '110001', channel: 'ChatGPT', status: 'COD', fulfillment: 'pending' },
    { orderNumber: 1013, total: 1500, subtotal: 1350, tax: 100, shipping: 50, pincode: '500001', channel: 'Website', status: 'paid', fulfillment: 'fulfilled' },
    { orderNumber: 1014, total: 900, subtotal: 800, tax: 50, shipping: 50, pincode: '635109', channel: 'Copilot', status: 'paid', fulfillment: 'RTO' },
    { orderNumber: 1015, total: 950, subtotal: 850, tax: 50, shipping: 50, pincode: '400001', channel: 'Gemini', status: 'COD', fulfillment: 'RTO' },
  ];

  for (const order of orders) {
    await prisma.order.create({
      data: {
        id: `test_${order.orderNumber}`,
        shop,
        orderNumber: order.orderNumber,
        totalPrice: order.total,
        subtotalPrice: order.subtotal,
        totalTax: order.tax,
        shippingPrice: order.shipping,
        pincode: order.pincode,
        channelType: order.channel,
        financialStatus: order.status,
        fulfillmentStatus: order.fulfillment,
        createdAt: new Date(),
        processedAt: new Date(),
      },
    });
  }

  console.log('✅ Test data seeded!');
}

main();