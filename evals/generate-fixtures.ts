import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FIXTURES_DIR = path.join(process.cwd(), 'evals', 'fixtures');
const PUBLIC_SAMPLES_DIR = path.join(process.cwd(), 'public', 'samples');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

fs.mkdirSync(FIXTURES_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_SAMPLES_DIR, { recursive: true });

export interface FixtureExpectedLine {
  description: string;
  expectedSku: string;
  packCount: number;
  packQuantity?: string;
  lineCostCents: number | null;
  expiryDate: string | null;
}

export interface FixtureExpected {
  fixtureId: string;
  category: 'clean' | 'supplier_variation' | 'degraded' | 'edge_case' | 'negative';
  description: string;
  expectedSupplierName: string | null;
  expectedDeliveryDate: string | null;
  expectedReference: string | null;
  expectedTotalCents: number | null;
  isNegativeTest?: boolean;
  lines: FixtureExpectedLine[];
}

interface FixtureDefinition {
  expected: FixtureExpected;
  html: string;
}

const fixtures: FixtureDefinition[] = [
  // 1. Clean Delivery Receipt - Bukidnon Specialty Coffee (VAT Inclusive)
  {
    expected: {
      fixtureId: 'dr-clean-bukidnon-vat-inc',
      category: 'clean',
      description: 'Clean Bukidnon Coffee DR with VAT inclusive prices and reference',
      expectedSupplierName: 'Bukidnon Specialty Coffee',
      expectedDeliveryDate: '2026-11-10',
      expectedReference: 'DR-88214',
      expectedTotalCents: 410000,
      lines: [
        {
          description: 'Bukidnon Arabica Honey Process 1kg',
          expectedSku: 'BEANS-BKD-1KG',
          packCount: 3,
          lineCostCents: 255000,
          expiryDate: null,
        },
        {
          description: 'Barista Whole Milk 1L',
          expectedSku: 'MILK-WM-1L',
          packCount: 10,
          lineCostCents: 155000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Courier New', monospace; background: #faf7f2; padding: 40px; color: #1c1917; }
  .box { max-width: 650px; margin: 0 auto; background: #fff; padding: 32px; border: 2px solid #44403c; box-shadow: 4px 6px 0px #78716c; }
  .header { text-align: center; border-bottom: 2px dashed #78716c; padding-bottom: 16px; margin-bottom: 20px; }
  .title { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .sub { font-size: 13px; color: #57534e; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 16px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { border-bottom: 1px solid #d6d3d1; padding: 8px 4px; text-align: left; }
  th { border-top: 2px solid #44403c; border-bottom: 2px solid #44403c; }
  .num { text-align: right; }
  .totals { margin-top: 20px; border-top: 2px solid #44403c; padding-top: 8px; text-align: right; font-size: 14px; }
  .total-row { display: flex; justify-content: flex-end; gap: 24px; margin-bottom: 4px; }
  .grand { font-size: 18px; font-weight: bold; }
  .footer { margin-top: 30px; font-size: 11px; text-align: center; color: #78716c; }
</style>
</head>
<body>
<div class="box">
  <div class="header">
    <div class="title">BUKIDNON SPECIALTY COFFEE TRADING</div>
    <div class="sub">TIN: 402-991-823-000 | Malaybalay, Bukidnon, Philippines</div>
    <div class="sub" style="font-size: 15px; font-weight: bold; margin-top: 8px;">DELIVERY RECEIPT</div>
  </div>
  <div class="meta">
    <div>DELIVER TO: The Caesura Cafe<br>Manila, Philippines</div>
    <div style="text-align: right;">DATE: 2026-11-10<br>DR NO: DR-88214</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">QTY</th>
        <th style="width: 15%;">UNIT</th>
        <th>DESCRIPTION</th>
        <th class="num" style="width: 20%;">UNIT PRICE</th>
        <th class="num" style="width: 22%;">AMOUNT (PHP)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>3</td>
        <td>BAG</td>
        <td>Bukidnon Arabica Honey Process 1kg</td>
        <td class="num">850.00</td>
        <td class="num">2,550.00</td>
      </tr>
      <tr>
        <td>10</td>
        <td>TETRA</td>
        <td>Barista Whole Milk 1L</td>
        <td class="num">155.00</td>
        <td class="num">1,550.00</td>
      </tr>
    </tbody>
  </table>
  <div class="totals">
    <div class="total-row"><span>Total Items:</span> <span>13 units</span></div>
    <div class="total-row grand"><span>TOTAL AMOUNT DUE:</span> <span>PHP 4,100.00</span></div>
    <div class="sub" style="text-align: right; margin-top: 4px;">VAT Inclusive</div>
  </div>
  <div class="footer">
    Received in good order and condition by: _____________________ Date: __________
  </div>
</div>
</body>
</html>`,
  },

  // 2. Clean Sales Invoice - Northern Dairy Supply (VAT Breakdown with 12% VAT)
  {
    expected: {
      fixtureId: 'si-clean-northern-dairy-vat-ex',
      category: 'clean',
      description: 'Northern Dairy Sales Invoice with VAT breakdown and TIN',
      expectedSupplierName: 'Northern Dairy Supply',
      expectedDeliveryDate: '2026-11-09',
      expectedReference: 'SI-49210',
      expectedTotalCents: 537600,
      lines: [
        {
          description: 'Fresh Dairy Barista Milk 1000ml',
          expectedSku: 'MILK-WM-1L',
          packCount: 16,
          lineCostCents: 240000,
          expiryDate: null,
        },
        {
          description: 'Oat Milk Barista Edition 1L',
          expectedSku: 'MILK-OAT-1L',
          packCount: 12,
          lineCostCents: 240000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #e2e8f0; padding: 40px; color: #0f172a; }
  .invoice { max-width: 650px; margin: 0 auto; background: #fff; padding: 36px; border: 1px solid #cbd5e1; border-radius: 4px; }
  .brand { font-size: 24px; font-weight: 800; color: #1e3a8a; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .si-badge { background: #1e3a8a; color: white; padding: 6px 14px; font-weight: bold; border-radius: 4px; font-size: 14px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 10px 8px; text-align: left; }
  td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; }
  .calc-box { margin-top: 24px; width: 280px; margin-left: auto; font-size: 13px; }
  .calc-row { display: flex; justify-content: space-between; padding: 4px 0; }
  .due { font-size: 16px; font-weight: bold; border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; color: #1e3a8a; }
</style>
</head>
<body>
<div class="invoice">
  <div class="head-row">
    <div>
      <div class="brand">NORTHERN DAIRY SUPPLY CORP.</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Balintawak, Quezon City, Metro Manila<br>VAT Reg. TIN: 009-412-884-000</div>
    </div>
    <div style="text-align: right;">
      <div class="si-badge">SALES INVOICE</div>
      <div style="font-size: 14px; font-weight: bold; margin-top: 8px;">SI No. SI-49210</div>
    </div>
  </div>
  <div class="info-grid">
    <div>
      <strong>Sold To:</strong> The Caesura Specialty Coffee<br>
      <strong>Address:</strong> Manila, Philippines
    </div>
    <div style="text-align: right;">
      <strong>Date:</strong> 2026-11-09<br>
      <strong>Terms:</strong> 15 Days
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">Qty</th>
        <th style="width: 15%;">Unit</th>
        <th>Product Description</th>
        <th class="num" style="width: 20%;">Unit Price</th>
        <th class="num" style="width: 22%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>16</td>
        <td>Carton</td>
        <td>Fresh Dairy Barista Milk 1000ml</td>
        <td class="num">150.00</td>
        <td class="num">2,400.00</td>
      </tr>
      <tr>
        <td>12</td>
        <td>Carton</td>
        <td>Oat Milk Barista Edition 1L</td>
        <td class="num">200.00</td>
        <td class="num">2,400.00</td>
      </tr>
    </tbody>
  </table>
  <div class="calc-box">
    <div class="calc-row"><span>Vatable Sales:</span> <span>PHP 4,800.00</span></div>
    <div class="calc-row"><span>12% VAT:</span> <span>PHP 576.00</span></div>
    <div class="calc-row due"><span>TOTAL AMOUNT DUE:</span> <span>PHP 5,376.00</span></div>
  </div>
</div>
</body>
</html>`,
  },

  // 3. Clean Delivery Note - Sweet Craft Syrups & Flavoring
  {
    expected: {
      fixtureId: 'dr-clean-sweetcraft-syrups',
      category: 'clean',
      description: 'Sweet Craft Syrups 3-line delivery note with syrups and sauces',
      expectedSupplierName: 'Sweet Craft Syrups & Flavoring',
      expectedDeliveryDate: '2026-11-08',
      expectedReference: 'DN-9943',
      expectedTotalCents: 335000,
      lines: [
        {
          description: 'Artisan Vanilla Syrup 750ml',
          expectedSku: 'SYRUP-VAN-750',
          packCount: 3,
          lineCostCents: 135000,
          expiryDate: null,
        },
        {
          description: 'Sea Salt Caramel Syrup 750ml',
          expectedSku: 'SYRUP-CAR-750',
          packCount: 2,
          lineCostCents: 90000,
          expiryDate: null,
        },
        {
          description: 'Dark Chocolate Sauce 1L',
          expectedSku: 'SAUCE-CHOC-1L',
          packCount: 2,
          lineCostCents: 110000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f1f5f9; padding: 40px; color: #1e293b; }
  .slip { max-width: 650px; margin: 0 auto; background: #fff; padding: 32px; border-top: 6px solid #d97706; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  .title { font-size: 20px; font-weight: bold; color: #92400e; }
  .meta { display: flex; justify-content: space-between; margin: 20px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th { text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; color: #475569; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; }
  .total { margin-top: 20px; text-align: right; font-size: 15px; font-weight: bold; }
</style>
</head>
<body>
<div class="slip">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div class="title">SWEET CRAFT SYRUPS & FLAVORING</div>
      <div style="font-size: 12px; color: #64748b;">Mandaluyong City, Metro Manila | TIN: 231-890-441-000</div>
    </div>
    <div style="text-align: right; font-weight: bold; font-size: 14px;">
      DELIVERY NOTE<br>
      <span style="color: #d97706;"># DN-9943</span>
    </div>
  </div>
  <div class="meta">
    <div>Customer: The Caesura</div>
    <div>Delivery Date: 2026-11-08</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Qty</th>
        <th>Item Description</th>
        <th class="num" style="width: 20%;">Price</th>
        <th class="num" style="width: 22%;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>3</td>
        <td>Artisan Vanilla Syrup 750ml</td>
        <td class="num">450.00</td>
        <td class="num">1,350.00</td>
      </tr>
      <tr>
        <td>2</td>
        <td>Sea Salt Caramel Syrup 750ml</td>
        <td class="num">450.00</td>
        <td class="num">900.00</td>
      </tr>
      <tr>
        <td>2</td>
        <td>Dark Chocolate Sauce 1L</td>
        <td class="num">550.00</td>
        <td class="num">1,100.00</td>
      </tr>
    </tbody>
  </table>
  <div class="total">
    Total Amount: PHP 3,350.00
  </div>
</div>
</body>
</html>`,
  },

  // 4. Clean Packaging Supplies (Non-expiring items)
  {
    expected: {
      fixtureId: 'dr-clean-packaging',
      category: 'clean',
      description: 'Packaging receipt for paper cups and lids without expiry',
      expectedSupplierName: 'Apex Packaging Supplies',
      expectedDeliveryDate: '2026-11-07',
      expectedReference: 'PKG-1044',
      expectedTotalCents: 475000,
      lines: [
        {
          description: 'Eco Paper Cup 8oz Kraft (Sleeve of 50)',
          expectedSku: 'PKG-CUP-8OZ',
          packCount: 10,
          lineCostCents: 250000,
          expiryDate: null,
        },
        {
          description: 'Hot Cup Sip Lid 8oz (Pack of 100)',
          expectedSku: 'PKG-LID-8OZ',
          packCount: 5,
          lineCostCents: 225000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #f8fafc; padding: 40px; }
  .box { max-width: 650px; margin: 0 auto; background: #fff; padding: 32px; border: 1px solid #e2e8f0; }
  .title { font-size: 20px; font-weight: bold; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { background: #f1f5f9; }
  .num { text-align: right; }
  .total { margin-top: 20px; text-align: right; font-weight: bold; font-size: 16px; }
</style>
</head>
<body>
<div class="box">
  <div style="display: flex; justify-content: space-between;">
    <div>
      <div class="title">APEX PACKAGING SUPPLIES</div>
      <div style="font-size: 12px; color: #64748b;">Pasig City | Tel: (02) 8871-2299</div>
    </div>
    <div style="text-align: right; font-size: 13px;">
      <strong>DR #: PKG-1044</strong><br>
      Date: 2026-11-07
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Quantity</th>
        <th>Description</th>
        <th class="num" style="width: 20%;">Price</th>
        <th class="num" style="width: 20%;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>10</td>
        <td>Eco Paper Cup 8oz Kraft (Sleeve of 50)</td>
        <td class="num">250.00</td>
        <td class="num">2,500.00</td>
      </tr>
      <tr>
        <td>5</td>
        <td>Hot Cup Sip Lid 8oz (Pack of 100)</td>
        <td class="num">450.00</td>
        <td class="num">2,250.00</td>
      </tr>
    </tbody>
  </table>
  <div class="total">Grand Total: PHP 4,750.00</div>
</div>
</body>
</html>`,
  },

  // 5. Explicit Printed Expiry Dates
  {
    expected: {
      fixtureId: 'dr-printed-expiry',
      category: 'edge_case',
      description: 'Dairy delivery with explicitly printed expiration dates on receipt',
      expectedSupplierName: 'Northern Dairy Supply',
      expectedDeliveryDate: '2026-11-11',
      expectedReference: 'DR-EXP-551',
      expectedTotalCents: 310000,
      lines: [
        {
          description: 'Fresh Dairy Barista Milk 1000ml (EXP: 2026-11-25)',
          expectedSku: 'MILK-WM-1L',
          packCount: 10,
          lineCostCents: 155000,
          expiryDate: '2026-11-25',
        },
        {
          description: 'Oat Milk Barista Edition 1L (EXP: 2027-02-15)',
          expectedSku: 'MILK-OAT-1L',
          packCount: 7,
          lineCostCents: 155000,
          expiryDate: '2027-02-15',
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: monospace; background: #fff; padding: 40px; }
  .box { max-width: 650px; margin: 0 auto; border: 2px solid #000; padding: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid #000; padding: 6px; text-align: left; }
  .num { text-align: right; }
</style>
</head>
<body>
<div class="box">
  <div style="text-align: center; font-weight: bold; font-size: 18px;">NORTHERN DAIRY SUPPLY</div>
  <div style="text-align: center; font-size: 12px; margin-bottom: 12px;">PERISHABLE CHILLED DELIVERY RECEIPT</div>
  <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px;">
    <div>CUSTOMER: The Caesura</div>
    <div>DATE: 2026-11-11<br>REF: DR-EXP-551</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">QTY</th>
        <th>ITEM DESCRIPTION / EXPIRY</th>
        <th class="num" style="width: 20%;">EXPIRY</th>
        <th class="num" style="width: 22%;">AMOUNT (PHP)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>10</td>
        <td>Fresh Dairy Barista Milk 1000ml</td>
        <td class="num">2026-11-25</td>
        <td class="num">1,550.00</td>
      </tr>
      <tr>
        <td>7</td>
        <td>Oat Milk Barista Edition 1L</td>
        <td class="num">2027-02-15</td>
        <td class="num">1,550.00</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align: right; font-weight: bold; margin-top: 16px; font-size: 15px;">
    TOTAL PHP 3,100.00
  </div>
</div>
</body>
</html>`,
  },

  // 6. No Prices Printed (Warehouse Transfer / Receiving Slip)
  {
    expected: {
      fixtureId: 'dr-no-prices',
      category: 'edge_case',
      description: 'Warehouse delivery slip with pack counts but blank/null prices',
      expectedSupplierName: 'Bukidnon Specialty Coffee',
      expectedDeliveryDate: '2026-11-06',
      expectedReference: 'DS-0091',
      expectedTotalCents: null,
      lines: [
        {
          description: 'Bukidnon Arabica Honey Process 1kg',
          expectedSku: 'BEANS-BKD-1KG',
          packCount: 5,
          lineCostCents: null,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #fff; padding: 40px; }
  .box { max-width: 650px; margin: 0 auto; border: 1px dashed #475569; padding: 30px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
  th, td { border-bottom: 1px solid #cbd5e1; padding: 10px; text-align: left; }
</style>
</head>
<body>
<div class="box">
  <div style="font-weight: bold; font-size: 18px;">BUKIDNON SPECIALTY COFFEE</div>
  <div style="font-size: 12px; color: #64748b;">DISPATCH TRANSFER SLIP (NO COMMERCIAL VALUE)</div>
  <div style="margin-top: 16px; font-size: 13px;">
    <strong>Slip No:</strong> DS-0091<br>
    <strong>Date:</strong> 2026-11-06<br>
    <strong>Destination:</strong> The Caesura Cafe
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Pack Qty</th>
        <th>Description</th>
        <th style="width: 25%; text-align: center;">Unit Cost</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>5</td>
        <td>Bukidnon Arabica Honey Process 1kg</td>
        <td style="text-align: center; color: #94a3b8;">--</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top: 24px; font-size: 12px; color: #64748b;">
    Note: Commercial invoice to follow via monthly billing statement.
  </div>
</div>
</body>
</html>`,
  },

  // 7. Degraded - Shadowed / Angle Shot Simulation
  {
    expected: {
      fixtureId: 'dr-degraded-shadow',
      category: 'degraded',
      description: 'Shadowed lighting and angle tilt simulating real café counter phone photo',
      expectedSupplierName: 'Sweet Craft Syrups & Flavoring',
      expectedDeliveryDate: '2026-11-05',
      expectedReference: 'DR-7110',
      expectedTotalCents: 180000,
      lines: [
        {
          description: 'Artisan Vanilla Syrup 750ml',
          expectedSku: 'SYRUP-VAN-750',
          packCount: 4,
          lineCostCents: 180000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background: #1e1b18;
    padding: 60px 40px;
    display: flex;
    justify-content: center;
  }
  .receipt-wrapper {
    transform: rotate(-1.5deg) skew(-0.8deg);
    box-shadow: 15px 25px 40px rgba(0,0,0,0.6);
  }
  .receipt {
    width: 580px;
    background: linear-gradient(135deg, #fefefe 0%, #ece8df 100%);
    padding: 30px;
    font-family: 'Courier New', monospace;
    position: relative;
    overflow: hidden;
  }
  .shadow-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(circle at 15% 20%, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.25) 75%);
    pointer-events: none;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 6px; border-bottom: 1px dashed #78716c; text-align: left; }
  .num { text-align: right; }
</style>
</head>
<body>
<div class="receipt-wrapper">
  <div class="receipt">
    <div class="shadow-overlay"></div>
    <div style="font-weight: bold; font-size: 17px; text-align: center;">SWEET CRAFT SYRUPS & FLAVORING</div>
    <div style="font-size: 11px; text-align: center; color: #57534e;">DELIVERY RECEIPT | DR-7110</div>
    <div style="margin-top: 12px; font-size: 12px;">
      Date: 2026-11-05<br>
      Deliver To: The Caesura
    </div>
    <table>
      <thead>
        <tr>
          <th>QTY</th>
          <th>ITEM</th>
          <th class="num">PRICE</th>
          <th class="num">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>4</td>
          <td>Artisan Vanilla Syrup 750ml</td>
          <td class="num">450.00</td>
          <td class="num">1,800.00</td>
        </tr>
      </tbody>
    </table>
    <div style="text-align: right; font-weight: bold; margin-top: 16px; font-size: 14px;">
      TOTAL: PHP 1,800.00
    </div>
  </div>
</div>
</body>
</html>`,
  },

  // 8. Degraded - Handheld Motion Blur Simulation
  {
    expected: {
      fixtureId: 'dr-degraded-blur',
      category: 'degraded',
      description: 'Slight handheld camera motion blur simulation',
      expectedSupplierName: 'Bukidnon Specialty Coffee',
      expectedDeliveryDate: '2026-11-04',
      expectedReference: 'DR-4402',
      expectedTotalCents: 170000,
      lines: [
        {
          description: 'Bukidnon Arabica Honey Process 1kg',
          expectedSku: 'BEANS-BKD-1KG',
          packCount: 2,
          lineCostCents: 170000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { background: #334155; padding: 40px; }
  .box {
    max-width: 600px;
    margin: 0 auto;
    background: #fffefb;
    padding: 30px;
    font-family: Arial, sans-serif;
    filter: blur(0.7px) contrast(1.1);
  }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  .num { text-align: right; }
</style>
</head>
<body>
<div class="box">
  <div style="font-size: 18px; font-weight: bold;">BUKIDNON SPECIALTY COFFEE</div>
  <div style="font-size: 12px; color: #64748b;">OFFICIAL DELIVERY RECEIPT</div>
  <div style="margin-top: 12px; font-size: 13px;">
    Ref: DR-4402<br>
    Date: 2026-11-04
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Qty</th>
        <th>Description</th>
        <th class="num">Amount (PHP)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2</td>
        <td>Bukidnon Arabica Honey Process 1kg</td>
        <td class="num">1,700.00</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align: right; font-weight: bold; margin-top: 16px;">
    Total: PHP 1,700.00
  </div>
</div>
</body>
</html>`,
  },

  // 9. Long Multi-Item Dense Delivery Note
  {
    expected: {
      fixtureId: 'dr-long-items',
      category: 'supplier_variation',
      description: 'Dense 5-line delivery note testing extraction token count and ordering',
      expectedSupplierName: 'Northern Dairy Supply',
      expectedDeliveryDate: '2026-11-03',
      expectedReference: 'DR-MULTI-901',
      expectedTotalCents: 670000,
      lines: [
        {
          description: 'Fresh Dairy Barista Milk 1000ml',
          expectedSku: 'MILK-WM-1L',
          packCount: 10,
          lineCostCents: 155000,
          expiryDate: null,
        },
        {
          description: 'Oat Milk Barista Edition 1L',
          expectedSku: 'MILK-OAT-1L',
          packCount: 12,
          lineCostCents: 240000,
          expiryDate: null,
        },
        {
          description: 'Barista Whole Milk 1L',
          expectedSku: 'MILK-WM-1L',
          packCount: 6,
          lineCostCents: 93000,
          expiryDate: null,
        },
        {
          description: 'Artisan Vanilla Syrup 750ml',
          expectedSku: 'SYRUP-VAN-750',
          packCount: 2,
          lineCostCents: 90000,
          expiryDate: null,
        },
        {
          description: 'Dark Chocolate Sauce 1L',
          expectedSku: 'SAUCE-CHOC-1L',
          packCount: 1,
          lineCostCents: 92000,
          expiryDate: null,
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #fff; padding: 30px; font-size: 12px; }
  .box { max-width: 650px; margin: 0 auto; border: 2px solid #000; padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #999; padding: 5px; text-align: left; }
  .num { text-align: right; }
</style>
</head>
<body>
<div class="box">
  <div style="font-size: 16px; font-weight: bold; text-align: center;">NORTHERN DAIRY & SPECIALTY SUPPLIES</div>
  <div style="display: flex; justify-content: space-between; margin-top: 10px;">
    <div>Deliver To: The Caesura</div>
    <div>Date: 2026-11-03<br>Ref: DR-MULTI-901</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 8%;">#</th>
        <th style="width: 10%;">QTY</th>
        <th>ITEM DESCRIPTION</th>
        <th class="num" style="width: 18%;">UNIT PRICE</th>
        <th class="num" style="width: 20%;">TOTAL (PHP)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>10</td>
        <td>Fresh Dairy Barista Milk 1000ml</td>
        <td class="num">155.00</td>
        <td class="num">1,550.00</td>
      </tr>
      <tr>
        <td>2</td>
        <td>12</td>
        <td>Oat Milk Barista Edition 1L</td>
        <td class="num">200.00</td>
        <td class="num">2,400.00</td>
      </tr>
      <tr>
        <td>3</td>
        <td>6</td>
        <td>Barista Whole Milk 1L</td>
        <td class="num">155.00</td>
        <td class="num">930.00</td>
      </tr>
      <tr>
        <td>4</td>
        <td>2</td>
        <td>Artisan Vanilla Syrup 750ml</td>
        <td class="num">450.00</td>
        <td class="num">900.00</td>
      </tr>
      <tr>
        <td>5</td>
        <td>1</td>
        <td>Dark Chocolate Sauce 1L</td>
        <td class="num">920.00</td>
        <td class="num">920.00</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align: right; font-weight: bold; margin-top: 10px; font-size: 13px;">
    GRAND TOTAL: PHP 6,700.00
  </div>
</div>
</body>
</html>`,
  },

  // 10. Negative Test - Non-Receipt (Latte Art Photo)
  {
    expected: {
      fixtureId: 'not-a-receipt',
      category: 'negative',
      description: 'Photo of a cup of café latte on wooden table (not a delivery document)',
      expectedSupplierName: null,
      expectedDeliveryDate: null,
      expectedReference: null,
      expectedTotalCents: null,
      isNegativeTest: true,
      lines: [],
    },
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 0;
    background: #3b281c;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-family: 'Georgia', serif;
  }
  .card {
    background: #fdfbf7;
    width: 500px;
    height: 600px;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 40px;
    border: 8px solid #c2a68c;
  }
  .cup {
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, #f3ece4 35%, #7a431d 70%, #4a2810 100%);
    border-radius: 50%;
    box-shadow: 0 10px 20px rgba(0,0,0,0.3);
    margin-bottom: 30px;
    position: relative;
  }
  .rosetta {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 80px; height: 110px;
    background: #fff;
    clip-path: polygon(50% 0%, 80% 25%, 90% 50%, 75% 80%, 50% 100%, 25% 80%, 10% 50%, 20% 25%);
    opacity: 0.85;
  }
  .title { font-size: 26px; color: #3b281c; font-style: italic; }
  .quote { font-size: 14px; color: #786252; margin-top: 12px; }
</style>
</head>
<body>
<div class="card">
  <div class="cup">
    <div class="rosetta"></div>
  </div>
  <div class="title">The Caesura Specialty Cafe</div>
  <div class="quote">"Between the delivery and the first pour, there is a pause."</div>
  <div style="margin-top: 24px; font-size: 11px; letter-spacing: 2px; color: #a18c7c;">EST. 2026 • MANILA</div>
</div>
</body>
</html>`,
  },
];

async function main() {
  console.log('Generating synthetic Philippine delivery receipt fixtures...');

  for (const f of fixtures) {
    const id = f.expected.fixtureId;
    const tempHtml = path.join(FIXTURES_DIR, `${id}.temp.html`);
    const outPng = path.join(FIXTURES_DIR, `${id}.png`);
    const expectedJson = path.join(FIXTURES_DIR, `${id}.expected.json`);

    fs.writeFileSync(tempHtml, f.html, 'utf-8');
    fs.writeFileSync(expectedJson, JSON.stringify(f.expected, null, 2), 'utf-8');

    console.log(`Rendering ${id}.png via headless Edge...`);
    execFileSync(EDGE_PATH, [
      '--headless',
      '--disable-gpu',
      `--screenshot=${outPng}`,
      '--window-size=1000,1300',
      `file://${tempHtml}`,
    ]);

    fs.unlinkSync(tempHtml);

    // Also copy clean sample fixtures to public/samples/ for instant demo use
    if (['dr-clean-bukidnon-vat-inc', 'si-clean-northern-dairy-vat-ex', 'dr-clean-sweetcraft-syrups'].includes(id)) {
      const publicCopy = path.join(PUBLIC_SAMPLES_DIR, `${id}.png`);
      fs.copyFileSync(outPng, publicCopy);
    }
  }

  console.log(`✓ All ${fixtures.length} fixtures generated in evals/fixtures/ and public/samples/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

