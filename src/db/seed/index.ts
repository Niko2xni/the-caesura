import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { client, db } from '@/db';
import {
  batches,
  categories,
  products,
  receipts,
  settings,
  stockMovements,
  supplierItems,
  suppliers,
  user,
} from '@/db/schema';
import { addDays, getBusinessToday } from '@/lib/dates';
import { normalizeText } from '@/lib/normalise';
import { auth } from '@/server/auth';
import { receiveDelivery } from '@/server/ledger/receive-delivery';
import { recordUsage } from '@/server/ledger/record-usage';
import { recordWaste } from '@/server/ledger/record-waste';
import { eq, sql } from 'drizzle-orm';

async function seed() {
  console.log('--- Seeding The Caesura: Realistic Philippine Specialty Café ---');

  const today = getBusinessToday();
  console.log(`Current business date (Asia/Manila): ${today}`);

  // 1. Settings singleton
  await db
    .insert(settings)
    .values({
      id: 1,
      businessName: 'The Caesura',
      currency: 'PHP',
      timezone: 'Asia/Manila',
      expiryWarningDays: 3,
      extractionCapPerUserDaily: 5,
      extractionCapPerIpDaily: 10,
      extractionCapGlobalDaily: 50,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        businessName: 'The Caesura',
        currency: 'PHP',
        timezone: 'Asia/Manila',
        expiryWarningDays: 3,
        extractionCapPerUserDaily: 5,
        extractionCapPerIpDaily: 10,
        extractionCapGlobalDaily: 50,
      },
    });
  console.log('✓ Settings initialized (The Caesura, Asia/Manila, PHP, 3-day expiry warning)');

  // 2. Users (Admin Owner & Staff Barista)
  const adminEmail = (process.env.ADMIN_EMAIL || 'owner@thecaesura.local').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'caesura-dev-password-2026';
  const staffEmail = 'staff@thecaesura.local';

  let [adminUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, adminEmail));

  if (!adminUser) {
    const res = await auth.api.signUpEmail({
      body: {
        name: 'Maya (Owner)',
        email: adminEmail,
        password: adminPassword,
      },
    });
    adminUser = { id: res.user.id, email: res.user.email, role: 'admin' };
    console.log(`✓ Created owner account: ${adminEmail} (role: admin)`);
  } else {
    if (adminUser.role !== 'admin') {
      await db.update(user).set({ role: 'admin' }).where(eq(user.id, adminUser.id));
    }
    console.log(`✓ Owner account ready: ${adminEmail} (role: admin)`);
  }

  const [staffUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, staffEmail));

  if (!staffUser) {
    const res = await auth.api.signUpEmail({
      body: {
        name: 'Carlos (Barista)',
        email: staffEmail,
        password: adminPassword,
      },
    });
    await db.update(user).set({ role: 'staff' }).where(eq(user.id, res.user.id));
    console.log(`✓ Created barista account: ${staffEmail} (role: staff)`);
  } else {
    console.log(`✓ Barista account ready: ${staffEmail} (role: staff)`);
  }

  // 3. Truncate existing transactional and catalogue data
  console.log('Resetting catalogue and ledger tables for fresh Philippine café demo...');
  await db.execute(sql`
    TRUNCATE TABLE
      stock_movements,
      receipt_lines,
      receipts,
      batches,
      supplier_items,
      products,
      categories,
      suppliers
    CASCADE;
  `);

  // 4. Categories
  const categoryDefs = [
    { name: 'Coffee Beans', sortOrder: 1 },
    { name: 'Dairy & Plant Milk', sortOrder: 2 },
    { name: 'Syrups & Sauces', sortOrder: 3 },
    { name: 'Tea & Powders', sortOrder: 4 },
    { name: 'Packaging & Consumables', sortOrder: 5 },
  ];

  const categoryRows = await db
    .insert(categories)
    .values(categoryDefs)
    .returning({ id: categories.id, name: categories.name });

  const catMap = new Map(categoryRows.map((c) => [c.name, c.id]));
  console.log(`✓ Inserted ${categoryRows.length} categories`);

  // 5. Suppliers
  const supplierDefs = [
    {
      name: 'Manila Coffee Exchange',
      contactName: 'Marco Bautista',
      email: 'orders@manilacoffee.ph',
      phone: '+63 917 555 0101',
      leadTimeDays: 3,
      notes: 'Direct trade green and roasted Philippine specialty coffee beans',
    },
    {
      name: 'Pacific Beverage Co.',
      contactName: 'Alex Rivera',
      email: 'orders@pacificbev.ph',
      phone: '+63 918 555 0202',
      leadTimeDays: 2,
      notes: 'Fresh dairy, Oatly barista, Bonsoy, and Monin syrups distributor',
    },
    {
      name: 'EcoPack Philippines',
      contactName: 'Dina Santos',
      email: 'sales@ecopack.ph',
      phone: '+63 920 555 0303',
      leadTimeDays: 4,
      notes: 'FSC certified compostable paper cups, PLA lids, and kraft takeaway supplies',
    },
  ];

  const supplierRows = await db
    .insert(suppliers)
    .values(supplierDefs)
    .returning({ id: suppliers.id, name: suppliers.name });

  const suppMap = new Map(supplierRows.map((s) => [s.name, s.id]));
  console.log(`✓ Inserted ${supplierRows.length} active suppliers`);

  // 6. Products
  const productDefs = [
    // Coffee Beans
    {
      sku: 'BEAN-APO-1KG',
      name: 'Mount Apo Natural Arabica (1kg)',
      categoryId: catMap.get('Coffee Beans')!,
      baseUnit: 'g' as const,
      tracksExpiry: true,
      shelfLifeDays: 60,
      reorderPoint: '5000.000',
    },
    {
      sku: 'BEAN-BEN-1KG',
      name: 'Benguet Typica Washed (1kg)',
      categoryId: catMap.get('Coffee Beans')!,
      baseUnit: 'g' as const,
      tracksExpiry: true,
      shelfLifeDays: 60,
      reorderPoint: '4000.000',
    },
    {
      sku: 'BEAN-SAG-1KG',
      name: 'Sagada Arabica Dark Roast (1kg)',
      categoryId: catMap.get('Coffee Beans')!,
      baseUnit: 'g' as const,
      tracksExpiry: true,
      shelfLifeDays: 90,
      reorderPoint: '3000.000',
    },
    // Dairy & Plant Milk
    {
      sku: 'MILK-WHOLE-1L',
      name: 'Barista Whole Milk (1L)',
      categoryId: catMap.get('Dairy & Plant Milk')!,
      baseUnit: 'ml' as const,
      tracksExpiry: true,
      shelfLifeDays: 14,
      reorderPoint: '20000.000',
    },
    {
      sku: 'MILK-OAT-1L',
      name: 'Oatly Barista Edition (1L)',
      categoryId: catMap.get('Dairy & Plant Milk')!,
      baseUnit: 'ml' as const,
      tracksExpiry: true,
      shelfLifeDays: 180,
      reorderPoint: '12000.000',
    },
    {
      sku: 'MILK-SOY-1L',
      name: 'Bonsoy Soy Milk (1L)',
      categoryId: catMap.get('Dairy & Plant Milk')!,
      baseUnit: 'ml' as const,
      tracksExpiry: true,
      shelfLifeDays: 120,
      reorderPoint: '6000.000',
    },
    // Syrups & Sauces
    {
      sku: 'SYR-VAN-750',
      name: 'Artisanal Vanilla Syrup (750ml)',
      categoryId: catMap.get('Syrups & Sauces')!,
      baseUnit: 'ml' as const,
      tracksExpiry: false,
      reorderPoint: '1500.000',
    },
    {
      sku: 'SAU-CAR-1L',
      name: 'Salted Caramel Sauce (1L)',
      categoryId: catMap.get('Syrups & Sauces')!,
      baseUnit: 'ml' as const,
      tracksExpiry: false,
      reorderPoint: '2000.000',
    },
    // Tea & Powders
    {
      sku: 'TEA-MAT-500',
      name: 'Uji Ceremonial Matcha (500g)',
      categoryId: catMap.get('Tea & Powders')!,
      baseUnit: 'g' as const,
      tracksExpiry: true,
      shelfLifeDays: 180,
      reorderPoint: '1000.000',
    },
    {
      sku: 'TEA-CHAI-1KG',
      name: 'Masala Chai Blend (1kg)',
      categoryId: catMap.get('Tea & Powders')!,
      baseUnit: 'g' as const,
      tracksExpiry: false,
      reorderPoint: '1000.000',
    },
    // Packaging & Consumables
    {
      sku: 'CUP-12OZ-50',
      name: '12oz Hot Paper Cup (50s)',
      categoryId: catMap.get('Packaging & Consumables')!,
      baseUnit: 'each' as const,
      tracksExpiry: false,
      reorderPoint: '200.000',
    },
    {
      sku: 'CUP-16OZ-50',
      name: '16oz Cold Bio Cup (50s)',
      categoryId: catMap.get('Packaging & Consumables')!,
      baseUnit: 'each' as const,
      tracksExpiry: false,
      reorderPoint: '200.000',
    },
  ];

  const productRows = await db
    .insert(products)
    .values(
      productDefs.map((p) => ({
        ...p,
        nameNormalized: normalizeText(p.name),
      })),
    )
    .returning({ id: products.id, sku: products.sku, name: products.name });

  const prodMap = new Map(productRows.map((p) => [p.sku, p.id]));
  console.log(`✓ Inserted ${productRows.length} catalogue products`);

  // 7. Supplier Items (Aliases & Pack Conversions)
  const supplierItemDefs = [
    // Manila Coffee Exchange
    {
      supplierId: suppMap.get('Manila Coffee Exchange')!,
      productId: prodMap.get('BEAN-APO-1KG')!,
      supplierSku: 'MCX-APO-1K',
      description: 'Mount Apo Specialty Natural 1kg Bag',
      packLabel: '1kg Bag',
      packQuantity: '1000.000',
      lastPackCostCents: 110000, // ₱1,100.00
    },
    {
      supplierId: suppMap.get('Manila Coffee Exchange')!,
      productId: prodMap.get('BEAN-BEN-1KG')!,
      supplierSku: 'MCX-BEN-1K',
      description: 'Benguet Typica Washed 1kg Bag',
      packLabel: '1kg Bag',
      packQuantity: '1000.000',
      lastPackCostCents: 95000, // ₱950.00
    },
    {
      supplierId: suppMap.get('Manila Coffee Exchange')!,
      productId: prodMap.get('BEAN-SAG-1KG')!,
      supplierSku: 'MCX-SAG-1K',
      description: 'Sagada Arabica Dark Roast 1kg Bag',
      packLabel: '1kg Bag',
      packQuantity: '1000.000',
      lastPackCostCents: 85000, // ₱850.00
    },
    // Pacific Beverage Co.
    {
      supplierId: suppMap.get('Pacific Beverage Co.')!,
      productId: prodMap.get('MILK-WHOLE-1L')!,
      supplierSku: 'PBC-MILK-1L',
      description: 'Barista Whole Milk 1L Tetra Pak',
      packLabel: '1L Carton',
      packQuantity: '1000.000',
      lastPackCostCents: 9500, // ₱95.00
    },
    {
      supplierId: suppMap.get('Pacific Beverage Co.')!,
      productId: prodMap.get('MILK-OAT-1L')!,
      supplierSku: 'PBC-OAT-CASE6',
      description: 'Oatly Barista Edition 1L (Case of 6)',
      packLabel: 'Case (6x1L)',
      packQuantity: '6000.000',
      lastPackCostCents: 108000, // ₱1,080.00 (₱180/L)
    },
    {
      supplierId: suppMap.get('Pacific Beverage Co.')!,
      productId: prodMap.get('MILK-SOY-1L')!,
      supplierSku: 'PBC-SOY-1L',
      description: 'Bonsoy Organic Soy Milk 1L',
      packLabel: '1L Carton',
      packQuantity: '1000.000',
      lastPackCostCents: 14500, // ₱145.00
    },
    {
      supplierId: suppMap.get('Pacific Beverage Co.')!,
      productId: prodMap.get('SYR-VAN-750')!,
      supplierSku: 'PBC-MON-VAN',
      description: 'Monin Artisanal Vanilla Syrup 750ml Glass Bottle',
      packLabel: '750ml Bottle',
      packQuantity: '750.000',
      lastPackCostCents: 48000, // ₱480.00
    },
    {
      supplierId: suppMap.get('Pacific Beverage Co.')!,
      productId: prodMap.get('SAU-CAR-1L')!,
      supplierSku: 'PBC-MON-CAR',
      description: 'Monin Salted Caramel Sauce 1L Squeeze Bottle',
      packLabel: '1L Squeeze',
      packQuantity: '1000.000',
      lastPackCostCents: 52000, // ₱520.00
    },
    // EcoPack Philippines
    {
      supplierId: suppMap.get('EcoPack Philippines')!,
      productId: prodMap.get('CUP-12OZ-50')!,
      supplierSku: 'ECO-CUP-12OZ',
      description: '12oz Kraft Double Wall Cup (Sleeve of 50)',
      packLabel: 'Sleeve of 50',
      packQuantity: '50.000',
      lastPackCostCents: 22500, // ₱225.00
    },
    {
      supplierId: suppMap.get('EcoPack Philippines')!,
      productId: prodMap.get('CUP-16OZ-50')!,
      supplierSku: 'ECO-CUP-16OZ',
      description: '16oz PLA Cold Bio Cup (Sleeve of 50)',
      packLabel: 'Sleeve of 50',
      packQuantity: '50.000',
      lastPackCostCents: 27500, // ₱275.00
    },
  ];

  await db.insert(supplierItems).values(
    supplierItemDefs.map((item) => ({
      ...item,
      descriptionNormalized: normalizeText(item.description),
    })),
  );
  console.log(`✓ Inserted ${supplierItemDefs.length} supplier items/mappings`);

  // 8. Deliveries & Receipts
  console.log('Receiving delivery receipts and establishing batches...');

  const userId = adminUser.id;
  const pbcId = suppMap.get('Pacific Beverage Co.')!;
  const mcxId = suppMap.get('Manila Coffee Exchange')!;
  const ecoId = suppMap.get('EcoPack Philippines')!;

  // Delivery A: Expired Whole Milk Batch (received 16 days ago, expired 2 days ago)
  const resA = await receiveDelivery({
    supplierId: pbcId,
    deliveryDate: addDays(today, -16),
    reference: 'DR-PBC-0891',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('MILK-WHOLE-1L')!,
        packCount: '10',
        packQuantity: '1000',
        lineCostCents: 95000,
        expiryDate: addDays(today, -2), // EXPIRED 2 days ago
        lotCode: 'LOT-EXP-MILK-01',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resA.ok) throw new Error(`Delivery A failed: ${resA.error}`);

  // Delivery B: Expired Bonsoy Soy Milk Batch (received 45 days ago, expired 1 day ago)
  const resB = await receiveDelivery({
    supplierId: pbcId,
    deliveryDate: addDays(today, -45),
    reference: 'DR-PBC-0812',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('MILK-SOY-1L')!,
        packCount: '3',
        packQuantity: '1000',
        lineCostCents: 43500,
        expiryDate: addDays(today, -1), // EXPIRED 1 day ago
        lotCode: 'LOT-EXP-SOY-01',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resB.ok) throw new Error(`Delivery B failed: ${resB.error}`);

  // Delivery C: Expiring Soon Whole Milk (received 10 days ago, expires tomorrow)
  const resC = await receiveDelivery({
    supplierId: pbcId,
    deliveryDate: addDays(today, -10),
    reference: 'DR-PBC-0914',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('MILK-WHOLE-1L')!,
        packCount: '12',
        packQuantity: '1000',
        lineCostCents: 114000,
        expiryDate: addDays(today, 1), // EXPIRES IN 1 DAY
        lotCode: 'LOT-SOON-MILK-02',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resC.ok) throw new Error(`Delivery C failed: ${resC.error}`);

  // Delivery D: Expiring Soon Mount Apo Beans (received 55 days ago, expires in 2 days)
  const resD = await receiveDelivery({
    supplierId: mcxId,
    deliveryDate: addDays(today, -55),
    reference: 'DR-MCX-0412',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('BEAN-APO-1KG')!,
        packCount: '5',
        packQuantity: '1000',
        lineCostCents: 550000,
        expiryDate: addDays(today, 2), // EXPIRES IN 2 DAYS
        lotCode: 'ROAST-APO-SOON',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resD.ok) throw new Error(`Delivery D failed: ${resD.error}`);

  // Delivery E: Benguet Typica (for low stock deficit demonstration)
  const resE = await receiveDelivery({
    supplierId: mcxId,
    deliveryDate: addDays(today, -20),
    reference: 'DR-MCX-0488',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('BEAN-BEN-1KG')!,
        packCount: '6',
        packQuantity: '1000',
        lineCostCents: 570000,
        expiryDate: addDays(today, 40),
        lotCode: 'ROAST-BEN-488',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resE.ok) throw new Error(`Delivery E failed: ${resE.error}`);

  // Delivery F: 12oz Hot Cups (for low stock deficit demonstration)
  const resF = await receiveDelivery({
    supplierId: ecoId,
    deliveryDate: addDays(today, -15),
    reference: 'DR-ECO-1029',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('CUP-12OZ-50')!,
        packCount: '5',
        packQuantity: '50', // 250 cups
        lineCostCents: 112500,
        expiryDate: null,
        lotCode: 'BATCH-CUP-12OZ',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resF.ok) throw new Error(`Delivery F failed: ${resF.error}`);

  // Delivery G: Fresh Healthy Stock (Pacific Bev Co)
  const resG = await receiveDelivery({
    supplierId: pbcId,
    deliveryDate: addDays(today, -2),
    reference: 'DR-PBC-0975',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('MILK-WHOLE-1L')!,
        packCount: '20',
        packQuantity: '1000', // 20L fresh milk
        lineCostCents: 190000,
        expiryDate: addDays(today, 12),
        lotCode: 'LOT-FRESH-MILK-03',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('MILK-OAT-1L')!,
        packCount: '3',
        packQuantity: '6000', // 18L Oatly
        lineCostCents: 324000,
        expiryDate: addDays(today, 150),
        lotCode: 'LOT-OAT-150D',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('MILK-SOY-1L')!,
        packCount: '6',
        packQuantity: '1000', // 6L Bonsoy
        lineCostCents: 87000,
        expiryDate: addDays(today, 90),
        lotCode: 'LOT-SOY-90D',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('SYR-VAN-750')!,
        packCount: '6',
        packQuantity: '750', // 4,500ml vanilla syrup
        lineCostCents: 288000,
        expiryDate: null,
        lotCode: 'LOT-MON-VAN-01',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('SAU-CAR-1L')!,
        packCount: '5',
        packQuantity: '1000', // 5,000ml caramel sauce
        lineCostCents: 260000,
        expiryDate: null,
        lotCode: 'LOT-MON-CAR-01',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resG.ok) throw new Error(`Delivery G failed: ${resG.error}`);

  // Delivery H: Fresh Healthy Stock (Manila Coffee Exchange)
  const resH = await receiveDelivery({
    supplierId: mcxId,
    deliveryDate: addDays(today, -8),
    reference: 'DR-MCX-0511',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('BEAN-SAG-1KG')!,
        packCount: '8',
        packQuantity: '1000', // 8kg Sagada dark roast
        lineCostCents: 680000,
        expiryDate: addDays(today, 82),
        lotCode: 'ROAST-SAG-0511',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('BEAN-APO-1KG')!,
        packCount: '5',
        packQuantity: '1000', // 5kg fresh Mount Apo
        lineCostCents: 550000,
        expiryDate: addDays(today, 52),
        lotCode: 'ROAST-APO-FRESH',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resH.ok) throw new Error(`Delivery H failed: ${resH.error}`);

  // Delivery I: Fresh Healthy Stock (EcoPack & Tea)
  const resI = await receiveDelivery({
    supplierId: ecoId,
    deliveryDate: addDays(today, -5),
    reference: 'DR-ECO-1060',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('CUP-16OZ-50')!,
        packCount: '10',
        packQuantity: '50', // 500 cold cups
        lineCostCents: 275000,
        expiryDate: null,
        lotCode: 'BATCH-CUP-16OZ',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resI.ok) throw new Error(`Delivery I failed: ${resI.error}`);

  // Delivery J: Teas & Powders (via Pacific Beverage)
  const resJ = await receiveDelivery({
    supplierId: pbcId,
    deliveryDate: addDays(today, -12),
    reference: 'DR-PBC-0933',
    source: 'manual',
    idempotencyKey: crypto.randomUUID(),
    userId,
    lines: [
      {
        productId: prodMap.get('TEA-MAT-500')!,
        packCount: '4',
        packQuantity: '500', // 2,000g Matcha
        lineCostCents: 480000,
        expiryDate: addDays(today, 120),
        lotCode: 'LOT-UJI-MATCHA',
        matchMethod: 'exact',
      },
      {
        productId: prodMap.get('TEA-CHAI-1KG')!,
        packCount: '3',
        packQuantity: '1000', // 3,000g Chai
        lineCostCents: 255000,
        expiryDate: null,
        lotCode: 'LOT-CHAI-BLEND',
        matchMethod: 'exact',
      },
    ],
  });
  if (!resJ.ok) throw new Error(`Delivery J failed: ${resJ.error}`);

  console.log('✓ Successfully received all delivery receipts and batches');

  // 9. Record Usage Deductions
  console.log('Recording café service usages (FEFO)...');

  // Consume 6,000ml Whole Milk from Delivery C (expiring soon batch), leaving 6,000ml
  const useMilk = await recordUsage({
    productId: prodMap.get('MILK-WHOLE-1L')!,
    quantity: '6000.000',
    note: 'Weekend rush espresso drink prep',
    userId,
  });
  if (!useMilk.ok) throw new Error(`Milk usage failed: ${useMilk.error}`);

  // Consume 3,000g Mount Apo Arabica from Delivery D (expiring soon batch), leaving 2,000g
  const useApo = await recordUsage({
    productId: prodMap.get('BEAN-APO-1KG')!,
    quantity: '3000.000',
    note: 'Weekly batch brew & espresso hopper rotation',
    userId,
  });
  if (!useApo.ok) throw new Error(`Apo usage failed: ${useApo.error}`);

  // Consume 4,500g Benguet Typica, leaving 1,500g on hand (reorder threshold is 4,000g -> DEFICIT!)
  const useBen = await recordUsage({
    productId: prodMap.get('BEAN-BEN-1KG')!,
    quantity: '4500.000',
    note: 'Pour-over bar single origin feature',
    userId,
  });
  if (!useBen.ok) throw new Error(`Benguet usage failed: ${useBen.error}`);

  // Consume 200 cups of 12oz Hot Cups, leaving 50 on hand (reorder threshold is 200 -> DEFICIT!)
  const useCups = await recordUsage({
    productId: prodMap.get('CUP-12OZ-50')!,
    quantity: '200.000',
    note: 'Hot beverage bar takeaway consumption',
    userId,
  });
  if (!useCups.ok) throw new Error(`Cup usage failed: ${useCups.error}`);

  // Consume 2,000ml Oatly Barista
  const useOat = await recordUsage({
    productId: prodMap.get('MILK-OAT-1L')!,
    quantity: '2000.000',
    note: 'Plant-based lattes and flat whites',
    userId,
  });
  if (!useOat.ok) throw new Error(`Oatly usage failed: ${useOat.error}`);

  // Consume 750ml Artisanal Vanilla Syrup
  const useVan = await recordUsage({
    productId: prodMap.get('SYR-VAN-750')!,
    quantity: '750.000',
    note: 'Iced vanilla latte signature syrups',
    userId,
  });
  if (!useVan.ok) throw new Error(`Vanilla usage failed: ${useVan.error}`);

  // Consume 500g Uji Matcha
  const useMat = await recordUsage({
    productId: prodMap.get('TEA-MAT-500')!,
    quantity: '500.000',
    note: 'Iced ceremonial matcha latte prep',
    userId,
  });
  if (!useMat.ok) throw new Error(`Matcha usage failed: ${useMat.error}`);

  console.log('✓ Recorded café service usages');

  // 10. Record Historical Waste Write-Offs (for Waste Report Analytics)
  console.log('Recording realistic waste write-offs for financial reporting...');

  // Find batch for Whole Milk (expired batch LOT-EXP-MILK-01)
  const [milkExpBatch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(eq(batches.lotCode, 'LOT-EXP-MILK-01'));

  if (milkExpBatch) {
    // Write off 8,000ml as expired, leaving 2,000ml STILL EXPIRED on shelves for Today board!
    const wasteMilk = await recordWaste({
      batchId: milkExpBatch.id,
      quantity: '8000.000',
      wasteReason: 'expired',
      note: 'Past sell-by date cleared from rear walk-in chiller',
      userId,
    });
    if (!wasteMilk.ok) throw new Error(`Waste milk failed: ${wasteMilk.error}`);
  }

  // Find batch for Bonsoy (expired batch LOT-EXP-SOY-01)
  const [soyExpBatch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(eq(batches.lotCode, 'LOT-EXP-SOY-01'));

  if (soyExpBatch) {
    // Write off 2,000ml, leaving 1,000ml STILL EXPIRED on shelves for Today board!
    const wasteSoy = await recordWaste({
      batchId: soyExpBatch.id,
      quantity: '2000.000',
      wasteReason: 'expired',
      note: 'Spoiled carton found at bottom of soy station',
      userId,
    });
    if (!wasteSoy.ok) throw new Error(`Waste soy failed: ${wasteSoy.error}`);
  }

  // Write off 1 bottle of Vanilla Syrup (750ml) as damaged
  const [vanBatch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(eq(batches.lotCode, 'LOT-MON-VAN-01'));

  if (vanBatch) {
    const wasteVan = await recordWaste({
      batchId: vanBatch.id,
      quantity: '750.000',
      wasteReason: 'damaged',
      note: 'Glass bottle dropped during bar restock shift',
      userId,
    });
    if (!wasteVan.ok) throw new Error(`Waste vanilla failed: ${wasteVan.error}`);
  }

  // Write off 500g of Benguet Beans as spoiled
  const [benBatch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(eq(batches.lotCode, 'ROAST-BEN-488'));

  if (benBatch) {
    const wasteBen = await recordWaste({
      batchId: benBatch.id,
      quantity: '500.000',
      wasteReason: 'spoiled',
      note: 'Water splash contamination into grinder hopper',
      userId,
    });
    if (!wasteBen.ok) throw new Error(`Waste benguet failed: ${wasteBen.error}`);
  }

  console.log('✓ Recorded waste write-offs with realistic financial cost impact');

  console.log(`
================================================================================
☕ THE CAESURA: DEMO DATA SEEDED SUCCESSFULLY!
================================================================================
Business: The Caesura (Asia/Manila, PHP)
Owner: Maya (owner@thecaesura.local / caesura-dev-password-2026)
Staff: Carlos (staff@thecaesura.local / caesura-dev-password-2026)

TODAY BOARD STATUS:
  ⚠️  EXPIRED ON SHELVES (Immediate Write-Off Required):
      - Barista Whole Milk (LOT-EXP-MILK-01): 2.0 L expired 2 days ago
      - Bonsoy Soy Milk (LOT-EXP-SOY-01): 1.0 L expired 1 day ago

  ⏱️  EXPIRING SOON (Use First - FEFO):
      - Barista Whole Milk (LOT-SOON-MILK-02): 6.0 L (1 day left)
      - Mount Apo Natural Arabica (ROAST-APO-SOON): 2.0 kg (2 days left)

  📦  REORDER POINT TRIGGERED:
      - Benguet Typica Washed: 1.0 kg on hand vs 4.0 kg reorder point (deficit: 3.0 kg)
        -> Primary Supplier: Manila Coffee Exchange (3 days lead time)
      - 12oz Hot Paper Cup: 50 cups on hand vs 200 cups reorder point (deficit: 150 cups)
        -> Primary Supplier: EcoPack Philippines (4 days lead time)

WASTE REPORT ANALYTICS (/waste/report):
  - Populated with expired, damaged, and spoiled write-offs with real unit costs.
================================================================================
`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });


