import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const settings = await prisma.storeSettings.findFirst();
    console.log('Store settings:', settings ? 'Found' : 'Empty');
    if (settings) {
      console.log('rulesRejectCodOver:', settings.rulesRejectCodOver);
    }
    const order = await prisma.order.findFirst();
    console.log('Order:', order ? 'Found' : 'Empty');
    if (order) {
      console.log('riskLevel:', order.riskLevel);
    }
    console.log('DATABASE VERIFICATION SUCCESSFUL!');
  } catch (e) {
    console.error('VERIFICATION FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
